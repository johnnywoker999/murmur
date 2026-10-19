import { formatBytes } from "@/lib/image-utils";
import type { GenerationTaskDeliveryProgress } from "@/services/api/task-center";

export type GenerationDeliveryProgressView = { title: string; percent: number | null; detail: string };

function sizeLabel(bytes: number) {
    return formatBytes(bytes) || "0 B";
}

// Backend stage while a finished video result is being fetched (set by the
// generation download loop before any bytes arrive).
export const GENERATION_RESULT_FETCH_STAGE = "正在取回生成結果";

export function generationTaskFetchingResult(task: { status: string; stage?: string }, hasDelivery: boolean) {
    return hasDelivery || task.status === "succeeded" || (task.status === "running" && task.stage === GENERATION_RESULT_FETCH_STAGE);
}

export function generationDeliveryProgressView(progress: GenerationTaskDeliveryProgress): GenerationDeliveryProgressView {
    if (progress.state === "waiting") return { title: "正在取回結果", percent: null, detail: "等待結果就緒" };
    const downloaded = Math.max(0, progress.downloadedBytes);
    const known = progress.totalBytes > 0;
    const percent = known ? Math.min(100, Math.floor((downloaded * 100) / progress.totalBytes)) : null;
    const size = known ? `${sizeLabel(downloaded)} / ${sizeLabel(progress.totalBytes)}` : sizeLabel(downloaded);
    const retrying = progress.state === "retrying";
    return {
        title: retrying ? "下載中斷，正在重試" : "正在取回結果",
        percent,
        detail: [size, retrying || progress.bytesPerSecond <= 0 ? "" : `${sizeLabel(progress.bytesPerSecond)}/s`].filter(Boolean).join(" · "),
    };
}
