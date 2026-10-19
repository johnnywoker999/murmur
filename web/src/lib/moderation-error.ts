import type { GenerationErrorCategory } from "./generation-error";

type ModerationCopy = { category: GenerationErrorCategory; reason: string; action: string };
const labels: Record<string, string[]> = {
    input: ["輸入文本", "參考圖片", "參考影片", "參考音訊"],
    output: ["生成文字", "生成圖片", "生成影片", "生成音訊"],
};
const mediaTypes = ["text", "image", "video", "audio"];

// Ark's documented families encode direction, medium and cause separately.
// PolicyViolation means copyright here; it is not a generic real-person rule.
export function moderationErrorCopy(code: string, message: string): ModerationCopy | undefined {
    const match = code.toLowerCase().match(/^(input|output)(text|image|video|audio)(?:sensitivecontentdetected|riskdetection)(?:\.(policyviolation|privacyinformation|deepfake))?$/);
    let direction = match?.[1];
    let media = match?.[2];
    let cause = match?.[3] || "";
    if (!direction) {
        if (/prompt\s+or\s+(?:reference|input)\s+/i.test(message)) return;
        if (/\boutput may contain sensitive information\b/i.test(message)) return { category: "moderation_output", reason: "生成結果未通過內容安全稽核", action: "請調整提示詞或參考素材後重新生成" };
        const subject = message.toLowerCase().match(/\b(input|output|reference)\s+(text|image|video|audio)\b/);
        const safety = /may contain sensitive information|includes sensitive content|content (?:safety|policy)|safety policy|copyright restrictions|may contain real person|counterfeit documents or credentials/i.test(message);
        if (!subject || !safety) return;
        direction = subject[1] === "reference" ? "input" : subject[1];
        media = subject[2];
        if (/copyright restrictions/i.test(message)) cause = "policyviolation";
        else if (/may contain real person/i.test(message)) cause = "privacyinformation";
        else if (/counterfeit documents or credentials/i.test(message)) cause = "deepfake";
    }
    const label = labels[direction][mediaTypes.indexOf(media!)];
    const category: GenerationErrorCategory = direction === "output" ? "moderation_output" : media === "text" ? "moderation_input" : "moderation_reference";
    let reason = `${label}未通過內容安全稽核`;
    let action = direction === "output" ? "請調整提示詞；如使用了參考素材，請檢查並更換後重新生成" : media === "text" ? "請調整提示詞後重新生成" : `請檢查並更換${label}後重新生成`;
    if (cause === "policyviolation") {
        reason = `${label}未通過上游版權稽核`;
        if (direction === "output" && media === "audio") action = "請調整音樂或音訊相關提示詞；如使用了參考音訊，請檢查並更換後重新生成";
    } else if (cause === "privacyinformation") {
        reason = direction === "input" && (media === "image" || media === "video") ? `${label}疑似包含真人形象，該模型拒絕生成` : `${label}未通過隱私稽核`;
    } else if (cause === "deepfake") {
        reason = `${label}未通過偽造內容稽核`;
    }
    return { category, reason, action };
}

// Persist only our exact generated copy, never arbitrary provider instructions.
export function persistedModerationCopy(text: string): ModerationCopy | undefined {
    for (const direction of ["input", "output"]) {
        for (const media of mediaTypes) {
            for (const suffix of ["", ".PolicyViolation", ".PrivacyInformation", ".DeepFake"]) {
                const copy = moderationErrorCopy(`${direction}${media}SensitiveContentDetected${suffix}`, "")!;
                if (text.startsWith(`${copy.reason}。${copy.action}。`)) return copy;
            }
        }
    }
}
