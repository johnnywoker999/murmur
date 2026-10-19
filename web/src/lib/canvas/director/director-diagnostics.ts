/**
 * 導演臺診斷領域：穩定白名單 code + 安全結構化欄位。
 *
 * 呼叫邊界的硬約束（安全邊界，不是風格偏好）：
 * - 絕不接收 Error / stack / componentStack / URL / Cookie / Authorization / token / 金鑰；
 * - 絕不接收 scene 名稱、素材正文、prompt 等業務文本；
 * - message 只能來自本模組的固定常量表，呼叫方不能自帶文案；
 * - 欄位只允許「白名單列舉 | 布林 | 有限數值 | 通過 safe-id 校驗的 id」；
 * - 未知 code 與未知欄位一律丟棄，不透傳。
 */

/** 故障與恢復程式碼白名單。新增程式碼必須同時補 message 與測試。 */
export const DIRECTOR_DIAGNOSTIC_CODES = [
    "DIRECTOR_VIEWPORT_RENDER_FAILED",
    "DIRECTOR_VIEWPORT_CONTEXT_LOST",
    "DIRECTOR_VIEWPORT_CONTEXT_RESTORED",
    "DIRECTOR_MODEL_LOAD_FAILED",
    "DIRECTOR_MODEL_LOAD_RETRY",
    "DIRECTOR_MODEL_ADOPT_FAILED",
    "DIRECTOR_SAVE_FLUSH_FAILED",
    "DIRECTOR_SAVE_RETRY_FAILED",
    "DIRECTOR_SAVE_RETRY_RECOVERED",
    "DIRECTOR_SAVE_DRAFT_UNAVAILABLE",
    "DIRECTOR_CLOSE_BLOCKED",
] as const;

export type DirectorDiagnosticCode = (typeof DIRECTOR_DIAGNOSTIC_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(DIRECTOR_DIAGNOSTIC_CODES);

/** 固定文案：呼叫方不得傳入任意字串，避免業務正文經 message 洩漏。 */
const MESSAGES: Record<DirectorDiagnosticCode, string> = {
    DIRECTOR_VIEWPORT_RENDER_FAILED: "導演臺 3D 視口渲染失敗",
    DIRECTOR_VIEWPORT_CONTEXT_LOST: "導演臺 WebGL 上下文丟失",
    DIRECTOR_VIEWPORT_CONTEXT_RESTORED: "導演臺 WebGL 上下文已恢復",
    DIRECTOR_MODEL_LOAD_FAILED: "導演臺 3D 模型載入失敗",
    DIRECTOR_MODEL_LOAD_RETRY: "導演臺 3D 模型重試載入",
    DIRECTOR_MODEL_ADOPT_FAILED: "導演臺 3D 模型採納失敗",
    DIRECTOR_SAVE_FLUSH_FAILED: "導演臺場景儲存失敗",
    DIRECTOR_SAVE_RETRY_FAILED: "導演臺場景重試儲存仍失敗",
    DIRECTOR_SAVE_RETRY_RECOVERED: "導演臺場景重試儲存成功",
    DIRECTOR_SAVE_DRAFT_UNAVAILABLE: "導演臺本地草稿不可用",
    DIRECTOR_CLOSE_BLOCKED: "導演臺關閉被阻止",
};

const LEVELS: Record<DirectorDiagnosticCode, "info" | "warning" | "error"> = {
    DIRECTOR_VIEWPORT_RENDER_FAILED: "error",
    DIRECTOR_VIEWPORT_CONTEXT_LOST: "warning",
    DIRECTOR_VIEWPORT_CONTEXT_RESTORED: "info",
    DIRECTOR_MODEL_LOAD_FAILED: "warning",
    DIRECTOR_MODEL_LOAD_RETRY: "info",
    DIRECTOR_MODEL_ADOPT_FAILED: "error",
    DIRECTOR_SAVE_FLUSH_FAILED: "error",
    DIRECTOR_SAVE_RETRY_FAILED: "error",
    DIRECTOR_SAVE_RETRY_RECOVERED: "info",
    DIRECTOR_SAVE_DRAFT_UNAVAILABLE: "error",
    DIRECTOR_CLOSE_BLOCKED: "warning",
};

/** 物件種類列舉：只表達形態，絕不表達名稱或素材來源。 */
export const DIRECTOR_OBJECT_KINDS = ["actor", "model", "billboard", "primitive", "unknown"] as const;
export type DirectorDiagnosticObjectKind = (typeof DIRECTOR_OBJECT_KINDS)[number];
const OBJECT_KIND_SET: ReadonlySet<string> = new Set(DIRECTOR_OBJECT_KINDS);

/** 儲存決策列舉：與 coordinator 的關閉決策同構，但不攜帶任何場景內容。 */
export const DIRECTOR_SAVE_OUTCOMES = ["close", "offer-draft-exit", "stay"] as const;
export type DirectorDiagnosticSaveOutcome = (typeof DIRECTOR_SAVE_OUTCOMES)[number];
const SAVE_OUTCOME_SET: ReadonlySet<string> = new Set(DIRECTOR_SAVE_OUTCOMES);

/**
 * 允許的結構化欄位。全部可選，且每個欄位都有獨立的校驗規則。
 * 這裡故意不提供任何自由文本欄位。
 */
export type DirectorDiagnosticFields = {
    /** 物件 id：safe-id 校驗；不通過則丟棄。 */
    objectId?: string;
    /** 場景 id：safe-id 校驗。絕不接收 scene 名稱。 */
    sceneId?: string;
    objectKind?: DirectorDiagnosticObjectKind;
    saveOutcome?: DirectorDiagnosticSaveOutcome;
    /** 載入/儲存重試次數。 */
    attempt?: number;
    /** 修訂號。 */
    revision?: number;
    /** 本地草稿是否可用。 */
    draftStored?: boolean;
    /** 是否由使用者顯式觸發（區分自動重試與手動重試）。 */
    userInitiated?: boolean;
};

export type DirectorDiagnosticEvent = {
    code: DirectorDiagnosticCode;
    level: "info" | "warning" | "error";
    message: string;
    fields: DirectorDiagnosticFields;
};

const SAFE_ID = /^[A-Za-z0-9._:-]{1,96}$/;

export function isDirectorDiagnosticCode(value: unknown): value is DirectorDiagnosticCode {
    return typeof value === "string" && CODE_SET.has(value);
}

/** id 白名單校驗：任何含 URL、query、路徑分隔、空格、憑證形態的輸入都不合法。 */
function safeDirectorId(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return SAFE_ID.test(trimmed) ? trimmed : undefined;
}

function boundedInteger(value: unknown, min: number, max: number): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const rounded = Math.round(value);
    if (rounded < min || rounded > max) return undefined;
    return rounded;
}

