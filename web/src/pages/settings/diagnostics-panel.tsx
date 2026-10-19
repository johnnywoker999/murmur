import { App, Button, Input } from "antd";
import { Select } from "@/components/ui/base/select";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import { exportDiagnosticBundle, downloadDiagnosticBundle, previewDiagnosticBundle, type DiagnosticExportInput, type DiagnosticPreview } from "@/services/diagnostics/diagnostics-api";
import { getClientDiagnosticEvents, getDiagnosticRuntime } from "@/services/diagnostics/client-diagnostics";
import { clearVideoPreviewCache } from "@/services/api/resources";
import { AppModal } from "@/components/ui/product/app-modal";
import { getDesktopAppBinding } from "@/services/desktop-runtime";
import { EnvironmentChecks } from "./environment-checks";

type DiagnosticsPanelProps = {
    taskId?: string;
    projectId?: string;
    open: boolean;
    onClose: () => void;
};

type DiagnosticRange = "15m" | "30m" | "1h" | "24h";

const rangeOptions: { value: DiagnosticRange; label: string }[] = [
    { value: "15m", label: "最近 15 分鐘" },
    { value: "30m", label: "最近 30 分鐘" },
    { value: "1h", label: "最近 1 小時" },
    { value: "24h", label: "最近 24 小時" },
];

export default function DiagnosticsPanel({ taskId, projectId, open, onClose }: DiagnosticsPanelProps) {
    const { message } = App.useApp();
    const [range, setRange] = useState<DiagnosticRange>("30m");
    const [description, setDescription] = useState("");
    const [preview, setPreview] = useState<DiagnosticPreview | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [bundleId, setBundleId] = useState("");
    const [clearingPreviews, setClearingPreviews] = useState(false);
	const openUpdateLogs = getDesktopAppBinding()?.OpenUpdateLogDirectory;
	const [updateLogError, setUpdateLogError] = useState("");

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoadingPreview(true);
        void previewDiagnosticBundle(buildInput(range, undefined, taskId, projectId))
            .then((result) => {
                if (!cancelled) setPreview(result);
            })
            .catch(() => {
                if (!cancelled) setPreview(null);
            })
            .finally(() => {
                if (!cancelled) setLoadingPreview(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, projectId, range, taskId]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const download = await exportDiagnosticBundle(buildInput(range, description, taskId, projectId));
            const saved = await downloadDiagnosticBundle(download);
            if (saved !== "saved") return;
            setBundleId(download.bundleId);
            message.success("診斷包已儲存，請連同診斷編號提交給支援人員");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "匯出診斷包失敗");
        } finally {
            setExporting(false);
        }
    };

    return (
        <AppModal
            open={open}
            centered
            width={560}
            footer={null}
            closable={false}
            keyboard={!exporting}
            mask={{ closable: !exporting }}
            onCancel={() => { if (!exporting) onClose(); }}
            rootClassName="app-spatial-modal diagnostics-modal"
            title={(
                <div className="flex items-center justify-between gap-2">
                    <span>問題診斷</span>
                    <Button type="text" aria-label="關閉問題診斷" disabled={exporting} icon={<X className="size-4" />} onClick={onClose} />
                </div>
            )}
        >
            <div className="max-h-[calc(100dvh-180px)] space-y-5 overflow-y-auto pt-4">
                {open ? <EnvironmentChecks /> : null}
                <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-sm font-medium">日誌範圍</span>
                        <Select
                            ariaLabel="日誌範圍"
                            className="w-full sm:w-60"
                            value={range}
                            options={rangeOptions}
                            onChange={(value) => {
                                const next = rangeOptions.find((option) => option.value === value)?.value;
                                if (next) setRange(next);
                            }}
                        />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-foreground/55" aria-live="polite">
                        {loadingPreview ? "正在讀取日誌…" : preview ? `包含 ${preview.taskCount} 個任務、${preview.apiCallCount} 次模型呼叫及前端日誌。` : "暫時無法讀取記錄數量，可繼續嘗試匯出。"}
                    </p>
                </div>
                {openUpdateLogs ? <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium">應用更新日誌</p>
                        <Button onClick={() => { setUpdateLogError(""); void openUpdateLogs().catch(() => setUpdateLogError("無法開啟日誌資料夾，請在儲存設定中檢視當前目錄。")); }}>開啟日誌資料夾</Button>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-foreground/55">{preview?.updateLog?.status === "available" ? `診斷包將包含 ${preview.updateLog.lines} 條更新記錄。` : preview?.updateLog?.status === "unreadable" ? "部分更新日誌無法讀取，其他資訊仍可匯出。" : preview?.updateLog?.status === "missing" ? "未找到更新日誌，其他資訊仍可匯出。" : "請選擇覆蓋更新失敗時間的日誌範圍。"}</p>
                    {preview?.updateLog?.truncated ? <p className="mt-1 text-xs leading-5 text-foreground/55">日誌較多，僅包含最近的部分更新記錄。</p> : null}
                    <p className="mt-1 text-xs leading-5 text-foreground/55">日誌位於當前資料目錄，檔名為 update.log。</p>
                    {updateLogError ? <p className="mt-1 text-xs leading-5 text-destructive" role="alert">{updateLogError}</p> : null}
                </div> : null}
                <div>
                    <label className="mb-3 block text-sm font-medium" htmlFor="diagnostic-description">
                        問題描述 <span className="ml-1 text-xs font-normal text-foreground/55">可選</span>
                    </label>
                    <Input.TextArea id="diagnostic-description" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="例如：生成一直停在處理中。" />
                </div>
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">影片預覽快取</p>
                        <p className="mt-1 text-xs leading-5 text-foreground/55">清理預覽以釋放空間，原檔案保留。</p>
                    </div>
                    <Button className="shrink-0" loading={clearingPreviews} onClick={async () => {
                        setClearingPreviews(true);
                        try { const result = await clearVideoPreviewCache(); message.success(`已清理 ${result.cleared} 個影片預覽`); }
                        catch (error) { message.error(error instanceof Error ? error.message : "清理失敗，請重試"); }
                        finally { setClearingPreviews(false); }
                    }}>清理預覽快取</Button>
                </div>
                <div>
                    <div className="flex items-center justify-between gap-4">
                        <p className="min-w-0 text-xs leading-5 text-foreground/55">診斷包不包含金鑰、Cookie 等隱私或原始媒體</p>
                        <Button className="shrink-0" type="primary" icon={<Download className="size-4" />} loading={exporting} onClick={() => void handleExport()}>匯出診斷包</Button>
                    </div>
                    {bundleId ? <p className="mt-3 break-all text-xs text-foreground/65" role="status">診斷編號：{bundleId}</p> : null}
                </div>
            </div>
        </AppModal>
    );
}

function buildInput(range: DiagnosticRange, description: string | undefined, taskId?: string, projectId?: string): DiagnosticExportInput {
    const to = new Date();
    const from = new Date(to.getTime() - rangeMilliseconds(range));
    return {
        from: from.toISOString(),
        to: to.toISOString(),
        taskId: taskId || undefined,
        projectId: projectId || undefined,
        description: description || undefined,
        runtime: getDiagnosticRuntime(),
        clientEvents: getClientDiagnosticEvents({ from, to }),
    };
}

function rangeMilliseconds(range: DiagnosticRange) {
    switch (range) {
        case "15m":
            return 15 * 60 * 1000;
        case "1h":
            return 60 * 60 * 1000;
        case "24h":
            return 24 * 60 * 60 * 1000;
        default:
            return 30 * 60 * 1000;
    }
}
