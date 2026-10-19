import { RESOURCE_BLOB_META_STORE_NAME, RESOURCE_BLOBS_STORE_NAME, localForageInstance } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { assertUserScope, captureUserScope, type CapturedUserScope } from "@/lib/user-scope-guard";
import { getResourceBlob, resourceIdFromStorageKey } from "@/services/api/resources";

type ResourceCacheMeta = {
    key: string;
    userScope: string;
    resourceId: string;
    version: string;
    size: number;
    mimeType: string;
    lastAccessedAt: number;
};

const blobStore = localForageInstance(RESOURCE_BLOBS_STORE_NAME);
const metaStore = localForageInstance(RESOURCE_BLOB_META_STORE_NAME);
const objectUrls = new Map<string, string>();
const sessionBlobs = new Map<string, Blob>();
const inFlight = new Map<string, Promise<string>>();
const scheduled = new Set<string>();
const cacheMetaTouchWarnings = new Set<string>();
const metaTouchedAt = new Map<string, number>();
const downloadQueue: Array<{ key?: string; run: () => void }> = [];
let activeDownloads = 0;
let persistQueue: Promise<void> = Promise.resolve();
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
const FALLBACK_CACHE_BYTES = 512 * 1024 * 1024;
const MIN_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 500;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;
const BUDGET_REFRESH_MS = 5 * 60 * 1000;
// The local HTTP/1 server shares the browser's connection pool with task APIs.
// Leave connections available for submitting, cancelling and querying tasks.
const MAX_CONCURRENT_DOWNLOADS = 4;

export async function getCachedResourceObjectUrl(storageKey: string) {
    const expected = captureUserScope();
    const target = cacheTarget(storageKey, expected.userScope);
    if (!target) return "";
    return readCachedObjectUrl(target, expected);
}

/** 同步讀取本會話記憶體中的 Blob URL，命中時節點首幀即可上屏，不必等 IndexedDB 非同步讀取。 */
export function peekCachedResourceObjectUrl(storageKey: string) {
    const resourceId = resourceIdFromStorageKey(storageKey);
    if (!resourceId) return "";
    const userScope = getActiveUserScope();
    return objectUrls.get(`${userScope}:${resourceId}:file`) || "";
}

export async function cacheResourceObjectUrl(storageKey: string, reload = false, priority = false) {
    const expected = captureUserScope();
    const target = cacheTarget(storageKey, expected.userScope);
    if (!target) return "";
    const requestKey = `${target.key}:${expected.epoch}`;
    if (reload) {
        // Explicit image decode recovery must bypass both memory and IndexedDB.
        await inFlight.get(requestKey)?.catch(() => undefined);
        assertUserScope(expected);
        const blob = await withDownloadSlot(() => downloadResourceBlob(storageKey, target, expected), priority);
        assertUserScope(expected);
        if (!blob) return "";
        const oldUrl = objectUrls.get(target.key);
        objectUrls.delete(target.key);
        const url = objectUrl(target.key, blob);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        return url;
    }
    const cached = await readCachedObjectUrl(target, expected);
    assertUserScope(expected);
    if (cached) return cached;
    const pending = inFlight.get(requestKey);
    if (pending) {
        if (priority) {
            const index = downloadQueue.findIndex((job) => job.key === requestKey);
            if (index > 0) downloadQueue.unshift(...downloadQueue.splice(index, 1));
        }
        return pending;
    }

    const task = withDownloadSlot(() => downloadAndCacheResource(storageKey, target, expected), priority, requestKey).finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, task);
    return task;
}

/**
 * 播放器先使用支援 Range 的資源 URL 起播；確認使用者實際播放後，再延遲下載完整 Blob。
 * 這樣不會讓 IndexedDB 快取阻塞首幀，同時後續開啟可直接複用本地 Object URL。
 */
export function scheduleResourceBlobCache(storageKey: string, delayMs = 4_000) {
    const expected = captureUserScope();
    const requestKey = `${expected.userScope}:${expected.epoch}:${storageKey}`;
    if (!resourceIdFromStorageKey(storageKey) || scheduled.has(requestKey)) return;
    scheduled.add(requestKey);
    const run = () => {
        void Promise.resolve().then(() => {
            assertUserScope(expected);
            return cacheResourceObjectUrl(storageKey);
        })
            .catch((error) => {
                // 這是播放後的後臺快取最佳化，不應讓播放器失敗；但下載/持久化異常必須可觀測。
                console.warn("後臺快取資源 Blob 失敗", { storageKey, error });
                return "";
            })
            .finally(() => scheduled.delete(requestKey));
    };
    if (typeof window === "undefined") {
        run();
        return;
    }
    window.setTimeout(run, Math.max(0, delayMs));
}

function withDownloadSlot<T>(task: () => Promise<T>, priority = false, key?: string) {
    return new Promise<T>((resolve, reject) => {
        const job = () => {
            activeDownloads += 1;
            task().then(resolve, reject).finally(() => {
                activeDownloads -= 1;
                runDownloadQueue();
            });
        };
        if (priority) downloadQueue.unshift({ key, run: job });
        else downloadQueue.push({ key, run: job });
        runDownloadQueue();
    });
}

