import { createContext, useContext } from "react";

import type { CanvasNodeData } from "@/types/canvas";

// 擴充套件節點（對比/圖表/調色等）要讀自己的上游才能工作，但節點經 CanvasProjectWorldLayers
// 渲染、CanvasNodeContentProps 裡只有 node 本身，沒有 nodes/connections。
// 與 canvas-node-action-context 同一個理由：通過 Context 注入，避免改動 world-layers 的透傳鏈。
// 無 Provider 時靜默降級為「沒有上游」，節點自行顯示空狀態而不是崩。
export type CanvasNodeGraphContextValue = {
    getUpstreamNodes?: (nodeId: string) => CanvasNodeData[];
};

export const CanvasNodeGraphContext = createContext<CanvasNodeGraphContextValue>({});

/** 取該節點的直接上游素材節點；無 Provider 或無上游時返回空陣列。 */
export function useUpstreamNodes(nodeId: string) {
    const { getUpstreamNodes } = useContext(CanvasNodeGraphContext);
    return getUpstreamNodes?.(nodeId) ?? [];
}
