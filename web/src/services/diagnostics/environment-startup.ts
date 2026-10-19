import { recordDiagnosticEvent } from "./client-diagnostics";
import { checkEnvironment, type EnvironmentReport } from "./environment-check";
import { browserCapabilities, browserChecks, probeBrowserStorage } from "./browser-environment";

// One non-blocking attempt per authenticated workspace. Failures remain visible
// in diagnostics; startup never waits for repairs or retries in a loop.
export async function runStartupEnvironmentCheck(signal?: AbortSignal) {
    try {
        const [native, browser] = await Promise.allSettled([checkEnvironment(true, signal), probeBrowserStorage(signal)]);
        if (signal?.aborted) return undefined;
        const report: EnvironmentReport = native.status === "fulfilled" ? native.value : {
            checkedAt: new Date().toISOString(), os: "browser", arch: "unknown", catalog: { repository: "", revision: "", cases: [] },
            checks: [{ id: "check-unavailable", title: "本地服務檢查", status: "unknown", detail: "啟動環境檢查未完成，可在問題診斷中重新檢查。", cases: [] }],
        };
        const checks = [...report.checks, ...browserChecks({ ...browserCapabilities(), ...(browser.status === "fulfilled" ? browser.value : {}) })];
        for (const check of checks) {
            if (check.status === "pass" || check.status === "skipped") continue;
            recordDiagnosticEvent({ category: "environment", code: check.id, level: check.status === "error" ? "error" : check.status === "repaired" ? "info" : "warning", message: check.detail });
        }
        return { ...report, checks };
    } catch {
        recordDiagnosticEvent({ category: "environment", code: "check-unavailable", level: "warning", message: "啟動環境檢查未完成，可在問題診斷中重新檢查。" });
        return undefined;
    }
}
