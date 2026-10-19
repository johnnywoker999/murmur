import { isVolcengineArkVideoProtocol, type ModelProtocol, type ModelProtocolWorkflow } from "@/lib/model-protocols";
import { beefAPIImageContract } from "@/lib/beefapi-image-contracts";
import type { ImageResolutionOption, ImageResolutionTier } from "@/lib/image-resolution-tiers";

export type ModelCapabilityConfig = {
    version: number;
    text?: TextCapabilityConfig;
    image?: ImageCapabilityConfig;
    video?: VideoCapabilityConfig;
};

export type TextCapabilityConfig = {
    /** Whether the upstream text endpoint accepts SSE streaming responses. */
    streaming?: boolean;
    /** Whether the model exposes a user-selectable reasoning/thinking mode. */
    thinking?: boolean;
    references: {
        promptMaxChars: number;
        maxImages: number;
        maxImageBytes: number;
        maxVideos: number;
        maxVideoBytes: number;
    };
};

export type ImageSizeParameter = "none" | "size" | "aspect_ratio";

/**
 * 普通影片模型提示詞字元數的預設上限。
 *
 * 影片提示詞由「輸入框文本 + 連線內容 + 技能上下文」合成，遠長於使用者手輸內容，
 * 因此不能沿用偏小的預設值把畫布工作流攔在本地。必須與後端
 * `DefaultVideoPromptMaxChars` 保持一致，否則前端放行後端拒絕（或反之）。
 */
export const DEFAULT_VIDEO_PROMPT_MAX_CHARS = 8000;

export type ImageCapabilityConfig = {
    references: {
        promptMaxChars: number;
        maxImages: number;
        maxImageBytes: number;
        maskSupported: boolean;
    };
    size: {
        parameter: ImageSizeParameter;
        values: string[];
        default: string;
        allowCustom: boolean;
        presets?: ImageResolutionOption[];
    };
    quality: {
        supported: boolean;
        values: string[];
        default: string;
    };
    transparentBackground: { supported: boolean; default: boolean };
    responseFormat: { supported: boolean };
    outputFormat: { supported: boolean };
    maxOutputs: number;
    fixedOutputs?: number;
};

export type VideoCapabilityConfig = {
    references: {
        promptMaxChars: number;
        minImages: number;
        maxImages: number;
        maxImageBytes: number;
        minImageWidth?: number;
        maxImageWidth?: number;
        minImageHeight?: number;
        maxImageHeight?: number;
        minImageAspect?: number;
        maxImageAspect?: number;
        minImagePixels?: number;
        maxImagePixels?: number;
        maxVideos: number;
        maxVideoBytes: number;
        maxVideoDurationSeconds: number;
        minVideoDurationSeconds?: number;
        maxVideoTotalDurationSeconds?: number;
        minVideoWidth?: number;
        maxVideoWidth?: number;
        minVideoHeight?: number;
        maxVideoHeight?: number;
        minVideoAspect?: number;
        maxVideoAspect?: number;
        minVideoPixels?: number;
        maxVideoPixels?: number;
        maxAudios: number;
        maxAudioBytes: number;
        maxAudioDurationSeconds: number;
        minAudioDurationSeconds?: number;
        maxAudioTotalDurationSeconds?: number;
    };
    duration: {
		continuous?: boolean;
		fractionalMin?: number;
        selection: "range" | "enum";
        min?: number;
        max?: number;
        step?: number;
        values?: number[];
        default: number;
    };
    durationSupported?: boolean;
    ratios: string[];
    defaultRatio: string;
    resolutions: string[];
    defaultResolution: string;
    generateAudio: { supported: boolean; default: boolean };
    watermark: { supported: boolean; default: boolean };
    operations: string[];
    defaultOperation: string;
};

// 舊版本的“允許自定義”可能只儲存了 `*`，前臺需要用這組標準值恢復可選項。
export const STANDARD_IMAGE_SIZE_VALUES = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "21:9", "9:16", "1024x1024", "1536x1024", "1024x1536"] as const;

export function normalizeCapabilityString(value: unknown) {
    // Persisted channel capability profiles may contain null/undefined or
    // numeric values from older versions. Never let a malformed profile crash
    // canvas rendering through an unguarded `.trim()` call.
    const normalized = String(value ?? "").trim();
    return normalized.startsWith("string:") ? normalized.slice("string:".length) : normalized;
}

function normalizeCapabilityStrings(values: unknown[]) {
    return Array.from(new Set(values.map(normalizeCapabilityString)));
}

export function normalizeModelCapabilityConfig(config: ModelCapabilityConfig): ModelCapabilityConfig {
    return {
        ...config,
        text: config.text ? { ...config.text, streaming: config.text.streaming !== false } : config.text,
        image: config.image
            ? {
                  ...config.image,
                  size: {
                      ...config.image.size,
                      values: normalizeCapabilityStrings(config.image.size.values),
                      default: normalizeCapabilityString(config.image.size.default),
                  },
                  quality: {
                      ...config.image.quality,
                      values: normalizeCapabilityStrings(config.image.quality.values),
                      default: normalizeCapabilityString(config.image.quality.default),
                  },
              }
            : undefined,
        video: config.video
            ? {
                  ...config.video,
                  ratios: normalizeCapabilityStrings(config.video.ratios),
                  defaultRatio: normalizeCapabilityString(config.video.defaultRatio),
                  resolutions: normalizeCapabilityStrings(config.video.resolutions),
                  defaultResolution: normalizeCapabilityString(config.video.defaultResolution),
                  operations: normalizeCapabilityStrings(config.video.operations),
                  defaultOperation: normalizeCapabilityString(config.video.defaultOperation),
              }
            : undefined,
    };
}

const catalogIntBounds: Record<string, [number, number]> = {
    promptMaxChars: [1, 1_000_000],
    minImages: [0, 100],
    maxImages: [0, 100],
    maxVideos: [0, 100],
    maxAudios: [0, 100],
    maxVideoDurationSeconds: [0, Number.MAX_SAFE_INTEGER],
    minVideoDurationSeconds: [0, Number.MAX_SAFE_INTEGER],
    maxAudioDurationSeconds: [0, Number.MAX_SAFE_INTEGER],
    maxAudioTotalDurationSeconds: [0, Number.MAX_SAFE_INTEGER],
    maxVideoTotalDurationSeconds: [0, Number.MAX_SAFE_INTEGER],
    minImageWidth: [0, Number.MAX_SAFE_INTEGER],
    maxImageWidth: [0, Number.MAX_SAFE_INTEGER],
    minImageHeight: [0, Number.MAX_SAFE_INTEGER],
    maxImageHeight: [0, Number.MAX_SAFE_INTEGER],
    minVideoWidth: [0, Number.MAX_SAFE_INTEGER],
    maxVideoWidth: [0, Number.MAX_SAFE_INTEGER],
    minVideoHeight: [0, Number.MAX_SAFE_INTEGER],
    maxVideoHeight: [0, Number.MAX_SAFE_INTEGER],
};
const catalogInt64Fields = ["maxImageBytes", "maxVideoBytes", "maxAudioBytes", "minImagePixels", "maxImagePixels", "minVideoPixels", "maxVideoPixels"] as const;
const catalogFloatFields = ["minImageAspect", "maxImageAspect", "minVideoAspect", "maxVideoAspect", "minAudioDurationSeconds"] as const;

function catalogObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function catalogFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function catalogWholeNumber(value: unknown): number | null {
    const number = catalogFiniteNumber(value);
    return number !== null && Number.isInteger(number) ? number : null;
}

function catalogStringValue(value: unknown): string | null {
    return typeof value === "string" ? value.trim() : null;
}

