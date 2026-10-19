import { recordDiagnosticEvent } from "@/services/diagnostics/client-diagnostics";

import { formatDirectorDiagnosticCode, projectDirectorDiagnostic, type DirectorDiagnosticCode, type DirectorDiagnosticFields } from "@/lib/canvas/director/director-diagnostics";

/**
 * 導演臺故障事件的唯一記錄入口。
 *
 * 複用統一的 client-diagnostics 緩衝區，絕不另建平行日誌。
 * 只傳固定 message 與安全 code/欄位；stack 一律不填。
 */

/** 去重視窗：同一 code+欄位組合在視窗內只記一次，避免高頻路徑灌滿緩衝區。 */
const DEDUPE_WINDOW_MS = 1500;
const lastSeen = new Map<string, number>();

function now(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

/** 測試與頁面重置用：清空去重狀態。 */
export function resetDirectorDiagnosticDedupe(): void {
    lastSeen.clear();
}

/**
 * 記錄一條導演臺診斷事件。
 * 返回是否真的寫入（未知 code 或命中去重視窗時返回 false），便於測試斷言。
 */
export function recordDirectorDiagnostic(code: DirectorDiagnosticCode, fields: DirectorDiagnosticFields = {}): boolean {
    const event = projectDirectorDiagnostic(code, fields);
    if (!event) return false;

    const signature = formatDirectorDiagnosticCode(event);
    const timestamp = now();
    const previous = lastSeen.get(signature);
    if (previous !== undefined && timestamp - previous < DEDUPE_WINDOW_MS) return false;
    lastSeen.set(signature, timestamp);

    recordDiagnosticEvent({
        level: event.level,
        category: "runtime",
        // code 攜帶 scene/object/列舉字尾，便於在統一診斷流裡檢索而無需自由文本。
        // 不寫 canvasId：DirectorScene.id 不是 canvas id，冒充會汙染既有後端契約的語義。
        code: signature,
        message: event.message,
    });
    return true;
}
