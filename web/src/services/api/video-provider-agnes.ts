import { getResourceOSSUrl } from "@/services/api/resources";
import { buildApiUrl, isSystemProxyBaseUrl, modelOptionName } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { ApiEnvelope, RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";
import { resolveVideoImageReferences, type VideoImageRole } from "./video-reference-roles";

type AgnesTaskResponse = {
    id?: string;
    task_id?: string;
    video_id?: string;
    status?: string;
    url?: string;
    metadata?: { url?: string } | null;
    error?: { message?: string; detail?: string; code?: string } | null;
    message?: string;
    detail?: string;
};

const AGNES_V25_MODELS = new Set(["agnes-video-2.5", "agnes-video-2.5-flash"]);
const AGNES_ASPECT_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] as const;

export function isAgnesConfig(config: ResolvedAiConfig) {
    return config.interfaceType === "agnes-video";
}

export async function createAgnesVideoTask(
    deps: VideoProviderDeps,
    config: ResolvedAiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    options?: RequestOptions,
): Promise<VideoGenerationTask> {
    const modelName = modelOptionName(model).trim();
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) throw new Error("請輸入 Agnes 影片提示詞");

    const [imageUrls, videoUrls, audioUrls] = await Promise.all([
        Promise.all(references.map((item) => resolveAgnesMediaUrl(item.url || item.dataUrl, item.storageKey))),
        Promise.all(videoReferences.map((item) => resolveAgnesMediaUrl(item.url, item.storageKey))),
        Promise.all(audioReferences.map((item) => resolveAgnesMediaUrl(item.url, item.storageKey))),
    ]);
    const imageRoles = resolveVideoImageReferences(references, options, { videoCount: videoUrls.length, audioCount: audioUrls.length }).map(({ role }) => role);
    const payload = modelName === "agnes-video-v2.0"
        ? buildAgnesV20Payload(config, modelName, normalizedPrompt, imageUrls, imageRoles, videoUrls, audioUrls, options)
        : buildAgnesV25Payload(config, modelName, normalizedPrompt, imageUrls, imageRoles, videoUrls, audioUrls);

    try {
        const raw = await deps.transport.post<ApiEnvelope<AgnesTaskResponse>>(deps.transport.apiUrl("/videos"), payload, options);
        const created = deps.response.unwrapEnvelope(raw, "Agnes 介面沒有返回影片任務");
        const id = String(created.video_id || created.task_id || created.id || "").trim();
        if (!id) throw new Error("Agnes 建立響應沒有 video_id");
        return { id, provider: "agnes", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "Agnes 影片任務建立失敗"));
    }
}

export async function pollAgnesVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const raw = await deps.transport.get<ApiEnvelope<AgnesTaskResponse>>(agnesPollUrl(config, task.id, modelOptionName(task.model)), options);
        const state = deps.response.unwrapEnvelope(raw, "Agnes 介面沒有返回任務狀態");
        const status = String(state.status || "").trim().toLowerCase();
        if (status === "completed" || status === "succeeded" || status === "success" || status === "done") {
            const url = String(state.metadata?.url || state.url || "").trim();
            if (!url) return { status: "failed", error: "Agnes 任務已完成但沒有返回影片 URL" };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "failed" || status === "cancelled" || status === "canceled") return { status: "failed", error: agnesFailureMessage(state) };
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "Agnes 影片任務查詢失敗"));
    }
}

export function agnesPollUrl(config: ResolvedAiConfig, videoId: string, modelName: string) {
    const query = new URLSearchParams({ video_id: videoId, model_name: modelName }).toString();
    const path = `/agnesapi?${query}`;
    if (isSystemProxyBaseUrl(config.baseUrl)) return buildApiUrl(config.baseUrl, path);
    let base: URL;
    try {
        base = new URL(config.baseUrl);
    } catch {
        throw new Error("Agnes Base URL 無效，請填寫完整的 HTTP(S) 地址");
    }
    base.pathname = "/agnesapi";
    base.search = query;
    base.hash = "";
    return base.toString();
}

