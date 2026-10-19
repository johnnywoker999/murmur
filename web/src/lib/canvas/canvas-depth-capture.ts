import { explainGenerationError, generationFailureMetadata } from "@/lib/generation-error";
import { CanvasGenerationDurableAckError } from "@/services/canvas-generation-errors";
import type { GenerationTask } from "@/services/api/task-center";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export function isDepthCaptureResultNode(node: CanvasNodeData) {
    return Boolean(node.metadata?.depthSourceNodeId) && (!node.metadata?.taskType || node.metadata.taskType === "depth_capture");
}

export function canRecoverOrRetryDepthCapture(node: CanvasNodeData) {
    return isDepthCaptureResultNode(node) && ["failed", "cancelled", "succeeded"].includes(node.metadata?.taskStatus || "");
}

export function findDepthCaptureSourceNode(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    const sourceNodeId = node.metadata?.depthSourceNodeId;
    return sourceNodeId ? nodes.find((candidate) => candidate.id === sourceNodeId) : undefined;
}

export function depthCaptureTaskMetadata(task: GenerationTask): CanvasNodeMetadata {
    const active = task.status === "queued" || task.status === "running";
    return {
        taskId: task.id,
        taskType: task.type,
        taskStatus: task.status,
        taskStage: task.stage,
        taskProgress: task.progress,
        taskProvider: task.provider,
        taskErrorCode: task.errorCode,
        taskOfficialStatus: task.officialStatus,
        generationErrorCode: undefined,
        model: task.model,
        taskProviderRequestId: task.providerRequestId,
        taskFailureDiagnostics: task.failureDiagnostics,
        taskCreatedAt: task.createdAt,
        taskUpdatedAt: task.updatedAt,
        taskCompletedAt: task.completedAt,
        generationErrorSummary: task.error,
        processingLabel: task.stage || (task.type === "depth_capture" ? "正在生成深度影片" : "正在生成影片"),
        ...(active ? { status: "loading", errorDetails: undefined } : {}),
    };
}

export function depthCaptureWaitFailureMetadata(error: unknown, observed?: GenerationTask | string): CanvasNodeMetadata {
    const task = typeof observed === "object" ? observed : undefined;
    if (typeof observed === "string" || task?.status === "queued" || task?.status === "running") {
        return { status: "loading", errorDetails: undefined, taskClientOperationTerminal: undefined, processingLabel: "暫時無法同步進度，請重新開啟畫布檢視任務狀態" };
    }
    if (task?.status === "succeeded") {
        const cause = error instanceof CanvasGenerationDurableAckError ? error.cause : error;
        const explanation = explainGenerationError(cause);
        return {
            ...generationFailureMetadata(new CanvasGenerationDurableAckError(cause), ""),
            ...(explanation.category === "result_target_unavailable" ? { resourceReloadAvailable: false } : {}),
            status: "error", taskStage: "畫布應用結果", taskClientOperationTerminal: false,
            generationErrorSummary: explanation.summary,
            taskFailureDiagnostics: {
                ...task.failureDiagnostics, source: "client_result", executionResult: "completed",
                stage: "畫布應用結果", summary: explanation.summary, requestId: explanation.requestId,
                httpStatus: explanation.httpStatus, capturedAt: new Date().toISOString(),
            },
        };
    }
    return { status: "error", errorDetails: task?.error || (error instanceof Error ? error.message : typeof error === "string" ? error : "深度處理失敗"), taskClientOperationTerminal: task?.status === "failed" || task?.status === "cancelled" };
}

export function canvasNodeFailureExplanation(node: CanvasNodeData) {
    const explanation = explainGenerationError({ code: node.metadata?.generationErrorCode || node.metadata?.taskErrorCode, message: node.metadata?.errorDetails }, { taskId: node.metadata?.taskId, model: node.metadata?.model, createdAt: node.metadata?.taskCreatedAt, stage: node.metadata?.taskStage });
    // This action opens saved history; it must never dispatch another generation.
    if (explanation.category === "result_target_unavailable") return { ...explanation, blockManualRetry: false };
    if (!canRecoverOrRetryDepthCapture(node)) return explanation;
    if (node.metadata?.taskStage === "已暫停，等待手動繼續") {
        return { ...explanation, reason: "深度捕捉已暫停", action: "確認元件已安裝後，點選重試繼續", uncertain: false, retryable: true, blockAutomaticRetry: false, blockManualRetry: false };
    }
    if (node.metadata?.taskStatus === "succeeded") {
        return { ...explanation, reason: "深度影片已生成，暫時未能顯示在畫布上", action: "點選「恢復結果」重新載入原任務", uncertain: false, retryable: true, blockAutomaticRetry: false, blockManualRetry: false };
    }
    return {
        ...explanation,
        ...(["unknown", "download_failed", "submission_uncertain"].includes(explanation.category) ? { reason: "深度處理失敗", action: "請檢視詳情，檢查深度元件和網路後重試" } : {}),
        uncertain: false,
        retryable: true,
        blockAutomaticRetry: false,
        blockManualRetry: false,
    };
}
