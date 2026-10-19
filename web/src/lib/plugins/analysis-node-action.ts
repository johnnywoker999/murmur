import { nanoid } from "nanoid";
import type { CanvasNodeMetadata } from "@/types/canvas";
import type { PluginAgentAction } from "./plugin-types";

export function prepareAnalysisNodeAction(nodeType: string, title: string, metadata: () => CanvasNodeMetadata): PluginAgentAction {
    return {
        id: "prepare-input",
        description: `為已有圖片準備${title}節點及連線，複用相同輸入的已有節點；僅準備輸入，不啟動分析或收費。`,
        inputSchema: { type: "object", properties: { sourceNodeId: { type: "string" } }, required: ["sourceNodeId"], additionalProperties: false },
        buildOperations(input, snapshot) {
            if (Object.keys(input).some((key) => key !== "sourceNodeId")) throw new Error("只接受 sourceNodeId");
            const source = snapshot.nodes.find((node) => node.id === input.sourceNodeId && node.type === "image");
            if (!source || !(source.metadata?.storageKey || source.metadata?.content || source.metadata?.previewContent)) throw new Error("請提供當前畫布已有圖片節點的真實 ID");
            const existing = snapshot.nodes.find((node) => node.type === nodeType && snapshot.connections.some((edge) => edge.fromNodeId === source.id && edge.toNodeId === node.id));
            if (existing) return [{ type: "select_nodes", ids: [existing.id] }];
            const id = `${nodeType}-${nanoid()}`;
            return [
                { type: "add_node", id, nodeType, title, position: { x: Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) + 120, y: source.position.y }, metadata: metadata() },
                { type: "connect_nodes", fromNodeId: source.id, toNodeId: id },
                { type: "select_nodes", ids: [id] },
            ];
        },
    };
}
