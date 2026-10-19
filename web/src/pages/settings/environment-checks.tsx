import { Button } from "antd";
import { useEffect, useRef, useState } from "react";
import { browserCapabilities, browserChecks, checkEnvironment, type EnvironmentCheck } from "@/services/diagnostics/environment-check";
import { probeBrowserStorage } from "@/services/diagnostics/browser-environment";

const labels: Record<EnvironmentCheck["status"], string> = { pass: "正常", warning: "需留意", error: "需處理", repaired: "已修復", skipped: "可選", unknown: "未確認" };

export function EnvironmentChecks() {
    const [checks, setChecks] = useState<EnvironmentCheck[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const active = useRef<AbortController | null>(null);
    async function run() {
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        setBusy(true);
        setError("");
        const storage = await probeBrowserStorage(controller.signal);
        if (controller.signal.aborted) return;
        const client = browserChecks({ ...browserCapabilities(), ...storage });
        try {
            const report = await checkEnvironment(true, controller.signal);
            if (controller.signal.aborted) return;
            setChecks([...report.checks, ...client]);
        } catch {
            if (controller.signal.aborted) return;
            setChecks(client);
            setError("本地服務檢查未完成，以下僅為瀏覽器檢查結果。請確認後端執行後重試。");
        } finally { if (!controller.signal.aborted) setBusy(false); }
    }
    useEffect(() => { void run(); return () => active.current?.abort(); }, []);
    return <section aria-label="環境自檢" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">環境自檢</h3>
            <Button aria-label="重新檢查" aria-busy={busy} disabled={busy} onClick={() => void run()}>{busy ? "檢查中" : "重新檢查"}</Button>
        </div>
        <p className="text-xs leading-5 text-foreground/55">僅補建缺失的臨時目錄。結果隨診斷包匯出。</p>
        {busy ? <p role="status" className="text-xs text-foreground/55">正在檢查執行環境…</p> : null}
        {error ? <p role="alert" className="text-xs leading-5 text-destructive">{error}</p> : null}
        <ul className="divide-y divide-border" aria-busy={busy}>
            {checks.map((check) => <li key={check.id} className="py-2">
                <div className="flex justify-between gap-3 text-xs"><span className="font-medium">{check.title}</span><span className={check.status === "error" ? "shrink-0 text-destructive" : "shrink-0 text-foreground/65"}>{labels[check.status]}</span></div>
                {check.status !== "pass" ? <p className="mt-1 text-xs leading-5 text-foreground/65">{check.detail}</p> : null}
            </li>)}
        </ul>
    </section>;
}
