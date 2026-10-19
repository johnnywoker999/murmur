import { assertUserScope, captureUserScope, isUserScopeAbandonedError, UserScopeAbandonedError, waitForRetryDelay, type CapturedUserScope } from "@/lib/user-scope-guard";
import { isLocalRuntimeMode } from "@/lib/runtime-mode";
import { http, apiBaseURL, ApiError, type HttpRequestConfig } from "@/services/api/request";

export type RemoteResource = {
    id: string;
    userId: string;
    kind: "image" | "video" | "audio" | "file" | string;
    status: "pending" | "ready" | "failed" | "deleted" | string;
    provider: string;
    endpoint: string;
    bucket: string;
    objectKey: string;
    publicUrl: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    durationMs?: number;
    etag?: string;
	playbackStatus?: string;
	playbackObjectKey?: string;
	playbackError?: string;
	error?: string;
    createdAt: string;
    updatedAt: string;
};

export type AccountFileStorageUsage = {
    usedBytes: number;
    totalBytes: number;
};

export async function prepareResourcePlayback(id: string, config?: HttpRequestConfig) {
    const data = await http.post<{ resource: RemoteResource }>(`/resources/${encodeURIComponent(id)}/playback`, {}, config);
    return data.resource;
}

export async function clearVideoPreviewCache(config?: HttpRequestConfig) {
    const expectedScope = config?.expectedScope ?? captureUserScope();
    const result = await http.delete<{ cleared: number }>("/resources/playback-cache", { ...config, expectedScope });
    assertUserScope(expectedScope);
    return result;
}

export type ArkPrivateAssetSync = {
    resourceId: string;
    status: "active" | string;
};

export type ResourceUploadMeta = {
    width?: number;
    height?: number;
    durationMs?: number;
    fileName?: string;
    idempotencyKey?: string;
    expectedScope?: CapturedUserScope;
};

/**
 * 資源直傳失敗。
 *
 * `permanent` 是這條邊界上唯一重要的資訊：媒體直傳失敗後，呼叫方預設會把檔案留在本機
 * IndexedDB；後端暫時不可用時由本地工作區繼續保留素材。
 * 但鑑權失效、越權、請求本身不合法這幾類失敗重傳多少次都是同樣結果，把它們也歸入
 * "稍後自動同步" 等於向用戶撒謊，必須當場丟擲。
 */
export class ResourceUploadError extends Error {
    readonly status?: number;
    /** true 表示重試不會自愈，呼叫方不得降級為本地暫存。 */
    readonly permanent: boolean;

    constructor(message: string, options: { status?: number; permanent: boolean; cause?: unknown }) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "ResourceUploadError";
        this.status = options.status;
        this.permanent = options.permanent;
    }
}

const resourceCache = new Map<string, RemoteResource>();
const resourceRequests = new Map<string, Promise<RemoteResource>>();
const missingResourceIds = new Set<string>();

export function resourceStorageKey(id: string) {
    return `resource:${id}`;
}

export async function getAccountFileStorageUsage() {
    const data = await http.get<{ usage: AccountFileStorageUsage }>("/resources/storage-usage");
    return data.usage;
}

export async function syncResourceToArkPrivateAsset(id: string) {
    const data = await http.post<{ sync: ArkPrivateAssetSync }>(`/resources/${encodeURIComponent(id)}/ark-private-asset`);
    return data.sync;
}

export function resourceIdFromStorageKey(storageKey?: string) {
    return storageKey?.startsWith("resource:") ? storageKey.slice("resource:".length) : "";
}

