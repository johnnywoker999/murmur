import type { GenerationTask, TaskStatus } from "@/services/api/task-center";

export const statusLabel: Record<TaskStatus, string> = {
    queued: "排隊中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失敗",
    cancelled: "已取消",
};

type GenerationTaskDisplayTarget = Pick<GenerationTask, "status" | "stage">;

export function isGenerationTaskSubmissionUncertain(task: GenerationTaskDisplayTarget) {
    return task.stage === "submission_unknown";
}

export function generationTaskStatusLabel(task: GenerationTaskDisplayTarget) {
    if (isGenerationTaskSubmissionUncertain(task)) return "提交結果待確認";
    return statusLabel[task.status];
}

export function generationTaskStageLabel(task: GenerationTaskDisplayTarget) {
    if (isGenerationTaskSubmissionUncertain(task)) return "為避免重複建立上游任務，未自動重試";
    if (task.stage === "generating") return "生成中";
    if (task.stage === "queued") return "排隊中";
    return task.stage || generationTaskStatusLabel(task);
}

export function generationTaskShowsProgress(task: GenerationTaskDisplayTarget) {
    if (isGenerationTaskSubmissionUncertain(task)) return false;
    // 排隊、後端接管和連線供應商都沒有真實百分比。只有上游狀態響應
    // 已經寫回任務後才顯示進度，避免所有圖片/影片長期停在同一個假數值。
    if (["等待佇列排程", "後端接管任務", "正在連線上游", "呼叫生成模型"].includes(task.stage || "")) return false;
    return true;
}

/** 上游百分比多久沒動，就不再把它畫成一根停住的進度條。 */
export const GENERATION_PROGRESS_STALL_MS = 60_000;

export const GENERATION_VIDEO_EXPECTATION = "影片通常要幾分鐘，可以先做別的。";

export type GenerationProgressRecord = { progress: number; changedAt: number };

/**
 * 記錄上游百分比最後一次變化的時間（只在客戶端記，不改任務資料）。
 * 百分比沒變就原樣返回舊記錄，變了或第一次看到就以 now 作為變化時間。
 */
export function trackGenerationProgressChange(previous: GenerationProgressRecord | undefined, progress: number, now: number): GenerationProgressRecord {
    if (previous && previous.progress === progress) return previous;
    return { progress, changedAt: now };
}

export type GenerationProgressDisplay = {
    /** none：不畫進度條；determinate：按真實百分比畫；indeterminate：百分比久未變化，改為迴圈掃描。 */
    bar: "none" | "determinate" | "indeterminate";
    /** 只在 determinate 時給出，永遠是上游返回的真實值。 */
    percent: number | null;
    /** 影片任務進行中給出的一句預期說明。 */
    expectation: string | null;
};

export function generationProgressDisplay(input: {
    status: GenerationTask["status"];
    progress: number | null;
    progressChangedAt?: number;
    now: number;
    isVideo: boolean;
}): GenerationProgressDisplay {
    const active = input.status === "queued" || input.status === "running";
    const expectation = active && input.isVideo ? GENERATION_VIDEO_EXPECTATION : null;
    if (input.progress === null) return { bar: "none", percent: null, expectation };
    const stalled = input.status === "running"
        && input.progressChangedAt !== undefined
        && input.now - input.progressChangedAt >= GENERATION_PROGRESS_STALL_MS;
    if (stalled) return { bar: "indeterminate", percent: null, expectation };
    return { bar: "determinate", percent: input.progress, expectation };
}

/** 已用時間，例如「3分12秒」「1時05分」。 */
export function formatGenerationElapsed(elapsedMs: number) {
    const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `${minutes}分${seconds % 60}秒` : `${Math.floor(minutes / 60)}時${minutes % 60}分`;
}

export const operationOptions = [
    { label: "文生影片", value: "text_to_video" },
    { label: "圖生影片", value: "image_to_video" },
    { label: "全模態參考", value: "reference_to_video" },
    { label: "影片續寫", value: "extend" },
    { label: "影片區域性修改", value: "inpaint" },
    { label: "元素替換", value: "replace_element" },
    { label: "鏡頭/運鏡調整", value: "camera_motion" },
    { label: "風格遷移", value: "style_transfer" },
    { label: "參考音訊生成影片", value: "audio_to_video" },
    { label: "結果版本對比", value: "compare_versions" },
];

export const operationLabelByValue = new Map(operationOptions.map((item) => [item.value, item.label]));

export const taskTypeLabel: Record<string, string> = {
    canvas_image: "畫布生圖",
    canvas_video: "畫布影片",
    canvas_audio: "畫布音訊",
    canvas_text: "畫布文本",
};

export function formatTaskKind(task: GenerationTask) {
    const typeLabel = taskTypeLabel[task.type];
    const operationLabel = task.operation ? operationLabelByValue.get(task.operation) : "";

    if (task.type === "canvas_video" && operationLabel) return `${typeLabel || "畫布影片"} · ${operationLabel}`;
    if (typeLabel) return typeLabel;
    if (operationLabel) return operationLabel;
    if (task.type.startsWith("video_")) return "影片任務";
    return "生成任務";
}
