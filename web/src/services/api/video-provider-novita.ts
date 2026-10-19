import { imageToDataUrl } from "@/services/image-storage";
import { modelOptionName } from "@/stores/use-config-store";
import { isPublicMediaUrl } from "./video-validation";
import { normalizeSeedanceDuration } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";

type NovitaVideoResult = { task?: { status?: string; reason?: string }; videos?: Array<{ video_url?: string }> };

export async function createNovitaVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (references.length > 1 || videoReferences.length || audioReferences.length) throw new Error("Novita 影片當前只支援 1 張起始圖，不支援參考影片或音訊");
    if (references.length && options?.videoEditOperation === "reference_to_video") throw new Error("Novita 影片當前不支援角色或風格參考圖生影片，請改用支援 reference_to_video 的模型");
    const payload: Record<string, unknown> = {
        model: modelOptionName(model),
        prompt: prompt.trim(),
        duration: normalizeNovitaVideoDuration(config.videoSeconds),
    };
    if (references[0]) {
        payload.image = isPublicMediaUrl(references[0].url || "") ? references[0].url : await imageToDataUrl(references[0]);
    } else {
        payload.aspect_ratio = normalizeNovitaVideoRatio(config.size);
    }
    try {
        const created = await deps.transport.post<{ task_id?: string }>(novitaVideoUrl(config, "/video/create"), payload, options);
        if (!created.task_id) throw new Error("Novita 影片介面沒有返回任務 ID");
        return { id: created.task_id, provider: "novita", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "Novita 影片任務建立失敗"));
    }
}

export async function pollNovitaVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const result = await deps.transport.get<NovitaVideoResult>(novitaVideoUrl(config, `/async/task-result?task_id=${encodeURIComponent(task.id)}`), options);
        const status = result.task?.status || "";
        if (status === "TASK_STATUS_SUCCEED") {
            const url = result.videos?.[0]?.video_url || "";
            if (!url) return { status: "failed", error: "Novita 影片任務已完成但沒有返回影片地址" };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "TASK_STATUS_FAILED") return { status: "failed", error: result.task?.reason || "影片生成失敗" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "Novita 影片任務查詢失敗"));
    }
}

function novitaVideoUrl(config: ResolvedAiConfig, path: string) {
    return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

function normalizeNovitaVideoDuration(value: string) {
    return normalizeSeedanceDuration(value) >= 8 ? "10" : "5";
}

function normalizeNovitaVideoRatio(value: string) {
    return value === "16:9" || value === "9:16" || value === "1:1" ? value : "16:9";
}
