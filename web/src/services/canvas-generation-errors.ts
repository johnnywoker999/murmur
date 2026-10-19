import { isCanvasRevisionConflict } from "@/services/canvas-revision-conflict";
import { explainGenerationError } from "@/lib/generation-error";

export class CanvasGenerationDurableAckError extends Error {
    readonly code: "canvas_conflict" | "result_apply_failed" | "result_target_unavailable";
    readonly cause: unknown;

    constructor(cause: unknown) {
        const explanation = explainGenerationError(cause);
        const code = isCanvasRevisionConflict(cause) ? "canvas_conflict" : explanation.category === "result_target_unavailable" ? "result_target_unavailable" : "result_apply_failed";
        super(code === "canvas_conflict" ? "生成結果已保留，畫布尚未更新" : code === "result_target_unavailable" ? explanation.message : "生成結果已保留，還沒放回畫布");
        this.name = "CanvasGenerationDurableAckError";
        this.code = code;
        this.cause = cause;
    }
}

export class CanvasGenerationMaterializationError extends Error {
    readonly code = "download_failed";
    readonly cause: unknown;

    constructor(cause?: unknown) {
        super("生成結果還沒取回，可以繼續取回");
        this.name = "CanvasGenerationMaterializationError";
        this.cause = cause;
    }
}

export class CanvasGenerationTargetSaveError extends Error {
    constructor(cause?: unknown, message = "畫布尚未儲存，未開始生成。請先處理畫布儲存提示後重試。") {
        super(message, { cause });
        this.name = "CanvasGenerationTargetSaveError";
    }
}

export class CanvasGenerationOutputMissingError extends Error {
    readonly code = "results_missing";
    constructor(index: number) {
        super(`原任務未返回第 ${index + 1} 張圖片，已有結果已保留，請檢視任務詳情`);
        this.name = "CanvasGenerationOutputMissingError";
    }
}
