import type { GenerationErrorCategory } from "./generation-error";

type VODCopy = { category: GenerationErrorCategory; reason: string; action: string; uncertain: boolean };
const copies: Record<string, VODCopy> = {
    capacity: { category: "concurrency", reason: "圖片服務當前繁忙", action: "請稍後再試", uncertain: false },
    rate: { category: "throttled", reason: "圖片服務請求過於頻繁", action: "請稍後再試", uncertain: false },
    channel_auth: { category: "permission", reason: "當前圖片服務未通過授權", action: "請聯絡支援檢查渠道許可權後再試", uncertain: false },
    channel_config: { category: "permission", reason: "當前圖片服務配置有誤", action: "請聯絡支援檢查服務配置後再試", uncertain: false },
    input_missing: { category: "input_inaccessible", reason: "參考素材不存在或已無法訪問", action: "請檢查並更換參考素材後重新生成", uncertain: false },
    invalid_params: { category: "invalid_params", reason: "圖片生成引數不符合要求", action: "請檢查模型、尺寸、格式和數量後再試", uncertain: false },
    invalid_media: { category: "invalid_params", reason: "參考素材格式不受當前模型支援", action: "請轉換圖片格式後更換參考素材", uncertain: false },
    duplicate: { category: "submission_uncertain", reason: "檢測到已有相同的圖片任務", action: "請先檢視原任務結果，不要重複提交", uncertain: true },
    create_unknown: { category: "submission_uncertain", reason: "尚未確認圖片任務是否建立成功", action: "請聯絡支援核對原任務，不要重複提交", uncertain: true },
    task_internal: { category: "async_failed", reason: "圖片任務因模型服務內部錯誤而失敗", action: "請保留排查資訊並聯系支援核對結果，再決定是否重新生成", uncertain: false },
    task_failed: { category: "async_failed", reason: "模型未能完成這次圖片生成", action: "請保留排查資訊並聯系支援核對原因，再決定是否重新生成", uncertain: false },
    task_timeout: { category: "timeout", reason: "圖片任務執行超時", action: "請聯絡支援查詢原任務結果，不要立即重新生成", uncertain: true },
    cancelled: { category: "cancelled", reason: "圖片任務已取消", action: "如仍需生成，請確認後重新提交", uncertain: false },
    query_failed: { category: "submission_uncertain", reason: "暫時無法查詢圖片任務結果", action: "請稍後檢視原任務，不要重複提交", uncertain: true },
    query_rejected: { category: "submission_uncertain", reason: "原圖片任務查詢被服務拒絕", action: "請聯絡支援修復查詢，不要重複提交", uncertain: true },
    query_missing: { category: "submission_uncertain", reason: "暫時無法找到原圖片任務", action: "請聯絡支援核對任務記錄，不要重複提交", uncertain: true },
    query_auth: { category: "submission_uncertain", reason: "圖片服務暫時無權查詢原任務", action: "請聯絡支援檢查渠道許可權並恢復查詢，不要重複提交", uncertain: true },
    unknown: { category: "submission_uncertain", reason: "圖片任務結果尚未確認", action: "請先檢視原任務或聯絡支援核對，不要重複提交", uncertain: true },
    partial: { category: "partial_success", reason: "部分圖片已生成，任務未全部完成", action: "請聯絡支援取回圖片，再決定是否補做", uncertain: true },
    results_missing: { category: "results_missing", reason: "圖片任務已結束，但未返回可用圖片", action: "請聯絡支援核對原任務，不要重複提交", uncertain: true },
    download_failed: { category: "download_failed", reason: "圖片已生成，但下載失敗", action: "請聯絡支援取回原圖片，不要重新生成", uncertain: true },
    request_large: { category: "input_too_large", reason: "圖片請求的資料量超過服務上限", action: "請減少參考素材或壓縮圖片後再試", uncertain: false },
    unsupported: { category: "model_missing", reason: "當前圖片服務不支援這次請求", action: "請聯絡支援檢查模型、介面和地域設定", uncertain: false },
    response_large: { category: "submission_uncertain", reason: "圖片服務返回的資料超過介面上限", action: "請聯絡支援取回結果，不要重複提交", uncertain: true },
    source_busy: { category: "input_inaccessible", reason: "圖片任務所需資源正在被佔用", action: "請確認參考素材可用後再試", uncertain: false },
    dry_run: { category: "invalid_params", reason: "本次為服務檢查，未執行圖片生成", action: "請聯絡支援檢查渠道配置後再試", uncertain: false },
    moderation: { category: "moderation_input", reason: "提示詞或參考素材未通過內容安全稽核", action: "請調整提示詞或參考素材後重新生成", uncertain: false },
};
const codes: Record<string, Record<string, string>> = {
    "create": {
        "FailedOperation": "create_unknown",
        "FailedOperation.InvalidVodUser": "channel_config",
        "InternalError": "create_unknown",
        "InvalidParameter": "invalid_params",
        "InvalidParameterValue.FileId": "input_missing",
        "InvalidParameterValue.SessionContextTooLong": "channel_config",
        "InvalidParameterValue.SessionId": "duplicate",
        "InvalidParameterValue.SessionIdTooLong": "channel_config",
        "InvalidParameterValue.SubAppId": "channel_config",
        "LimitExceeded.Quota": "capacity",
        "UnauthorizedOperation": "channel_auth",
        "ActionOffline": "unsupported",
        "AuthFailure": "channel_auth",
        "AuthFailure.InvalidAuthorization": "channel_auth",
        "AuthFailure.InvalidSecretId": "channel_auth",
        "AuthFailure.MFAFailure": "channel_auth",
        "AuthFailure.SecretIdNotFound": "channel_auth",
        "AuthFailure.SignatureExpire": "channel_auth",
        "AuthFailure.SignatureFailure": "channel_auth",
        "AuthFailure.TokenFailure": "channel_auth",
        "AuthFailure.UnauthorizedOperation": "channel_auth",
        "DryRunOperation": "dry_run",
        "InvalidAction": "unsupported",
        "InvalidParameterValue": "invalid_params",
        "InvalidRequest": "invalid_params",
        "IpInBlacklist": "channel_auth",
        "IpNotInWhitelist": "channel_auth",
        "LimitExceeded": "capacity",
        "MissingParameter": "invalid_params",
        "NoSuchProduct": "unsupported",
        "NoSuchVersion": "unsupported",
        "RequestLimitExceeded": "rate",
        "RequestLimitExceeded.GlobalRegionUinLimitExceeded": "rate",
        "RequestLimitExceeded.IPLimitExceeded": "rate",
        "RequestLimitExceeded.UinLimitExceeded": "rate",
        "RequestSizeLimitExceeded": "request_large",
        "ResourceInUse": "source_busy",
        "ResourceInsufficient": "capacity",
        "ResourceNotFound": "input_missing",
        "ResourceUnavailable": "capacity",
        "ResponseSizeLimitExceeded": "response_large",
        "ServiceUnavailable": "capacity",
        "UnknownParameter": "invalid_params",
        "UnsupportedOperation": "unsupported",
        "UnsupportedProtocol": "unsupported",
        "UnsupportedRegion": "unsupported",
        "InvalidParameter.VoilationContent": "moderation",
        "InvalidParameter.ViolationContent": "moderation",
        "ContentModerationFailed": "moderation"
    },
    "task": {
        "RequestLimitExceeded": "capacity",
        "InvalidParameter.VoilationContent": "moderation",
        "InvalidParameter.ViolationContent": "moderation",
        "InvalidParameterValue": "invalid_params",
        "FailedOperation": "capacity",
        "InternalError": "task_internal",
        "InvalidParameter": "invalid_params",
        "InvalidParameter.MediaFormat": "invalid_media",
        "ContentModerationFailed": "moderation",
        "ResourceInsufficient": "capacity",
        "ModelGenerateFailed": "task_failed",
        "ResourceNotFound": "input_missing",
        "OperationCanceled": "cancelled",
        "TaskTimeout": "task_timeout"
    }
};

