import { maxModelInputCapacity, type ModelInputSummary } from "@/lib/model-selection";
import { getNodeAcceptedInputKinds, getNodeGenerationMode, getNodeInputKind, getNodeMaxInputCount } from "@/lib/canvas/node-registry";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

type ConnectionCandidate = Pick<CanvasConnection, "fromNodeId" | "toNodeId">;
type CanvasConnectionPolicyOptions = {
    // 僅跳過參考素材數量上限，媒體型別不相容仍然拒絕。
    ignoreCapacity?: boolean;
};

export function canvasConnectionError(config: AiConfig, nodes: CanvasNodeData[], connections: CanvasConnection[], candidate: ConnectionCandidate, options: CanvasConnectionPolicyOptions = {}) {
    const target = nodes.find((node) => node.id === candidate.toNodeId);
    if (!target) return "找不到連線目標節點";
    const acceptedInputKinds = getNodeAcceptedInputKinds(target.type);
    if (acceptedInputKinds.length) {
        const source = nodes.find((node) => node.id === candidate.fromNodeId);
        const sourceKind = source ? getNodeInputKind(source.type) : undefined;
        const isMediaConversion = target.type === CanvasNodeType.MediaConversion;
        const hasAcceptedSource = isMediaConversion
            ? source?.type === CanvasNodeType.Image || source?.type === CanvasNodeType.Video
            : Boolean(sourceKind && acceptedInputKinds.includes(sourceKind));
        if (!sourceKind || !hasAcceptedSource) {
            const labels = acceptedInputKinds.map(acceptedInputKindLabel).join("或");
            const targetLabel = isMediaConversion ? "轉換" : target.type === CanvasNodeType.BatchTable ? "批次創作表" : labels;
            return `${targetLabel}節點只接受${labels}輸入`;
        }
        const maxInputCount = getNodeMaxInputCount(target.type);
        if (maxInputCount) {
            const inputCount = new Set(
                [...connections, { id: "candidate", ...candidate }]
                    .filter((connection) => connection.toNodeId === target.id)
                    .map((connection) => connection.fromNodeId),
            ).size;
            if (inputCount > maxInputCount) return `${isMediaConversion ? "轉換" : "當前"}節點最多連線 ${maxInputCount} 個輸入`;
        }
    }
    const mode = getNodeGenerationMode(target);
    if (!mode) return "";
    const input = connectionInputSummary(target.id, nodes, connections, candidate);
    const visualInputCount = input.imageCount + input.characterCount;

    if (mode === "image") {
        if (input.videoCount > 0) return "圖片生成節點不能連線參考影片";
        if (input.audioCount > 0) return "圖片生成節點不能連線參考音訊";
        return options.ignoreCapacity ? "" : capacityError(config, mode, "image", visualInputCount, "參考圖");
    }
    if (mode === "video") {
        return options.ignoreCapacity ? "" : capacityError(config, mode, "image", visualInputCount, "參考圖") || capacityError(config, mode, "video", input.videoCount, "參考影片") || capacityError(config, mode, "audio", input.audioCount, "參考音訊");
    }
    if (mode === "text" && input.audioCount > 0) return "文本生成節點不能連線參考音訊";
    if (mode === "audio" && input.characterCount > 1) return "角色配音一次只能連線一個角色卡";
    if (mode === "audio" && (input.imageCount > 0 || input.videoCount > 0 || input.audioCount > 0)) return "音訊生成節點只接受文本或單個角色卡輸入";
    return "";
}

function acceptedInputKindLabel(kind: "image" | "video" | "audio" | "text" | "table_data") {
    if (kind === "image") return "圖片";
    if (kind === "video") return "影片";
    if (kind === "audio") return "音訊";
    if (kind === "table_data") return "多維表格";
    return "文本";
}

export function connectionInputSummary(targetNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], candidate?: ConnectionCandidate): ModelInputSummary {
    const sourceIds = new Set([...connections, ...(candidate ? [{ id: "candidate", ...candidate }] : [])].filter((connection) => connection.toNodeId === targetNodeId).map((connection) => connection.fromNodeId));
    const input: ModelInputSummary = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 };
    sourceIds.forEach((sourceId) => {
        const source = nodes.find((node) => node.id === sourceId);
        if (!source) return;
        // 生成配置與背板不是參考素材，不參與容量計數——這一步必須早於角色卡判定，
        // 否則一個帶角色後設資料的配置/背板節點會被多算成角色。
        const inputKind = getNodeInputKind(source.type);
        if (!inputKind) return;
        // 角色卡是跨型別覆蓋：落在可計數型別上時改記為角色。
        if (source.metadata?.workflowKind === "character") input.characterCount += 1;
        else if (inputKind !== "table_data") input[`${inputKind}Count`] += 1;
    });
    return input;
}

function capacityError(config: AiConfig, capability: "image" | "video", kind: "image" | "video" | "audio", count: number, label: string) {
    const maximum = maxModelInputCapacity(config, capability, kind);
    if (maximum === null || count <= maximum) return "";
    const unit = kind === "image" ? "張" : "個";
    return maximum > 0 ? `已配置模型最多支援 ${maximum} ${unit}${label}` : `已配置模型均不支援${label}`;
}