export function isResourceUrl(url?: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    const path = url?.split(/[?#]/, 1)[0] || "";
    return path.startsWith(`${base}/resources/`) && path.endsWith("/file");
}

const RESOURCE_FILE_PATH = /\/(?:api\/)?resources\/([^/]+)\/file$/;

export function ownedResourceIdFromMediaRef(storageKey?: string, url?: string) {
    const fromKey = resourceIdFromStorageKey(storageKey);
    if (fromKey) return fromKey;
    if (!url?.trim()) return "";
    if (isResourceUrl(url)) return resourceIdFromResourceFilePath(url.split(/[?#]/, 1)[0] || "");
    return resourceIdFromTrustedLocalFileUrl(url);
}

function resourceIdFromResourceFilePath(path: string) {
    const match = path.match(RESOURCE_FILE_PATH);
    if (!match) return "";
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return "";
    }
}

function resourceIdFromTrustedLocalFileUrl(url: string) {
    try {
        const parsed = new URL(url, "http://127.0.0.1");
        if (parsed.protocol === "wails:") return resourceIdFromResourceFilePath(parsed.pathname);
        if ((parsed.protocol === "http:" || parsed.protocol === "https:") && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) {
            return resourceIdFromResourceFilePath(parsed.pathname);
        }
        if (url.startsWith("/")) return resourceIdFromResourceFilePath(parsed.pathname);
        return "";
    } catch {
        return "";
    }
}

// 超過該閾值（與後端單請求 multipart 上限 50MB 一致）的本地媒體走分片上傳，避免大影片匯入失敗。
const CHUNK_UPLOAD_THRESHOLD = 50 << 20;
const CHUNK_UPLOAD_RETRIES = 2;

export async function uploadResourceFile(
    file: Blob,
    kind: "image" | "video" | "audio" | "file",
    meta?: ResourceUploadMeta,
    onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<RemoteResource> {
    const expected = meta?.expectedScope ?? captureUserScope();
    const name = meta?.fileName || (file instanceof File ? file.name : `${kind}.${extensionFromMime(file.type, kind)}`);
    // 分片與 multipart 兩條路徑的失敗都要歸一成 ResourceUploadError，
    // 否則呼叫方只能靠文案猜測該重試還是該報錯。
    try {
        if (file.size > CHUNK_UPLOAD_THRESHOLD) {
            const resource = await uploadFileInChunks(file, name, kind, meta, expected, onProgress);
            rememberResource(resource, expected);
            return resource;
        }
        const formData = new FormData();
        formData.append("kind", kind);
        formData.append("file", file, name);
        if (meta?.width) formData.append("width", String(Math.round(meta.width)));
        if (meta?.height) formData.append("height", String(Math.round(meta.height)));
        if (meta?.durationMs) formData.append("durationMs", String(Math.round(meta.durationMs)));
        const data = await http.post<{ resource: RemoteResource }>("/resources", formData, {
            ...scopedUploadConfig(expected, meta?.idempotencyKey),
            onUploadProgress: onProgress ? ({ loaded, total }) => {
                if (total && total > 0) onProgress(Math.min(file.size, file.size * loaded / total), file.size);
            } : undefined,
        });
        rememberResource(data.resource, expected);
        return data.resource;
    } catch (error) {
        throw normalizeUploadError(error);
    }
}

// 分片上傳：POST 開始會話 → 逐片 PUT 原始二進位制（每片 8MB）→ POST 合併落庫。
// 單請求體積小、可斷點續傳/失敗重試；單檔案不再受 50MB 限制（僅日/總量配額約束）。
async function uploadFileInChunks(file: Blob, name: string, kind: "image" | "video" | "audio" | "file", meta: ResourceUploadMeta | undefined, expected: CapturedUserScope, onProgress?: (uploadedBytes: number, totalBytes: number) => void) {
    // 片級失敗通常意味著會話過期/網路抖動：整體重開一次會話重傳（整傳重試）。
    for (let attempt = 0; attempt < CHUNK_UPLOAD_RETRIES; attempt++) {
        try {
            return await runChunkedUpload(file, name, kind, meta, expected, onProgress);
        } catch (error) {
            if (attempt === CHUNK_UPLOAD_RETRIES - 1) throw error;
            await prepareChunkRetry(error, expected);
        }
    }
    throw new Error("上傳失敗");
}

async function runChunkedUpload(file: Blob, name: string, kind: "image" | "video" | "audio" | "file", meta: ResourceUploadMeta | undefined, expected: CapturedUserScope, onProgress?: (uploadedBytes: number, totalBytes: number) => void) {
    const session = await http.post<{ uploadId: string; chunkSize: number; chunkCount: number }>("/resources/uploads", { fileName: name, kind, size: file.size, width: meta?.width, height: meta?.height, durationMs: meta?.durationMs }, scopedUploadConfig(expected, meta?.idempotencyKey));
    for (let index = 0; index < session.chunkCount; index++) {
        assertUserScope(expected);
        const start = index * session.chunkSize;
        const end = Math.min(file.size, start + session.chunkSize);
        const blob = file.slice(start, end);
        // raw 二進位制直傳，與後端按裸 body 逐片落盤對齊（勿設手動 Content-Type，讓 axios 處理）。
        await http.put<{ index: number }>(`/resources/uploads/${encodeURIComponent(session.uploadId)}/chunks/${index}`, blob, {
            headers: { "Content-Type": "application/octet-stream" },
            expectedScope: expected,
            onUploadProgress: onProgress ? ({ loaded }) => onProgress(start + Math.min(loaded, blob.size), file.size) : undefined,
        });
        onProgress?.(Math.min(end, file.size), file.size);
    }
    assertUserScope(expected);
    const complete = await http.post<{ resource: RemoteResource }>(`/resources/uploads/${encodeURIComponent(session.uploadId)}/complete`, undefined, scopedUploadConfig(expected));
    return complete.resource;
}

async function prepareChunkRetry(error: unknown, expected: CapturedUserScope) {
    if (isUserScopeAbandonedError(error)) throw error;
    assertUserScope(expected);
    if (error instanceof ApiError && error.retryable && error.retryAfterMs) {
        await waitForRetryDelay(error.retryAfterMs);
        assertUserScope(expected);
    }
}

function rememberResource(resource: RemoteResource, expected: CapturedUserScope) {
    assertUserScope(expected);
    resourceCache.set(resourceCacheKey(resource.id, expected), resource);
}

// 失敗分類直接複用 request() 已經算好的 ApiError.retryable（408/425/429/5xx 可重試），
// 不在這裡另起一套響應碼判斷，避免兩處規則漂移。
// 差別只有一處：沒有拿到任何 HTTP 響應（斷網、超時）時 retryable 為 false，
// 但這種失敗恰恰是最該退回本機等待重傳的，因此單獨按瞬時處理。
function normalizeUploadError(error: unknown): ResourceUploadError {
    if (isUserScopeAbandonedError(error)) throw error;
    if (error instanceof ResourceUploadError) return error;
    // 請求取消不是上傳失敗，保持原始語義交給呼叫方。
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ApiError) {
        const status = error.status;
        const permanent = status !== undefined && !error.retryable;
        // 即使誤超 50MB multipart 上限（後端 http.MaxBytesError），也給出可讀中文而非英文裸錯。
        if (status === 400 && /body too large|MaxBytes/i.test(error.message)) {
            return new ResourceUploadError("檔案過大，請使用小於 50MB 的檔案或稍後重試", { status, permanent: true, cause: error });
        }
        if (status === 413) return new ResourceUploadError("檔案過大，無法上傳", { status, permanent: true, cause: error });
        return new ResourceUploadError(error.message || "上傳失敗", { status, permanent, cause: error });
    }
    return new ResourceUploadError(error instanceof Error ? error.message : "上傳失敗", { permanent: false, cause: error });
}

export async function importResourceFromUrl(url: string, kind: "image" | "video" | "audio" | "file", meta?: Omit<ResourceUploadMeta, "fileName">) {
    const expected = meta?.expectedScope ?? captureUserScope();
    const data = await http.post<{ resource: RemoteResource }>("/resources/import", { url, kind, width: meta?.width, height: meta?.height, durationMs: meta?.durationMs }, scopedUploadConfig(expected, meta?.idempotencyKey));
    rememberResource(data.resource, expected);
    return data.resource;
}

function scopedUploadConfig(expected: CapturedUserScope, idempotencyKey?: string): HttpRequestConfig {
    const value = idempotencyKey?.trim();
    return value ? { headers: { "X-Idempotency-Key": value }, expectedScope: expected } : { expectedScope: expected };
}

function lookupAccessError(expected: CapturedUserScope, signal?: { aborted?: boolean }) {
    if (signal?.aborted) return new DOMException("Aborted", "AbortError");
    try {
        assertUserScope(expected);
        return undefined;
    } catch (error) {
        return error instanceof Error ? error : new UserScopeAbandonedError();
    }
}

function rememberLookupResult(cacheKey: string, resource: RemoteResource, expected: CapturedUserScope, signal?: { aborted?: boolean }) {
    const blocked = lookupAccessError(expected, signal);
    if (blocked) throw blocked;
    resourceCache.set(cacheKey, resource);
    missingResourceIds.delete(cacheKey);
    return resource;
}

export function getResource(id: string, config?: HttpRequestConfig): Promise<RemoteResource> {
    const expected = config?.expectedScope ?? captureUserScope();
    const blocked = lookupAccessError(expected, config?.signal);
    if (blocked) return Promise.reject(blocked);
    const cacheKey = resourceCacheKey(id, expected);
    const cached = resourceCache.get(cacheKey);
    const ensureMetadata = config?.params?.metadata === "ensure";
    if (cached && !ensureMetadata) return Promise.resolve(cached);
    if (missingResourceIds.has(cacheKey)) return Promise.reject(new Error("資源不存在或已被刪除"));
    const sharePending = !config?.signal && !ensureMetadata;
    if (sharePending) {
        const pending = resourceRequests.get(cacheKey);
        if (pending) return pending;
    }
    const task = http.get<{ resource: RemoteResource }>(`/resources/${encodeURIComponent(id)}`, {
        ...config,
        signal: config?.signal,
        expectedScope: expected,
    })
        .then((data) => rememberLookupResult(cacheKey, data.resource, expected, config?.signal))
        .catch((error) => {
            if (isUserScopeAbandonedError(error)) throw error;
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            const abandoned = lookupAccessError(expected, config?.signal);
            if (abandoned) throw abandoned;
            if (error instanceof ApiError && error.status === 404) missingResourceIds.add(cacheKey);
            throw error;
        })
        .finally(() => {
            if (sharePending && resourceRequests.get(cacheKey) === task) resourceRequests.delete(cacheKey);
        });
    if (sharePending) resourceRequests.set(cacheKey, task);
    return task;
}

// refreshResource 繞過快取強制拉取資源最新狀態（轉碼副本就緒輪詢用），並回寫快取。
export function refreshResource(id: string, config?: HttpRequestConfig): Promise<RemoteResource> {
    const expected = config?.expectedScope ?? captureUserScope();
    const blocked = lookupAccessError(expected, config?.signal);
    if (blocked) return Promise.reject(blocked);
    const cacheKey = resourceCacheKey(id, expected);
    return http.get<{ resource: RemoteResource }>(`/resources/${encodeURIComponent(id)}`, {
        ...config,
        signal: config?.signal,
        expectedScope: expected,
    }).then((data) => rememberLookupResult(cacheKey, data.resource, expected, config?.signal));
}

export async function getResourceOSSUrl(storageKey?: string) {
    if (isLocalRuntimeMode()) {
        throw new Error("本地素材不會上傳到物件儲存；當前影片渠道要求公網 URL，請改用支援本地素材的渠道或直接提供公網素材地址");
    }
    const id = resourceIdFromStorageKey(storageKey);
    if (!id) throw new Error("當前媒體尚未上傳到後端資源儲存");
    try {
        const data = await http.get<{ url: string }>(`/resources/${encodeURIComponent(id)}/oss-url`);
        if (!data.url) throw new Error("後端未返回物件儲存地址");
        return data.url;
    } catch (error) {
        if (error instanceof ApiError) throw new Error(error.message || "獲取物件儲存地址失敗");
        throw error;
    }
}

function resourceCacheKey(id: string, expected: CapturedUserScope) {
    return `${expected.userScope}:${expected.epoch}:${id}`;
}

export function resourceFileUrl(id: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/resources/${encodeURIComponent(id)}/file`;
}

function resourceProxyFileUrl(id: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/resources/${encodeURIComponent(id)}/file?proxy=1`;
}

export function resolveResourceUrl(storageKey?: string, fallback = "") {
    const id = resourceIdFromStorageKey(storageKey);
    // 資源引用本身已經包含穩定 ID；恢復/展示階段不需要再查一遍後設資料。
    // 需要 publicUrl、mime 或尺寸時必須顯式呼叫 getResource，避免隱式 N+1。
    return id ? resourceFileUrl(id) : fallback;
}

// playbackVariantUrl 返回瀏覽器相容播放副本 URL（H.265→H.264 轉碼結果）。
// 副本就緒前由後端回退原件，呼叫方再按需降級。
export function playbackVariantUrl(id: string) {
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return `${base}/resources/${encodeURIComponent(id)}/file?variant=playback`;
}

/**
 * Load a browser-compatible video through the authenticated API client. Native
 * media elements cannot attach the desktop launch token, and large videos must
 * not inherit the API client's short JSON-request timeout.
 */
export type ResourcePlayback = { blob: Blob; compatible: boolean };

export async function getResourcePlayback(storageKey: string, config?: HttpRequestConfig): Promise<ResourcePlayback | null> {
    const id = resourceIdFromStorageKey(storageKey);
    if (!id) return null;
    const response = await http.raw<Blob>({
        ...config,
        method: "get",
        url: `/resources/${encodeURIComponent(id)}/file?variant=playback&proxy=1`,
        expectedScope: config?.expectedScope ?? captureUserScope(),
        responseType: "blob",
        timeout: 0,
    });
    return {
        blob: response.data instanceof Blob ? response.data : new Blob([response.data]),
        // A ready database row may outlive its copy. The file endpoint then
        // serves the original with its original ETag; it must remain eligible
        // for decoder-error recovery.
        compatible: String(response.headers.etag || "").endsWith(':pb"'),
    };
}

export async function getResourcePlaybackBlob(storageKey: string, config?: HttpRequestConfig) {
    return (await getResourcePlayback(storageKey, config))?.blob ?? null;
}

export async function getResourceBlob(storageKey: string, config?: HttpRequestConfig) {
    const id = resourceIdFromStorageKey(storageKey);
    if (!id) return null;
    // Do not use a bare fetch here. Desktop mode protects resource routes with
    // X-Desktop-Token, which is attached by the shared axios client. A native
    // <video> element cannot add that header itself, so materialized media must
    // first be downloaded through this authenticated path and exposed as a
    // local object URL by resource-blob-cache.
    try {
        const response = await http.raw<Blob>({
            ...config,
            method: "get",
            url: `/resources/${encodeURIComponent(id)}/file?proxy=1`,
            expectedScope: config?.expectedScope ?? captureUserScope(),
            responseType: "blob",
            // Images may be much larger than JSON responses; keep the shared
            // authenticated media path independent of the 4 s JSON timeout.
            timeout: 0,
        });
        return response.data instanceof Blob ? response.data : new Blob([response.data]);
    } catch (error) {
        if (isUserScopeAbandonedError(error) || (error instanceof DOMException && error.name === "AbortError")) throw error;
        return null;
    }
}

function extensionFromMime(mimeType: string, kind: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    return kind === "image" ? "png" : "bin";
}