function catalogStringList(value: unknown, allowEmpty: boolean): string[] | null {
    if (!Array.isArray(value)) return null;
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        const text = catalogStringValue(item);
        if (text === null) return null;
        if (!text || seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    if (!allowEmpty && !result.length) return null;
    return result;
}

function catalogBooleanConfig(value: unknown): { supported: boolean; default: boolean } | null {
    const child = catalogObject(value);
    if (!child || typeof child.supported !== "boolean" || typeof child.default !== "boolean") return null;
    return { supported: child.supported, default: child.default };
}

function catalogNumbersFinite(value: unknown): boolean {
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(catalogNumbersFinite);
    if (value && typeof value === "object") return Object.values(value).every(catalogNumbersFinite);
    return true;
}

function catalogPresentNumber(object: Record<string, number>, key: string): number | undefined {
    return object[key];
}

function sanitizeCatalogReferences(input: Record<string, unknown>): VideoCapabilityConfig["references"] | null {
    const refs: Record<string, number> = {};
    for (const [key, bounds] of Object.entries(catalogIntBounds)) {
        if (!(key in input)) continue;
        const value = catalogWholeNumber(input[key]);
        if (value === null || value < bounds[0] || value > bounds[1]) return null;
        refs[key] = value;
    }
    for (const key of catalogInt64Fields) {
        if (!(key in input)) continue;
        const value = catalogWholeNumber(input[key]);
        if (value === null || value < 0) return null;
        refs[key] = value;
    }
    for (const key of catalogFloatFields) {
        if (!(key in input)) continue;
        const value = catalogFiniteNumber(input[key]);
        if (value === null || value < 0) return null;
        refs[key] = value;
    }
    const minImages = catalogPresentNumber(refs, "minImages");
    const maxImages = catalogPresentNumber(refs, "maxImages");
    if (minImages !== undefined && maxImages !== undefined && minImages > maxImages) return null;
    const minVideo = catalogPresentNumber(refs, "minVideoDurationSeconds");
    const maxVideo = catalogPresentNumber(refs, "maxVideoDurationSeconds");
    if (minVideo !== undefined && maxVideo !== undefined && maxVideo > 0 && minVideo > maxVideo) return null;
    const minAudio = catalogPresentNumber(refs, "minAudioDurationSeconds");
    const maxAudio = catalogPresentNumber(refs, "maxAudioDurationSeconds");
    if (minAudio !== undefined && maxAudio !== undefined && maxAudio > 0 && minAudio > maxAudio) return null;
    return refs as VideoCapabilityConfig["references"];
}

function sanitizeCatalogDuration(input: Record<string, unknown>): VideoCapabilityConfig["duration"] | null {
    const selection = catalogStringValue(input.selection);
    const defaultValue = catalogWholeNumber(input.default);
    if ((selection !== "range" && selection !== "enum") || defaultValue === null) return null;
    if (selection === "range") {
        if (input.continuous===true) {
            const min=Number(input.min),max=Number(input.max),step=Number(input.step),fractionalMin=Number(input.fractionalMin ?? input.min);
            if (![min,max,step,fractionalMin].every(Number.isFinite) || fractionalMin<.92 || fractionalMin>min || max<min || max>3600 || step<=0 || defaultValue<min || defaultValue>max) return null;
            return {selection,min,max,step,fractionalMin,default:defaultValue,continuous:true};
        }
        const min = catalogWholeNumber(input.min);
        const max = catalogWholeNumber(input.max);
        const step = catalogWholeNumber(input.step);
        if (min === null || max === null || step === null) return null;
        if (min < 1 || max < min || max > 3600 || step < 1 || defaultValue < min || defaultValue > max || (defaultValue - min) % step !== 0) return null;
        return { selection, min, max, step, default: defaultValue };
    }
    if (!Array.isArray(input.values) || !input.values.length || input.values.length > 100) return null;
    const values: number[] = [];
    const seen = new Set<number>();
    for (const raw of input.values) {
        const value = catalogWholeNumber(raw);
        if (value === null || (value < 1 && value !== -1) || value > 3600 || seen.has(value)) return null;
        seen.add(value);
        values.push(value);
    }
    if (!seen.has(defaultValue)) return null;
    return { selection, values, default: defaultValue };
}

export function sanitizeServerVideoCapability(value: unknown): VideoCapabilityConfig | null {
    const object = catalogObject(value);
    if (!object || !catalogNumbersFinite(object)) return null;
    const references = catalogObject(object.references);
    const duration = catalogObject(object.duration);
    const generateAudio = catalogBooleanConfig(object.generateAudio);
    const watermark = catalogBooleanConfig(object.watermark);
    const ratios = catalogStringList(object.ratios, true);
    const resolutions = catalogStringList(object.resolutions, true);
    const operations = catalogStringList(object.operations, false);
    const defaultRatio = catalogStringValue(object.defaultRatio);
    const defaultResolution = catalogStringValue(object.defaultResolution);
    const defaultOperation = catalogStringValue(object.defaultOperation);
    if (!references || !duration || !generateAudio || !watermark || !ratios || !resolutions || !operations || defaultRatio === null || defaultResolution === null || !defaultOperation || !operations.includes(defaultOperation)) return null;
    if (ratios.length ? !defaultRatio || !ratios.includes(defaultRatio) : defaultRatio !== "") return null;
    if (resolutions.length ? !defaultResolution || !resolutions.includes(defaultResolution) : defaultResolution !== "") return null;
    const normalizedDuration = sanitizeCatalogDuration(duration);
    const normalizedRefs = sanitizeCatalogReferences(references);
    if (!normalizedDuration || !normalizedRefs) return null;
    const video: VideoCapabilityConfig = {
        references: normalizedRefs,
        duration: normalizedDuration,
        ratios,
        defaultRatio,
        resolutions,
        defaultResolution,
        generateAudio,
        watermark,
        operations,
        defaultOperation,
    };
    if ("durationSupported" in object) {
        if (typeof object.durationSupported !== "boolean") return null;
        video.durationSupported = object.durationSupported;
    }
    return video;
}

// Keep explicit pixel presets for each resolution tier so the settings panel can
// switch between 1K, 2K and 4K without silently converting the requested ratio.
const defaultImageSizes = [
    "auto",
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "16:9",
    "21:9",
    "9:16",
    "1024x1024",
    "1360x1024",
    "1024x1360",
    "1536x1024",
    "1024x1536",
    "1024x1280",
    "1280x1024",
    "2048x880",
    "1824x1024",
    "1024x1824",
    "2048x2048",
    "2304x1728",
    "1728x2304",
    "2496x1664",
    "1664x2496",
    "1792x2240",
    "2240x1792",
    "3136x1344",
    "2752x1536",
    "1536x2752",
    "2880x2880",
    "3264x2448",
    "2448x3264",
    "3504x2336",
    "2336x3504",
    "2560x3200",
    "3200x2560",
    "3808x1632",
    "3840x2160",
    "2160x3840",
];

export function upgradeGPTImageCapability(profile: ImageCapabilityConfig, protocol: ModelProtocol | undefined, model: string): ImageCapabilityConfig {
    if (protocol !== "openai-image" || !["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model.trim().toLowerCase())) return profile;
    if (!Array.isArray(profile.quality?.values) || !Array.isArray(profile.size?.values)) return profile;
    const defaults = defaultImageCapabilityConfig(protocol, model);
    const legacyQuality = profile.quality.supported && profile.quality.default === "auto" && profile.quality.values.length === 4 && ["auto", "low", "medium", "high"].every((value) => profile.quality.values.includes(value));
    const quality = legacyQuality && (model.trim().toLowerCase() === "gpt-image-2" || defaults.quality.values.includes("xhigh"))
        ? { ...profile.quality, values: [...defaults.quality.values], default: defaults.quality.default } : profile.quality;
    const fixSize = (value: string) => value === "2048x878" ? "2048x880" : value;
    return { ...profile, quality, size: { ...profile.size, values: profile.size.values.map(fixSize), default: fixSize(profile.size.default),
        ...(Array.isArray(profile.size.presets) ? { presets: profile.size.presets.map((preset) => preset.size === "2048x878" ? { ...preset, size: "2048x880", height: 880 } : preset) } : {}) } };
}

export function defaultImageCapabilityConfig(protocol?: ModelProtocol, model = ""): ImageCapabilityConfig {
    const image: ImageCapabilityConfig = {
        references: { promptMaxChars: 32000, maxImages: 16, maxImageBytes: 30 * 1024 * 1024, maskSupported: true },
        size: { parameter: "size", values: [...defaultImageSizes], default: "1:1", allowCustom: true },
        quality: { supported: true, values: ["auto", "low", "medium", "high"], default: "auto" },
        transparentBackground: { supported: true, default: false },
        responseFormat: { supported: true },
        outputFormat: { supported: true },
        maxOutputs: 15,
    };
    if (protocol === "openai-image" && ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model.trim().toLowerCase())) {
        image.quality.values = ["auto", "low", "medium", "high", "xhigh", "max"];
    }
    if (protocol === "openai-image" && model.trim().toLowerCase() === "gpt-image-2") {
        image.quality = { supported: true, values: ["low", "medium", "high"], default: "low" };
    }
    const contract = protocol === "openai-image" ? beefAPIImageContract(model) : undefined;
    if (contract) {
        return {
            references: { promptMaxChars: contract.promptMaxChars, maxImages: contract.maxImages, maxImageBytes: contract.maxImageBytes, maskSupported: false },
            size: { parameter: "size", values: [...Object.keys(contract.sizes), ...(contract.fixedOutputs ? Object.values(contract.sizes) : [])], default: "1:1", allowCustom: contract.minSide !== contract.maxSide },
            quality: { supported: false, values: [], default: "auto" },
            transparentBackground: { supported: false, default: false },
            responseFormat: { supported: Boolean(contract.fixedOutputs) }, outputFormat: { supported: false }, maxOutputs: contract.fixedOutputs || 1, fixedOutputs: contract.fixedOutputs,
        };
    }
    if (protocol === "grok-image") {
        image.references.maxImages = 1;
        image.references.maskSupported = false;
        // grok2api / xAI Imagine：size→aspect_ratio，quality→resolution(1k/2k)。
        image.size = {
            parameter: "aspect_ratio",
            values: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"],
            default: "1:1",
            allowCustom: false,
        };
        image.quality = { supported: true, values: ["1k", "2k"], default: "2k" };
        image.transparentBackground = { supported: false, default: false };
        image.responseFormat = { supported: true };
        image.outputFormat = { supported: false };
        image.maxOutputs = 1;
    } else if (protocol === "volcengine-ark-image" || protocol === "volcengine-ark-agent-plan-image") {
        image.references.maskSupported = false;
        image.quality.supported = false;
        image.transparentBackground.supported = false;
        image.responseFormat.supported = false;
        image.outputFormat.supported = false;
    }
    if (protocol === "volcengine-jimeng-image") {
        image.references.maxImages = 14;
        image.references.maskSupported = false;
        image.quality.supported = false;
        image.transparentBackground.supported = false;
        image.responseFormat.supported = false;
        image.outputFormat.supported = false;
    }
    if (protocol === "gemini-image") {
        image.references.maskSupported = false;
        // Gemini Images uses imageConfig.aspectRatio, not the OpenAI-style pixel size field.
        image.size = {
            parameter: "aspect_ratio",
            values: ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"],
            default: "1:1",
            allowCustom: false,
        };
        image.transparentBackground = { supported: false, default: false };
        image.responseFormat = { supported: false };
        image.outputFormat = { supported: false };
        image.maxOutputs = 4;
    }
    if (protocol === "agnes-image") {
        // Agnes 影像：size 必填，取 1K/2K/3K/4K 檔位或 WxH 精確尺寸，畫面比例走獨立的 ratio 欄位；
        // 參考圖放 extra_body.image，支援多圖合成，但沒有蒙版端點。
        image.references.maxImages = 9;
        image.references.maskSupported = false;
        image.size = {
            parameter: "aspect_ratio",
            values: ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"],
            default: "1:1",
            allowCustom: false,
        };
        // 官方檔位是 1K/2K/3K/4K，統一層只提供 1k/2k/4k 三檔；3K 保留在協議對映裡但不在介面露出。
        image.quality = { supported: true, values: ["1k", "2k", "4k"], default: "2k" };
        image.transparentBackground = { supported: false, default: false };
        // 頂層 response_format 是官方明確的錯誤寫法，輸出格式只能在 extra_body 內宣告。
        image.responseFormat = { supported: false };
        image.outputFormat = { supported: false };
        // 該端點不接受 n，單次請求固定返回一張圖片。
        image.maxOutputs = 1;
    }
    if (
        protocol !== "grok-image" &&
        String(model ?? "")
            .trim()
            .toLowerCase()
            .startsWith("grok-imagine-image")
    ) {
        image.references.maxImages = 0;
        image.references.maskSupported = false;
        image.size = {
            parameter: "aspect_ratio",
            values: ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2"],
            default: "1:1",
            allowCustom: false,
        };
        image.quality = { supported: true, values: ["1k", "2k"], default: "2k" };
        image.transparentBackground = { supported: false, default: false };
        image.responseFormat = { supported: true };
        image.outputFormat = { supported: false };
        image.maxOutputs = 1;
    }
    return image;
}

export function defaultModelCapabilityConfig(protocol?: ModelProtocol, model = ""): ModelCapabilityConfig {
    const text: TextCapabilityConfig = {
        streaming: true,
        // 文本模型的視覺能力必須由管理員明確開啟，不能根據模型名猜測。
        references: { promptMaxChars: 32000, maxImages: 0, maxImageBytes: 0, maxVideos: 0, maxVideoBytes: 0 },
    };
    const video: VideoCapabilityConfig = {
        references: {
            promptMaxChars: DEFAULT_VIDEO_PROMPT_MAX_CHARS,
            minImages: 0,
            maxImages: 9,
            maxImageBytes: 30 * 1024 * 1024,
            maxVideos: 0,
            maxVideoBytes: 0,
            maxVideoDurationSeconds: 0,
            maxAudios: 0,
            maxAudioBytes: 0,
            maxAudioDurationSeconds: 0,
        },
        duration: { selection: "range", min: 1, max: 15, step: 1, default: 6 },
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        defaultRatio: "16:9",
        resolutions: ["480p", "720p", "1080p", "1440p", "2160p"],
        defaultResolution: "720p",
        generateAudio: { supported: false, default: false },
        watermark: { supported: false, default: false },
        operations: ["text_to_video", "image_to_video"],
        defaultOperation: "text_to_video",
    };
    if (protocol === "full-video") {
        const is25 = model.endsWith("2.5");
        video.references.promptMaxChars = 4000;
        video.references.maxImages = is25 ? 30 : 9;
        video.references.maxVideos = is25 ? 10 : 3;
        video.references.maxAudios = is25 ? 10 : 3;
        video.references.maxVideoBytes = 100_000_000;
        video.references.maxAudioBytes = 100_000_000;
        video.references.minVideoDurationSeconds = 2;
        video.references.minAudioDurationSeconds = 2;
        video.references.maxVideoDurationSeconds = is25 ? 30 : 15;
        video.references.maxAudioDurationSeconds = is25 ? 30 : 15;
        video.duration = { selection: "range", min: 4, max: is25 ? 30 : 15, step: 1, default: 5 };
        video.resolutions = is25 ? ["480p", "720p"] : ["480p", "720p", "1080p"];
        video.defaultResolution = "480p";
        video.operations = ["text_to_video", "image_to_video", "reference_to_video"];
    }
    if (protocol === "volcengine-jimeng-video") {
        video.duration = { selection: "enum", values: [5, 10], default: 5 };
        video.resolutions = ["720p"];
    }
    if (protocol === "gemini-veo") {
        video.duration = { selection: "enum", values: [4, 6, 8], default: 6 };
        video.resolutions = ["720p", "1080p"];
    }
    if (protocol === "volcengine-ark-video" || protocol === "volcengine-ark-agent-plan-video" || protocol === "newapi-channel-1" || protocol === "newapi-channel-2" || protocol === "video-generations-json") {
        video.references.maxVideos = 3;
        video.references.maxAudios = 3;
        video.references.maxVideoBytes = 200 * 1024 * 1024;
        video.references.maxAudioBytes = 15 * 1024 * 1024;
        video.references.maxVideoDurationSeconds = 15;
        video.references.maxAudioDurationSeconds = 15;
        video.generateAudio = { supported: true, default: true };
    }
    if (protocol === "volcengine-ark-video" || protocol === "volcengine-ark-agent-plan-video") {
        video.references.minVideoDurationSeconds = 2;
        video.references.minAudioDurationSeconds = 2;
    }
    if (protocol === "volcengine-ark-video" || protocol === "volcengine-ark-agent-plan-video" || protocol === "newapi-channel-1") video.resolutions = ["480p", "720p", "1080p"];
    if (protocol === "volcengine-ark-video" || protocol === "volcengine-ark-agent-plan-video") {
        video.watermark = { supported: true, default: false };
        video.operations.push("reference_to_video");
        if (/^dreamina-seedance-2-0-(?:fast|mini)(?:-|$)/.test(model.toLowerCase().split("/").pop() || "")) video.resolutions = ["480p", "720p"];
    }
    if (protocol === "newapi-channel-2") {
        // APIMart 的 Seedance 2.0 Video Generations 協議支援參考影片/音訊，
        // 但不是火山方舟 Agent Plan，因此單獨宣告全模態參考能力。
        video.operations.push("reference_to_video");
    }
    if (protocol === "video-generations-json") {
        video.duration.default = 5;
        video.resolutions = ["720p", "1080p"];
        video.watermark = { supported: true, default: false };
        video.operations.push("reference_to_video");
    }
    if (protocol === "novita-video") {
        video.references.maxImages = 1;
        video.references.maxImageBytes = 10 * 1024 * 1024;
        video.duration = { selection: "enum", values: [5, 10], default: 5 };
        video.ratios = ["16:9", "9:16", "1:1"];
        video.resolutions = ["1080p"];
        video.defaultResolution = "1080p";
    }
    if (protocol === "minimax-video") {
        video.references.maxImages = 9;
        video.references.maxImageBytes = 30 * 1024 * 1024;
        video.references.maxVideos = 3;
        video.references.maxVideoBytes = 50 * 1024 * 1024;
        video.references.maxVideoDurationSeconds = 15;
        video.references.maxAudios = 3;
        video.references.maxAudioBytes = 15 * 1024 * 1024;
        video.references.maxAudioDurationSeconds = 15;
        video.duration = { selection: "enum", values: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], default: 5 };
        video.ratios = ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
        video.resolutions = ["768P", "2K"];
        video.defaultResolution = "768P";
        video.watermark = { supported: true, default: false };
        video.operations.push("reference_to_video");
    }
    if (
        protocol === "agnes-video" &&
        ["agnes-video-2.5", "agnes-video-2.5-flash"].includes(
            String(model ?? "")
                .trim()
                .toLowerCase(),
        )
    ) {
        const flash =
            String(model ?? "")
                .trim()
                .toLowerCase() === "agnes-video-2.5-flash";
        video.references.maxImages = flash ? 5 : 9;
        video.references.maxVideos = flash ? 0 : 3;
        video.references.maxAudios = 3;
        video.duration = { selection: "range", min: 4, max: 12, step: 1, default: 5 };
        video.ratios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
        video.defaultRatio = "16:9";
        video.resolutions = flash ? ["720P"] : ["720P", "960P", "2K"];
        video.defaultResolution = "720P";
        video.operations.push("reference_to_video", "audio_to_video");
    }
    if (isSeedance2Family(protocol, model)) {
        if (protocol === "newapi") video.generateAudio = { supported: true, default: true };
        video.references = overlayOfficialSeedance2References(video.references, isSeedance25Model(model));
        if (protocol === "volcengine-ark-video" || protocol === "volcengine-ark-agent-plan-video") video.references.minAudioDurationSeconds = 2;
        video.operations = Array.from(new Set([...video.operations, "reference_to_video", ...(isSeedance25Model(model) ? ["audio_to_video" as const] : [])]));
        if (isSeedance25Model(model) && video.duration.selection === "range" && (video.duration.max || 0) < 30) {
            video.duration = { ...video.duration, max: 30 };
        }
    }
    if (isVolcengineArkVideoProtocol(protocol) && /^dreamina-seedance-2[.-](?:0|5)(?:-|$)/.test(model.trim().toLowerCase().split("/").pop() || "")) {
        video.duration = { ...video.duration, selection: "enum", min: 4, values: [-1, ...Array.from({ length: (video.duration.max || 15) - 3 }, (_, index) => index + 4)] };
        video.ratios = [...video.ratios, "adaptive"];
        if (isSeedance25Model(model)) video.operations = [...video.operations, "inpaint", "extend"];
    }
    return { version: 1, text, image: defaultImageCapabilityConfig(protocol, model), video };
}

export function pluginWorkflowCapabilityConfig(protocol: ModelProtocol, workflow: ModelProtocolWorkflow): ModelCapabilityConfig | undefined {
    if (workflow.capability !== "image" && workflow.capability !== "video") return undefined;
    const fallback = defaultModelCapabilityConfig(protocol, workflow.id);
    const fields: WorkflowVideoFieldLike[] = workflow.parameters.map((parameter) => ({
        fieldName: parameter.name,
        source: parameter.mapping,
        fieldType: parameter.type,
        options: parameter.values,
        defaultValue: workflow.defaults?.[parameter.name],
    }));
    if (workflow.capability === "image") {
        return { ...fallback, image: workflowImageCapabilityConfig(fields, fallback.image!) };
    }
    return { ...fallback, video: workflowVideoCapabilityConfig(fields, fallback.video!) };
}

export function modelCapabilityConfigFor(
    config: { channels: Array<{ id: string; models: string[]; baseUrl?: string; interfaceType?: ModelProtocol; modelProfiles?: Array<{ model: string; capabilityConfig?: ModelCapabilityConfig; protocol?: ModelProtocol }> }> },
    model: string,
) {
    const separator = model.indexOf("::");
    const channelId = separator >= 0 ? model.slice(0, separator) : "";
    const modelName = separator >= 0 ? model.slice(separator + 2) : model;
    const channel = config.channels.find((item) => item.id === channelId) || config.channels.find((item) => item.models.includes(modelName));
    // Older desktop config migrations can leave two entries for the same model:
    // a legacy operation-only array followed by the real capability object. The
    // first-match lookup silently selected the malformed legacy entry, so video
    // reference requests were evaluated against stale limits. Prefer a complete
    // capability object while retaining the legacy entry as a fallback.
    const profile = channel?.modelProfiles?.find((item) => item.model === modelName && item.capabilityConfig && !Array.isArray(item.capabilityConfig)) || channel?.modelProfiles?.find((item) => item.model === modelName);
    const protocol = profile?.protocol || channel?.interfaceType;
    const fallback = defaultModelCapabilityConfig(protocol, modelName);
    const alignMaterialPixels = (video: VideoCapabilityConfig | undefined) => {
        let host = "";
        try { host = new URL(channel?.baseUrl || "").hostname.toLowerCase(); } catch { /* no public URL */ }
        const materialHost = ["beeftv.app", "enterprise.beefapi.com", "beefapi.com", "whatstoken.ai", "www.whatstoken.ai"].includes(host);
        if (video && isSeedance2Family(protocol, modelName) && (isVolcengineArkVideoProtocol(protocol) || materialHost) && video.references.minVideoPixels === 409600 && video.references.maxVideoPixels === 8295044) video.references.minVideoPixels = 407696;
    };

    if (!profile?.capabilityConfig) {
        alignMaterialPixels(fallback.video);
        return fallback;
    }
    const capabilityConfig = normalizeModelCapabilityConfig(profile.capabilityConfig);
    const text = capabilityConfig.text ? { ...fallback.text!, ...capabilityConfig.text, references: { ...fallback.text!.references, ...capabilityConfig.text.references } } : fallback.text;
    const video = (capabilityConfig.video ? { ...fallback.video!, ...capabilityConfig.video, references: { ...fallback.video!.references, ...capabilityConfig.video.references } } : fallback.video)!;
    alignMaterialPixels(video);
    const configuredImage = capabilityConfig.image;
    const image = configuredImage
        ? (() => {
              const configuredSize = configuredImage.size;
              const configuredValues = configuredSize?.values?.map(normalizeCapabilityString);
              const allowCustom = Boolean(configuredSize?.allowCustom || configuredValues?.includes("*"));
              const concreteValues = configuredValues?.filter((value) => value !== "*") || [];
              const values = !configuredValues ? fallback.image!.size.values : concreteValues.length || !allowCustom ? concreteValues : [...STANDARD_IMAGE_SIZE_VALUES];
              const configuredDefault = configuredSize?.default ? normalizeCapabilityString(configuredSize.default) : undefined;
              const defaultValue = configuredDefault && configuredDefault !== "*" && values.includes(configuredDefault) ? configuredDefault : values.find((value) => value !== "*") || fallback.image!.size.default;
              return {
                  ...fallback.image!,
                  ...configuredImage,
                  size: {
                      ...fallback.image!.size,
                      ...configuredSize,
                      values,
                      default: defaultValue,
                      allowCustom,
                  },
              };
          })()
        : fallback.image;
    return { ...fallback, ...capabilityConfig, text, image, video };
}

function isSeedance2Family(protocol: ModelProtocol | undefined, modelName: string) {
    return Boolean(protocol && ["openai", "openai-videos", "newapi", "newapi-channel-2", "volcengine-ark-video", "volcengine-ark-agent-plan-video"].includes(protocol) && String(modelName).toLowerCase().includes("seedance-2"));
}

export function isSeedance25Model(modelName: string) {
    const base = String(modelName).trim().toLowerCase().split("/").pop() || "";
    return /^seedance-2\.5(?:-|$)/.test(base) || /^(?:doubao|dreamina)-seedance-2[.-]5(?:-|$)/.test(base);
}

function overlayOfficialSeedance2References(base: VideoCapabilityConfig["references"], is25: boolean): VideoCapabilityConfig["references"] {
    return {
        ...base,
        maxImages: is25 ? 30 : 9,
        maxVideos: is25 ? 10 : 3,
        maxVideoBytes: 200 * 1024 * 1024,
        maxVideoDurationSeconds: is25 ? 30 : 15,
        minVideoDurationSeconds: 2,
        maxVideoTotalDurationSeconds: is25 ? 30 : 15,
        maxAudios: is25 ? 10 : 3,
        maxAudioBytes: 15 * 1024 * 1024,
        maxAudioDurationSeconds: is25 ? 30 : 15,
        minAudioDurationSeconds: 1.8,
        maxAudioTotalDurationSeconds: is25 ? 30 : 15,
        maxImageBytes: base.maxImageBytes || 30 * 1024 * 1024,
        minImageWidth: 300,
        maxImageWidth: 6000,
        minImageHeight: 300,
        maxImageHeight: 6000,
        minImageAspect: 0.4,
        maxImageAspect: 2.5,
        minVideoWidth: 300,
        maxVideoWidth: 6000,
        minVideoHeight: 300,
        maxVideoHeight: 6000,
        minVideoAspect: 0.4,
        maxVideoAspect: 2.5,
        minVideoPixels: 409600,
        maxVideoPixels: 8295044,
    };
}

// 工作流欄位是供應商引數的唯一事實來源；不能用普通影片模型的固定清晰度列表覆蓋它。
export type WorkflowVideoFieldLike = {
    nodeId?: string;
    classType?: string;
    fieldName?: string;
    label?: string;
    role?: string;
    safeToOverride?: boolean;
    optionsSource?: string;
    enabled?: boolean;
    source?: string;
    sourceFromUpstream?: boolean;
    randomEnabled?: boolean;
    fieldType?: string;
    options?: unknown[];
    fieldValue?: unknown;
    value?: unknown;
    default?: unknown;
    defaultValue?: unknown;
    min?: unknown;
    max?: unknown;
    step?: unknown;
};

export type WorkflowFieldNumberBounds = { min?: number; max?: number; step?: number };

export function workflowFieldKey(field: WorkflowVideoFieldLike) {
    return `field:${String(field.nodeId || "").trim()}:${String(field.fieldName || "").trim()}`;
}

export function workflowFieldRandomKey(field: WorkflowVideoFieldLike) {
    return `random:${String(field.nodeId || "").trim()}:${String(field.fieldName || "").trim()}`;
}

export function workflowFieldSource(field: WorkflowVideoFieldLike) {
    return String(field.source || "")
        .trim()
        .replace(/[\s_-]/g, "")
        .toLowerCase();
}

export function workflowParameterFields(fields: readonly WorkflowVideoFieldLike[]) {
    return fields.filter((field) => {
        const source = workflowFieldSource(field);
        const fieldType = String(field.fieldType || "")
            .trim()
            .toUpperCase();
        if (!field.fieldName || !field.nodeId || field.enabled === false || !workflowFieldSafeToOverride(field)) return false;
        if (["prompt", "text", "positiveprompt", "positive", "referenceimage", "image", "referencevideo", "video", "referenceaudio", "audio", "mask"].includes(source)) return false;
        if (["IMAGE", "VIDEO", "AUDIO"].includes(fieldType)) return false;
        return true;
    });
}

export function workflowFieldSafeToOverride(field: WorkflowVideoFieldLike) {
    if (field.safeToOverride === false) return false;
    const classType = String(field.classType || "")
        .trim()
        .toLowerCase();
    const fieldName = String(field.fieldName || "")
        .trim()
        .toLowerCase();
    if (classType === "int" && fieldName === "value") return false;
    return classType !== "imageresize+" || !["width", "height", "multiple_of"].includes(fieldName);
}

export function workflowFieldRole(field: WorkflowVideoFieldLike) {
    if (["prompt", "media", "business", "internal"].includes(String(field.role || ""))) return String(field.role);
    const source = workflowFieldSource(field);
    const fieldType = String(field.fieldType || "")
        .trim()
        .toUpperCase();
    if (["prompt", "text", "positiveprompt", "positive"].includes(source)) return "prompt";
    if (["referenceimage", "image", "referencevideo", "video", "referenceaudio", "audio", "mask"].includes(source) || ["IMAGE", "VIDEO", "AUDIO"].includes(fieldType)) return "media";
    if (!workflowFieldSafeToOverride(field)) return "internal";
    const key = normalizeWorkflowVideoFieldKey(String(field.fieldName || ""));
    if (
        [
            "aspectratio",
            "ratio",
            "duration",
            "durationseconds",
            "seconds",
            "videoseconds",
            "quality",
            "resolution",
            "seed",
            "noiseseed",
            "steps",
            "step",
            "sigmapoints",
            "cfg",
            "cfgscale",
            "guidance",
            "guidancescale",
            "sampler",
            "samplername",
            "scheduler",
            "fps",
            "count",
            "batch",
            "batchsize",
            "generateaudio",
            "watermark",
            "negativeprompt",
            "systemprompt",
        ].includes(key)
    )
        return "business";
    return field.classType ? "internal" : "business";
}

/** 讀取工作流欄位宣告的連續數值範圍；相容 RunningHub 將範圍包在 options/range 中的返回格式。 */
export function workflowFieldNumberBounds(field: WorkflowVideoFieldLike | undefined): WorkflowFieldNumberBounds {
    if (!field) return {};
    const sources: Record<string, unknown>[] = [field as unknown as Record<string, unknown>];
    const options = Array.isArray(field.options) ? field.options : [];
    options.forEach((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) return;
        const item = option as Record<string, unknown>;
        const nested = item.range;
        if (nested && typeof nested === "object" && !Array.isArray(nested)) sources.push(nested as Record<string, unknown>);
        if (["min", "max", "step", "minValue", "maxValue", "stepValue"].some((key) => item[key] !== undefined)) sources.push(item);
    });
    const read = (keys: string[]) => {
        for (const source of sources) {
            for (const key of keys) {
                const raw = source[key];
                if (raw === undefined || raw === null || String(raw).trim() === "") continue;
                const value = Number(raw);
                if (Number.isFinite(value)) return value;
            }
        }
        return undefined;
    };
    return { min: read(["min", "minValue", "min_value"]), max: read(["max", "maxValue", "max_value"]), step: read(["step", "stepValue", "step_value"]) };
}

