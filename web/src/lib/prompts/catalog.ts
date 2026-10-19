import type { CanvasGenerationMode } from "@/types/canvas";
import type { SrtEntry } from "@/types/timeline";

export type CanvasPromptPreset = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    modes: CanvasGenerationMode[];
    source: "builtin" | "skill";
};

export const CANVAS_BUILTIN_PRESETS: CanvasPromptPreset[] = [
    {
        id: "character-sheet",
        name: "角色設定圖",
        description: "正面、側面、背面與表情參考，鎖定角色一致性",
        prompt: "生成角色設定圖：保持同一角色身份、五官、髮型、服裝和體態一致，包含正面、側面、背面和關鍵表情參考，背景簡潔，便於後續鏡頭複用。",
        modes: ["image"],
        source: "builtin",
    },
    {
        id: "multi-angle",
        name: "多機位視角",
        description: "圍繞同一主體生成連續、可銜接的機位變化",
        prompt: "圍繞同一主體設計多機位畫面，保持人物、服裝、場景和光線一致，分別給出遠景、全景、中景、近景、特寫、側面、背面和俯拍視角，鏡頭之間具有連續性。",
        modes: ["image", "video"],
        source: "builtin",
    },
    {
        id: "next-shot",
        name: "畫面推演",
        description: "推演當前畫面的前後動作與鏡頭銜接",
        prompt: "基於當前畫面推演下一個連續鏡頭：保持角色和場景一致，明確主體接下來的動作、視線、環境變化、鏡頭運動和自然銜接方式，不要跳變構圖或身份。",
        modes: ["image", "video"],
        source: "builtin",
    },
    {
        id: "story-beats",
        name: "連續鏡頭",
        description: "將短劇情拆成可生成的連續鏡頭節拍",
        prompt: "把這段內容拆成連續鏡頭節拍。每個鏡頭寫清主體動作、景別、構圖、機位、運鏡、光線、情緒和與前後鏡頭的銜接，並保持角色、場景和道具一致。",
        modes: ["text", "image", "video"],
        source: "builtin",
    },
    {
        id: "cinematic-light",
        name: "電影光影最佳化",
        description: "保留內容，最佳化真實光線、層次和融合感",
        prompt: "保留主體身份、動作和原始構圖，最佳化為真實電影攝影光線：明確主光方向、環境反射、陰影層次、膚色和背景融合，降低塑膠感與過度銳化，不改變畫面內容。",
        modes: ["image", "video"],
        source: "builtin",
    },
    {
        id: "video-prompt",
        name: "影片提示詞最佳化",
        description: "整理為模型更容易執行的時序化鏡頭指令",
        prompt: "將當前要求改寫為結構化影片提示詞，按時間順序描述開場畫面、主體動作、鏡頭運動、環境變化、聲音和結束畫面；消除衝突指令，保留所有關鍵約束。",
        modes: ["text", "video"],
        source: "builtin",
    },
];

export const IMAGE_PROMPT_REVERSE = `請根據參考圖片反推一段適合用於 AI 生圖的提示詞。

要求：
1. 只輸出提示詞正文，不要解釋。
2. 覆蓋主體、構圖、風格、光線、色彩、材質、鏡頭和氛圍。
3. 儘量寫成可直接用於生圖模型的完整提示詞。`;

export function workflowStarterPrompt(kind: "character_cards" | "character_three_view" | "storyboard_video", title: string, workflowTitle: string) {
    if (kind === "character_cards") return `請基於「${workflowTitle}」拆分主要角色，併為每個角色生成可用於後續創作的角色圖片卡片：外觀、服飾、身份、性格和視覺辨識點。`;
    if (kind === "character_three_view") return `請基於上游角色卡片生成「${title}」：同一角色的正面、側面、背面三檢視，保持服飾、髮型、道具和比例一致。`;
    return `請基於上游角色三檢視，為「${workflowTitle}」製作分鏡劇情影片方案：包含鏡頭順序、景別、動作、節奏和畫面連續性。`;
}

export function buildTextRewritePrompt(sourceText: string, instruction: string) {
    return `請根據要求修改以下文本。\n\n原文：\n${sourceText}\n\n修改要求：\n${instruction}`;
}

export function buildVideoOperationPrompt(operation: string, prompt: string, operationLabel: string) {
    if (operation === "compare_versions") return `請對以下影片結果版本做對比分析，輸出推薦版本、差異點和修改建議：\n${prompt}`;
    return `影片編輯任務：${operationLabel}\n創作要求：${prompt}`;
}

export function buildSubtitleHighlightSystemPrompt() {
    return `你是一個影片字幕關鍵詞高亮助手。請輸出嚴格 JSON。

任務目標：
- 為每條字幕判斷是否需要高亮
- 每條字幕最多高亮 1 段
- 只返回最值得高亮的一個關鍵詞或短語
- start 和 end 使用 JavaScript 字串下標
- end 為 exclusive
- 沒有明確重點時返回 shouldHighlight=false

高亮標準：
- 優先高亮結論詞、數字、身份詞、首次/突破詞、強反差詞
- 不要高亮虛詞、口頭語、整句長短語

邊界約束：
- 不負責顏色、字號、位置、動效
- 只返回 highlights 陣列
- highlightText 必須嚴格等於原字幕文本切片結果`;
}

export function buildSubtitleHighlightUserMessage(entries: SrtEntry[]) {
    const lines = entries.map((entry) => {
        return `entryIndex=${entry.index} | startMs=${entry.startMs} | endMs=${entry.endMs} | text=${entry.text}`;
    });
    return `請根據以下字幕和上下文，為每條字幕判斷是否需要高亮，並返回 JSON：

{
  "highlights": [
    {
      "entryIndex": 1,
      "shouldHighlight": true,
      "highlightText": "示例",
      "start": 0,
      "end": 2
    }
  ]
}

字幕列表：
${lines.join("\n")}`;
}
