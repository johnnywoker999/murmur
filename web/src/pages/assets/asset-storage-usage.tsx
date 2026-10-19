import { HardDrive } from "lucide-react";

import { useAccountFileStorageUsage } from "@/hooks/use-account-file-storage-usage";
import { accountFileStorageUsageQueryKey, accountStorageMeter, formatStorageBytes } from "@/lib/account-storage-usage";
import { useUserStore } from "@/stores/use-user-store";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";

export const assetStorageUsageQueryKey = accountFileStorageUsageQueryKey;

export function AssetStorageUsage() {
    const query = useAccountFileStorageUsage();
    const storageMode = useUserStore((state) => state.storageMode);
    const user = useUserStore((state) => state.user);
    const localMode = isLocalWorkspaceMode() || storageMode === "local" || user?.username === "local";
    const usage = query.data;
    const meter = accountStorageMeter(usage);

    return (
        <section className={`assets-storage-usage${meter.full ? " is-full" : ""}${usage?.usedBytes ? " has-usage" : ""}`} aria-label={localMode ? "本地檔案容量" : "賬號檔案容量"} aria-busy={query.isPending} title={localMode ? "統計瀏覽器本地儲存的素材檔案" : "包含素材檔案和創作會話附件"}>
            <span className="assets-storage-usage-icon" aria-hidden="true">
                <HardDrive />
            </span>
            <span className="assets-storage-usage-title">{localMode ? "本地儲存" : "賬號容量"}</span>
            {usage ? (
                <>
                    <span className="assets-storage-usage-value">
                        {formatStorageBytes(usage.usedBytes)} / {formatStorageBytes(usage.totalBytes)}
                    </span>
                    <span
                        className="assets-storage-usage-track"
                        role="progressbar"
                        aria-label="賬號檔案容量使用進度"
                        aria-valuemin={0}
                        aria-valuemax={usage.totalBytes}
                        aria-valuenow={Math.min(usage.usedBytes, usage.totalBytes)}
                        aria-valuetext={`已使用 ${formatStorageBytes(usage.usedBytes)}，總容量 ${formatStorageBytes(usage.totalBytes)}`}
                    >
                        <span style={{ width: `${meter.percent}%` }} />
                    </span>
                    <span className="assets-storage-usage-percent">{meter.percentLabel}</span>
                </>
            ) : query.isError ? (
                <span className="assets-storage-usage-status">
                    容量統計暫時不可用。
                    <button type="button" onClick={() => void query.refetch()}>
                        重試
                    </button>
                </span>
            ) : (
                <span className="assets-storage-usage-status">正在統計已用容量…</span>
            )}
        </section>
    );
}
