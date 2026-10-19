import { resourceFileUrl, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import type { ReferenceImage } from "@/types/image";

/** 調色引數，單位與 CSS filter 一致（百分比 / 度） */
export type CanvasColorGrade = {
    brightness: number;
    contrast: number;
    saturate: number;
    hueRotate: number;
};

export const DEFAULT_COLOR_GRADE: CanvasColorGrade = { brightness: 100, contrast: 100, saturate: 100, hueRotate: 0 };

export function isNeutralColorGrade(grade: CanvasColorGrade) {
    return grade.brightness === 100 && grade.contrast === 100 && grade.saturate === 100 && grade.hueRotate === 0;
}

/**
 * 預覽（img 的 CSS filter）與匯出（canvas 的 ctx.filter）共用同一個字串。
 * 兩處各寫一份的話，使用者看到的和生成用的就會悄悄不一致。
 */
export function colorGradeCssFilter(grade: CanvasColorGrade) {
    return `brightness(${grade.brightness}%) contrast(${grade.contrast}%) saturate(${grade.saturate}%) hue-rotate(${grade.hueRotate}deg)`;
}

// 同一張圖 + 同一組引數在一次會話內只上傳一次。
// 不做跨會話快取：那需要往節點 metadata 回寫，而構建參考圖的路徑拿不到寫入通道。
const publishedCache = new Map<string, { url: string; storageKey: string; type: string }>();

function cacheKey(url: string, grade: CanvasColorGrade) {
    return `${url}|${grade.brightness}|${grade.contrast}|${grade.saturate}|${grade.hueRotate}`;
}

async function renderGradedBlob(url: string, grade: CanvasColorGrade) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("源圖無法讀取（可能不允許跨域）"));
        image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("無法建立畫布上下文");
    // ctx.filter 在少數瀏覽器上不存在——那會靜默匯出一張未調色的圖，
    // 與使用者看到的預覽不一致。寧可明確失敗。
    if (!("filter" in ctx)) throw new Error("當前瀏覽器不支援匯出調色結果，請換用 Chrome / Edge");
    ctx.filter = colorGradeCssFilter(grade);
    ctx.drawImage(image, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("調色結果匯出失敗");
    return { blob, width: canvas.width, height: canvas.height };
}

/**
 * 把調色節點的參考圖落地成真實資源——照 resolveCanvasDrawingReference 的做法：
 * 本地渲染 → 上傳 → 換成 storageKey/url，讓下游按普通圖片消費。
 *
 * 只在生成真正要用它時才呼叫（見 canvas-node-generation），所以拖滑桿調引數不會產生上傳。
 */
export async function resolveCanvasColorGradeReference(image: ReferenceImage): Promise<ReferenceImage> {
    const source = image.source;
    if (!source || source.kind !== "colorgrade") return image;

    const cached = publishedCache.get(cacheKey(source.url, source.grade));
    if (cached) return { ...image, dataUrl: "", url: cached.url, storageKey: cached.storageKey, type: cached.type };

    try {
        const render = await renderGradedBlob(source.url, source.grade);
        const resource = await uploadResourceFile(render.blob, "image", {
            width: render.width,
            height: render.height,
            fileName: `colorgrade-${image.id}.png`,
        });
        const storageKey = resourceStorageKey(resource.id);
        const url = resource.publicUrl || resourceFileUrl(resource.id);
        const type = resource.mimeType || "image/png";
        publishedCache.set(cacheKey(source.url, source.grade), { url, storageKey, type });
        return { ...image, dataUrl: "", url, storageKey, type };
    } catch (error) {
        throw new Error(error instanceof Error ? `調色參考圖生成失敗：${error.message}` : "調色參考圖生成失敗");
    }
}
