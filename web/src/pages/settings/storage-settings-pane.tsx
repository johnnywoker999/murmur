import { useEffect, useState } from "react";
import { App, Button, Input } from "antd";
import { FolderOpen } from "lucide-react";
import { getDesktopAppBinding, type DesktopStorageUsage } from "@/services/desktop-runtime";
import { flushModelConfig, getModelConfigPersistenceState } from "@/services/model-config-repository";
import { saveRemoteUserDataNow } from "@/services/local-workspace-sync";
import { recordDiagnosticEvent } from "@/services/diagnostics/client-diagnostics";

const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

export function StorageSettingsPane() {
    const { message, modal } = App.useApp();
    const binding = getDesktopAppBinding();
    const [usage, setUsage] = useState<DesktopStorageUsage>();
    const [target, setTarget] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [cleanupInterrupted, setCleanupInterrupted] = useState(false);
    const [errorSummary, ...errorDetails] = error.split("\n\n");
    useEffect(() => {
        let active = true;
        void binding
            ?.StorageSettings?.()
            .then((value) => {
                if (active) setUsage(value);
            })
            .catch(() => {
                if (active) setError("儲存資訊暫時無法讀取，請重試");
            });
        return () => {
            active = false;
        };
    }, [binding]);
    if (!binding?.StorageSettings || !binding.MigrateStorage) return null;
    const choose = async () => {
        try {
            const path = await binding.ChooseStorageDirectory?.();
            if (path) setTarget(path);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };
    const migrate = async () => {
        setBusy(true);
        setError("");
        let phase = "save_workspace";
        recordDiagnosticEvent({ level: "info", category: "action", code: "storage_migration_started", message: "開始準備儲存遷移" });
        try {
            await Promise.all([flushModelConfig(), saveRemoteUserDataNow()]);
            const state = getModelConfigPersistenceState();
            if (state.dirty || state.status === "error") throw new Error("模型配置尚未儲存，請先解決儲存錯誤再遷移");
            phase = "migrate_workspace";
            await binding.MigrateStorage!(target.trim());
            window.location.reload();
        } catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            recordDiagnosticEvent({ level: "error", category: "action", code: "storage_migration_failed", reason: phase, message: details });
            setError(details);
            setBusy(false);
        }
    };
    const cleanup = () =>
        modal.confirm({
            title: "清理原目錄",
            centered: true,
            okText: "確認並清理",
            cancelText: "取消",
            content: (
                <p className="break-words">
                    請先確認當前專案、素材和模型配置可以正常使用。清理 {usage?.previousDir} 可釋放約 {size(usage?.previousBytes || 0)}；清理後無法從此目錄恢復。
                </p>
            ),
            onOk: async () => {
                setBusy(true);
                setError("");
                try {
                    setUsage(await binding.CleanupPreviousStorage!());
                    setCleanupInterrupted(false);
                    message.success("原目錄已清理");
                } catch (error) {
                    setCleanupInterrupted(true);
                    setError(error instanceof Error ? error.message : String(error));
                    // Cleanup may have removed durable copies while leaving busy scratch.
                    try {
                        setUsage(await binding.StorageSettings!());
                    } catch {
                        /* Keep the last known usage. */
                    }
                } finally {
                    setBusy(false);
                }
            },
        });
    return (
        <section className="settings-section storage-settings-block space-y-4" aria-label="本地儲存">
            <div className="settings-pane-header">
                <div className="min-w-0">
                    <h2>本地儲存</h2>
                </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
                <div className="min-w-0 break-all">當前目錄：{usage?.dataDir || "正在讀取…"}</div>
                {usage ? (
                    <p className="shrink-0 text-foreground/60">
                        資料佔用 {size(usage.usedBytes)} · 磁碟剩餘 {size(usage.freeBytes)}
                    </p>
                ) : null}
            </div>
            <label className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="shrink-0 text-sm">新儲存目錄：</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <Input className="min-w-0 flex-1" aria-label="新儲存目錄" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="例如 D:\MURMUR AI" disabled={busy} />
                    <Button icon={<FolderOpen className="size-4" />} onClick={choose} disabled={busy}>
                        選擇資料夾
                    </Button>
                </div>
            </label>
            <p className="text-sm leading-6 text-foreground/60">請選擇空資料夾。遷移期間請暫停操作；完成後會重新載入。原目錄會保留，請確認專案和素材完整後再清理。</p>
            {error ? (
                <div role="alert" className="text-sm text-destructive break-words">
                    <p>{errorSummary}</p>
                    {errorDetails.length > 0 ? (
                        <details className="mt-2">
                            <summary className="cursor-pointer">錯誤詳情</summary>
                            <p className="mt-2 break-all whitespace-pre-wrap">{errorDetails.join("\n\n")}</p>
                        </details>
                    ) : null}
                </div>
            ) : null}
            <Button type="primary" onClick={migrate} loading={busy} disabled={!usage || !target.trim() || target.trim() === usage.dataDir}>
                {busy ? "正在遷移並校驗檔案…" : "遷移舊資料並使用新目錄"}
            </Button>
            {usage?.previousDir && binding.CleanupPreviousStorage ? (
                <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm break-all">待清理的原目錄：{usage.previousDir}。</p>
                    {cleanupInterrupted ? <p className="text-sm">清理未完成，原目錄可能已部分清理。請保留當前儲存目錄。</p> : null}
                    <Button danger disabled={busy} onClick={cleanup}>
                        清理原目錄，釋放磁碟空間
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