function runDownloadQueue() {
    while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && downloadQueue.length) downloadQueue.shift()?.run();
}

export async function primeResourceBlobCache(storageKey: string, blob: Blob, expectedScope?: CapturedUserScope) {
    const expected = expectedScope ?? captureUserScope();
    assertUserScope(expected);
    const target = cacheTarget(storageKey, expected.userScope);
    if (!target) return "";
    sessionBlobs.set(target.key, blob);
    const url = objectUrl(target.key, blob);
    if (blob.size <= MAX_CACHE_BYTES) void enqueuePersist(target, blob);
    return url;
}

export async function getCachedResourceBlob(storageKey: string) {
    const expected = captureUserScope();
    const target = cacheTarget(storageKey, expected.userScope);
    if (!target) return null;
    const sessionBlob = sessionBlobs.get(target.key);
    if (sessionBlob) return sessionBlob;
    const cached = await readPersistedBlob(target);
    assertUserScope(expected);
    if (cached) {
        touchCacheMetaSafely(target);
        return cached;
    }
    await cacheResourceObjectUrl(storageKey, false, true);
    assertUserScope(expected);
    const result = sessionBlobs.get(target.key) || await readPersistedBlob(target);
    assertUserScope(expected);
    return result;
}

async function downloadAndCacheResource(storageKey: string, target: ResourceCacheMeta, expected: CapturedUserScope) {
    const blob = await downloadResourceBlob(storageKey, target, expected);
    assertUserScope(expected);
    if (!blob) return "";
    return objectUrl(target.key, blob);
}

async function downloadResourceBlob(storageKey: string, target: ResourceCacheMeta, expected: CapturedUserScope) {
    const blob = await getResourceBlob(storageKey, { expectedScope: expected });
    assertUserScope(expected);
    if (!blob) return null;
    sessionBlobs.set(target.key, blob);
    if (blob.size <= MAX_CACHE_BYTES) void enqueuePersist(target, blob);
    return blob;
}

function enqueuePersist(target: ResourceCacheMeta, blob: Blob) {
    const task = persistQueue.then(() => persistBlob(target, blob));
    // IndexedDB 快取是讀效能最佳化，不得反向判定服務端資源上傳失敗；但失敗必須可觀測，
    // 並把佇列恢復為 fulfilled，避免一個壞條目永久阻斷後續快取寫入。
    const observed = task.catch((error) => {
        console.warn("媒體快取持久化失敗，當前會話仍可繼續讀取", { resourceId: target.resourceId, version: target.version, error });
    });
    persistQueue = observed;
    return observed;
}

async function persistBlob(target: ResourceCacheMeta, blob: Blob) {
    // 不嘗試寫入超過當前快取預算的單個媒體，避免觸發瀏覽器配額異常和無效的全量淘汰。
    if (blob.size > (await cacheBudget())) return;
    await evictFor(blob.size, target.key);

    const write = async () => {
        await blobStore.setItem(target.key, blob);
        await metaStore.setItem(target.key, {
            ...target,
            size: blob.size,
            mimeType: blob.type || target.mimeType,
            lastAccessedAt: Date.now(),
        });
    };

    try {
        await write();
        invalidateCacheStats();
        return;
    } catch (firstError) {
        // 第一次失敗通常意味著瀏覽器配額不足；激進淘汰後只允許再嘗試一次，
        // 避免快取層無限重試拖慢資源讀取，也不把快取失敗誤報成服務端資源失敗。
        await evictFor(blob.size, target.key, true);
        try {
            await write();
            invalidateCacheStats();
            return;
        } catch (retryError) {
            const cleanupResults = await Promise.allSettled([blobStore.removeItem(target.key), metaStore.removeItem(target.key)]);
            const cleanupError = cleanupResults.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
            if (cleanupError) {
                console.error("媒體快取寫入失敗後的清理也失敗", {
                    resourceId: target.resourceId,
                    version: target.version,
                    firstError,
                    retryError,
                    cleanupError,
                });
            }
            throw retryError;
        }
    }
}

async function readCachedObjectUrl(target: ResourceCacheMeta, expected: CapturedUserScope) {
    const existing = objectUrls.get(target.key);
    if (existing) {
        touchCacheMetaSafely(target);
        return existing;
    }
    const blob = sessionBlobs.get(target.key) || await readPersistedBlob(target);
    assertUserScope(expected);
    if (!blob) return "";
    touchCacheMetaSafely(target);
    return objectUrl(target.key, blob);
}

async function readPersistedBlob(target: ResourceCacheMeta) {
    try {
        return await blobStore.getItem<Blob>(target.key);
    } catch (error) {
        console.warn("媒體快取讀取失敗，重新下載資源", { resourceId: target.resourceId, error });
        return null;
    }
}

