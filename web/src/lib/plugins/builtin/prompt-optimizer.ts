import { registerPlugin } from "../plugin-registry";
import type {
    PluginManifest,
    PluginTextContentPart,
    PluginTextMessage,
    PluginTextTool,
    PromptOptimizationInput,
    PromptOptimizationMode,
    PromptOptimizationResult,
    PromptOptimizationVariant,
    PromptOptimizerProvider,
    RegisteredPlugin,
} from "../plugin-types";

export const PROMPT_OPTIMIZER_PLUGIN_ID = "prompt-optimizer";

const modeLabels: Record<PromptOptimizationMode, string> = {
    expand: "擴充套件想法",
    refine: "精修已有提示詞",
    style: "強化視覺風格",
    "model-adapt": "適配當前模型",
    reference: "結合參考素材",
};

const optimizerTool: PluginTextTool = {
    type: "function",
    function: {
        name: "optimize_prompt",
        description: "返回結構化的 AI 生圖或生影片提示詞最佳化結果。",
        strict: true,
        parameters: {
            type: "object",
            additionalProperties: false,
            required: ["optimizedPrompt", "negativePrompt", "changes", "assumptions", "variants"],
            properties: {
                optimizedPrompt: { type: "string", description: "可直接用於生成的正向提示詞。" },
                negativePrompt: { type: "string", description: "需要規避的內容；沒有時返回空字串。" },
                changes: { type: "array", items: { type: "string" }, description: "相較輸入提示詞做出的關鍵變化。" },
                assumptions: { type: "array", items: { type: "string" }, description: "對模糊需求做出的假設；沒有時返回空陣列。" },
                variants: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["label", "prompt"],
                        properties: {
                            label: { type: "string" },
                            prompt: { type: "string" },
                        },
                    },
                    description: "最多兩個可選的提示詞版本。",
                },
            },
        },
    },
};

const manifest: PluginManifest = {
    id: PROMPT_OPTIMIZER_PLUGIN_ID,
    name: "AI 提示詞最佳化器",
    version: "0.3.0",
    apiVersion: "beeftv.plugin/v1",
    description: "把模糊的生圖想法整理成可執行、可比較、適配當前模型的提示詞。",
    author: "內建工具",
    permissions: ["canvas.read", "canvas.write", "ai.text"],
    trusted: true,
    runtime: { web: "trusted-backend" },
    contributes: { aiCapabilities: ["prompt-optimizer"] },
};

const systemPrompt = [
    "你是當前創作工作臺裡的提示詞導演，負責把使用者模糊的視覺想法整理成可以直接交給生成模型的提示詞。",
    "只最佳化表達和可執行性，不擅自改變使用者明確寫出的主體、身份、動作、數量、時代、地點、畫幅比例或安全邊界。",
    "優先使用具體視覺化語言：主體與關係、構圖與景別、動作、環境、材質、光線、色彩、鏡頭和風格。",
    "如果輸入已經足夠明確，保持原意並做剋制的精修；如果資訊不足，把不確定項寫入 assumptions，不要假裝知道。",
    "根據 generationMode 選擇表達：圖片側重靜態畫面、構圖和材質，影片側重動作連續性、時長感、鏡頭運動和首尾銜接。",
    "當最佳化模式是適配當前模型時，先結合 targetProtocol 和 targetModel 判斷模型族，再嚴格執行模型適配策略；不要編造不存在的引數、權重語法或模型能力。",
    "最終必須呼叫 optimize_prompt 工具，不要輸出 Markdown，不要在工具呼叫之外解釋。",
].join("\n");

type ModelAdaptationProfile = {
    id: string;
    label: string;
    promptShape: string;
    rules: string[];
    avoid: string[];
};

const genericImageProfile: ModelAdaptationProfile = {
    id: "generic-image",
    label: "通用圖片模型",
    promptShape: "自然語言描述，按主體與動作 → 環境 → 構圖 → 光線與材質 → 風格排列。",
    rules: ["先鎖定主體、數量、身份和動作，再補充可見的畫面細節。", "把重要的比例、文字、位置和一致性要求寫明確。"],
    avoid: ["不要臆造供應商引數或控制語法。", "關鍵規避項不要只放在 negativePrompt 中，正向提示詞也要表達清楚。"],
};

const genericVideoProfile: ModelAdaptationProfile = {
    id: "generic-video",
    label: "通用影片模型",
    promptShape: "單鏡頭時序描述，按起始畫面 → 主體動作 → 鏡頭運動 → 環境變化 → 結尾狀態排列。",
    rules: ["每個動作使用可觀察、連續的動詞，避免一段話塞入互不相連的多個鏡頭。", "明確主體、鏡頭和環境誰在運動，並保持角色、服裝和場景一致。"],
    avoid: ["不要把靜態攝影引數堆成關鍵詞列表。", "不要新增使用者未要求的轉場、角色或劇情。"],
};

