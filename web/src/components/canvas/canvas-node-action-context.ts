import { createContext, useContext } from "react";

import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

// 批次子圖操作條（下載/建立副本/刪除）與主圖位下載需要呼叫畫布級動作，
// 但畫布節點經 CanvasProjectWorldLayers 渲染、不便逐個透傳 handler，
// 通過 Context 注入，避免改動 world-layers。無 Provider 時靜默降級為 no-op。
export type CanvasNodeActionContextValue = {
    upload?: (node: CanvasNodeData) => void;
    download?: (node: CanvasNodeData) => void;
    duplicate?: (node: CanvasNodeData) => void;
    deleteNode?: (node: CanvasNodeData) => void;
    /** 合併式更新節點 metadata；擴充套件節點（如調色）在自己的面板裡改引數時用。 */
    updateMetadata?: (nodeId: string, patch: CanvasNodeMetadata) => void;
    /** 更新單個節點；媒體尺寸回寫使用它，避免觸發全量節點時間戳歸併。 */
    updateNode?: (nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => void;
    /** 合併延遲提交媒體測量結果，避免首屏圖片同時解碼時反覆重新整理畫布。 */
    updateMediaNode?: (nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => void;
    /** 改節點寬高；圖片首次量到真實尺寸後按比例校正節點用。 */
    resizeNode?: (nodeId: string, size: { width: number; height: number }) => void;
    /** 開啟節點級肖像排查工作臺；任務生命週期由畫布頁面持有。 */
    /** 開啟節點級 AI 審美批改報告。 */
    openArtCritique?: (node: CanvasNodeData) => void;
    /** 全景節點匯出截圖：上傳 dataUrl 並在源節點右側建立派生圖片節點。 */
    addPanoramaCaptureNode?: (node: CanvasNodeData, dataUrl: string, title: string) => Promise<void> | void;
    /** 開啟影片片段剪輯工作流（智慧剪輯節點複用）。 */
    openVideoSegment?: (node: CanvasNodeData) => void;
};

export const CanvasNodeActionContext = createContext<CanvasNodeActionContextValue>({});

export function useCanvasNodeActions() {
    return useContext(CanvasNodeActionContext);
}