/** 只有真正的列舉項才作為下拉選項；範圍物件交給 InputNumber。 */
export function workflowFieldChoiceValues(field: WorkflowVideoFieldLike | undefined) {
    const bounds = workflowFieldNumberBounds(field);
    if (bounds.min !== undefined && bounds.max !== undefined && bounds.step !== undefined) return [];
    const protocolOptions = workflowFieldChoiceValuesFromProtocol(field);
    if (protocolOptions.length) return protocolOptions;
    const options = Array.isArray(field?.options) ? field.options : [];
    return options.filter((option) => !workflowFieldOptionIsRange(option));
}

/** ComfyUI 的列舉按完整字串校驗；舊畫布中的比例簡寫只能對映到唯一同字首原值。 */
export function workflowFieldSubmissionValue(field: WorkflowVideoFieldLike, value: unknown) {
    const choices = workflowFieldSubmissionChoices(field);
    const submitted = workflowFieldOptionValue(value);
    if (!choices.length || choices.some((choice) => workflowFieldOptionValue(choice) === submitted)) return value;
    const ratio = workflowRatioPrefix(submitted);
    if (!ratio) return value;
    const matches = choices.filter((choice) => workflowRatioPrefix(workflowFieldOptionValue(choice)) === ratio);
    return matches.length === 1 ? workflowFieldOptionValue(matches[0]) : value;
}

