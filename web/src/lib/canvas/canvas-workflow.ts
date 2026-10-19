import type { CanvasNodeMetadata } from "@/types/canvas";

export type CanvasWorkflowProvider = "model" | "runninghub";

/**
 * 統一解析畫布節點的工作流渠道；舊節點可能沒有 workflowProvider，
 * 但已經儲存了具體工作流 ID，此時不能退回普通模型的首尾幀邏輯。
 */
export function resolveCanvasWorkflowProvider(metadata?: CanvasNodeMetadata): CanvasWorkflowProvider {
    if (metadata?.workflowProvider) return metadata.workflowProvider;
    if (metadata?.runningHubWorkflowId?.trim()) return "runninghub";
    return "model";
}

export function isCanvasWorkflowProvider(metadata?: CanvasNodeMetadata) {
    const provider = resolveCanvasWorkflowProvider(metadata);
    return provider === "runninghub";
}
