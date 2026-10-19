import { loadCanvasDrawingRender, saveCanvasDrawingRenderPublication } from "@/lib/canvas/canvas-drawing-storage";
import { resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import type { ReferenceImage } from "@/types/image";

export async function resolveCanvasDrawingReference(projectId: string, image: ReferenceImage): Promise<ReferenceImage> {
    const source = image.source;
    if (!source || source.kind !== "drawing") return image;
    if (!source.shapeCount) throw new Error(`繪圖“${image.name}”為空，請先完成繪圖再生成`);

    const render = await loadCanvasDrawingRender(projectId, source.drawingId);
    if (!render || render.revision !== source.revision) {
        throw new Error(`繪圖“${image.name}”缺少當前版本的生成圖，請開啟繪圖並儲存後重試`);
    }

    if (resourceIdFromStorageKey(render.storageKey)) {
        return {
            ...image,
            dataUrl: "",
            url: render.url,
            storageKey: render.storageKey,
            type: render.mimeType,
        };
    }

    try {
        const resource = await uploadResourceFile(render.blob, "image", {
            width: render.width,
            height: render.height,
            fileName: `drawing-${source.drawingId}-r${source.revision}.png`,
        });
        const storageKey = resourceStorageKey(resource.id);
        const url = resource.publicUrl || resourceFileUrl(resource.id);
        const saved = await saveCanvasDrawingRenderPublication(projectId, source.drawingId, source.revision, { storageKey, url });
        if (!saved) throw new Error("繪圖在上傳期間發生了修改，請重新生成");
        return { ...image, dataUrl: "", url, storageKey, type: resource.mimeType || render.mimeType };
    } catch (error) {
        if (error instanceof Error && error.message === "繪圖在上傳期間發生了修改，請重新生成") throw error;
        throw new Error(error instanceof Error ? `繪圖參考圖上傳失敗：${error.message}` : "繪圖參考圖上傳失敗");
    }
}