const resolutionSelectorAspectRatioOptions = ["1:1 (Square)", "2:3 (Portrait Photo)", "3:2 (Photo)", "3:4 (Portrait Standard)", "4:3 (Standard)", "9:16 (Portrait Widescreen)", "16:9 (Widescreen)", "21:9 (Ultrawide)"];

function workflowFieldSubmissionChoices(field: WorkflowVideoFieldLike) {
    const classType = normalizeWorkflowVideoFieldKey(String(field.classType || ""));
    const fieldName = normalizeWorkflowVideoFieldKey(String(field.fieldName || ""));
    // RunningHub 的 API JSON 只有當前值，沒有 ComfyUI object_info。該節點的真實列舉
    // 來自節點型別合同，不能使用通用比例模板冒充上游 options。
    if (classType === "resolutionselector" && fieldName === "aspectratio") return resolutionSelectorAspectRatioOptions;
    return workflowFieldChoiceValues(field);
}

function workflowRatioPrefix(value: string) {
    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)(?:\s|\(|$)/);
    return match ? `${match[1]}:${match[2]}` : "";
}

const workflowKnownOptions: Record<string, string[]> = {
    aspectratio: ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "3:2", "2:3", "21:9", "9:21"],
    ratio: ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "3:2", "2:3", "21:9", "9:21"],
    resolution: ["512", "768", "1024", "1280", "1536", "2048", "1k", "2k", "4k"],
    size: ["512", "768", "1024", "1280", "1536", "2048"],
    sampler: ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", "lms", "dpmpp_2m", "dpmpp_sde", "ddim", "uni_pc"],
    samplername: ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", "lms", "dpmpp_2m", "dpmpp_sde", "ddim", "uni_pc"],
    scheduler: ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta"],
};

