import { isLocalRuntimeMode } from "@/lib/runtime-mode";
import { moderationErrorCopy, persistedModerationCopy } from "./moderation-error";
import { vodImageErrorCopy } from "./vod-image-error";
import { taskConstraintCopy, persistedTaskConstraintCopy } from "./task-constraint-error";

export const CONTENT_MODERATION_ERROR_CODE = "sensitive_words_detected";

export const GENERATION_ERROR_CATEGORIES = [
    "auth",
    "permission",
    "quota_user",
    "quota_upstream",
    "quota_unknown",
    "quota_limit",
    "moderation_input",
    "moderation_reference",
    "moderation_output",
    "invalid_params",
    "local_storage",
    "local_disk_full",
    "local_credential",
    "canvas_conflict",
    "result_apply_failed",
    "result_target_unavailable",
    "context_too_long",
    "input_inaccessible",
    "input_too_large",
    "model_missing",
    "throttled",
    "concurrency",
    "provider_unavailable",
    "network",
    "request_not_sent",
    "timeout",
    "submission_uncertain",
    "async_failed",
    "cancelled",
    "partial_success",
    "download_failed",
    "delivery_failed",
    "results_missing",
    "malformed_response",
    "unknown",
] as const;

export type GenerationErrorCategory = (typeof GENERATION_ERROR_CATEGORIES)[number];

export type GenerationFailureExplanation = {
    httpStatus?: number;
    summary?: string;
    category: GenerationErrorCategory;
    reason: string;
    action: string;
    message: string;
    errorCode: string;
    providerCode?: string;
    requestId?: string;
    taskId?: string;
    retryable: boolean;
    uncertain: boolean;
    blockAutomaticRetry: boolean;
    blockManualRetry: boolean;
    moderation: boolean;
};

export type GenerationFailureMetadata = {
    generationErrorSummary?: string;
    errorDetails: string;
    generationErrorCode?: string;
    failedPromptFingerprint?: string;
    failedInputFingerprint?: string;
};

export type GenerationFailureContext = {
    errorSummary?: string;
    failureDiagnostics?: GenerationFailureDiagnostics;
    completedAt?: string;
    updatedAt?: string;
    taskId?: string;
    providerRequestId?: string;
    model?: string;
    createdAt?: string;
    stage?: string;
};

export type GenerationFailureDiagnostics = {
    source: "local_validation" | "upstream_http" | "upstream_response" | "local_result" | "local_response" | "reference_upload" | "client_result" | "unknown";
    version?: string;
    platform?: string;
    executionResult?: string;
    omittedRequests?: number;
    requests?: { operation: string; method: string; dispatched: boolean; transportPhase?: string; transportRoute?: string; outcome: string; httpStatus?: number; requestId?: string; providerCode?: string; summary?: string; startedAt: string; durationMs: number; requestBytes?: number; receivedBytes?: number; declaredResponseBytes?: number; responseLimitBytes?: number }[];
    input?: { protocol?: string; model?: string; size?: string; quality?: string; count?: string; promptChars: number; imageCount: number; videoCount: number; audioCount: number; images?: { bytes: number; width: number; height: number }[]; imageLimitsRecorded?: boolean; maxImages?: number; maxImageBytes?: number };
    summary?: string;
    providerCode?: string;
    httpStatus?: number;
    requestId?: string;
    providerTaskId?: string;
    param?: string;
    stage?: string;
    capturedAt?: string;
};

type CategoryCopy = { reason: string; action: string };

const LOCAL_TASK_ADMISSION_FAILURE: CategoryCopy = {
    reason: "本地任務儲存失敗，尚未提交生成",
    action: "請重啟應用後重試；若仍失敗，請保留排查資訊並聯系支援",
};

const CATEGORY_COPY: Record<GenerationErrorCategory, CategoryCopy> = {
    auth: { reason: "模型服務鑑權失敗", action: "請檢查 API Key 後重試" },
    permission: { reason: "當前渠道沒有使用該模型的許可權", action: "請更換模型或檢查渠道許可權" },
    quota_user: { reason: "當前賬號可用額度不足", action: "請檢查賬號餘額，補充額度或調整令牌、套餐額度後重試" },
    quota_upstream: { reason: "模型供應商拒絕了計費或額度相關請求", action: "請到供應商核對賬單與額度後，再決定是否重試" },
    quota_unknown: { reason: "模型服務拒絕了計費或額度相關請求", action: "請到當前渠道或模型供應商核對賬單與額度後，再決定是否重試" },
    quota_limit: { reason: "模型呼叫已達到設定的用量上限", action: "請檢查當前渠道的用量或預算限制，調整後再試" },
    moderation_input: { reason: "提示詞或參考素材未通過內容安全稽核", action: "請調整提示詞或參考素材後重新生成" },
    moderation_reference: { reason: "參考素材未通過內容安全稽核", action: "請檢查並更換參考素材後重新生成" },
    moderation_output: { reason: "生成結果未通過內容安全稽核", action: "請調整提示詞或參考素材後重新生成" },
    invalid_params: { reason: "模型不接受當前引數", action: "請檢查模型、尺寸、時長、格式或數量後重試" },
    local_storage: { reason: "本地資料庫無法讀寫", action: "請重啟應用；若仍失敗，請保留排查資訊並聯系支援，不要重複生成" },
    local_disk_full: { reason: "本地磁碟空間不足，無法儲存資料", action: "請清理 MURMUR AI 資料目錄所在磁碟；已有生成結果請優先取回原任務，不要重複生成" },
    local_credential: { reason: "本地算力憑據讀取失敗", action: "請檢查工作區資料目錄並重新連線算力賬號；不要刪除工作區金鑰" },
    canvas_conflict: { reason: "生成結果已保留，畫布尚未更新", action: "請點選「繼續取回」，不要重新生成" },
    result_apply_failed: { reason: "生成結果已保留，還沒放回畫布", action: "請點選「繼續取回」，不要重新生成" },
    result_target_unavailable: { reason: "生成結果已儲存，無法放回原節點", action: "從「生成歷史」取回，無需重新生成" },
    context_too_long: { reason: "輸入內容超出模型長度限制", action: "請縮短提示詞或減少參考內容後重試" },
    input_inaccessible: { reason: "參考素材無法讀取", action: "請檢查素材後重試" },
    input_too_large: { reason: "參考素材過大", action: "請壓縮或更換素材後重試" },
    model_missing: { reason: "當前模型或介面不可用", action: "請檢查模型名稱和渠道配置" },
    throttled: { reason: "請求過於頻繁", action: "請稍後再試" },
    concurrency: { reason: "同時進行的生成過多", action: "請等待已有任務完成後再試" },
    provider_unavailable: { reason: "模型服務暫時不可用", action: "請稍後重試" },
    network: { reason: "網路連線失敗", action: "請檢查網路並核對原任務狀態後，再決定是否重新生成" },
    request_not_sent: { reason: "未能連線服務，本次請求尚未提交", action: "請檢查網路或代理後重試" },
    timeout: { reason: "模型服務響應超時", action: "請稍後查詢原任務，不要立即重新提交" },
    submission_uncertain: { reason: "提交結果尚未確認，上游任務可能仍在執行", action: "請先查詢原任務狀態，不要立即重新提交" },
    async_failed: { reason: "生成任務沒有完成", action: "請檢視詳情後決定是否重試" },
    cancelled: { reason: "任務已取消", action: "可按原輸入重新提交" },
    partial_success: { reason: "部分結果已生成，其餘失敗", action: "請檢視已有結果後再決定是否補做" },
    download_failed: { reason: "生成結果還沒取回", action: "點選「繼續取回」可繼續下載原結果，不會重新生成" },
    delivery_failed: { reason: "影片已生成，但暫時無法取回", action: "請聯絡支援恢復成片，恢復後點選「取回結果」；無需重新付費生成" },
    results_missing: { reason: "任務結束但沒有可用結果", action: "請檢視詳情後再決定是否重試" },
    malformed_response: { reason: "模型服務返回了無法解析的內容", action: "請檢視詳情並核對原任務狀態後，再決定是否重新生成" },
    unknown: { reason: "生成失敗", action: "請檢視詳情後再決定是否重試" },
};

