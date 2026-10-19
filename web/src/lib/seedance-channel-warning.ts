// Temporary advisory for the two verified WhatsToken routes. Native Ark,
// Fast and Mini retain their own contract.
export function seedanceTaskRetryWarning(inputJson?: string, model?: string) {
    try {
        const input = JSON.parse(inputJson || "{}");
        const p = input.videoParameters;
        if (!p?.affectedChannel) return undefined;
        return seedanceReferenceRatioWarning({ model: p.model || model || "", credentialRef: "beefapi-enterprise", videoCount: p.videoCount, ratio: p.size, operation: input.metadata?.videoEditOperation });
    } catch { return undefined; }
}

export function seedanceReferenceRatioWarning(input: { model: string; baseUrl?: string; credentialRef?: string; videoCount: number; ratio: string; operation?: string }) {
    if (!input.videoCount || !["seedance-2.0", "seedance-2.0-official2", "seedance-2.5", "seedance-2.5-official"].includes(input.model)) return undefined;
    if (["inpaint", "replace_element", "style_transfer", "extend"].includes(input.operation || "")) return undefined;
    if (!input.ratio || ["adaptive", "auto"].includes(input.ratio)) return undefined;
    let host = "";
    try { host = new URL(input.baseUrl || "").hostname.toLowerCase(); } catch { /* Managed credentials may not expose a URL. */ }
    if (input.credentialRef !== "beefapi-enterprise" && !["beeftv.app", "enterprise.beefapi.com", "whatstoken.ai", "www.whatstoken.ai"].includes(host)) return undefined;
    return {
        title: "輸出比例可能與設定不一致",
        content: `當前模型帶參考影片生成時，可能不會按設定的 ${input.ratio} 輸出。繼續生成仍會計費，比例不符不會自動退款。你也可以更換模型，或移除參考影片後再生成。`,
        okText: "接受風險並生成",
        cancelText: "返回調整",
    };
}
