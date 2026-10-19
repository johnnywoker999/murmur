import type { CanvasColorGrade } from "@/lib/canvas/canvas-color-grade";

export type ReferenceImage = {
    id: string;
    sourceNodeId?: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    bytes?: number;
    width?: number;
    height?: number;
    // 繫結素材錄入的火山方舟素材 ID。方舟影片渠道生成時會優先改寫為
    // asset:// 引用，跳過上傳同步；其他渠道與本地回退路徑忽略此欄位。
    arkAssetId?: string;
    // 參考圖的來源：需要在真正生成時才落地成資源的那幾類。
    // 判別欄位是 kind——新增一類時，canvas-node-generation 裡的分派也要跟著加分支，
    // 漏了會靜默按普通圖片處理（dataUrl 為空 → 參考圖丟失）。
    source?:
        | {
            kind: "drawing";
            drawingId: string;
            revision: number;
            shapeCount: number;
        }
        | {
            kind: "colorgrade";
            /** 上游源圖地址 */
            url: string;
            grade: CanvasColorGrade;
        };
};