function cacheTarget(storageKey: string, userScope: string): ResourceCacheMeta | null {
    const resourceId = resourceIdFromStorageKey(storageKey);
    if (!resourceId) return null;
    // 本地桌面工作區沒有登入使用者，guest 只是本地名稱空間，不代表
    // 禁止訪問資源。資原始檔介面本身仍負責桌面令牌鑑權。
    // resource ID 是不可變資源的穩定標識，檔案介面本身負責鑑權。
    // 快取初始化不能先對每個資源讀取一遍後設資料，否則首屏會重新形成 N+1 請求。
    const version = "file";
    return {
        key: `${userScope}:${resourceId}:${version}`,
        userScope,
        resourceId,
        version,
        size: 0,
        mimeType: "application/octet-stream",
        lastAccessedAt: Date.now(),
    };
}

async function touchCacheMeta(target: ResourceCacheMeta) {
    const now = Date.now();
    // 同一會話內重複訪問不落 IndexedDB：淘汰掃描在寫入時才需要後設資料，
    // 記憶體時間戳足夠讓高頻讀取跳過跨程式 I/O。
    const lastTouchedAt = metaTouchedAt.get(target.key);
    if (lastTouchedAt && now - lastTouchedAt < TOUCH_INTERVAL_MS) return;
    metaTouchedAt.set(target.key, now);
    const current = await metaStore.getItem<ResourceCacheMeta>(target.key);
    if (!current || now - current.lastAccessedAt < TOUCH_INTERVAL_MS) return;
    await metaStore.setItem(target.key, { ...current, lastAccessedAt: now });
}


function touchCacheMetaSafely(target: ResourceCacheMeta) {
    void touchCacheMeta(target).catch((error) => {
        // 訪問時間只服務於快取淘汰，不影響資源讀取；失敗可降級，但不能無痕吞掉。
        if (cacheMetaTouchWarnings.has(target.key)) return;
        cacheMetaTouchWarnings.add(target.key);
        console.warn("更新資源快取訪問時間失敗", { storageKey: target.key, error });
    });
}

// 條目數/位元組數與儲存配額在記憶體中跟蹤，常規寫入只做 O(1) 檢查，
// 只有接近預算才執行全量 LRU 掃描，避免每張圖持久化都 iterate 全部後設資料。
let cacheStats: { count: number; bytes: number } | null = null;
let cachedBudget: { value: number; at: number } | null = null;

async function evictFor(incomingBytes: number, protectedKey: string, aggressive = false) {
    const entryCount = await metaStore.length().catch(() => 0);
    const budget = aggressive ? Math.max(MIN_CACHE_BYTES, (await cacheBudget()) / 2) : await cacheBudget();
    // 常規寫入只在統計可信或明顯未接近閾值時跳過全表掃描；寫入會使記憶體統計失效，
    // 因此不會用可能過時的位元組數做永久放行。
    if (!aggressive) {
        if (cacheStats && cacheStats.count < MAX_CACHE_ENTRIES && cacheStats.bytes + incomingBytes <= budget) return;
        if (!cacheStats && entryCount < MAX_CACHE_ENTRIES - 10 && incomingBytes < budget / 10) return;
    }
    const metas: ResourceCacheMeta[] = [];
    await metaStore.iterate<ResourceCacheMeta, void>((value) => {
        if (value?.key) metas.push(value);
    });
    let total = metas.reduce((sum, item) => sum + Math.max(0, item.size || 0), 0);
    let count = metas.length;
    // 當前頁面正在使用的 Blob URL 不能在 LRU 清理時撤銷，否則已渲染節點會立即變成失效資源。
    const candidates = metas.filter((item) => item.key !== protectedKey && !objectUrls.has(item.key) && !sessionBlobs.has(item.key)).sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    for (const candidate of candidates) {
        if (total + incomingBytes <= budget && count < MAX_CACHE_ENTRIES) break;
        await removeCacheEntry(candidate);
        total -= Math.max(0, candidate.size || 0);
        count -= 1;
    }
    cacheStats = { count, bytes: total };
}

function invalidateCacheStats() {
    cacheStats = null;
}

async function removeCacheEntry(meta: ResourceCacheMeta) {
    const url = objectUrls.get(meta.key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(meta.key);
    sessionBlobs.delete(meta.key);
    await Promise.all([blobStore.removeItem(meta.key), metaStore.removeItem(meta.key)]);
}

async function cacheBudget() {
    // 配額估計是跨程式呼叫且會話內基本穩定，短暫快取避免每張圖一次 IPC 往返。
    if (cachedBudget && Date.now() - cachedBudget.at < BUDGET_REFRESH_MS) return cachedBudget.value;
    let value = FALLBACK_CACHE_BYTES;
    if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate().catch(() => null);
        if (estimate?.quota) value = Math.min(MAX_CACHE_BYTES, Math.max(MIN_CACHE_BYTES, Math.floor(estimate.quota * 0.2)));
    }
    cachedBudget = { value, at: Date.now() };
    return value;
}

function objectUrl(key: string, blob: Blob) {
    const existing = objectUrls.get(key);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    objectUrls.set(key, url);
    return url;
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", (event) => {
        if (event.persisted) return;
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        sessionBlobs.clear();
    });
}
