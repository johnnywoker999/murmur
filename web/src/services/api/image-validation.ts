import { imageSizeRequest, type ImageCapabilityConfig } from "@/lib/model-capabilities";
import type { ReferenceImage } from "@/types/image";

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const VOLCENGINE_ARK_IMAGE_MAX_PIXELS = 4624220;

export function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** grok2api / xAI Imagine：畫布 quality 對映為 resolution（1k/2k）。 */
export function normalizeGrokImageResolution(quality: string | undefined) {
    const value = (quality || "").trim().toLowerCase();
    if (!value || value === "auto") return undefined;
    if (value === "1k" || value === "low" || value === "standard") return "1k";
    if (value === "2k" || value === "medium" || value === "hd" || value === "high" || value === "4k") return "2k";
    return undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
export function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

export function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("影像尺寸格式不支援，請使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("影像比例必須是正數，例如 9:16");
    if (Math.max(w, h) / Math.min(w, h) > IMAGE_MAX_RATIO) throw new Error("影像寬高比不能超過 3:1，請調整尺寸");
    return { width: w, height: h };
}

export function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

export function validateImageSize(width: number, height: number, requireStepAlignment = true) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("影像尺寸必須是正整數，例如 1024x1024");
    if (requireStepAlignment && (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0)) throw new Error("影像尺寸的寬高必須是 16 的倍數，請調整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("影像尺寸最長邊不能超過 3840px，請調整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("影像寬高比不能超過 3:1，請調整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("影像總畫素需在 655360 到 8294400 之間，請調整尺寸");
}

export function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error("影像尺寸格式不支援，請使用 auto、9:16 或 1024x1024");
}

export function resolveAspectRatio(value: string) {
    const normalized = value.trim().toLowerCase().replace("×", "x");
    if (normalized.includes(":")) return normalized;
    const dimensions = parseImageDimensions(normalized);
    if (!dimensions) throw new Error("影像比例格式不支援，請使用 3:4 或 1024x1360");
    const divisor = dimensionGCD(dimensions.width, dimensions.height);
    return `${dimensions.width / divisor}:${dimensions.height / divisor}`;
}

function dimensionGCD(left: number, right: number) {
    while (right) [left, right] = [right, left % right];
    return Math.max(1, left);
}

export function resolveImageRequestSize(profile: ImageCapabilityConfig, quality: string | undefined, size: string) {
    const request = imageSizeRequest(profile, size);
    if (!request) return undefined;
    if (request.parameter === "aspect_ratio" && !profile.size.allowCustom && profile.size.presets?.length) {
        const normalized = normalizeQuality(quality || profile.quality.default);
        const tier = normalized === "low" ? "1k" : normalized === "medium" ? "2k" : normalized === "high" ? "4k" : undefined;
        if (tier && !profile.size.presets.some((preset) => preset.tier === tier && preset.ratio === request.value)) {
            throw new Error("當前解析度不支援所選圖片寬高比");
        }
    }
    const dimensions = parseImageDimensions(request.value);
    // 模型宣告的精確預設（如 1920x1080）不應被自定義尺寸的 16 畫素對齊規則拒絕。
    if (request.parameter === "size" && dimensions && profile.size.values.includes(request.value)) {
        validateImageSize(dimensions.width, dimensions.height, false);
        return request;
    }
    const value = request.parameter === "size" ? resolveRequestSize(quality, request.value) : resolveAspectRatio(request.value);
    return value ? { parameter: request.parameter, value } : undefined;
}

export function validateImageCapability(profile: ImageCapabilityConfig, references: ReferenceImage[], mask?: ReferenceImage) {
    if (references.length > profile.references.maxImages) throw new Error(`當前圖片模型最多支援 ${profile.references.maxImages} 張參考圖`);
    if (mask && !profile.references.maskSupported) throw new Error("當前圖片模型不支援蒙版編輯");
    if (profile.references.maxImageBytes > 0 && references.some((image) => (image.bytes || 0) > profile.references.maxImageBytes)) throw new Error("參考圖片檔案超過當前模型大小限制");
}

export function normalizeVolcengineArkImageSize(size: string | undefined) {
    if (!size) return undefined;
    const dimensions = parseImageDimensions(size);
    if (!dimensions || dimensions.width * dimensions.height <= VOLCENGINE_ARK_IMAGE_MAX_PIXELS) return size;
    const scale = Math.sqrt(VOLCENGINE_ARK_IMAGE_MAX_PIXELS / (dimensions.width * dimensions.height));
    let width = Math.floor((dimensions.width * scale) / 2) * 2;
    let height = Math.floor((dimensions.height * scale) / 2) * 2;
    while (width > 2 && height > 2 && width * height > VOLCENGINE_ARK_IMAGE_MAX_PIXELS) {
        if (width >= height) width -= 2;
        else height -= 2;
    }
    return `${width}x${height}`;
}