const PROVIDER_CODE_CATEGORIES: Record<string, GenerationErrorCategory> = {
    local_storage_failed: "local_storage",
    local_credential_failed: "local_credential",
    local_disk_full: "local_disk_full",
    accountoverdueerror: "quota_upstream",
    "operationdenied.serviceoverdue": "quota_upstream",
    setlimitexceeded: "quota_limit",
    inflightbatchsizeexceeded: "concurrency",
    modelnotopen: "permission",
    "operationdenied.servicenotopen": "permission",
    contentsecuritydetectionerror: "provider_unavailable",
    invalid_reference_audio: "invalid_params",
    insufficient_user_quota: "quota_user",
    model_temporarily_unavailable: "provider_unavailable",
    no_available_channel: "provider_unavailable",
    "channel:invalid_key": "provider_unavailable",
    "channel:no_available_key": "provider_unavailable",
    "channel:param_override_invalid": "unknown",
    "channel:header_override_invalid": "unknown",
    "channel:model_mapped_error": "unknown",
    "channel:aws_client_error": "provider_unavailable",
    "channel:response_time_exceeded": "timeout",
    "violation_fee.grok.csam": "moderation_input",
    prompt_blocked: "moderation_input",
    context_media_limit_exceeded: "context_too_long",
    media_request_capacity_exceeded: "concurrency",
    key_site_mismatch: "auth",
    bad_request_body: "invalid_params",
    invalid_api_type: "unknown",
    responses_encrypted_context_mismatch: "invalid_params",
    count_token_failed: "unknown",
    model_price_error: "unknown",
    json_marshal_failed: "unknown",
    do_request_failed: "submission_uncertain",
    get_channel_failed: "provider_unavailable",
    gen_relay_info_failed: "unknown",
    read_request_body_failed: "unknown",
    convert_request_failed: "unknown",
    read_response_body_failed: "submission_uncertain",
    bad_response_status_code: "unknown",
    bad_response: "malformed_response",
    bad_response_body: "malformed_response",
    empty_response: "results_missing",
    aws_invoke_error: "unknown",
    query_data_error: "unknown",
    update_data_error: "unknown",
    pre_consume_token_quota_failed: "unknown",
    upstream_crowded: "throttled",
    upstream_unavailable: "provider_unavailable",
    image_reference_upload_failed: "provider_unavailable",
    reference_media_upload_failed: "provider_unavailable",
    reference_preupload_failed: "provider_unavailable",
    upstream_rejected: "unknown",
    upstream_error: "unknown",
    invalid_api_key: "auth",
    invalid_authentication: "auth",
    authentication_error: "auth",
    unauthenticated: "auth",
    unauthorized: "auth",
    permission_denied: "permission",
    forbidden: "permission",
    access_denied: "permission",
    insufficient_quota: "quota_unknown",
    insufficient_balance: "quota_unknown",
    billing_not_active: "quota_unknown",
    billing_hard_limit_reached: "quota_upstream",
    arrearage: "quota_upstream",
    allocationquota: "quota_unknown",
    quota_exceeded: "quota_unknown",
    sensitive_words_detected: "moderation_input",
    content_filter: "moderation_input",
    content_policy_violation: "moderation_input",
    contentmoderationfailed: "moderation_input",
    "invalidparameter.voilationcontent": "moderation_input",
    "invalidparameter.violationcontent": "moderation_input",
    content_policy: "moderation_input",
    datainspectionfailed: "moderation_input",
    prohibited_content: "moderation_input",
    invalid_request: "invalid_params",
    invalid_request_error: "invalid_params",
    invalid_parameter: "invalid_params",
    invalidparameter: "invalid_params",
    invalid_argument: "invalid_params",
    requestparameteriswrong: "invalid_params",
    model_capability_not_supported: "invalid_params",
    context_length_exceeded: "context_too_long",
    contentlengthexceeded: "context_too_long",
    url_error: "input_inaccessible",
    invalid_image_url: "input_inaccessible",
    file_too_large: "input_too_large",
    payload_too_large: "input_too_large",
    video_request_body_too_large: "input_too_large",
    model_not_found: "model_missing",
    model_not_exist: "model_missing",
    invalid_model: "model_missing",
    not_found: "model_missing",
    rate_limit_exceeded: "throttled",
    rate_limit_error: "throttled",
    throttling: "throttled",
    too_many_requests: "throttled",
    resource_exhausted: "throttled",
    channel_concurrency_wait_timeout: "concurrency",
    channel_concurrency_unavailable: "concurrency",
    unavailable: "provider_unavailable",
    overloaded: "provider_unavailable",
    internal_error: "provider_unavailable",
    upstream_timeout: "timeout",
    deadline_exceeded: "timeout",
    request_cancelled: "cancelled",
    provider_submission_unknown: "submission_uncertain",
    video_submission_unknown: "submission_uncertain",
    video_delivery_failed: "delivery_failed",
    image_result_unknown: "submission_uncertain",
    image_submission_pending: "submission_uncertain",
    image_result_expired: "submission_uncertain",
    image_result_unavailable: "submission_uncertain",
    idempotency_conflict: "submission_uncertain",
    provider_reference_invalid: "input_inaccessible",
};

const DEFAULT_GENERATION_ERROR_MESSAGE = "生成失敗。請檢視詳情後再決定是否重試。";
export const CONTENT_MODERATION_MESSAGE = "提示詞未通過內容安全稽核。請修改提示詞或參考圖後重新生成。";

const HTML_BODY = /^\s*(?:<!doctype|<html|<head|<body)/i;
const LOCAL_DATABASE_ERROR = /(?:^|:\s*)(?:table\s+[a-z0-9_]+\s+has no column named\s+[a-z0-9_]+|no such (?:column|table):\s*[a-z0-9_.]+|(?:UNIQUE|NOT NULL|CHECK) constraint failed:\s*\S+|FOREIGN KEY constraint failed|database (?:is locked|is malformed)|database disk image is malformed|attempt to write a readonly database|disk I\/O error)(?:\b|$)/i;
const HTTP_STATUS = /(?:HTTP\s+|status(?:[_\s]+code)?\s*[:：=]?\s*)(\d{3})\b/i;
const WRAPPED_HTTP_STATUS = /Request failed with status code\s+(\d{3})/i;
const URL_PATTERN = /(?:https?:\/\/|data:[a-z0-9.+-]+\/[^;]+;base64,)[^\s"'<>]+/gi;
const SECRET_PATTERN = /(?:api[_-]?key|secret[_-]?key|access[_-]?token|authorization|bearer|sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,})[^\s,;]*/gi;
const PROMPT_ECHO = /((?:prompt|input|query)\s*[=:：]\s*)(?:"[^"]{0,400}"|'[^']{0,400}'|\S{1,400})/gi;
const SIGNED_QUERY = /(?:[?&](?:signature|x-amz-signature|x-oss-signature|token|key)=)[^\s&]+/gi;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const UNSAFE_ID = /secret|token|password|apikey|api-key|bearer|sk-/i;

type ExtractedFields = {
    code: string;
    type: string;
    status: string;
    message: string;
    param: string;
    requestId: string;
    taskId: string;
};

export function explainGenerationError(error: unknown, context: GenerationFailureContext = {}): GenerationFailureExplanation {
    const classified = classifyUnknown(error, context);
    const copy = explanationCopy(classified);
    const message = joinSentences(copy.reason, copy.action, debugIdLine(classified.taskId || context.taskId, classified.requestId || context.providerRequestId));
    const moderation = isModerationCategory(classified.category);
    const uncertain = classified.uncertain || classified.category === "submission_uncertain" || classified.category === "download_failed" || (classified.category === "timeout" && classified.status === 524);
    const preparation = confirmedReferencePreparation(classified);
    const blockAutomaticRetry = uncertain || moderation || preparation || Object.hasOwn(REFERENCE_PREPARATION_COPY, classified.providerCode || "") || !["throttled", "concurrency", "provider_unavailable", "cancelled", "request_not_sent"].includes(classified.category);
    return {
        category: classified.category,
        httpStatus: classified.status,
        summary: ["local_storage", "local_disk_full"].includes(classified.category) ? copy.reason : sanitizeProviderText(error instanceof Error ? error.message : typeof error === "string" ? error : providerPayloadMessage(error)),
        reason: copy.reason,
        action: copy.action,
        message: message || DEFAULT_GENERATION_ERROR_MESSAGE,
        errorCode: classified.category,
        providerCode: classified.providerCode || undefined,
        requestId: sanitizeDebugId(classified.requestId || (error && typeof error === "object" && "requestId" in error && typeof error.requestId === "string" ? error.requestId : "") || context.providerRequestId) || undefined,
        taskId: sanitizeDebugId(classified.taskId || context.taskId) || undefined,
        retryable: Boolean(classified.retryable) && !uncertain && !moderation && !preparation,
        uncertain,
        blockAutomaticRetry,
        blockManualRetry: blockAutomaticRetry && !preparation,
        moderation,
    };
}

export function generationErrorMessage(error: unknown) {
    return explainGenerationError(error).message;
}

export function generationErrorCode(error: unknown) {
    if (error && typeof error === "object" && "code" in error) {
        const code = (error as { code?: unknown }).code;
        if (typeof code === "string" && isGenerationErrorCode(code)) return code;
    }
    const explained = explainGenerationError(error);
    return explained.category === "unknown" ? undefined : explained.errorCode;
}

export function generationFailureMetadata(error: unknown, prompt: string, references: Array<string | { id?: string; storageKey?: string; url?: string }> = []): GenerationFailureMetadata {
    const explained = explainGenerationError(error);
    const inputFingerprint = generationInputFingerprint(prompt, references);
    if (!explained.moderation) return { errorDetails: explained.message, generationErrorSummary: explained.summary, generationErrorCode: explained.category === "unknown" ? undefined : explained.errorCode };
    return {
        errorDetails: explained.message,
        generationErrorCode: explained.errorCode,
        failedPromptFingerprint: generationPromptFingerprint(prompt),
        failedInputFingerprint: inputFingerprint,
    };
}

export function isContentModerationError(value: unknown) {
    if (!value) return false;
    if (typeof value === "object" && value && "category" in value && isModerationCategory(String((value as { category?: unknown }).category || ""))) return true;
    const explained = explainGenerationError(value);
    if (explained.moderation) return true;
    const text = value instanceof Error ? value.message : String(value);
    return text.toLowerCase().includes(CONTENT_MODERATION_ERROR_CODE) || text.includes("內容稽核未通過") || text.includes("內容安全稽核");
}

export function shouldBlockAutomaticRetry(error: unknown, stage?: string) {
    if (stage === "submission_unknown") return true;
    return explainGenerationError(error, { stage }).blockAutomaticRetry;
}

export function shouldBlockManualRetry(error: unknown, stage?: string) {
    return explainGenerationError(error, { stage }).blockManualRetry;
}

export function unchangedModeratedPrompt(
    metadata: { errorDetails?: string; generationErrorCode?: string; failedPromptFingerprint?: string; failedInputFingerprint?: string } | undefined,
    prompt: string,
    references: Array<string | { id?: string; storageKey?: string; url?: string }> = [],
) {
    const moderationFailure = isModerationCategory(metadata?.generationErrorCode || "") || isContentModerationError(metadata?.errorDetails);
    if (!moderationFailure) return false;
    if (metadata?.failedInputFingerprint) return metadata.failedInputFingerprint === generationInputFingerprint(prompt, references);
    if (references.length) return false;
    if (!metadata?.failedPromptFingerprint) return false;
    return metadata.failedPromptFingerprint === generationPromptFingerprint(prompt);
}