// The stage owns ambiguous VOD codes. Read only the error text supplied by the caller.
function genericVODCode(code: string) {
    const normalized = code.toLowerCase().trim().replace(/-/g, "_").replace(/\s+/g, "_");
    return ["", "unknown", "failed", "badrequest", "api_error", "upstream_error", "upstream_rejected", "invalid_request", "invalid_request_error", "invalid_parameter", "invalidparameter", "invalid_argument", "bad_response", "bad_response_body"].includes(normalized) || /^\d{3}$/.test(normalized);
}

export function vodImageErrorCopy(code: string, text: string): (VODCopy & { providerCode?: string; fromCode: boolean; retryable: boolean }) | undefined {
    if (code === "access_denied" && text.startsWith("你的請求觸發了上游內容安全策略，類別：內容安全")) return { ...copies.moderation, fromCode: true, retryable: false };
    let key = code.startsWith("vod_image_") ? code.slice(10) : "";
    let providerCode = code;
    if (!Object.hasOwn(copies, key)) {
        for (const [candidate, copy] of Object.entries(copies)) {
            if (text.startsWith(copy.reason + "。" + copy.action + "。") && (genericVODCode(code) || code === copy.category || (code === "image_result_unknown" && copy.uncertain))) { key = candidate; break; }
        }
    }
    if (!Object.hasOwn(copies, key)) {
        const match = text.trim().match(/^VOD (?:(image task failed) \[([A-Za-z][A-Za-z0-9_.]*|)\]|([A-Za-z][A-Za-z0-9_.]*)):/);
        if (!match) return;
        // An authoritative outer error must never be overridden by nested text.
        if (!genericVODCode(code)) return;
        const stage = match[1] ? "task" : "create";
        providerCode = match[2] || match[3] || "";
        key = Object.hasOwn(codes[stage], providerCode) ? codes[stage][providerCode] : (stage === "task" ? "task_failed" : "create_unknown");
        if (stage === "task" && ["", "ModelGenerateFailed"].includes(providerCode) && /\brejected (?:by the|as a result of (?:our|the)) safety system\b/i.test(text)) key = "moderation";
    }
    const copy = Object.hasOwn(copies, key) ? copies[key] : undefined;
    if (!copy) return;
    return { ...copy, providerCode: providerCode || undefined, fromCode: true, retryable: false };
}