function containsAny(value: string, keywords: string[]) {
    return keywords.some((keyword) => value.includes(keyword));
}

function resolveModelAdaptationProfile(input: PromptOptimizationInput): ModelAdaptationProfile {
    const model = `${input.targetModel || ""} ${input.targetProtocol || ""}`.toLowerCase();
    if (input.generationMode === "image") {
        if (containsAny(model, ["gemini", "imagen", "nano-banana", "nanobanana"])) {
            return {
                id: "gemini-image",
                label: "Gemini / Imagen 圖片模型",
                promptShape: "清晰的自然語言場景描述，按主體 → 背景與上下文 → 風格與攝影細節組織。",
                rules: ["優先使用完整句子和具體視覺事實，參考圖只描述確實可見的內容。", "如果畫面含文字，保留原文並明確位置、層級和字數，避免無關裝飾。", "控制提示詞長度，先保留主體、上下文和風格這三個核心層次。"],
                avoid: ["不要使用 SD 權重、反向提示詞標籤或未確認的供應商引數。"],
            };
        }
        if (containsAny(model, ["gpt-image", "dall-e", "dalle", "openai-image", "openai"])) {
            return {
                id: "openai-image",
                label: "OpenAI 圖片模型",
                promptShape: "簡潔、完整的自然語言描述，先說要生成什麼，再補充構圖、光線、材質和風格。",
                rules: ["使用模型能直接理解的畫面描述，不把提示詞寫成控制台引數。", "對畫面中的文字、位置、數量和主體關係使用明確句子。"],
                avoid: ["不要新增 SD 權重、逗號關鍵詞堆疊或 -- 引數。", "不要依賴單獨 negativePrompt，重要限制要寫進正向描述。"],
            };
        }
        if (containsAny(model, ["grok-image", "grok-imagine"])) {
            return {
                id: "grok-image",
                label: "Grok 圖片模型",
                promptShape: "簡潔的自然語言畫面描述，主體、動作、環境和視覺風格清晰分層。",
                rules: ["保留明確的主體關係、構圖和風格意圖，避免把提示詞寫成引數清單。", "有參考圖時說明要保留的主體或風格特徵，不臆測看不見的細節。"],
                avoid: ["不要新增 SD 權重、Midjourney 引數或模型未確認支援的控制語法。"],
            };
        }
        if (containsAny(model, ["seedream", "jimeng", "doubao", "volcengine-ark-image", "volcengine-ark-agent-plan-image", "volcengine-jimeng-image"])) {
            return {
                id: "seedream-image",
                label: "Seedream / 即夢 / 火山圖片模型",
                promptShape: "中文自然語言鏡頭描述，按主體與動作 → 構圖 → 光影 → 材質與風格組織。",
                rules: ["優先寫清人物或主體的外觀、動作、空間關係和畫面重點。", "需要人物一致性時重複關鍵外觀特徵，避免只寫抽象的‘保持一致’。", "中文需求保持中文表達，英文專有名詞只在確實有幫助時保留。"],
                avoid: ["不要套用 SD 的權重語法、質量詞串或無意義的英文標籤。", "不要把多個鏡頭和互相沖突的動作混在一條提示詞裡。"],
            };
        }
        if (containsAny(model, ["flux"])) {
            return {
                id: "flux-image",
                label: "FLUX 圖片模型",
                promptShape: "自然語言段落 + 少量明確的視覺關鍵詞，主體和動作放在前面。",
                rules: ["用具體關係描述主體、位置、材質和光線，而不是重複質量形容詞。", "保留使用者指定的風格和構圖，不主動新增模型引數。"],
                avoid: ["不要輸出很長的逗號標籤清單或堆疊 negative prompt。", "不要新增未經使用者要求的 LoRA、取樣器或權重標記。"],
            };
        }
        if (containsAny(model, ["sdxl", "stable-diffusion", "stable diffusion", "sd3", "stable3"])) {
            return {
                id: "stable-diffusion-image",
                label: "Stable Diffusion / SDXL 圖片模型",
                promptShape: "緊湊的分層關鍵詞或短句，按主體 → 構圖 → 光線 → 風格與質量組織。",
                rules: ["只保留能影響畫面的關鍵詞，主體和構圖優先。", "如果原提示詞已經使用括號權重，只在確有必要時保留並少量調整。", "將畫面主體和反向規避項分開表達，避免互相沖突。"],
                avoid: ["不要盲目新增過多質量詞、藝術家名或模型專屬標籤。", "不確定權重語法是否被當前渠道支援時，不要主動新增。"],
            };
        }
        if (containsAny(model, ["midjourney", "mid-journey"])) {
            return {
                id: "midjourney-image",
                label: "Midjourney 圖片模型",
                promptShape: "精煉的視覺描述，主體、場景、構圖和風格清晰，引數放在末尾。",
                rules: ["優先寫畫面內容和視覺方向，保持短而有辨識度。", "只有使用者原本提供或明確要求時才保留 --ar、--stylize 等引數。"],
                avoid: ["不要臆造 Midjourney 引數或把所有攝影術語都堆上去。", "不要使用與當前工作臺協議無關的命令字首。"],
            };
        }
        if (containsAny(model, ["ideogram", "recraft"])) {
            return {
                id: "design-image",
                label: "設計與文字圖片模型",
                promptShape: "先說明畫布、主體和版式，再說明文字內容、位置、層級、字型氣質和配色。",
                rules: ["畫面文字保留精確原文並控制字數，明確文字與主體的空間關係。", "區分內容、版式和視覺風格，避免只給抽象審美詞。"],
                avoid: ["不要擅自改寫品牌名、標題、數字或標語。"],
            };
        }
        return genericImageProfile;
    }

    if (containsAny(model, ["seedance", "doubao-seedance", "volcengine-ark-video", "volcengine-ark-agent-plan-video", "volcengine-jimeng-video", "jimeng-video"])) {
        return {
            id: "seedance-video",
            label: "Seedance / 即夢影片模型",
            promptShape: "單鏡頭時序描述，明確起始構圖、動作節拍、鏡頭運動、環境變化和結尾狀態。",
            rules: ["用連續動作描述主體如何開始、發展和結束，保持鏡頭內的因果關係。", "人物、服裝、場景和道具的一致性優先於堆疊風格詞。", "有首幀或參考圖時，明確哪些內容必須保持、哪些內容允許變化。"],
            avoid: ["不要在一條提示詞中拼接多個無關鏡頭。", "不要把靜態圖片引數當成影片動作指令。"],
        };
    }
    if (containsAny(model, ["veo", "gemini-veo"])) {
        return {
            id: "veo-video",
            label: "Veo 影片模型",
            promptShape: "電影化的自然語言鏡頭描述，按主體、動作、鏡頭、環境和節奏組織。",
            rules: ["把想法拆成可觀察的動作和鏡頭運動，並補充時間順序。", "用景別、機位、運鏡、光線和環境聲等視覺化要素控制鏡頭。"],
            avoid: ["不要只寫情緒和抽象風格，不給動作或鏡頭變化。", "不要加入使用者未要求的多鏡頭轉場。"],
        };
    }
    if (containsAny(model, ["kling"])) {
        return {
            id: "kling-video",
            label: "Kling 影片模型",
            promptShape: "簡潔、連續的動作指令，明確主體運動和攝像機運動。",
            rules: ["每個動作都寫清主體、方向、速度或結果，避免互相沖突的動作。", "優先保證物理連續性、角色一致性和鏡頭穩定。"],
            avoid: ["不要加入過多抽象敘事或無法在短片段中完成的事件。"],
        };
    }
    if (containsAny(model, ["runway", "gen-3", "gen3", "minimax-video", "hailuo", "wan", "ltx-video", "hunyuan-video"])) {
        return {
            id: "general-video-family",
            label: "通用影片模型",
            promptShape: "以單個鏡頭為單位描述起始畫面、動作過程、攝影機和結束畫面。",
            rules: ["動作使用連續動詞，明確運動主體和攝像機，不把結果寫成靜態形容詞。", "保持角色、服裝、場景和光線的連續性。"],
            avoid: ["不要堆砌靜態圖片關鍵詞或一次安排過多動作。"],
        };
    }
    return genericVideoProfile;
}

