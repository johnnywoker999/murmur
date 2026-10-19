export type PortraitTextureSettings = {
    personSceneFusion: "light" | "natural" | "deep";
    lightingFusion: "soft" | "natural" | "atmosphere";
    skin: "clear" | "natural" | "real";
    texture: "soft" | "natural" | "grain";
    sharpness: "soft" | "standard" | "high";
};

export type PortraitTextureSettingKey = keyof PortraitTextureSettings;

type PortraitTextureOption = {
    value: string;
    label: string;
    prompt: string;
};

export type PortraitTextureGroup = {
    key: PortraitTextureSettingKey;
    label: string;
    options: readonly PortraitTextureOption[];
};

export const DEFAULT_PORTRAIT_TEXTURE_SETTINGS: PortraitTextureSettings = {
    personSceneFusion: "deep",
    lightingFusion: "natural",
    skin: "natural",
    texture: "natural",
    sharpness: "standard",
};

export const PORTRAIT_TEXTURE_GROUPS: readonly PortraitTextureGroup[] = [
    {
        key: "personSceneFusion",
        label: "人景融合",
        options: [
            { value: "light", label: "輕度對齊", prompt: "輕度對齊人物與場景，僅修正明顯邊緣和空間關係" },
            { value: "natural", label: "自然融合", prompt: "自然融合人物與場景，統一邊緣、色調和空間關係" },
            { value: "deep", label: "深度融合", prompt: "深度融合人物與場景，細緻統一邊緣、環境色和空間層次" },
        ],
    },
    {
        key: "lightingFusion",
        label: "光影融合",
        options: [
            { value: "soft", label: "柔和補光", prompt: "使用柔和補光，減弱生硬陰影並保留自然明暗" },
            { value: "natural", label: "自然匹配", prompt: "讓人物光向、色溫與場景光線自然匹配" },
            { value: "atmosphere", label: "氛圍強化", prompt: "強化環境光與氛圍光，保持光影方向合理" },
        ],
    },
    {
        key: "skin",
        label: "皮膚",
        options: [
            { value: "clear", label: "清透修飾", prompt: "清透修飾皮膚，適度均勻膚色且不過度磨皮" },
            { value: "natural", label: "自然膚質", prompt: "保留自然膚質、毛孔和真實膚色過渡" },
            { value: "real", label: "真實肌理", prompt: "強化真實皮膚肌理和細微質感，避免塑膠感" },
        ],
    },
    {
        key: "texture",
        label: "紋理",
        options: [
            { value: "soft", label: "柔和紋理", prompt: "使用柔和細膩的整體紋理，減少粗糙噪點" },
            { value: "natural", label: "自然紋理", prompt: "保持服裝、頭髮、皮膚和場景材質的自然紋理" },
            { value: "grain", label: "顆粒質感", prompt: "增加剋制的顆粒質感和材質層次" },
        ],
    },
    {
        key: "sharpness",
        label: "銳度",
        options: [
            { value: "soft", label: "柔焦", prompt: "使用輕柔焦效果，保持主體輪廓可辨" },
            { value: "standard", label: "標準清晰", prompt: "保持標準清晰度，細節自然且不過度銳化" },
            { value: "high", label: "高畫質銳化", prompt: "提升關鍵細節清晰度，避免銳化光暈和噪點" },
        ],
    },
] as const;

export function normalizePortraitTextureSettings(value: unknown): PortraitTextureSettings {
    const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
        personSceneFusion: normalizeSetting("personSceneFusion", candidate.personSceneFusion),
        lightingFusion: normalizeSetting("lightingFusion", candidate.lightingFusion),
        skin: normalizeSetting("skin", candidate.skin),
        texture: normalizeSetting("texture", candidate.texture),
        sharpness: normalizeSetting("sharpness", candidate.sharpness),
    };
}

export function buildPortraitTexturePrompt(userPrompt: string, value: unknown) {
    const settings = normalizePortraitTextureSettings(value);
    const instructions = PORTRAIT_TEXTURE_GROUPS.map((group) => {
        const selected = group.options.find((option) => option.value === settings[group.key]);
        return `${group.label}（${selected?.label || "預設"}）：${selected?.prompt || "保持自然"}`;
    });

    return [
        userPrompt.trim(),
        "請基於參考圖片進行人物質感調節，只最佳化下列視覺屬性：",
        ...instructions.map((instruction) => `- ${instruction}`),
        "必須保持原人物身份、五官、髮型、服裝、姿勢、構圖、場景和畫面比例；不得新增或刪除主體，不得新增文字、水印或標誌。",
    ].filter(Boolean).join("\n");
}

function normalizeSetting<Key extends PortraitTextureSettingKey>(key: Key, value: unknown): PortraitTextureSettings[Key] {
    const group = PORTRAIT_TEXTURE_GROUPS.find((item) => item.key === key);
    return group?.options.some((option) => option.value === value)
        ? value as PortraitTextureSettings[Key]
        : DEFAULT_PORTRAIT_TEXTURE_SETTINGS[key];
}