export function workflowFieldPresetOptions(field: WorkflowVideoFieldLike | undefined) {
    if (!field) return [];
    const fieldType = String(field.fieldType || "")
        .trim()
        .toUpperCase();
    if (["NUMBER", "FLOAT", "INTEGER", "INT", "SLIDER", "BOOLEAN", "BOOL", "IMAGE", "VIDEO", "AUDIO"].includes(fieldType)) return [];
    const classType = normalizeWorkflowVideoFieldKey(String(field.classType || ""));
    const key = normalizeWorkflowVideoFieldKey(String(field.fieldName || ""));
    if (classType === "resolutionselector" && key === "aspectratio") return resolutionSelectorAspectRatioOptions;
    return workflowKnownOptions[key] || [];
}

export function workflowFieldConfigurationError(field: WorkflowVideoFieldLike) {
    const bounds = workflowFieldNumberBounds(field);
    if (bounds.min !== undefined && bounds.max !== undefined && bounds.min > bounds.max) return "最小值不能大於最大值";
    if (bounds.step !== undefined && bounds.step <= 0) return "步長必須大於 0";
    return "";
}

export function workflowFieldValueError(field: WorkflowVideoFieldLike, value: unknown) {
    const configurationError = workflowFieldConfigurationError(field);
    if (configurationError) return configurationError;
    const fieldType = String(field.fieldType || "")
        .trim()
        .toUpperCase();
    const bounds = workflowFieldNumberBounds(field);
    const numeric = ["NUMBER", "FLOAT", "INTEGER", "INT", "SLIDER"].includes(fieldType) || bounds.min !== undefined || bounds.max !== undefined || bounds.step !== undefined;
    if (numeric) {
        if (value === undefined || value === null || String(value).trim() === "" || !Number.isFinite(Number(value))) return "請輸入有效數字";
        const parsed = Number(value);
        if ((bounds.min !== undefined && parsed < bounds.min) || (bounds.max !== undefined && parsed > bounds.max)) return "數值超出允許範圍";
        if (bounds.step !== undefined) {
            const start = bounds.min ?? 0;
            const steps = (parsed - start) / bounds.step;
            if (Math.abs(steps - Math.round(steps)) > 1e-7) return "數值不符合步長";
        }
    }
    const options = workflowFieldChoiceValues(field).map(workflowFieldOptionValue);
    if (options.length && !options.includes(workflowFieldOptionValue(value))) return "當前值不在允許選項中";
    return "";
}