export function generationPromptFingerprint(value: string) {
    const normalized = value.trim().replace(/\s+/g, " ");
    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${normalized.length}:${(hash >>> 0).toString(36)}`;
}

export function generationInputFingerprint(prompt: string, references: Array<string | { id?: string; storageKey?: string; url?: string }> = []) {
    const referenceKeys = references
        .map((item) => (typeof item === "string" ? item : [item.id, item.storageKey, item.url].filter(Boolean).join("|")))
        .map((item) => item.trim())
        .filter(Boolean)
        .sort();
    return generationPromptFingerprint(`${prompt.trim()}\n${referenceKeys.join("\n")}`);
}

export function formatGenerationDiagnostics(explanation: GenerationFailureExplanation, context: GenerationFailureContext = {}) {
    const evidence = context.failureDiagnostics;
    const taskId = sanitizeDebugId(context.taskId) || sanitizeDebugId(explanation.taskId);
    const requestId = sanitizeDebugId(evidence?.requestId) || sanitizeDebugId(explanation.requestId);
    const model = sanitizeProviderCode(evidence?.input?.model || context.model || "");
    const createdAt = context.createdAt && /^\d{4}-\d{2}-\d{2}[T ][\d:.+Z-]{5,35}$/.test(context.createdAt) ? context.createdAt : "";
    const lines = [
        "排查資訊版本：2",
        `原因：${sanitizeProviderText(explanation.reason)}`,
        explanation.action ? `下一步：${sanitizeProviderText(explanation.action)}` : "",
        `類別：${explanation.category}`,
        explanation.category === "local_credential" ? `失敗階段：讀取本地算力憑據${explanation.summary?.includes("尚未提交生成") ? "（尚未提交生成）" : ""}` : "",
        `錯誤來源：${explanation.category === "local_credential" ? "本地算力連線" : explanation.category === "local_disk_full" ? "本地磁碟寫入" : explanation.category === "local_storage" ? "本地任務儲存" : ({ local_validation: "本地引數校驗", upstream_http: "上游 HTTP 響應", upstream_response: "上游業務響應", local_result: "本地結果處理", local_response: "本地響應大小限制", reference_upload: "參考素材上傳", client_result: "畫布應用結果", unknown: "未記錄" } as Record<string, string>)[evidence?.source || "unknown"] || "未記錄"}`,
        `錯誤摘要：${sanitizeProviderText(evidence?.summary || context.errorSummary || explanation.summary || "") || "未記錄"}`,
        evidence && ["upstream_http", "upstream_response", "reference_upload"].includes(evidence.source) && sanitizeProviderCode(evidence.providerCode || "") ? `${evidence.source === "reference_upload" ? "儲存返回程式碼" : "上游程式碼"}：${sanitizeProviderCode(evidence.providerCode || "")}` : "",
        evidence?.httpStatus && Number.isInteger(evidence.httpStatus) && evidence.httpStatus >= 100 && evidence.httpStatus <= 599 ? `HTTP 狀態：${evidence.httpStatus}` : "",
        !evidence?.httpStatus && explanation.httpStatus ? `HTTP 狀態：${explanation.httpStatus}` : "",
        sanitizeProviderCode(evidence?.param || "") ? `引數：${sanitizeProviderCode(evidence?.param || "")}` : "",
        sanitizeProviderText(evidence?.stage || context.stage || "") ? `失敗階段：${sanitizeProviderText(evidence?.stage || context.stage || "")}` : "",
        taskId ? `任務 ID：${taskId}` : "",
        `請求 ID：${requestId || "未記錄"}`,
        sanitizeDebugId(evidence?.providerTaskId) ? `上游任務 ID：${sanitizeDebugId(evidence?.providerTaskId)}` : "",
        sanitizeDebugId(context.providerRequestId) ? `服務端關聯 ID：${sanitizeDebugId(context.providerRequestId)}` : "",
        model ? `模型：${model}` : "",
        evidence?.version ? `執行版本：${diagnosticToken(evidence.version)} (${diagnosticToken(evidence.platform || "")})` : "",
        evidence?.executionResult ? `生成執行：${evidence.executionResult === "completed" ? "完成" : evidence.executionResult === "pending" ? "等待回查" : evidence.executionResult === "failed" ? "未完成" : "未知"}` : "",
        ...formatExecutionEvidence(evidence),
        createdAt ? `任務建立時間：${createdAt}` : "",
        ...[["錯誤記錄時間", evidence?.capturedAt], ["任務結束時間", context.completedAt], ["任務更新時間", context.updatedAt]].flatMap(([label, value]) => value && /^\d{4}-\d{2}-\d{2}[T ][\d:.+Z-]{5,35}$/.test(value) ? [`${label}：${value}`] : []),
    ].filter(Boolean);
    return lines.join("\n");
}

function formatExecutionEvidence(evidence?: GenerationFailureDiagnostics): string[] {
    const lines: string[] = [];
    const number = (n: number | undefined) => Number.isSafeInteger(n) && n! >= 0 ? String(n) : "未知";
    const input = evidence?.input;
    if (input) {
        lines.push(`任務配置（協議可能轉換或省略）：協議=${diagnosticToken(input.protocol)}，模型=${diagnosticToken(input.model)}，尺寸=${diagnosticToken(input.size)}，質量=${diagnosticToken(input.quality)}，數量=${diagnosticToken(input.count)}`);
        lines.push(`輸入統計：提示詞 ${number(input.promptChars)} 字；圖片/影片/音訊 ${number(input.imageCount)}/${number(input.videoCount)}/${number(input.audioCount)}`);
        if (input.imageLimitsRecorded) lines.push(`本地參考圖限制：最多 ${number(input.maxImages)} 張，單圖位元組上限=${number(input.maxImageBytes)}（位元組上限為 0 表示未設定大小限制）`);
        input.images?.slice(0, 16).forEach((media, i) => lines.push(`參考圖 ${i + 1}：${number(media.width)}×${number(media.height)}，${number(media.bytes)} 位元組`));
    }
    const outcomes: Record<string, string> = { response_received: "收到響應（業務結果另判）", transport_error: "傳輸或讀取失敗", not_dispatched: "請求未傳送", http_error: "HTTP 錯誤", cancelled: "取消", timeout: "超時", business_error: "業務錯誤", response_limit: "本地響應大小限制" };
    const phases: Record<string, string> = { connect: "建立連線", tls: "TLS 握手", request: "傳送請求", response_wait: "等待響應", response: "讀取響應" };
    const routes: Record<string, string> = { direct: "直連", proxy: "代理" };
    const preparationOperations: Record<string, string> = { reference_create: "申請素材上傳", reference_put: "上傳素材檔案", reference_complete: "確認素材上傳" };
    evidence?.requests?.slice(0, 8).forEach((request, i) => {
        lines.push(`請求 ${i + 1}：${preparationOperations[request.operation] || sanitizeProviderCode(request.operation)}；${outcomes[request.outcome] || "未知"}；已發起=${request.dispatched === true ? "是" : "否"}；HTTP=${number(request.httpStatus)}；ID=${sanitizeDebugId(request.requestId) || "未記錄"}；耗時=${number(request.durationMs)}ms`);
        lines.push(`請求 ${i + 1} 位元組：請求體大小=${number(request.requestBytes)}（不代表已傳送）；響應宣告=${number(request.declaredResponseBytes)}；已讀=${number(request.receivedBytes)}；響應上限=${number(request.responseLimitBytes)}`);
        if (phases[request.transportPhase || ""]) lines.push(`請求 ${i + 1} 連線：${routes[request.transportRoute || ""] || "未記錄"}；階段=${phases[request.transportPhase!]}`);
        if (/^\d{4}-\d{2}-\d{2}[T ][\d:.+Z-]{5,35}$/.test(request.startedAt)) lines.push(`請求 ${i + 1} 時間：${request.startedAt}`);
        if (sanitizeProviderCode(request.providerCode || "")) lines.push(`請求 ${i + 1} 上游程式碼：${sanitizeProviderCode(request.providerCode || "")}`);
        if (request.summary) lines.push(`請求 ${i + 1} 摘要：${sanitizeProviderText(request.summary)}`);
    });
    if (evidence?.omittedRequests) lines.push(`中間請求省略：${number(evidence.omittedRequests)}`);
    return lines;
}

function diagnosticToken(value?: string): string {
    return value && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value) && !value.includes("://") && !/(?:bearer|api[_-]?key|secret|token|sk-|^[a-z]:[\\/]|\/(?:Users|home|private|tmp|var|Volumes|mnt|media|run|root|opt|srv|etc)\/)/i.test(value) ? value : "未記錄";
}

export function isGenerationErrorCode(code: string) {
    return (GENERATION_ERROR_CATEGORIES as readonly string[]).includes(code) || /^(?:model|provider|origin)_[a-z0-9_]{2,80}$/.test(code) || code === CONTENT_MODERATION_ERROR_CODE;
}

type Classified = {
    category: GenerationErrorCategory;
    reason?: string;
    action?: string;
    providerCode?: string;
    requestId?: string;
    taskId?: string;
    status?: number;
    fromCode?: boolean;
    uncertain?: boolean;
    retryable?: boolean;
};

function classifyUnknown(error: unknown, context: GenerationFailureContext): Classified {
    if (context.stage === "submission_unknown") {
        const classified = classifyUnknown(error, { ...context, stage: undefined });
        if (classified.fromCode && classified.uncertain) return classified;
        return { category: "submission_uncertain", uncertain: true, retryable: false };
    }
    if (!error) return { category: "unknown", retryable: false };
    if (typeof error === "object" && error) {
    const record = error as Record<string, unknown>;
        if (record.reason === "local_credential_failed") return { category: "local_credential", status: numericStatus(record.status), fromCode: true, retryable: false };
        if (record.reason === "local_disk_full") return { category: "local_disk_full", status: numericStatus(record.status), fromCode: true, retryable: false };
        if (record.reason === "local_storage_failed") return { category: "local_storage", ...LOCAL_TASK_ADMISSION_FAILURE, fromCode: true, retryable: false };
        if (record.name === "ApiError" && record.reason === "quota_exceeded") {
            return { category: "quota_limit", reason: sanitizeProviderText(String(record.message || "工作區用量已達到上限")), action: "請清理不需要的任務記錄或素材後重試", fromCode: true, retryable: false };
        }
        if (record.reason === "stale_revision" || record.code === "canvas_conflict") {
            return { category: "canvas_conflict", fromCode: true, retryable: false };
        }
        if (["node_task_mismatch", "node_mismatch", "canvas_mismatch", "node_deleted"].includes(String(record.reason || ""))) {
            return { category: "result_target_unavailable", status: numericStatus(record.status), fromCode: true, retryable: false };
        }
        if (typeof record.code === "string" && typeof record.message === "string") {
            const vodCopy = vodImageErrorCopy(record.code, record.message);
            if (vodCopy) return vodCopy;
        }
        if (record.code === "download_failed" || record.code === "result_apply_failed" || record.code === "result_target_unavailable") {
            return { category: record.code, fromCode: true, retryable: false };
        }
        if (typeof record.message === "string" && isCanvasSaveConflictText(record.message) && (record.reason === "conflict" || record.status === 409 || record.status === 428)) {
            return { category: "canvas_conflict", fromCode: true, retryable: false };
        }
        const response = record.response && typeof record.response === "object" ? (record.response as Record<string, unknown>) : undefined;
        const status = numericStatus(record.status) ?? numericStatus(record.statusCode) ?? numericStatus(response?.status);
        const data = record.data ?? record.body ?? response?.data ?? record.response;
        if (status || data) {
            const classified = classifyHttp(status, data ?? record);
            if (classified.category !== "unknown" || status) return classified;
        }
        if (record.code === "provider_unavailable" && typeof record.message === "string") {
            const preparation = persistedReferencePreparation(record.message);
            if (preparation) return preparation;
        }
        const structured = classifyText(stringifyAllowlisted(record));
        if (structured.fromCode || structured.category !== "unknown") return structured;
        if (typeof record.reason === "string" && record.reason) {
            const fromReason = classifyText(record.reason);
            if (fromReason.category !== "unknown") return fromReason;
        }
        if (typeof record.message === "string" && record.message) return classifyText(record.message);
    }
    if (error instanceof Error) return classifyText(error.message);
    if (typeof error === "string") return classifyText(error);
    return classifyText(providerPayloadMessage(error));
}

function classifyHttp(status: number | undefined, body: unknown): Classified {
    const text = typeof body === "string" ? body : providerPayloadMessage(body) || (body && typeof body === "object" ? JSON.stringify(body) : "");
    if (persistedReferencePreparation(text)) return { category: "submission_uncertain", status, uncertain: true, retryable: false };
    let classified = classifyText(text || (body && typeof body === "object" ? stringifyAllowlisted(body) : ""));
    if (body && typeof body === "object") {
        const fromObject = classifyText(stringifyAllowlisted(body));
        if (fromObject.fromCode || (fromObject.category !== "unknown" && classified.category === "unknown")) classified = fromObject;
    }
    const fields = extractProviderFields(typeof body === "string" ? body : body && typeof body === "object" ? stringifyAllowlisted(body) : "");
    // Local API reasons are handled before this provider-response fallback.
    if (classified.category === "local_disk_full" || classified.category === "local_credential") classified = { category: "unknown", retryable: false };
    if (status === 402 && fields.code === "video_reservation_failed" && fields.message.startsWith("insufficient balance for this video request")) {
        classified = { ...classified, category: "quota_user", fromCode: true, reason: undefined, action: undefined };
    }
    if (classified.category !== "unknown" && !classified.fromCode && !trustProviderMessageStatus(status)) {
        classified = { category: "unknown", retryable: false };
    }
    if (!classified.fromCode && (classified.category === "unknown" || classified.category === "malformed_response") && status) {
        classified = { category: categoryFromHttpStatus(status), status, retryable: false };
        if (status === 524) {
            classified.category = "timeout";
            classified.uncertain = true;
            classified.reason = "模型服務響應超時，請求可能仍在服務端執行";
            classified.action = "請先查詢原任務或到供應商核對狀態，不要立即重新提交";
        }
    }
    if (status === 524 && (classified.category === "unknown" || classified.category === "timeout" || classified.category === "provider_unavailable" || classified.category === "malformed_response")) {
        classified.category = "timeout";
        classified.uncertain = true;
        classified.reason = "模型服務響應超時，請求可能仍在服務端執行";
        classified.action = "請先查詢原任務或到供應商核對狀態，不要立即重新提交";
    }
    if (status === 413 && classified.category === "input_too_large" && !classified.reason) {
        classified.reason = "整次請求的資料量超過介面上限";
        classified.action = "請減少參考素材，或改用可公開訪問的素材連結後再提交";
    }
    classified.status = status;
    classified.retryable = retryableCategory(classified.category) && !classified.uncertain;
    return classified;
}

function classifyText(raw: string): Classified {
    const text = raw.trim();
    if (!text) return { category: "unknown", retryable: false };
    const preparation = persistedReferencePreparation(text);
    if (preparation) return preparation;
    if (text === LOCAL_TASK_ADMISSION_FAILURE.reason || text.startsWith(`${LOCAL_TASK_ADMISSION_FAILURE.reason}。`)) {
        return { category: "local_storage", ...LOCAL_TASK_ADMISSION_FAILURE, fromCode: true, retryable: false };
    }
    if (isCanvasSaveConflictText(text)) {
        return { category: "canvas_conflict", fromCode: true, retryable: false };
    }
    const taskCopy = persistedTaskConstraintCopy(text);
    if (taskCopy) return { category: "invalid_params", ...taskCopy, requestId: sanitizeDebugId(text.match(/請求 ([A-Za-z0-9._:-]{6,127})/)?.[1]), taskId: sanitizeDebugId(text.match(/任務 ([A-Za-z0-9._:-]{6,127})/)?.[1]), retryable: false };
    const moderationCopy = persistedModerationCopy(text);
    if (moderationCopy) {
        return { ...moderationCopy, requestId: sanitizeDebugId(text.match(/請求 ([A-Za-z0-9._:-]{6,127})/)?.[1]), taskId: sanitizeDebugId(text.match(/任務 ([A-Za-z0-9._:-]{6,127})/)?.[1]), retryable: false };
    }
    const durationCopy = referenceDurationCopy(text);
    if (durationCopy) {
        const debug = text.match(/。排查編號：([^。]+)。?$/)?.[1] || "";
        return {
            category: "invalid_params",
            ...durationCopy,
            requestId: sanitizeDebugId(debug.match(/(?:^| · )請求 ([A-Za-z0-9._:-]{6,127})$/)?.[1]),
            taskId: sanitizeDebugId(debug.match(/^任務 ([A-Za-z0-9._:-]{6,127})(?: · |$)/)?.[1]),
            retryable: false,
        };
    }
    const mediaCopy = referenceMediaConstraintCopy(text);
    if (mediaCopy) {
        const debug = text.match(/。排查編號：([^。]+)。?$/)?.[1] || "";
        return {
            category: mediaCopy.reason.includes("過大") ? "input_too_large" : "invalid_params",
            ...mediaCopy,
            requestId: sanitizeDebugId(debug.match(/(?:^| · )請求 ([A-Za-z0-9._:-]{6,127})$/)?.[1]),
            taskId: sanitizeDebugId(debug.match(/^任務 ([A-Za-z0-9._:-]{6,127})(?: · |$)/)?.[1]),
            retryable: false,
        };
    }
    if (HTML_BODY.test(text)) {
        const status = extractExplicitHttpStatus(text);
        if (status) return classifyHttp(status, "");
        return { category: "malformed_response", retryable: false };
    }
    const storage = resourceStorageFailureMessage(text);
    if (storage) return { category: "input_inaccessible", reason: storage.replace(/。$/, ""), action: "", retryable: false };
    const fields = extractProviderFields(text);
    const vodCopy = vodImageErrorCopy(fields.code, /^[{[]/.test(text) ? fields.message : text);
    if (vodCopy) return { ...vodCopy, requestId: sanitizeDebugId(fields.requestId), taskId: sanitizeDebugId(fields.taskId) };
    // Inspect only the error message, never JSON request echoes or debug fields.
    const databaseMessage = fields.code || fields.type || fields.message || fields.status || /^[{[]/.test(text) ? fields.message : text;
    if (/(write local resource|生成內容寫入資源儲存失敗|database or disk is full|本地磁碟空間不足)/i.test(databaseMessage) && /(no space left on device|not enough space on the disk|disk full|database or disk is full|本地磁碟空間不足)/i.test(databaseMessage)) return { category: "local_disk_full", fromCode: true, retryable: false };
    if (LOCAL_DATABASE_ERROR.test(databaseMessage)) return { category: "local_storage", fromCode: true, requestId: sanitizeDebugId(fields.requestId), taskId: sanitizeDebugId(fields.taskId), retryable: false };
    if (fields.code || fields.type || fields.message || fields.status) {
        const fromCode = categoryFromProviderCode(fields.code, fields.type, fields.status);
        if (fromCode) return specialize({ category: fromCode, fromCode: true, providerCode: sanitizeProviderCode(fields.code), requestId: sanitizeDebugId(fields.requestId), taskId: sanitizeDebugId(fields.taskId) }, fields);
        const fromMessage = categoryFromProviderMessage(`${fields.message} ${fields.type} ${fields.status}`);
        if (fromMessage) return specialize({ category: fromMessage, providerCode: sanitizeProviderCode(fields.code), requestId: sanitizeDebugId(fields.requestId), taskId: sanitizeDebugId(fields.taskId) }, fields);
    }
    if (/^[{[]/.test(text)) return { category: "unknown", providerCode: sanitizeProviderCode(fields.code), requestId: sanitizeDebugId(fields.requestId), taskId: sanitizeDebugId(fields.taskId), retryable: false };
    const persisted = matchPersistedCategory(text);
    if (persisted) return { category: persisted, uncertain: ["timeout", "download_failed", "submission_uncertain"].includes(persisted), retryable: false };
    if (isMalformedText(text)) return { category: "malformed_response", retryable: false };
    const fromFull = categoryFromProviderMessage(text);
    if (fromFull) return specialize({ category: fromFull }, { ...emptyFields(), message: text });
    if (isNetworkText(text)) return { category: "network", retryable: true };
    if (isDownloadText(text)) return { category: "download_failed", uncertain: true, retryable: false };
    if (isCancelledText(text)) return { category: "cancelled", retryable: false };
    if (isResultsMissingText(text)) return { category: "results_missing", retryable: false };
    const status = extractExplicitHttpStatus(text);
    if (status) return classifyHttp(status, "");
    if (/[\u4e00-\u9fff]/.test(text) && !containsInfrastructureDetails(text)) return { category: "unknown", reason: sanitizeProviderText(text), action: "", retryable: false };
    return { category: "unknown", retryable: false };
}

function specialize(classified: Classified, fields: ExtractedFields): Classified {
    fields = { ...fields, message: sanitizeProviderText(fields.message) };
    classified.requestId ||= sanitizeDebugId(fields.message.match(/\brequest\s*id:\s*([A-Za-z0-9_-]{6,127})\b/i)?.[1]);
    const taskConstraint = persistedTaskConstraintCopy(fields.message) || taskConstraintCopy(`${fields.code} ${fields.message}`);
    if (taskConstraint && ["unknown", "invalid_params"].includes(classified.category))
        return {
            ...classified,
            category: "invalid_params",
            ...taskConstraint,
            requestId: classified.requestId || sanitizeDebugId(fields.message.match(/請求 ([A-Za-z0-9._:-]{6,127})/)?.[1]),
            taskId: classified.taskId || sanitizeDebugId(fields.message.match(/任務 ([A-Za-z0-9._:-]{6,127})/)?.[1]),
            retryable: false,
        };
    // Only broad wrappers may be refined by a more specific provider message.
    const genericCode =
        ["", "unknown", "failed", "badrequest", "api_error", "upstream_error", "upstream_rejected", "invalid_request", "invalid_request_error", "invalid_parameter", "invalidparameter", "invalid_argument"].includes(normalizeCode(fields.code)) ||
        /^\d{3}$/.test(fields.code);
    const persistedCopy = persistedModerationCopy(fields.message);
    if (persistedCopy && (classified.category === persistedCopy.category || (genericCode && ["unknown", "invalid_params"].includes(classified.category)))) {
        const persisted = classifyText(fields.message);
        return { ...classified, ...persisted, providerCode: classified.providerCode, requestId: classified.requestId || persisted.requestId, taskId: classified.taskId || persisted.taskId };
    }
    if (genericCode && ["unknown", "invalid_params"].includes(classified.category)) {
        const refined = categoryFromProviderMessage(fields.message);
        if (refined) classified.category = refined;
    }
    if (isModerationCategory(classified.category) || (genericCode && ["unknown", "invalid_params"].includes(classified.category))) {
        const moderationCopy = moderationErrorCopy(fields.code, fields.message);
        if (moderationCopy) return { ...classified, ...moderationCopy, retryable: false };
    }
    const audioOrDuration = referenceAudioCopy(fields.message, normalizeCode(fields.code) === "invalid_reference_audio") || referenceDurationCopy(fields.message);
    if (audioOrDuration) return { ...classified, category: "invalid_params", ...audioOrDuration, retryable: false };
    const mediaCopy = ["unknown", "invalid_params", "input_too_large", "input_inaccessible"].includes(classified.category) ? referenceMediaConstraintCopy(fields.message) : undefined;
    if (mediaCopy) return { ...classified, category: mediaCopy.reason.includes("過大") ? "input_too_large" : "invalid_params", ...mediaCopy, retryable: false };
    if (classified.category === "invalid_params") {
        const refined = categoryFromProviderMessage(fields.message);
        if (refined === "context_too_long" || refined === "input_inaccessible" || refined === "input_too_large" || refined === "model_missing") classified.category = refined;
    }
    if (isModerationCategory(classified.category) && !["moderation_reference", "moderation_output"].includes(fields.code)) classified.category = moderationCategoryFromMessage(`${fields.message} ${fields.code}`.toLowerCase());
    const normalized = `${fields.message} ${fields.code}`.toLowerCase();
    if (classified.category === "invalid_params") {
        const duration = fields.message.match(/duration\s+(?:must|should)\s+be\s+between\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?\s+and\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i);
        if (duration && Number(duration[1]) <= Number(duration[2])) {
            const reference = fields.message.includes("素材") || /reference|audio/i.test(fields.message);
            classified.reason = reference ? "參考素材時長不符合模型要求" : "影片時長不符合模型要求";
            classified.action = reference ? `請檢查每段參考音訊和影片，將不符合要求的素材調整為 ${duration[1]}–${duration[2]} 秒後重新提交` : `請將時長調整為 ${duration[1]}–${duration[2]} 秒後重試`;
        }
        const height = fields.message.match(/height\s+(?:must|should)\s+be\s+between\s+(\d+)\s*(?:px|pixels?)?\s+and\s+(\d+)\s*(?:px|pixels?)/i);
        if (height) {
            classified.reason = "參考素材高度不符合模型要求";
            classified.action = `請將高度調整為 ${height[1]}–${height[2]} 畫素後重新提交`;
        }
        const width = fields.message.match(/width\s+(?:must|should)\s+be\s+between\s+(\d+)\s*(?:px|pixels?)?\s+and\s+(\d+)\s*(?:px|pixels?)/i);
        if (width && !height) {
            classified.reason = "參考素材寬度不符合模型要求";
            classified.action = `請將寬度調整為 ${width[1]}–${width[2]} 畫素後重新提交`;
        }
        const aspect = fields.message.match(/aspect(?:\s*ratio)?\s+(?:must|should)\s+be\s+between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)/i);
        if (aspect) {
            classified.reason = "參考素材寬高比不符合模型要求";
            classified.action = `請將寬高比調整為 ${aspect[1]}–${aspect[2]} 後重新提交`;
        }
        const pixels = fields.message.match(/(?:pixel(?:s)?(?:\s+count)?|total\s+pixels)\s+(?:must|should)\s+be\s+between\s+(\d+)\s+and\s+(\d+)/i);
        if (pixels) {
            classified.reason = "參考素材畫素總量不符合模型要求";
            classified.action = `請將參考素材的寬×高調整到 ${pixels[1]}–${pixels[2]} 畫素；修改生成解析度不會改變參考素材`;
        }
    }
    if (classified.category === "input_too_large") {
        if (
            normalizeCode(fields.code) === "video_request_body_too_large" ||
            fields.message.startsWith("整次請求的資料量超過介面上限") ||
            /(?:request\s+(?:body|entity|payload)|payload)\s+(?:is\s+)?too\s+large|(?:request|payload).{0,24}(?:exceeds?|larger than)/i.test(fields.message)
        ) {
            classified.reason = "整次請求的資料量超過介面上限";
            classified.action = "請減少參考素材，或改用可公開訪問的素材連結後再提交";
        } else if (/(?:file|image|video|audio)\s+too\s+large/i.test(fields.message)) {
            classified.reason = "單個參考檔案過大";
            classified.action = "請壓縮或更換該素材後再提交";
        }
    }
    if (((normalized.includes("thinking") || normalized.includes("reasoning")) && normalized.includes("tool_choice")) || (normalized.includes("tool_choice") && (normalized.includes("not support") || normalized.includes("unsupported")))) {
        classified.category = "invalid_params";
        classified.reason = "當前模型為思考或推理模式，不支援強制工具呼叫";
        classified.action = "請改用自動工具選擇或更換非思考模式模型";
    }
    classified.retryable = retryableCategory(classified.category);
    return classified;
}

function referenceDurationCopy(text: string): CategoryCopy | undefined {
    const audio = referenceAudioCopy(text);
    if (audio) return audio;
    const numbered = text.match(/^第 (\d+) 段參考(音訊|影片)時長為 (\d+(?:\.\d+)?) 秒[，。]需要 (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒/);
    if (numbered) return { reason: `第 ${numbered[1]} 段參考${numbered[2]}時長為 ${numbered[3]} 秒`, action: `需要 ${numbered[4]}–${numbered[5]} 秒；請裁剪或更換這段素材後再提交` };
    const missing = text.match(/^第 (\d+) 段參考(音訊|影片)的時長無法讀取/);
    if (missing) return { reason: `第 ${missing[1]} 段參考${missing[2]}的時長無法讀取`, action: "請重新匯入素材後再提交" };
    const persisted = text.match(/^參考素材時長不符合模型要求。請檢查每段參考音訊和影片，將不符合要求的素材調整為 (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?) 秒/);
    if (persisted) return { reason: "參考素材時長不符合模型要求", action: `請檢查每段參考音訊和影片，將不符合要求的素材調整為 ${persisted[1]}–${persisted[2]} 秒後重新提交` };
}

function referenceAudioCopy(text: string, invalidAudio = false): CategoryCopy | undefined {
    const duration = text.match(/^reference audio (\d+) is (\d+(?:\.\d+)?) seconds; use audio between (\d+(?:\.\d+)?) and (\d+(?:\.\d+)?) seconds/i);
    if (duration) return { reason: `第 ${duration[1]} 段參考音訊時長為 ${duration[2]} 秒`, action: `需要 ${duration[3]}–${duration[4]} 秒；請裁剪或更換這段素材後再提交` };
    const total =
        text.match(/^reference audio is (\d+(?:\.\d+)?) seconds in total; this model accepts at most (\d+(?:\.\d+)?) seconds of reference audio/i) || text.match(/^參考音訊總時長為 (\d+(?:\.\d+)?) 秒[。，](?:該|當前)模型最多支援 (\d+(?:\.\d+)?) 秒/);
    if (total) return { reason: `參考音訊總時長為 ${total[1]} 秒`, action: `該模型最多支援 ${total[2]} 秒參考音訊；請裁剪或減少參考音訊後再提交` };
    const numbered = text.match(/^reference audio (\d+)(?::| requires| exceeds)/i);
    const label = numbered ? `第 ${numbered[1]} 段參考音訊` : "參考音訊";
    const persisted = text.match(/^(第 \d+ 段參考音訊|參考音訊)(無法下載|的格式或時長無法讀取|檔案過大|不符合模型要求)。/);
    const issue =
        persisted?.[2] ||
        (invalidAudio || numbered
            ? /15 MiB|byte limit|at most.*MiB/i.test(text)
                ? "檔案過大"
                : /duration could not be measured|invalid.*audio|unsupported|readable audio track/i.test(text)
                  ? "的格式或時長無法讀取"
                  : /download|HTTPS URL|URL.*(?:policy|allowed)|redirect|readable within/i.test(text)
                    ? "無法下載"
                    : "不符合模型要求"
            : "");
    if (!issue) return;
    const actions: Record<string, string> = {
        無法下載: "請重新上傳音訊，確認素材連結可公開訪問後再提交",
        的格式或時長無法讀取: "請將音訊重新匯出為 MP3、WAV 或 M4A，確認檔案完整且含有音軌後再上傳",
        檔案過大: "請壓縮或更換音訊，確保檔案不超過模型的大小限制後再提交",
        不符合模型要求: "請檢查參考音訊的時長、格式和大小，調整後再提交",
    };
    return { reason: `${persisted?.[1] || label}${issue}`, action: actions[issue] };
}

function extractProviderFields(raw: string): ExtractedFields {
    const fields = emptyFields();
    if (raw.length > 16384) return fields;
    const suffix = raw.match(/\s*\(request id:\s*([A-Za-z0-9._:-]{6,127})\)\s*$/i);
    if (suffix) raw = raw.slice(0, suffix.index);
    const tryParse = (value: string) => {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                Object.assign(fields, walkProviderFields(parsed as Record<string, unknown>, 0));
                fields.requestId ||= sanitizeDebugId(suffix?.[1]);
            }
        } catch {
            return;
        }
    };
    tryParse(raw.trim());
    if (fields.message.startsWith("{") || fields.message.startsWith("[")) {
        const nested = emptyFields();
        try {
            const parsed = JSON.parse(fields.message) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(nested, walkProviderFields(parsed as Record<string, unknown>, 0));
        } catch {
            /* keep outer fields */
        }
        if (nested.message) fields.message = nested.message;
        if (nested.code) fields.code = nested.code;
        if (nested.type) fields.type = nested.type;
    }
    if (fields.message || fields.code) return fields;
    for (let index = raw.indexOf("{"); index >= 0; index = raw.indexOf("{", index + 1)) {
        tryParse(raw.slice(index).trim());
        if (fields.message || fields.code) return fields;
    }
    return fields;
}

function walkProviderFields(payload: Record<string, unknown>, depth: number): ExtractedFields {
    const fields = emptyFields();
    if (depth > 5) return fields;
    fields.code = allowlistedString(payload.code);
    fields.type = allowlistedString(payload.type);
    fields.status = allowlistedString(payload.status);
    fields.message = allowlistedString(payload.message) || allowlistedString(payload.msg) || allowlistedString(payload.detail);
    fields.param = allowlistedString(payload.param) || allowlistedString(payload.parameter);
    fields.requestId = allowlistedString(payload.request_id) || allowlistedString(payload.requestId) || allowlistedString(payload["request-id"]);
    fields.taskId = allowlistedString(payload.task_id) || allowlistedString(payload.taskId);
    const nested = [payload.error, payload.data, payload.output, payload.promptFeedback].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
    for (const child of nested) {
        const walked = walkProviderFields(child, depth + 1);
        if (!fields.code || (child === payload.error && walked.code)) fields.code = walked.code;
        if (!fields.type) fields.type = walked.type;
        if (!fields.status) fields.status = walked.status;
        if (!fields.message || (child === payload.error && walked.message)) fields.message = walked.message;
        if (!fields.param) fields.param = walked.param;
        if (!fields.requestId) fields.requestId = walked.requestId;
        if (!fields.taskId) fields.taskId = walked.taskId;
        if (allowlistedString(child.blockReason)) {
            fields.code = fields.code || allowlistedString(child.blockReason);
            fields.message = fields.message || "blocked by content safety policy";
        }
    }
    return fields;
}

function categoryFromProviderCode(...values: string[]): GenerationErrorCategory | "" {
    for (const value of values) {
        const normalized = normalizeCode(value);
        if (!normalized || normalized === "0" || normalized === "success" || normalized === "ok") continue;
        if ((GENERATION_ERROR_CATEGORIES as readonly string[]).includes(normalized)) return normalized as GenerationErrorCategory;
        if (PROVIDER_CODE_CATEGORIES[normalized]) return PROVIDER_CODE_CATEGORIES[normalized];
        const moderationCopy = moderationErrorCopy(normalized, "");
        if (moderationCopy) return moderationCopy.category;
        if (/^sensitivecontentdetected(?:\.|$)/.test(normalized)) return "moderation_input";
        if (normalized.includes("content_filter") || normalized.includes("contentpolicy") || normalized.includes("sensitive_words")) return "moderation_input";
        if (normalized.includes("insufficient") && (normalized.includes("quota") || normalized.includes("balance"))) return "quota_unknown";
        if (normalized.includes("rate_limit") || normalized.includes("throttl")) return "throttled";
        if (normalized.includes("context_length") || normalized.includes("max_tokens")) return "context_too_long";
        if (normalized.includes("model_not") || normalized.includes("invalid_model")) return "model_missing";
        if (normalized.includes("auth") && (normalized.includes("invalid") || normalized.includes("fail") || normalized.includes("unauth"))) return "auth";
        if (normalized.includes("permission") || normalized.includes("forbidden")) return "permission";
    }
    return "";
}

function referenceMediaConstraintCopy(text: string): CategoryCopy | undefined {
    text = text.split("。排查編號：", 1)[0];
    if (text.startsWith("當前渠道需要線上素材連結：")) {
        const [reason, ...action] = text.split("。");
        return { reason, action: action.join("。") };
    }
    const unreadableFps = text.match(/^(第 \d+ 個參考影片幀率無法讀取)/);
    if (unreadableFps) return {reason:unreadableFps[1],action:"請重新匯出 MP4/MOV 影片後上傳，確保檔案完整且包含有效的影片軌"};
    const measuredFps = text.match(/^(第 \d+ 個參考影片平均幀率為 \d+(?:\.\d+)? FPS)[，。](?:需要 |請將參考影片重新匯出為 )(\d+)–(\d+) FPS/);
    if (measuredFps) return { reason: measuredFps[1], action: `請將參考影片重新匯出為 ${measuredFps[2]}–${measuredFps[3]} FPS 後再提交` };
    const fps = text.match(/^(?:素材轉換失敗:\s*)?(?:frame rate|framerate|fps) must be between (\d+(?:\.\d+)?)\s*(?:fps)? and (\d+(?:\.\d+)?)[.\s]*$/i);
    if (fps) return { reason: "參考影片幀率不符合要求", action: `請將參考影片重新匯出為 ${fps[1]}–${fps[2]} FPS 後再提交` };
    if (text.startsWith("參考影片幀率不符合要求。請將參考影片重新匯出為 ")) return { reason: text.split("。")[0], action: text.slice(text.indexOf("。") + 1) };
    if (/^(?:(?:素材轉換失敗:\s*)?(?:unsupported (?:video |audio )?codec|(?:video |audio )?codec (?:is )?not supported)[.\s]*$|參考素材編碼不受當前模型支援。)/i.test(text)) return { reason: "參考素材編碼不受當前模型支援", action: "請將影片重新匯出為常見的 H.264 MP4，音訊重新匯出為 MP3 或 WAV 後替換素材；只修改檔案字尾無效" };
    if (/^(?:asset (?:is )?(?:not ready|still processing)[.\s]*$|參考素材仍在處理中。)/i.test(text)) return { reason: "參考素材仍在處理中", action: "請在素材庫確認處理完成後再生成，不要重複上傳或反覆提交" };
    if (/^(?:asset (?:access denied|permission denied|forbidden)[.\s]*$|無權訪問參考素材。)/i.test(text)) return { reason: "無權訪問參考素材", action: "請使用上傳該素材的賬號與渠道，或重新上傳原檔案；檢查素材許可權，無需修改提示詞" };
    const pixelPersisted = text.match(/^(參考素材畫素總量不符合模型要求)。((?:請將參考素材的寬×高調整到) \d+–\d+ 畫素[^{}]*)$/);
    if (pixelPersisted) return { reason: pixelPersisted[1], action: pixelPersisted[2] };
    const videoPersisted = text.match(/^(第 \d+ 個參考影片(?:無法讀取|格式或地址不支援|檔案過大|尺寸為 \d+×\d+|時長為 \d+(?:\.\d+)? 秒|畫素總量為 \d+（\d+×\d+）))[。]([^{}]+)$/);
    if (videoPersisted) return { reason: videoPersisted[1], action: videoPersisted[2] };

    const persisted = text.match(/^參考素材(寬度|高度|寬高比)不符合模型要求。請將(?:寬度|高度|寬高比)調整為 (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)( 畫素| )後重新提交/);
    if (persisted) return { reason: `參考素材${persisted[1]}不符合模型要求`, action: `請將${persisted[1]}調整為 ${persisted[2]}–${persisted[3]}${persisted[4]}後重新提交` };
    const single = text.match(/^(第 \d+ (?:張|個|段)參考(?:圖|影片|音訊)(?:寬度|高度|寬高比|時長)為 \d+(?:\.\d+)?(?: 畫素| 秒)?)[，。]需要 ((?:至少|不超過) \d+(?:\.\d+)?(?: 畫素| 秒)?)/);
    if (single) return { reason: single[1], action: `需要 ${single[2]}；${single[1].includes("時長") ? "請裁剪或更換這段素材後再提交" : "請調整尺寸或更換後再提交"}` };
    const size = text.match(/^第 (\d+) (張|個|段)參考(圖|影片|音訊)(寬度|高度)為 (\d+) 畫素[，。]需要 (\d+)–(\d+) 畫素/);
    if (size) return { reason: `第 ${size[1]} ${size[2]}參考${size[3]}${size[4]}為 ${size[5]} 畫素`, action: `需要 ${size[6]}–${size[7]} 畫素；請調整尺寸或更換後再提交` };
    const aspect = text.match(/^第 (\d+) (張|個|段)參考(圖|影片|音訊)寬高比為 (\d+(?:\.\d+)?)[，。]需要 (\d+(?:\.\d+)?)–(\d+(?:\.\d+)?)/);
    if (aspect) return { reason: `第 ${aspect[1]} ${aspect[2]}參考${aspect[3]}寬高比為 ${aspect[4]}`, action: `需要 ${aspect[5]}–${aspect[6]}；請調整尺寸或更換後再提交` };
    const videoDuration = text.match(/^(第 \d+ 個參考影片時長為 \d+(?:\.\d+)? 秒)，需要 (\d+)–(\d+) 秒/);
    if (videoDuration) return { reason: videoDuration[1], action: `請將這段參考影片裁剪或更換為 ${videoDuration[2]}–${videoDuration[3]} 秒` };
    const videoRead = text.match(/^第 (\d+) 個參考影片[：:]?(?:參考影片)?(?:尺寸|時長)?(?:下載失敗|無法讀取|無法完整讀取|資料無法讀取|分段讀取失敗|在讀取期間發生變化|時長無法讀取|尺寸無法讀取)/);
    if (videoRead) return { reason: `第 ${videoRead[1]} 個參考影片無法讀取`, action: "請檢查素材連結，或重新匯出 MP4/MOV 檔案後匯入" };
    const videoFormat = text.match(/^第 (\d+) 個參考影片[：:]?(?:參考影片)?需使用/);
    if (videoFormat) return { reason: `第 ${videoFormat[1]} 個參考影片格式或地址不支援`, action: "請匯入 MP4/MOV 檔案，或使用可公開訪問的 HTTP/HTTPS 影片連結" };
    const videoBytes = text.match(/^第 (\d+) 個參考影片[：:]?(?:參考影片)?檔案不能超過 (\d+)MB/);
    if (videoBytes) return { reason: `第 ${videoBytes[1]} 個參考影片檔案過大`, action: `請壓縮至 ${videoBytes[2]}MB 以內或更換素材` };
    const videoSize = text.match(/^(第 \d+ 個參考影片尺寸為 \d+×\d+)，需要寬高均在 (\d+)–(\d+) 畫素之間/);
    if (videoSize) return { reason: videoSize[1], action: `請將這段參考影片的寬和高均調整到 ${videoSize[2]}–${videoSize[3]} 畫素` };
    const pixelDetail = text.match(/^(第 \d+ (?:張|個|段)參考(?:圖|影片|音訊)畫素總量為 \d+（\d+×\d+）)，需要 ([^；]+) 畫素/);
    if (pixelDetail) return { reason: pixelDetail[1], action: `需要 ${pixelDetail[2]} 畫素；請調整這份素材的尺寸或更換原檔案，修改生成解析度不會改變參考素材` };
    const unknownSize = text.match(/^(第 \d+ 個參考影片尺寸無法讀取)/);
    if (unknownSize) return { reason: unknownSize[1], action: "請重新匯出 MP4/MOV 後匯入" };
    const pixels = text.match(/^第 (\d+) (張|個|段)參考(圖|影片|音訊)畫素總量/);
    if (pixels) return { reason: `第 ${pixels[1]} ${pixels[2]}參考${pixels[3]}畫素總量不符合當前模型要求`, action: "請調整尺寸或更換後再提交" };
    const file = text.match(/^第 (\d+) (張|個|段)參考(圖|影片|音訊)檔案過大[，。]當前模型單檔案上限為 ([^；;]+)/);
    if (file) return { reason: `第 ${file[1]} ${file[2]}參考${file[3]}檔案過大`, action: `當前模型單檔案上限為 ${file[4]}；請壓縮或更換後再提交` };
    if (text.startsWith("整次請求的參考素材合計過大")) return { reason: "整次請求的參考素材合計過大", action: "請減少素材後再提交" };
}

function categoryFromProviderMessage(raw: string): GenerationErrorCategory | "" {
    const normalized = sanitizeProviderText(raw).toLowerCase();
    if (!normalized.trim()) return "";
    if (/duration\s+(?:must|should)\s+be\s+between\s+\d/.test(normalized)) return "invalid_params";
    if (
        /(?:width|height)\s+(?:must|should)\s+be\s+between\s+\d/.test(normalized) ||
        /aspect(?:\s*ratio)?\s+(?:must|should)\s+be\s+between/.test(normalized) ||
        /(?:pixel(?:s)?(?:\s+count)?|total\s+pixels)\s+(?:must|should)\s+be\s+between/.test(normalized)
    )
        return "invalid_params";
    if (((normalized.includes("thinking") || normalized.includes("reasoning")) && normalized.includes("tool_choice")) || (normalized.includes("tool_choice") && (normalized.includes("not support") || normalized.includes("unsupported"))))
        return "invalid_params";
    const moderationCopy = moderationErrorCopy("", normalized);
    if (moderationCopy) return moderationCopy.category;
    if (containsContentSafety(normalized)) return moderationCategoryFromMessage(normalized);
    if (normalized.includes("insufficient_quota") || ((normalized.includes("quota") || normalized.includes("balance") || normalized.includes("額度") || normalized.includes("餘額") || normalized.includes("欠費")) && !normalized.includes("rate")))
        return normalized.includes("arrearage") || normalized.includes("billing_hard_limit") ? "quota_upstream" : "quota_unknown";
    if (normalized.includes("rate limit") || normalized.includes("too many requests") || normalized.includes("throttl") || normalized.includes("頻繁")) return "throttled";
    if (normalized.includes("context length") || normalized.includes("too many tokens") || normalized.includes("max_tokens") || (normalized.includes("長度") && (normalized.includes("最大") || normalized.includes("超出")))) return "context_too_long";
    if (normalized.includes("model_not_found") || normalized.includes("model not found") || normalized.includes("模型不存在") || normalized.includes("當前模型或介面不可用")) return "model_missing";
    if (normalized.includes("invalid api key") || normalized.includes("incorrect api key") || normalized.includes("authentication") || normalized.includes("unauthorized") || normalized.includes("鑑權失敗")) return "auth";
    if (normalized.includes("permission") && (normalized.includes("denied") || normalized.includes("model") || normalized.includes("access"))) return "permission";
    if (normalized.includes("url error") || normalized.includes("failed to download") || normalized.includes("cannot fetch") || normalized.includes("invalid image url") || normalized.includes("無法讀取")) return "input_inaccessible";
    if (normalized.includes("too large") || normalized.includes("payload too large") || normalized.includes("過大") || normalized.startsWith("整次請求的資料量超過介面上限") || /(?:request|payload).{0,24}(?:exceeds?|larger than)/i.test(normalized))
        return "input_too_large";
    if (normalized.includes("invalid") || normalized.includes("parameter") || normalized.includes("argument") || normalized.includes("請檢查模型")) return "invalid_params";
    return "";
}

function containsContentSafety(normalized: string) {
    return (
        /\brejected (?:by the|as a result of (?:our|the)) safety system\b/.test(normalized) ||
        normalized.includes("contentmoderationfailed") ||
        normalized.includes("invalidparameter.voilationcontent") ||
        normalized.includes("invalidparameter.violationcontent") ||
        normalized.includes("上游內容安全策略") ||
        normalized.includes("sensitive_words_detected") ||
        normalized.includes("content policy") ||
        normalized.includes("content safety") ||
        normalized.includes("safety policy") ||
        normalized.includes("data inspection") ||
        normalized.includes("prohibited_content") ||
        normalized.includes("內容安全稽核") ||
        normalized.includes("內容稽核未通過") ||
        (normalized.includes("blocked by") && (normalized.includes("safety") || normalized.includes("policy") || normalized.includes("content"))) ||
        (normalized.includes("safety") && (normalized.includes("blocked") || normalized.includes("violat") || normalized.includes("filter")))
    );
}

function moderationCategoryFromMessage(normalized: string): GenerationErrorCategory {
    if (/prompt\s+(?:or|and)\s+(?:reference|input)|提示詞或參考/.test(normalized)) return "moderation_input";
    if (normalized.includes("reference image") || normalized.includes("input image") || normalized.includes("參考圖")) return "moderation_reference";
    if (normalized.includes("output") && (normalized.includes("image") || normalized.includes("video") || normalized.includes("result"))) return "moderation_output";
    return "moderation_input";
}

function categoryFromHttpStatus(status: number): GenerationErrorCategory {
    if (status === 401) return "auth";
    if (status === 403) return "permission";
    if (status === 402) return "quota_unknown";
    if (status === 404) return "model_missing";
    if (status === 408 || status === 504 || status === 524) return "timeout";
    if (status === 409) return "invalid_params";
    if (status === 413) return "input_too_large";
    if (status === 400 || status === 422) return "invalid_params";
    if (status === 429) return "throttled";
    if (status >= 500) return "provider_unavailable";
    return "unknown";
}

function trustProviderMessageStatus(status?: number) {
    if (!status) return true;
    if (status >= 200 && status < 300) return true;
    return status === 400 || status === 402 || status === 409 || status === 413 || status === 422 || status === 429 || status === 451;
}

function extractExplicitHttpStatus(raw: string) {
    const match = raw.match(HTTP_STATUS) || raw.match(WRAPPED_HTTP_STATUS);
    const status = match ? Number(match[1]) : 0;
    return status >= 400 && status <= 599 ? status : 0;
}

function explanationCopy(classified: Classified): CategoryCopy {
    if (classified.reason) return { reason: classified.reason, action: classified.action || "" };
    return CATEGORY_COPY[classified.category] || CATEGORY_COPY.unknown;
}

function debugIdLine(taskId?: string, requestId?: string) {
    const parts = [sanitizeDebugId(taskId) ? `任務 ${sanitizeDebugId(taskId)}` : "", sanitizeDebugId(requestId) ? `請求 ${sanitizeDebugId(requestId)}` : ""].filter(Boolean);
    return parts.length ? `排查編號：${parts.join(" · ")}` : "";
}

function joinSentences(...parts: Array<string | undefined>): string {
    const out = parts.map((part) => (part || "").trim().replace(/[。.;；]+$/u, "")).filter(Boolean);
    if (!out.length) return DEFAULT_GENERATION_ERROR_MESSAGE;
    if (out.length === 1) return out[0];
    return `${out.join("。")}。`;
}

function sanitizeDebugId(value?: string) {
    const text = (value || "").trim();
    if (!text || text.length > 80 || !SAFE_ID.test(text) || UNSAFE_ID.test(text)) return "";
    return text;
}

function sanitizeProviderCode(value: string) {
    const text = value.trim();
    return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(text) && !/^(?:sk-|eyJ)|secret|password|bearer/i.test(text) ? text : "";
}

function sanitizeProviderText(value: string) {
    let text = value.trim();
    text = text.replace(/(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|private|tmp|var|Volumes|mnt|media|run|root|opt|srv|etc)\/)[^\r\n:"'<>]+/gi, "[路徑已隱藏]");
    if (!text || HTML_BODY.test(text)) return "";
    // Unstructured messages may echo whole headers or prompts; discard the suffix,
    // since a whitespace-based token matcher cannot know where a secret ends.
    text = text.replace(/(?:authorization|cookie|set-cookie|api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|password|prompt|input|query)\s*[=:：][\s\S]*/i, "[已隱藏]");
    text = text.replace(URL_PATTERN, "").replace(SIGNED_QUERY, "").replace(SECRET_PATTERN, "").replace(PROMPT_ECHO, "$1[已隱藏]");
    text = text.replace(/\s+/g, " ").trim();
    if (text.startsWith("{") || text.startsWith("[") || text.startsWith("<")) return "";
    return text.slice(0, 240);
}

function normalizeCode(value: string) {
    return value.toLowerCase().trim().replace(/-/g, "_").replace(/\s+/g, "_");
}

function allowlistedString(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && value !== 0) return String(value);
    return "";
}

function numericStatus(value: unknown) {
    if (typeof value === "number" && value >= 400 && value <= 599) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) {
        const status = Number(value);
        return status >= 400 && status <= 599 ? status : undefined;
    }
    return undefined;
}

function stringifyAllowlisted(value: unknown) {
    try {
        return JSON.stringify(value);
    } catch {
        return "";
    }
}

function emptyFields(): ExtractedFields {
    return { code: "", type: "", status: "", message: "", param: "", requestId: "", taskId: "" };
}

function isModerationCategory(value: string) {
    return value === "moderation_input" || value === "moderation_reference" || value === "moderation_output" || value === CONTENT_MODERATION_ERROR_CODE;
}

function retryableCategory(category: GenerationErrorCategory) {
    return category === "throttled" || category === "provider_unavailable" || category === "network" || category === "timeout" || category === "concurrency" || category === "request_not_sent";
}

function isNetworkText(value: string) {
    return /\b(?:dial tcp|connection refused|connection reset|forcibly closed by the remote host|software caused connection abort|connection was aborted by the software in your host machine|wsaeconnreset|wsaeconnaborted|no such host|i\/o timeout|context deadline exceeded|network error|failed to fetch|fetch failed|socket hang up|econnrefused|econnreset|etimedout)\b/i.test(value);
}

function isMalformedText(value: string) {
    return /(?:介面返回非 JSON|沒有返回有效 JSON|invalid character|unexpected end of json|<!doctype|<html)/i.test(value);
}

function isDownloadText(value: string) {
    return value.includes("影片結果下載失敗") || (value.includes("下載失敗") && value.includes("結果"));
}

function isCancelledText(value: string) {
    return value.includes("任務已取消") || value.includes("請求已取消") || /context canceled/i.test(value);
}

function isResultsMissingText(value: string) {
    return value.includes("沒有返回圖片") || value.includes("沒有返回影片") || value.includes("沒有可用結果") || value.includes("介面沒有返回");
}

function isCanvasSaveConflictText(text: string) {
    return (
        text.includes("雲端畫布已有更新") ||
        text.includes("已停止覆蓋") ||
        text.includes("畫布有版本衝突") ||
        text.includes("生成結果已保留，但畫布有版本衝突") ||
        text.includes("畫布有未處理的外部改動") ||
        text.startsWith(CATEGORY_COPY.canvas_conflict.reason)
    );
}

function matchPersistedCategory(text: string): GenerationErrorCategory | "" {
    if (text.startsWith("當前賬號額度不足")) return "quota_user";
    for (const [category, copy] of Object.entries(CATEGORY_COPY) as Array<[GenerationErrorCategory, CategoryCopy]>) {
        if (category === "unknown") continue;
        if (text.startsWith(copy.reason)) return category;
    }
    if (text.includes("真人形象")) return "moderation_reference";
    if (text.includes("不支援強制工具呼叫")) return "invalid_params";
    if (text.startsWith("影片時長不符合模型要求")) return "invalid_params";
    if (text.includes("可能仍在服務端執行") || text.includes("請勿立即重試")) return "timeout";
    return "";
}

function containsInfrastructureDetails(value: string) {
    return /(?:介面請求失敗|Request failed with status code|https?:\/\/|\b(?:GET|POST|PUT|PATCH|DELETE)\s+["']?|Bad Gateway|Service Unavailable|Gateway Timeout|upstream_error)/i.test(value);
}

function providerPayloadMessage(payload: unknown): string {
    if (typeof payload === "string") return payload.trim();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
    const record = payload as Record<string, unknown>;
    if (record.error && typeof record.error === "object") {
        const nested = providerPayloadMessage(record.error);
        if (nested) return nested;
    }
    for (const key of ["message", "msg", "detail"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return typeof record.error === "string" ? record.error.trim() : "";
}

const REFERENCE_PREPARATION_COPY: Record<string, CategoryCopy> = {
    image_reference_upload_failed: { reason: "參考圖片上傳失敗，本次尚未開始生成", action: "請稍後重試" },
    reference_media_upload_failed: { reason: "參考素材上傳失敗，本次尚未開始生成", action: "請檢查物件儲存配置和公開讀取許可權後重試" },
    reference_preupload_failed: { reason: "參考素材上傳失敗，本次尚未開始生成", action: "請檢查網路或稍後重試" },
};

function persistedReferencePreparation(raw: string): Classified | undefined {
    const text = raw.trim();
    const debug = text.match(/。排查編號：([^。]+)。?$/)?.[1] || "";
    const requestId = sanitizeDebugId(debug.match(/(?:^| · )請求 ([A-Za-z0-9._:-]{6,127})$/)?.[1]);
    const taskId = sanitizeDebugId(debug.match(/^任務 ([A-Za-z0-9._:-]{6,127})(?: · |$)/)?.[1]);
    for (const [providerCode, copy] of Object.entries(REFERENCE_PREPARATION_COPY)) {
        const message = joinSentences(copy.reason, copy.action, debugIdLine(taskId, requestId));
        if (text === message || text === message.replace(/。$/, "")) {
            return { category: "provider_unavailable", ...copy, providerCode, requestId, taskId, fromCode: true, retryable: false };
        }
    }
}

function confirmedReferencePreparation(classified: Classified) {
    const copy = REFERENCE_PREPARATION_COPY[classified.providerCode || ""];
    return Boolean(copy && !classified.uncertain && classified.category === "provider_unavailable" && classified.reason === copy.reason && classified.action === copy.action);
}

function resourceStorageFailureMessage(value: string) {
    if (!value) return "";
    if (isLocalRuntimeMode() && /(?:參考(?:圖片|媒體)上傳失敗|OSS 上傳失敗|物件儲存|騰訊雲 COS|七牛雲)/i.test(value)) {
        return "本地參考素材儲存失敗，請檢查本地資源目錄後重試。";
    }
    if (/\bUserDisable\b/i.test(value)) return "物件儲存賬號已停用，請檢查或更換物件儲存配置。";
    if (/(?:參考(?:圖片|媒體)上傳失敗|OSS 上傳失敗|物件儲存|騰訊雲 COS|七牛雲)/i.test(value)) {
        return "參考素材上傳到物件儲存失敗，請檢查物件儲存配置後重試。";
    }
    return "";
}
