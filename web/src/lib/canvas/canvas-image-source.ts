import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { mediaGeneratorMetadata } from "@/lib/canvas/canvas-node-semantics";

/** 已有媒體但沒有生成配置的圖片是輸入素材，不提供原地生成入口。 */
export function isCanvasImageSourceNode(node: CanvasNodeData | null | undefined): boolean {
    if (node?.type === CanvasNodeType.Image && node.metadata?.fileUpload) return true;
    return node?.type === CanvasNodeType.Image
        && Boolean(node.metadata?.content)
        && !node.metadata?.generationType
        && !node.metadata?.taskId
        && !node.metadata?.generationResultPlacement
        && !node.metadata?.copiedFromNodeId
        && !node.metadata?.versionOfNodeId;
}

export function createPortraitTextureNode(source: CanvasNodeData, id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: `${source.title || "圖片"} · 人物質感`,
        position: { x: source.position.x + source.width + 96, y: source.position.y },
        width: source.width,
        height: source.height,
        metadata: mediaGeneratorMetadata({
            prompt: "@圖片1",
            composerContent: "@圖片1",
            generationType: "edit",
            portraitTexture: source.metadata?.portraitTexture,
        }),
    };
}
