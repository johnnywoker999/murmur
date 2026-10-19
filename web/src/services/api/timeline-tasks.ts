import { assertCanonicalPlan, type CanonicalPlanOptions, type CanonicalSourceMeta, type CanonicalTimelinePlan } from "@/lib/timeline/timeline-canonical-plan";
import { ApiError, getTransportFailureKind, http, type HttpRequestConfig } from "@/services/api/request";
import type { GenerationTask } from "@/services/api/task-center";
import type { TimelineProject } from "@/types/timeline";
import type { ChannelModelCatalogItem } from "@/lib/channel-model-catalog";
import { getBeefAPIConnectionEpoch } from "@/services/api/beefapi-connection";
import { UserScopeAbandonedError } from "@/lib/user-scope-guard";

// The local backend may spend 30 seconds fetching the managed catalog before
// admitting a cloud task. Keep a response margin without retrying submissions.
const TRANSCRIPTION_ADMISSION_TIMEOUT_MS = 35_000;

function transcriptionTransportError(error: unknown, submitting: boolean): unknown {
    const kind = getTransportFailureKind(error);
    if (!kind) return error;
    const cause = error instanceof ApiError ? error.cause : error;
    const timedOut = kind === "timeout";
    return new ApiError(submitting
        ? (timedOut ? "轉寫提交等待超時，任務可能已建立。請先到任務中心確認狀態。" : "轉寫提交連線中斷，任務狀態尚未確認。請先到任務中心檢視。")
        : (timedOut ? "讀取轉寫模型超時，請檢查 MURMUR AI 連線後重試。" : "無法連線轉寫模型服務，請檢查 MURMUR AI 連線後重試。"),
        { cause, status: error instanceof ApiError ? error.status : undefined });
}

export async function getTranscriptionModels(config?: HttpRequestConfig) {
    const connectionEpoch = getBeefAPIConnectionEpoch();
    try {
        const result = await http.post<{ models: ChannelModelCatalogItem[] }>("/beefapi/connection/models", {}, { timeout: TRANSCRIPTION_ADMISSION_TIMEOUT_MS, ...config });
        if (connectionEpoch !== getBeefAPIConnectionEpoch()) throw new UserScopeAbandonedError();
        return result.models.filter(item => item.supportedEndpointTypes?.includes("audio.transcriptions"));
    } catch (error) { throw transcriptionTransportError(error, false); }
}

// 時間線字幕轉寫任務 API。
// 建立入參與後端 TimelineTranscriptionCreateRequest 保持同名欄位，結果由任務中心統一查詢。

export type TimelineTranscriptionCreateRequest = {
    model?: string;
    resourceId: string;
    language?: string;
    projectId?: string;
    clientOperationId?: string;
};

export type TimelineTranscriptionResult = {
    segments: TimelineTranscriptionSegment[];
    srt?: string;
    language?: string;
};

export type TimelineTranscriptionSegment = {
    startMs: number;
    endMs: number;
    text: string;
};

export async function createTimelineTranscriptionTask(
    payload: TimelineTranscriptionCreateRequest,
    config?: HttpRequestConfig,
): Promise<GenerationTask> {
    try {
        return await http.post<GenerationTask>("/timeline/transcriptions", payload, { ...(payload.model ? { timeout: TRANSCRIPTION_ADMISSION_TIMEOUT_MS } : {}), ...config });
    } catch (error) { throw transcriptionTransportError(error, true); }
}

// 時間線成片渲染任務 API。
// timeline 直接傳 TimelineProject；後端使用同名欄位構建渲染輸入，未知欄位由後端邊界忽略。
// 任務完成後由任務中心讀取 ResultJSON，並按 TimelineRenderResult 解包。

export type TimelineRenderCreateRequest = {
    projectId: string;
    timeline: TimelineProject;
    options?: CanonicalPlanOptions;
    clientOperationId?: string;
};

export type TimelineRenderResult = {
    resourceId: string;
    fileName?: string;
    size?: number;
    durationMs?: number;
    subtitleSrt?: string;
};

export async function createTimelineRenderTask(
    payload: TimelineRenderCreateRequest,
    config?: HttpRequestConfig,
): Promise<GenerationTask> {
    return http.post<GenerationTask>("/timeline/renders", payload, config);
}

export type TimelineRenderPlanCompileRequest = {
    timeline: TimelineProject;
    sources?: CanonicalSourceMeta[];
    options?: CanonicalPlanOptions;
};

/** 只讀規劃：不排隊、不落盤、不計費。失敗必須上拋，匯出不得改走本地語義編譯。 */
export async function compileTimelineRenderPlan(
    payload: TimelineRenderPlanCompileRequest,
    signal?: AbortSignal,
): Promise<CanonicalTimelinePlan> {
    const plan = await http.post<CanonicalTimelinePlan>("/timeline/render-plan", payload, { signal });
    assertCanonicalPlan(plan);
    return plan;
}