function buildUserMessage(input: PromptOptimizationInput, modelProfile: ModelAdaptationProfile | null = input.mode === "model-adapt" ? resolveModelAdaptationProfile(input) : null): PluginTextMessage {
    const textParts = [
        `最佳化模式：${modeLabels[input.mode]}`,
        `目標型別：${input.generationMode === "image" ? "圖片" : "影片"}`,
        `目標生成模型：${input.targetModel?.trim() || "未指定"}`,
        `目標介面協議：${input.targetProtocol?.trim() || "未指定"}`,
        "",
        "使用者原始提示詞：",
        input.prompt.trim() || "（使用者還沒有寫出具體提示詞，請從參考上下文中提煉一個可執行版本）",
    ];
    if (modelProfile) {
        textParts.push(
            "",
            `模型適配策略：${modelProfile.label}`,
            `建議提示詞結構：${modelProfile.promptShape}`,
            "必須遵守：",
            ...modelProfile.rules.map((rule) => `- ${rule}`),
            "避免：",
            ...modelProfile.avoid.map((rule) => `- ${rule}`),
            "請在 changes 中明確說明已經採用的模型適配要點。",
        );
    }
    if (input.context?.texts?.length) {
        textParts.push("", "已連線的文本上下文：", ...input.context.texts.map((item) => `- ${item.title}：${item.text}`));
    }
    if (input.context?.images?.length) {
        textParts.push("", "已連線的參考圖已作為圖片輸入，請只在確實可見的內容上做判斷：", ...input.context.images.map((item) => `- ${item.title}`));
    }
    textParts.push(
        "",
        "輸出要求：",
        "1. optimizedPrompt 是一段可以直接複製到當前生成節點的提示詞。",
        "2. negativePrompt 只填寫明確有幫助的規避項，沒有就留空。",
        "3. changes 和 assumptions 使用簡短中文條目。",
        "4. variants 最多給出兩個明顯不同但仍忠於原意的版本，沒有必要時返回空陣列。",
    );

    const content: PluginTextContentPart[] = [{ type: "text", text: textParts.join("\n") }];
    for (const image of input.context?.images || []) {
        if (/^(data:|https?:\/\/)/i.test(image.url.trim())) content.push({ type: "image_url", image_url: { url: image.url.trim() } });
    }
    return { role: "user", content };
}