export function workflowImageCapabilityConfig(fields: readonly WorkflowVideoFieldLike[], fallback = defaultModelCapabilityConfig().image!): ImageCapabilityConfig {
    const ratioField = fields.find((field) => workflowVideoFieldMatches(field, "aspectratio"));
    const sizeField = fields.find((field) => workflowVideoFieldMatches(field, "size"));
    const qualityField = fields.find((field) => workflowVideoFieldMatches(field, "quality"));
    const ratioOptions = workflowFieldChoiceValues(ratioField).map(workflowFieldOptionValue).filter(Boolean);
    const ratioDefault = workflowFieldDefaultValue(ratioField);
    const sizeOptions = workflowFieldChoiceValues(sizeField).map(workflowFieldOptionValue).filter(Boolean);
    const sizeDefault = workflowFieldDefaultValue(sizeField);
    const qualityOptions = workflowFieldChoiceValues(qualityField).map(workflowFieldOptionValue).filter(Boolean);
    return {
        ...fallback,
        size: ratioField
            ? { parameter: "aspect_ratio", values: ratioOptions.length ? ratioOptions : ratioDefault ? [ratioDefault] : [], default: ratioDefault || ratioOptions[0] || "auto", allowCustom: false }
            : sizeField
              ? { parameter: "size", values: sizeOptions.length ? sizeOptions : sizeDefault ? [sizeDefault] : [], default: sizeDefault || sizeOptions[0] || "auto", allowCustom: false }
              : { ...fallback.size, values: [], default: "auto", allowCustom: false },
        quality: qualityField ? { supported: qualityOptions.length > 0, values: qualityOptions, default: workflowFieldDefaultValue(qualityField) || qualityOptions[0] || "auto" } : { supported: false, values: [], default: "auto" },
        transparentBackground: { supported: false, default: false },
        maxOutputs: 1,
    };
}

export function workflowVideoCapabilityConfig(fields: readonly WorkflowVideoFieldLike[], fallback = defaultModelCapabilityConfig().video!): VideoCapabilityConfig {
    const profile: VideoCapabilityConfig = {
        ...fallback,
        references: { ...fallback.references },
        duration: { ...fallback.duration, values: fallback.duration.values ? [...fallback.duration.values] : undefined },
        ratios: [...fallback.ratios],
        resolutions: [...fallback.resolutions],
        generateAudio: { ...fallback.generateAudio },
        watermark: { ...fallback.watermark },
    };
    // 工作流沒有統一的解析度/時長協議。清空普通模型的候選值，
    // 後面只根據工作流欄位自身宣告的 options 或數值範圍恢復控制元件。
    profile.resolutions = [];
    profile.defaultResolution = "";
    profile.ratios = [];
    profile.defaultRatio = "";
    profile.duration = { selection: "enum", values: [], default: fallback.duration.default };
    profile.generateAudio = { supported: false, default: false };
    profile.watermark = { supported: false, default: false };
    const resolutionField = fields.find((field) => workflowVideoFieldMatches(field, "vquality"));
    const durationField = fields.find((field) => workflowVideoFieldMatches(field, "videoseconds"));
    const ratioField = fields.find((field) => workflowVideoFieldMatches(field, "aspectratio"));

    if (resolutionField) {
        const options = workflowFieldChoiceValues(resolutionField).map(workflowFieldOptionValue).filter(Boolean);
        const bounds = workflowFieldNumberBounds(resolutionField);
        const generated = options.length ? options : bounds.min !== undefined && bounds.max !== undefined ? [] : workflowNumericFieldValues(resolutionField);
        const defaultValue = workflowFieldDefaultValue(resolutionField);
        if (bounds.min === undefined || bounds.max === undefined || bounds.max < bounds.min) {
            if (generated.length) profile.resolutions = generated;
        } else if (defaultValue !== "") profile.resolutions = [defaultValue];
        if (profile.resolutions.length) profile.defaultResolution = matchWorkflowValue(defaultValue, profile.resolutions) || profile.resolutions[0];
    }
    if (durationField) {
        const options = workflowFieldChoiceValues(durationField)
            .map(workflowFieldOptionValue)
            .map(workflowDurationNumber)
            .filter((value): value is number => value !== undefined);
        const bounds = workflowFieldNumberBounds(durationField);
        const generated = options.length ? options : workflowNumericFieldValues(durationField).map(Number).filter(Number.isFinite);
        const defaultValue = Number(workflowFieldDefaultValue(durationField));
        if (generated.length) {
            profile.duration = { selection: "enum", values: [...new Set(generated)], default: Number.isFinite(defaultValue) ? defaultValue : generated[0] };
        } else {
            const min = bounds.min;
            const max = bounds.max;
            const step = bounds.step;
            if (min !== undefined && max !== undefined && max >= min) {
                profile.duration = { selection: "range", min, max, ...(step !== undefined && step > 0 ? { step } : {}), default: Number.isFinite(defaultValue) ? defaultValue : min };
            } else if (Number.isFinite(defaultValue)) {
                // 只有預設值時不能臆造通用時長選項，只保留工作流當前值。
                profile.duration = { selection: "enum", values: [defaultValue], default: defaultValue };
            }
        }
    }
    if (ratioField) {
        const options = workflowFieldOptionValues(ratioField.options);
        const defaultValue = workflowFieldDefaultValue(ratioField);
        // 工作流宣告瞭比例欄位時，不能繼續沿用普通模型的比例列表。
        // 沒有 options 時只保留該欄位當前預設值（例如 `auto`）。
        profile.ratios = options.length ? options : defaultValue ? [defaultValue] : [];
        if (profile.ratios.length) profile.defaultRatio = matchWorkflowValue(defaultValue, profile.ratios) || profile.ratios[0];
    }
    const generateAudioField = fields.find((field) => workflowBooleanFieldMatches(field, "generateaudio"));
    const watermarkField = fields.find((field) => workflowBooleanFieldMatches(field, "watermark"));
    if (generateAudioField) profile.generateAudio = { supported: true, default: workflowBooleanDefault(generateAudioField) };
    if (watermarkField) profile.watermark = { supported: true, default: workflowBooleanDefault(watermarkField) };
    return profile;
}

/** 讀取工作流當前選擇的比例/尺寸；欄位沒有語義名時僅識別純尺寸列舉。 */
export function workflowOutputSizeValue(fields: readonly WorkflowVideoFieldLike[], values: Readonly<Record<string, unknown>>) {
    const field =
        fields.find((item) => workflowVideoFieldMatches(item, "aspectratio")) ||
        fields.find((item) => workflowVideoFieldMatches(item, "size")) ||
        fields.find((item) => {
            const options = workflowFieldChoiceValues(item).map(workflowFieldOptionValue).filter(Boolean);
            return options.length > 1 && options.every(workflowOutputSizeLike);
        });
    const value = workflowFieldCurrentValue(field, values);
    const submitted = !field || value === undefined ? "" : workflowFieldOptionValue(workflowFieldSubmissionValue(field, value));
    return submitted || workflowVideoDefaultSize(fields, values);
}