function buildAgnesV25Payload(config: ResolvedAiConfig, model: string, prompt: string, images: string[], imageRoles: VideoImageRole[], videos: string[], audios: string[]) {
    if (!AGNES_V25_MODELS.has(model)) throw new Error(`Agnes 影片協議不支援模型 ${model}`);
    const seconds = agnesSeconds(config.videoSeconds);
    const size = agnesResolution(config.vquality);
    if (model === "agnes-video-2.5-flash") {
        if (size !== "720P") throw new Error("Agnes Video 2.5 Flash 僅支援 720P");
        if (images.length > 5) throw new Error("Agnes Video 2.5 Flash 最多支援 5 張參考圖");
        if (videos.length) throw new Error("Agnes Video 2.5 Flash 不支援參考影片");
    }
    const hasReferenceImages = imageRoles.includes("reference_image");
    const hasFrameImages = imageRoles.includes("first_frame") || imageRoles.includes("last_frame");
    if (hasFrameImages && (hasReferenceImages || videos.length || audios.length)) throw new Error("Agnes Video 2.5 不能同時混用首尾幀和角色、影片或音訊參考素材");
    const mode = videos.length || audios.length || hasReferenceImages ? "reference" : images.length ? "keyframe" : "text";
    const payload: Record<string, unknown> = {
        model,
        prompt,
        mode,
        seconds,
        size,
        aspect_ratio: agnesAspectRatio(config.size),
        n: 1,
    };
    if (mode === "keyframe") {
        const firstFrame = imageForRole(images, imageRoles, "first_frame") || images[0];
        const lastFrame = imageForRole(images, imageRoles, "last_frame");
        payload.first_frame = firstFrame;
        if (lastFrame) payload.last_frame = lastFrame;
    } else if (mode === "reference") {
        if (images.length) payload.images = images;
        if (audios.length) payload.audios = audios;
        if (videos.length) payload.videos = videos.map((url) => ({ url }));
    }
    return payload;
}

function buildAgnesV20Payload(config: ResolvedAiConfig, model: string, prompt: string, images: string[], imageRoles: VideoImageRole[], videos: string[], audios: string[], options?: RequestOptions) {
    if (videos.length || audios.length) throw new Error("Agnes Video V2.0 不支援參考影片或音訊");
    if (options?.videoEditOperation === "reference_to_video" || imageRoles.includes("reference_image")) throw new Error("Agnes Video V2.0 不支援角色或風格參考圖模式，請改用 Agnes Video 2.5");
    const seconds = Math.max(1, Math.floor(Number(config.videoSeconds) || 5));
    const frameRate = 24;
    const targetFrames = seconds * frameRate;
    const payload: Record<string, unknown> = {
        model,
        prompt,
        frame_rate: frameRate,
        num_frames: Math.min(441, Math.floor((targetFrames - 1 + 4) / 8) * 8 + 1),
    };
    const orderedImages = [imageForRole(images, imageRoles, "first_frame"), imageForRole(images, imageRoles, "last_frame")].filter((value): value is string => Boolean(value));
    if (orderedImages.length === 1) payload.image = orderedImages[0];
    if (orderedImages.length > 1) payload.extra_body = { image: orderedImages, mode: "keyframes" };
    return payload;
}

function imageForRole(images: string[], roles: VideoImageRole[], role: VideoImageRole) {
    const index = roles.indexOf(role);
    return index >= 0 ? images[index] : undefined;
}

function agnesSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 5);
    if (seconds < 4 || seconds > 12) throw new Error("Agnes Video 2.5 時長必須在 4–12 秒之間");
    return String(seconds);
}

function agnesResolution(value: string) {
    const normalized = String(value || "720").trim().toLowerCase();
    if (normalized === "auto" || normalized === "720" || normalized === "720p") return "720P";
    if (normalized === "960" || normalized === "960p") return "960P";
    if (normalized === "2k" || normalized === "1440" || normalized === "1440p") return "2K";
    throw new Error("Agnes Video 2.5 解析度必須是 720P、960P 或 2K");
}

function agnesAspectRatio(value: string) {
    const normalized = String(value || "16:9").trim().toLowerCase().replace("×", "x");
    if (normalized === "auto" || !normalized) return "16:9";
    const direct = AGNES_ASPECT_RATIOS.find((ratio) => ratio === normalized);
    if (direct) return direct;
    const dimensions = normalized.match(/^(\d+)x(\d+)$/);
    if (dimensions) {
        const aspect = Number(dimensions[1]) / Number(dimensions[2]);
        const matched = AGNES_ASPECT_RATIOS.find((ratio) => {
            const [width, height] = ratio.split(":").map(Number);
            return Math.abs(width / height - aspect) < 0.01;
        });
        if (matched) return matched;
    }
    throw new Error("Agnes Video 2.5 畫幅必須是 21:9、16:9、4:3、1:1、3:4 或 9:16");
}

async function resolveAgnesMediaUrl(value: string | undefined, storageKey?: string) {
    if (storageKey?.startsWith("resource:")) return getResourceOSSUrl(storageKey);
    if (/^https?:\/\//i.test(value || "")) return String(value);
    throw new Error("Agnes 參考素材需要公網 URL；本地素材不能直接傳送到該渠道，請改用支援本地素材的渠道或提供公網素材地址");
}

function agnesFailureMessage(state: AgnesTaskResponse) {
    return String(state.error?.message || state.error?.detail || state.error?.code || state.message || state.detail || "Agnes 影片生成失敗");
}