function parseJsonObject(value: string) {
    const cleaned = value
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
    const candidates = [cleaned];
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
    for (const candidate of candidates) {
        try {
            const parsed: unknown = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
            // 某些相容模型會在 JSON 外包一層解釋，繼續嘗試擷取物件部分。
        }
    }
    return null;
}

function stringArray(value: unknown) {
    return Array.isArray(value)
        ? value
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
        : [];
}

function variants(value: unknown): PromptOptimizationVariant[] {
    if (!Array.isArray(value)) return [];
    return value
        .flatMap((item): PromptOptimizationVariant[] => {
            if (!item || typeof item !== "object") return [];
            const record = item as Record<string, unknown>;
            const label = typeof record.label === "string" ? record.label.trim() : "備選版本";
            const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
            return prompt ? [{ label: label || "備選版本", prompt }] : [];
        })
        .slice(0, 2);
}

function normalizeResult(value: Record<string, unknown> | null, sourcePrompt: string, modelProfile?: ModelAdaptationProfile | null): PromptOptimizationResult {
    const optimizedPrompt = typeof value?.optimizedPrompt === "string" ? value.optimizedPrompt.trim() : "";
    const negativePrompt = typeof value?.negativePrompt === "string" ? value.negativePrompt.trim() : "";
    return {
        optimizedPrompt: optimizedPrompt || sourcePrompt.trim(),
        negativePrompt,
        changes: stringArray(value?.changes),
        assumptions: stringArray(value?.assumptions),
        variants: variants(value?.variants),
        modelProfile: modelProfile ? { id: modelProfile.id, label: modelProfile.label } : undefined,
    };
}

function createPromptOptimizer(context: Parameters<NonNullable<RegisteredPlugin["createPromptOptimizer"]>>[0]): PromptOptimizerProvider {
    const textService = context.services?.ai?.text;
    if (!textService) throw new Error("提示詞最佳化器暫未獲得文本模型服務");

    return {
        optimize: async (input, options) => {
            const modelProfile = input.mode === "model-adapt" ? resolveModelAdaptationProfile(input) : null;
            const response = await textService.requestToolResponse({
                model: input.optimizerModel,
                messages: [{ role: "system", content: systemPrompt }, buildUserMessage(input, modelProfile)],
                tools: [optimizerTool],
                toolChoice: { type: "function", name: "optimize_prompt" },
                signal: options?.signal,
                onDelta: options?.onDelta,
            });
            const toolCall = response.toolCalls.find((call) => call.name === "optimize_prompt");
            const parsed = parseJsonObject(toolCall?.arguments || response.content);
            return normalizeResult(parsed, input.prompt, modelProfile);
        },
    };
}

export const promptOptimizerPlugin: RegisteredPlugin = {
    manifest,
    createPromptOptimizer,
};

registerPlugin(promptOptimizerPlugin);