/**
 * 純投影：把任意輸入收斂成安全事件。未知 code 返回 null，呼叫方據此丟棄。
 * 未知欄位、非法 id、越界數值、非布林值一律不出現在輸出裡。
 */
export function projectDirectorDiagnostic(code: unknown, fields: unknown): DirectorDiagnosticEvent | null {
    if (!isDirectorDiagnosticCode(code)) return null;

    const source: Record<string, unknown> = fields && typeof fields === "object" && !Array.isArray(fields) ? (fields as Record<string, unknown>) : {};
    const safe: DirectorDiagnosticFields = {};

    const objectId = safeDirectorId(source.objectId);
    if (objectId) safe.objectId = objectId;

    const sceneId = safeDirectorId(source.sceneId);
    if (sceneId) safe.sceneId = sceneId;

    if (typeof source.objectKind === "string" && OBJECT_KIND_SET.has(source.objectKind)) {
        safe.objectKind = source.objectKind as DirectorDiagnosticObjectKind;
    }
    if (typeof source.saveOutcome === "string" && SAVE_OUTCOME_SET.has(source.saveOutcome)) {
        safe.saveOutcome = source.saveOutcome as DirectorDiagnosticSaveOutcome;
    }

    const attempt = boundedInteger(source.attempt, 0, 999);
    if (attempt !== undefined) safe.attempt = attempt;

    const revision = boundedInteger(source.revision, 0, Number.MAX_SAFE_INTEGER);
    if (revision !== undefined) safe.revision = revision;

    if (typeof source.draftStored === "boolean") safe.draftStored = source.draftStored;
    if (typeof source.userInitiated === "boolean") safe.userInitiated = source.userInitiated;

    return { code, level: LEVELS[code], message: MESSAGES[code], fields: safe };
}

/**
 * 把安全欄位壓成 code 字尾，便於在統一診斷流裡檢索而無需自由文本。
 *
 * scene/object 走 safe-id 投影后的值（非法 id 在投影階段已被丟棄，不會到這裡），
 * 因此字尾裡只可能出現受限字元集。完整簽名同時用於去重：
 * 不同 objectId / sceneId 必須是不同事件，不能在去重視窗內互相吞掉。
 */
export function formatDirectorDiagnosticCode(event: DirectorDiagnosticEvent): string {
    const parts: string[] = [event.code];
    if (event.fields.sceneId) parts.push("scene=" + event.fields.sceneId);
    if (event.fields.objectId) parts.push("object=" + event.fields.objectId);
    if (event.fields.objectKind) parts.push("kind=" + event.fields.objectKind);
    if (event.fields.saveOutcome) parts.push("outcome=" + event.fields.saveOutcome);
    if (event.fields.attempt !== undefined) parts.push("attempt=" + event.fields.attempt);
    if (event.fields.revision !== undefined) parts.push("revision=" + event.fields.revision);
    if (event.fields.draftStored !== undefined) parts.push("draft=" + (event.fields.draftStored ? "1" : "0"));
    if (event.fields.userInitiated !== undefined) parts.push("user=" + (event.fields.userInitiated ? "1" : "0"));
    return parts.join(" ");
}

/** 從 DirectorObject 的形態推導列舉，不讀取 name / url / storageKey。 */
export function directorDiagnosticObjectKind(object: { kind?: string; primitive?: string } | null | undefined): DirectorDiagnosticObjectKind {
    if (!object) return "unknown";
    if (object.kind === "actor") return "actor";
    if (object.kind === "model") return "model";
    if (object.kind === "billboard") return "billboard";
    if (typeof object.primitive === "string" && object.primitive) return "primitive";
    return "unknown";
}