/** 從工作流同一節點的 width/height 欄位讀取預設輸出尺寸。 */
export function workflowVideoDefaultSize(fields: readonly WorkflowVideoFieldLike[], values: Readonly<Record<string, unknown>> = {}) {
    const candidates = fields.filter((field) => workflowDimensionFieldMatches(field, "width") || workflowDimensionFieldMatches(field, "height"));
    const groups = Array.from(new Set(candidates.map((field) => String(field.nodeId || "").trim()).filter(Boolean)));
    const orderedGroups = groups.sort((left, right) => {
        const leftResize = candidates.some(
            (field) =>
                String(field.nodeId || "").trim() === left &&
                String(field.label || "")
                    .toLowerCase()
                    .includes("imageresize"),
        );
        const rightResize = candidates.some(
            (field) =>
                String(field.nodeId || "").trim() === right &&
                String(field.label || "")
                    .toLowerCase()
                    .includes("imageresize"),
        );
        return Number(leftResize) - Number(rightResize);
    });
    for (const nodeId of orderedGroups) {
        const nodeFields = candidates.filter((field) => String(field.nodeId || "").trim() === nodeId);
        const width = nodeFields.find((field) => workflowDimensionFieldMatches(field, "width"));
        const height = nodeFields.find((field) => workflowDimensionFieldMatches(field, "height"));
        const widthValue = workflowNumber(workflowFieldCurrentValue(width, values));
        const heightValue = workflowNumber(workflowFieldCurrentValue(height, values));
        if (widthValue !== undefined && widthValue > 0 && heightValue !== undefined && heightValue > 0) return `${Math.round(widthValue)}x${Math.round(heightValue)}`;
    }
    return "";
}

export function workflowVideoFieldsFromJson(value: Record<string, unknown> | undefined) {
    if (!value || typeof value !== "object") return [] as WorkflowVideoFieldLike[];
    const fields: WorkflowVideoFieldLike[] = [];
    Object.entries(value).forEach(([nodeId, rawNode]) => {
        if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) return;
        const node = rawNode as Record<string, unknown>;
        const classType = String(node.class_type || node.type || "").trim();
        const inputs = node.inputs;
        if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) return;
        Object.entries(inputs as Record<string, unknown>).forEach(([fieldName, fieldValue]) => {
            if (Array.isArray(fieldValue)) return;
            const fieldType = typeof fieldValue === "number" ? "NUMBER" : typeof fieldValue === "boolean" ? "BOOLEAN" : "TEXT";
            const candidate = { nodeId, classType, fieldName, fieldValue, fieldType };
            const safeToOverride = workflowFieldSafeToOverride(candidate);
            const role = workflowFieldRole(candidate);
            fields.push({ ...candidate, safeToOverride, role, enabled: safeToOverride && role !== "internal" });
        });
    });
    return fields;
}

function workflowVideoFieldMatches(field: WorkflowVideoFieldLike, source: string) {
    const keys = [field.source, field.fieldName, field.label].map((value) => normalizeWorkflowVideoFieldKey(String(value || ""))).filter(Boolean);
    if (source === "vquality") {
        // quality 是工作流自己的質量引數（可能是 0.1-3 這類連續值），
        // 只有顯式 videoquality/videoresolution/vquality 才屬於影片解析度。
        if (workflowFieldSource(field) === "quality" || keys.some((key) => ["quality", "imagequality"].includes(key))) return false;
        return keys.some((key) => ["vquality", "videoresolution", "videoquality", "resolution"].includes(key) || key.includes("清晰度") || key.includes("解析度"));
    }
    if (source === "videoseconds") {
        return keys.some((key) => ["videoseconds", "duration", "seconds", "durationseconds", "videoduration", "videodurationseconds", "videolength", "clipduration"].includes(key) || key.includes("時長") || key.includes("秒數"));
    }
    if (source === "size") {
        return keys.some((key) => ["size", "imagesize", "imageresolution", "resolution"].includes(key));
    }
    if (source === "quality") {
        return workflowFieldSource(field) === "quality" || keys.some((key) => ["quality", "imagequality"].includes(key) || key.includes("清晰度"));
    }
    return keys.some((key) => ["aspectratio", "ratio", "imageaspectratio", "imageratio", "videoaspectratio", "videoratio"].includes(key));
}

function workflowDimensionFieldMatches(field: WorkflowVideoFieldLike, dimension: "width" | "height") {
    const keys = [field.source, field.fieldName, field.label].map((value) => normalizeWorkflowVideoFieldKey(String(value || ""))).filter(Boolean);
    return keys.some((key) => key === dimension || key.endsWith(dimension) || key.includes(`${dimension}pixels`));
}

function workflowBooleanFieldMatches(field: WorkflowVideoFieldLike, name: "generateaudio" | "watermark") {
    const keys = [field.source, field.fieldName, field.label].map((value) => normalizeWorkflowVideoFieldKey(String(value || ""))).filter(Boolean);
    return keys.some((key) => key === name || key.endsWith(name));
}

function workflowBooleanDefault(field: WorkflowVideoFieldLike) {
    const value = workflowFieldDefaultValue(field).toLowerCase();
    return value === "true" || value === "1" || value === "yes";
}

function normalizeWorkflowVideoFieldKey(value: string) {
    return String(value)
        .toLowerCase()
        .replace(/[\s_-]/g, "");
}

function workflowFieldOptionValues(options: unknown[] | undefined) {
    if (!Array.isArray(options)) return [] as string[];
    return options
        .filter((option) => !workflowFieldOptionIsRange(option))
        .map(workflowFieldOptionValue)
        .filter(Boolean);
}

function workflowFieldChoiceValuesFromProtocol(field: WorkflowVideoFieldLike | undefined) {
    const explicit = workflowFieldOptionValues(field?.options);
    if (explicit.length) return explicit;
    const classType = normalizeWorkflowVideoFieldKey(String(field?.classType || ""));
    const fieldName = normalizeWorkflowVideoFieldKey(String(field?.fieldName || ""));
    // RunningHub 對該節點有固定列舉，但 getJsonApiFormat 可能只返回預設值；
    // 只有節點型別和欄位名同時匹配時才補齊，避免把所有工作流比例強製成同一套選項。
    if (classType === "resolutionselector" && fieldName === "aspectratio") return resolutionSelectorAspectRatioOptions;
    return [] as string[];
}

function workflowFieldOptionIsRange(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const item = value as Record<string, unknown>;
    const nested = item.range;
    return [item, nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : undefined].some(
        (candidate) => candidate && ["min", "max", "step", "minValue", "maxValue", "stepValue"].some((key) => candidate[key] !== undefined),
    );
}

function workflowFieldOptionValue(value: unknown): string {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const item = value as Record<string, unknown>;
        for (const key of ["value", "id", "key", "name", "label"]) {
            if (item[key] !== undefined && item[key] !== null && String(item[key]).trim()) return String(item[key]).trim();
        }
    }
    return value === undefined || value === null ? "" : String(value).trim();
}

function workflowOutputSizeLike(value: string) {
    return /^\d+(?:\.\d+)?(?:x|:)\d+(?:\.\d+)?(?:-|$)/i.test(value.trim());
}

function workflowFieldDefaultValue(field: WorkflowVideoFieldLike | undefined) {
    if (!field) return "";
    return workflowFieldOptionValue(field.fieldValue ?? field.defaultValue ?? field.value ?? field.default);
}

/**
 * 讀取畫布當前的工作流欄位值。新版本按 nodeId + fieldName 儲存；舊畫布曾按
 * source 語義鍵儲存，比例欄位必須相容讀取，否則會靜默回退到工作流預設的 1:1。
 */
export function workflowFieldCurrentValue(field: WorkflowVideoFieldLike | undefined, values: Readonly<Record<string, unknown>>) {
    if (!field) return undefined;
    for (const key of [workflowFieldKey(field), ...workflowFieldLegacyKeys(field)]) {
        if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
    }
    // 舊畫布和新工作流 schema 可能分別使用 aspectRatio / aspect_ratio，
    // 欄位語義相同但儲存鍵不同。讀取時按節點號和規範化欄位名相容，
    // 避免找不到使用者已選值後回退到工作流或全域性預設比例。
    const nodeKey = normalizeWorkflowParameterPart(field.nodeId);
    const fieldKeys = [field.fieldName, field.source, field.label].map((value) => normalizeWorkflowParameterPart(value)).filter(Boolean);
    if (nodeKey && fieldKeys.length) {
        for (const [key, value] of Object.entries(values)) {
            const match = key.match(/^field:([^:]+):(.+)$/i);
            if (!match) continue;
            if (normalizeWorkflowParameterPart(match[1]) === nodeKey && fieldKeys.includes(normalizeWorkflowParameterPart(match[2]))) return value;
        }
    }
    return field.fieldValue ?? field.defaultValue ?? field.value ?? field.default;
}

export function workflowFieldHasStoredValue(field: WorkflowVideoFieldLike | undefined, values: Readonly<Record<string, unknown>>) {
    if (!field) return false;
    if ([workflowFieldKey(field), ...workflowFieldLegacyKeys(field)].some((key) => Object.prototype.hasOwnProperty.call(values, key))) return true;
    const nodeKey = normalizeWorkflowParameterPart(field.nodeId);
    const fieldKeys = [field.fieldName, field.source, field.label].map((value) => normalizeWorkflowParameterPart(value)).filter(Boolean);
    if (!nodeKey || !fieldKeys.length) return false;
    return Object.keys(values).some((key) => {
        const match = key.match(/^field:([^:]+):(.+)$/i);
        return Boolean(match && normalizeWorkflowParameterPart(match[1]) === nodeKey && fieldKeys.includes(normalizeWorkflowParameterPart(match[2])));
    });
}

