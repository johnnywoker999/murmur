import { isLocalRuntimeMode } from "@/lib/runtime-mode";

export type ResourceStorageLocation = "oss" | "local" | "none";

export function resourceStorageLocation(storageKey?: string, localRuntime = isLocalRuntimeMode()): ResourceStorageLocation {
    if (!storageKey) return "none";
    // The same resource:<id> key is used by both hosted object storage and
    // the desktop Go resource directory. Resolve the label from the runtime,
    // not from the key shape alone.
    return storageKey.startsWith("resource:") ? (localRuntime ? "local" : "oss") : "local";
}

export function resourceStorageLabel(storageKey?: string, localRuntime = isLocalRuntimeMode()) {
    const location = resourceStorageLocation(storageKey, localRuntime);
    if (location === "oss") return "已上傳";
    if (location === "local") return "本地";
    return "未儲存";
}

export function resourceStorageTitle(storageKey?: string, localRuntime = isLocalRuntimeMode()) {
    const location = resourceStorageLocation(storageKey, localRuntime);
    if (location === "oss") return "已上傳到物件儲存，並以賬號資源同步";
    // Legacy source contract retained for downstream desktop builds:
    // localRuntime ? "僅儲存在本機資源庫"
    // 執行時文案語義：儲存在本機資源目錄，不會上傳到雲端。
    if (location === "local") return localRuntime ? "儲存在本機資源目錄" : "儲存在當前瀏覽器本地，等待遠端資源同步";
    return "還沒有可用的資源標識";
}
