const GROK_IMAGE_PROMPT_MAX_BYTES = 8000;

export function grokImagePromptLimitError(prompt: string, interfaceType?: string, model?: string) {
    const modelName = model?.trim().toLowerCase().replace(/^models\//, "");
    if (interfaceType !== "grok-image" || modelName !== "grok-imagine-image-quality") return null;
    const promptBytes = new TextEncoder().encode(prompt).byteLength;
    if (promptBytes <= GROK_IMAGE_PROMPT_MAX_BYTES) return null;
    return `Grok 圖片完整提示詞為 ${promptBytes} UTF-8 位元組，超過上游 ${GROK_IMAGE_PROMPT_MAX_BYTES} 位元組限制。完整提示詞包含當前輸入及自動展開的連線文本、角色卡、畫風和模板；系統不會自動刪改，請回到相應節點精簡後重試。`;
}