function normalizeWorkflowParameterPart(value: unknown) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]/g, "");
}

function workflowFieldLegacyKeys(field: WorkflowVideoFieldLike) {
    const keys = [field.source, field.fieldName, field.label].map((value) => normalizeWorkflowVideoFieldKey(String(value || ""))).filter(Boolean);
    if (keys.some((key) => ["aspectratio", "ratio", "imageaspectratio", "imageratio", "videoaspectratio", "videoratio"].includes(key))) {
        return ["source:aspectRatio", "source:aspect_ratio", "source:ratio"];
    }
    if (keys.some((key) => ["size", "imagesize", "imageresolution"].includes(key))) return ["source:size"];
    if (keys.some((key) => ["quality", "imagequality"].includes(key))) return ["source:quality"];
    if (keys.some((key) => ["vquality", "videoresolution", "videoquality"].includes(key))) return ["source:vquality", "source:videoResolution"];
    if (keys.some((key) => ["videoseconds", "duration", "durationseconds", "seconds"].includes(key))) return ["source:videoSeconds", "source:duration", "source:duration_seconds"];
    if (keys.some((key) => ["count", "batch", "batchsize"].includes(key))) return ["source:count", "source:batch"];
    return [] as string[];
}

function workflowNumericFieldValues(field: WorkflowVideoFieldLike) {
    const bounds = workflowFieldNumberBounds(field);
    const min = bounds.min;
    const max = bounds.max;
    const step = bounds.step;
    if (min === undefined || max === undefined || max < min || step === undefined || step <= 0) return [] as string[];
    const count = Math.floor((max - min) / step) + 1;
    if (count <= 0 || count > 32) return [] as string[];
    return Array.from({ length: count }, (_, index) => String(Number((min + index * step).toFixed(6))));
}

function workflowNumber(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function workflowDurationNumber(value: string) {
    const parsed = Number(
        String(value)
            .trim()
            .replace(/(?:s|秒)$/i, ""),
    );
    return Number.isFinite(parsed) ? parsed : undefined;
}

function matchWorkflowValue(value: string, options: string[]) {
    if (!value) return "";
    return options.find((option) => option.toLowerCase() === value.toLowerCase()) || options.find((option) => option.replace(/p$/i, "").toLowerCase() === value.replace(/p$/i, "").toLowerCase()) || "";
}

export function normalizeImageValue(profile: ImageCapabilityConfig, value: { size?: string; quality?: string; count?: string; transparentBackground?: string }) {
    const size = normalizeImageSizeSetting(profile, value.size);
    const requestedQuality = String(value.quality || "")
        .trim()
        .toLowerCase();
    // 比例協議的固定解析度預設沒有獨立 quality 欄位時，UI 仍需把當前比例對應的
    // 預設檔位帶入請求。僅在 quality 未宣告支援時啟用，避免與 auto/low/medium/high
    // 這組真實圖片質量語義混用。
    const presetTier = !profile.quality.supported ? imagePresetTierForSelection(profile, size) : undefined;
    const quality = profile.quality.supported
        ? requestedQuality === "auto" || requestedQuality === "any"
            ? profile.quality.values.includes("auto") ? "auto" : profile.quality.default
            : value.quality && profile.quality.values.includes(value.quality)
              ? value.quality
              : profile.quality.default || "auto"
        : requestedQuality === "1k" || requestedQuality === "2k" || requestedQuality === "4k"
          ? requestedQuality
          : presetTier || profile.quality.default || "auto";
    const count = String(profile.fixedOutputs || Math.max(1, Math.min(profile.maxOutputs, Math.floor(Math.abs(Number(value.count)) || 1))));
    const transparentBackground = profile.transparentBackground.supported && value.transparentBackground === "true" ? "true" : "false";
    return { size, quality, count, transparentBackground };
}

function imagePresetTierForSelection(profile: ImageCapabilityConfig, size: string): ImageResolutionTier | undefined {
    if (profile.size.parameter !== "aspect_ratio" || !size || size === "auto") return undefined;
    return profile.size.presets?.find((preset) => preset.ratio === size)?.tier;
}

export function normalizeImageSizeSetting(profile: ImageCapabilityConfig, value?: string) {
    if (profile.size.parameter === "none") return "auto";
    const candidate = value?.trim() || profile.size.default;
    if (profile.size.allowCustom || profile.size.values.includes(candidate)) return candidate;
    return profile.size.default || profile.size.values[0] || "auto";
}

export function imageSizeRequest(profile: ImageCapabilityConfig, value?: string) {
    const parameter = profile.size.parameter;
    if (parameter === "none") return undefined;
    const normalized = normalizeImageSizeSetting(profile, value);
    if (!normalized || normalized === "auto") return undefined;
    return { parameter, value: normalized };
}

export function normalizeVideoValue(profile: VideoCapabilityConfig, value: { seconds?: string; ratio?: string; resolution?: string }) {
    const duration = profile.duration.selection === "enum" ? ((profile.duration.values || []).includes(Number(value.seconds)) ? Number(value.seconds) : profile.duration.default) : normalizeRangeDuration(profile, Number(value.seconds));
    const ratio = resolveVideoRatioValue(profile, value.ratio);
    // 前端狀態歷史上儲存過 `720`，而能力配置和供應商通常使用 `720p`；統一按能力中的原始值返回，避免被誤判為不支援。
    const resolution = resolveVideoResolutionValue(profile, value.resolution);
    return { seconds: String(duration), ratio, resolution };
}

export function resolveVideoRatioValue(profile: VideoCapabilityConfig, value: string | undefined) {
    return profile.ratios.includes(value || "") ? value! : profile.defaultRatio || profile.ratios[0] || "";
}

export function resolveVideoResolutionValue(profile: VideoCapabilityConfig, value: string | undefined) {
    return videoResolutionRequest(profile, value) || profile.defaultResolution || profile.resolutions[0] || "";
}

export function videoResolutionRequest(profile: VideoCapabilityConfig, value: string | undefined) {
    const requested = String(value || "")
        .trim()
        .toLowerCase();
    if (!requested || requested === "auto" || requested === "default" || requested === "medium" || requested === "high") return undefined;
    const candidates = [requested];
    if (/^\d+$/.test(requested)) candidates.push(`${requested}p`);
    if (requested === "low") candidates.push("480p");
    if (requested === "2k") candidates.push("1440p");
    if (requested === "1440" || requested === "1440p") candidates.push("2k");
    if (requested === "4k") candidates.push("2160p");
    if (requested === "2160" || requested === "2160p") candidates.push("4k");
    const supported = new Map(profile.resolutions.map((resolution) => [resolution.trim().toLowerCase(), resolution.trim()]));
    for (const candidate of candidates) {
        const match = supported.get(candidate);
        if (match) return match;
    }
    return undefined;
}

function normalizeRangeDuration(profile: VideoCapabilityConfig, value: number) {
    const min = profile.duration.continuous ? profile.duration.fractionalMin || profile.duration.min || .92 : profile.duration.min || 1;
    const max = profile.duration.max || min;
    const step = profile.duration.step || 1;
    const candidate = Number.isFinite(value) ? (profile.duration.continuous ? value : Math.floor(value)) : profile.duration.default;
    const clamped = Math.min(max, Math.max(min, candidate));
	if (profile.duration.continuous) return clamped;
    const maxStep = Math.max(0, Math.floor((max - min) / step));
    return min + Math.min(maxStep, Math.max(0, Math.round((clamped - min) / step))) * step;
}

export function videoDurationOptions(profile: VideoCapabilityConfig) {
    if (profile.duration.selection === "enum") return profile.duration.values || [];
	if (profile.duration.continuous) return [profile.duration.fractionalMin || profile.duration.min || .92,...Array.from({length:15},(_,i)=>i+1)];
    const min = profile.duration.min || 1;
    const max = profile.duration.max || min;
    const step = profile.duration.step || 1;
    return Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, index) => min + index * step);
}

export function videoDurationAllowed(profile: VideoCapabilityConfig, value: number) {
    if (value === -1) return (profile.duration.values || []).includes(-1);
    if (profile.duration.selection === "enum") return (profile.duration.values || []).includes(value);
    const min = profile.duration.continuous ? profile.duration.fractionalMin || profile.duration.min || .92 : profile.duration.min || 1;
    const max = profile.duration.max || min;
    const step = profile.duration.step || 1;
    return Number.isFinite(value) && value >= min && value <= max && (profile.duration.continuous || Math.abs((value-min)/step-Math.round((value-min)/step))<1e-7);
}
