import { useEffect, useState } from "react";
import { Alert, App, Button, Input, Switch } from "antd";
import { getDesktopAppBinding, type ReferenceStorageConfig } from "@/services/desktop-runtime";

const fields = [
    ["endpoint", "S3 端點", "https://…"],
    ["bucket", "儲存桶名稱", "例如 beeftv-media"],
    ["region", "區域", "R2 使用 auto；S3 使用儲存桶所在區域"],
    ["accessKeyId", "Access Key ID", ""],
    ["publicBaseURL", "儲存桶公網地址", "https://media.example.com"],
] as const;

export function ReferenceStoragePane() {
    const binding = getDesktopAppBinding();
    const { message } = App.useApp();
    const [config, setConfig] = useState<ReferenceStorageConfig>({ enabled: false, endpoint: "", bucket: "", region: "auto", accessKeyId: "", publicBaseURL: "", hasSecret: false });
    const [secret, setSecret] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; detail: string } | null>(null);
    useEffect(() => {
        let active = true;
        void binding
            ?.ReferenceStorageSettings?.()
            .then((value) => {
                if (active) setConfig(value);
            })
            .catch(() => {
                if (active) setLoadError(true);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [binding]);
    if (!binding?.SaveReferenceStorage) return null;
    const save = async (test = false) => {
        setBusy(true);
        setTestResult(null);
        try {
            const value = await binding.SaveReferenceStorage!({ ...config, secretAccessKey: secret });
            setConfig(value);
            setSecret("");
            if (test) {
                await binding.TestReferenceStorage!();
                setTestResult({ success: true, detail: "上傳、公開讀取和測試檔案清理均已通過" });
            } else message.success("物件儲存配置已儲存");
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (test) setTestResult({ success: false, detail });
            else message.error(detail);
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="settings-section storage-settings-block space-y-4" aria-label="參考素材物件儲存">
            <div className="settings-pane-header">
                <div className="min-w-0">
                    <h2>參考素材物件儲存</h2>
                </div>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
                <span>生成時上傳需要公網地址的參考素材</span>
                <Switch checked={config.enabled} disabled={loadError || busy || loading} onChange={(enabled) => { setTestResult(null); setConfig((value) => ({ ...value, enabled })); }} />
            </label>
            <p className="text-sm leading-6 text-foreground/60">啟用後，需要線上素材的渠道會使用上傳後的連結。原始素材仍儲存在本機；儲存及流量由你的儲存服務計費。</p>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
                {fields.map(([key, label, placeholder]) => (
                    <label key={key} className="block min-w-0 space-y-2 text-sm">
                        <span>{label}</span>
                        <Input aria-label={label} value={config[key]} placeholder={placeholder} disabled={busy || loadError || loading} autoComplete="off" onChange={(event) => { setTestResult(null); setConfig((value) => ({ ...value, [key]: event.target.value })); }} />
                    </label>
                ))}
                <label className="block min-w-0 space-y-2 text-sm">
                    <span>Secret Access Key</span>
                    <Input.Password
                        aria-label="Secret Access Key"
                        value={secret}
                        autoComplete="new-password"
                        placeholder={config.hasSecret ? "已儲存，留空保持" : "請輸入訪問金鑰"}
                        disabled={busy || loadError || loading}
                        onChange={(event) => { setTestResult(null); setSecret(event.target.value); }}
                    />
                </label>
            </div>
            {loadError ? (
                <p role="alert" className="text-sm text-destructive">
                    已有配置暫時無法讀取，請先匯出問題記錄，避免覆蓋。
                </p>
            ) : null}
            {testResult && <Alert showIcon type={testResult.success ? "success" : "error"} title={testResult.success ? "儲存測試通過" : "儲存測試未通過"} description={testResult.detail} />}
            <div className="flex flex-wrap gap-3">
                <Button onClick={() => void save()} loading={busy} disabled={loading || loadError}>儲存物件儲存配置</Button>
                {binding.TestReferenceStorage && <Button onClick={() => void save(true)} loading={busy} disabled={loading || loadError || !config.enabled}>儲存並測試上傳</Button>}
            </div>
            <p className="text-sm leading-6 text-foreground/60">支援 S3 相容儲存。測試會上傳一張小圖片，檢查公開讀取後刪除；儲存服務可能收取少量請求費用。</p>
        </section>
    );
}
