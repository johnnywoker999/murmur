import type { EnvironmentCheck } from "./environment-check";
import { captureUserScopeEpoch, subscribeUserScope, userScopeEpochMatches } from "@/lib/user-scope";

let storageWritable: boolean | undefined;
let storageTimedOut = false;
let latestStorageProbe = 0;
subscribeUserScope(() => {
    latestStorageProbe++;
    storageWritable = undefined;
    storageTimedOut = false;
});

export type BrowserCapabilities = { secureRandom: boolean; randomUUID: boolean; structuredClone: boolean; indexedDB: boolean; storageWritable?: boolean; storageTimedOut?: boolean; webGL: boolean; h264: boolean; hevc: boolean };

export function browserCapabilities(): BrowserCapabilities {
    // Creating a GPU context can destabilize remote/virtual-display drivers.
    // Presence is only an interface check, never proof of working acceleration.
    const webGL = typeof globalThis.WebGLRenderingContext !== "undefined";
    const video = typeof document === "undefined" ? undefined : document.createElement("video");
    let indexedDBAvailable = false;
    try { indexedDBAvailable = typeof globalThis.indexedDB !== "undefined"; } catch { /* Access can be denied for opaque origins. */ }
    return {
        secureRandom: typeof globalThis.crypto?.getRandomValues === "function",
        randomUUID: typeof globalThis.crypto?.randomUUID === "function",
        structuredClone: typeof globalThis.structuredClone === "function",
        indexedDB: indexedDBAvailable,
        storageWritable,
        storageTimedOut,
        webGL,
        h264: Boolean(video?.canPlayType('video/mp4; codecs="avc1.42E01E"')),
        hevc: Boolean(video?.canPlayType('video/mp4; codecs="hvc1"')),
    };
}

export function browserChecks(capabilities = browserCapabilities()): EnvironmentCheck[] {
    const check = (id: string, title: string, status: EnvironmentCheck["status"], detail: string, cases = ["ENV-0001"]): EnvironmentCheck => ({ id, title, status, detail, cases });
    return [
        check("secure-random", "安全隨機數", capabilities.secureRandom ? "pass" : "error", capabilities.secureRandom ? "安全隨機數可用。建立任務不依賴 randomUUID 的安全上下文限制。" : "缺少安全隨機數能力，無法可靠建立任務標識。請更新瀏覽器或 WebView2 執行時。"),
        check("structured-clone", "畫布資料複製", capabilities.structuredClone ? "pass" : "error", capabilities.structuredClone ? "畫布資料複製能力可用。" : "執行時缺少畫布所需的資料複製能力，請更新瀏覽器或 WebView2 執行時。"),
        check("indexed-db", "瀏覽器本地快取", !capabilities.indexedDB || capabilities.storageWritable === false ? "error" : capabilities.storageTimedOut ? "warning" : capabilities.storageWritable === true ? "pass" : "unknown", !capabilities.indexedDB || capabilities.storageWritable === false ? "本地快取無法寫入，請檢查隱私設定、儲存空間或更新執行時。" : capabilities.storageTimedOut ? "快取檢查超時，尚未確認可寫。請關閉佔用儲存的頁面後重新檢查。" : capabilities.storageWritable === true ? "已完成獨立測試記錄的寫入、讀取和清理。" : "尚未完成本地快取寫入檢查。"),
        check("webgl", "圖形加速", capabilities.webGL ? "unknown" : "warning", capabilities.webGL ? "圖形介面可用，硬體加速狀態需在實際預覽中確認。" : "圖形介面不可用，部分預覽可能變慢。請檢查遠端桌面、顯示卡驅動或瀏覽器硬體加速設定。", ["ENV-0051"]),
        check("video-codec", "影片播放", capabilities.h264 ? "pass" : "warning", capabilities.h264 ? (capabilities.hevc ? "瀏覽器宣告支援 H.264 和 HEVC；具體素材仍需實際解碼。" : "瀏覽器宣告支援 H.264，HEVC 素材可由本地影片工具生成相容預覽。") : "瀏覽器未宣告 H.264 播放能力，請更新執行時並檢查系統媒體元件。", ["ENV-0014", "ENV-0029"]),
    ];
}

// Use an isolated, uniquely named database. Never open or clear product stores.
// Late success after the deadline still closes and removes the probe database.
type StorageProbeResult = Pick<BrowserCapabilities, "storageWritable" | "storageTimedOut">;
export async function probeBrowserStorage(signal?: AbortSignal): Promise<StorageProbeResult> {
    if (signal?.aborted) return {};
    const probe = ++latestStorageProbe;
    const epoch = captureUserScopeEpoch();
    const publish = (result: StorageProbeResult) => {
        if (probe === latestStorageProbe && !signal?.aborted && userScopeEpochMatches(epoch)) {
            storageWritable = result.storageWritable;
            storageTimedOut = result.storageTimedOut ?? false;
        }
        return result;
    };
    try { if (typeof indexedDB === "undefined") return publish({ storageWritable: false }); }
    catch { return publish({ storageWritable: false }); }
    return new Promise<StorageProbeResult>((resolve) => {
        const name = `beeftv-environment-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let settled = false;
        let database: IDBDatabase | undefined;
        const removeProbe = () => { try { return indexedDB.deleteDatabase(name); } catch { return undefined; } };
        const finish = (result?: boolean, timedOut = false) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            database?.close();
            removeProbe();
            const snapshot = { storageWritable: result, storageTimedOut: timedOut };
            resolve(signal?.aborted ? {} : publish(snapshot));
        };
        const timer = setTimeout(() => finish(undefined, true), 2000);
        const abort = () => finish();
        signal?.addEventListener("abort", abort, { once: true });
        try {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () => { request.result.createObjectStore("probe"); };
            request.onerror = () => { finish(false); removeProbe(); };
            request.onsuccess = () => {
                database = request.result;
                if (settled) { database.close(); removeProbe(); return; }
                try {
                const transaction = database.transaction("probe", "readwrite");
                const store = transaction.objectStore("probe");
                store.put("ok", "test");
                let verified = false;
                store.get("test").onsuccess = (event) => { verified = (event.target as IDBRequest).result === "ok"; };
                transaction.oncomplete = () => {
                    database?.close();
                    const cleanup = removeProbe();
                    if (!cleanup) { finish(); return; }
                    cleanup.onsuccess = () => finish(verified);
                    cleanup.onerror = () => finish();
                };
                transaction.onabort = () => { database?.close(); removeProbe(); finish(false); };
                } catch { database.close(); removeProbe(); finish(false); }
            };
        } catch { finish(false); }
    });
}
