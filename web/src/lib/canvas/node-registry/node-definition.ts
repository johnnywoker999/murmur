import type { ReactNode } from "react";

import type { CanvasResourceKind } from "@/lib/canvas/canvas-resource-references";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata, CanvasNodeTypeId } from "@/types/canvas";
import type { PluginCanvasNodeContribution } from "@/lib/plugins/plugin-types";

/** 作為上游輸入被容量校驗計數時歸入的類別 */
export type CanvasNodeInputKind = "image" | "video" | "audio" | "text" | "table_data";

/**
 * 節點定義——登入檔的基本單元。
 *
 * 一種畫布節點型別的靜態知識（叫什麼、長什麼樣、能拉多小、是否鎖比例）集中在這裡，
 * 避免同一份知識散落到建立選單、搜尋彈窗、拉伸邏輯等多處後各自漂移。
 */
export type CanvasNodeDefinition = {
    type: CanvasNodeTypeId;
    /** UI 短標籤——建立選單等處顯示，如「文本」 */
    label: string;
    /** 列表/搜尋標籤，預設派生為 `${label}節點` */
    listLabel?: string;
    /** 不帶 className——由渲染處用 [&_svg]:size-* 統一控制尺寸 */
    icon: ReactNode;
    /** 新建節點的預設標題（與 label 分開：選單叫「文本」，新建出來的節點名是「Note」） */
    defaultTitle: string;
    defaultSize: { width: number; height: number };
    defaultMetadata?: CanvasNodeMetadata;
    /** 手動拉伸的最小尺寸 */
    minSize: { width: number; height: number };
    /** 拉伸時是否鎖定寬高比，預設不鎖 */
    keepAspectRatio?: (node: CanvasNodeData) => boolean;
    /** 是否出現在新增節點選單（技能、生成配置由其他入口建立） */
    showInCreateMenu: boolean;
    /**
     * 作為 @ 引用素材時歸入的型別；不設或返回 null 表示該節點不是可引用素材。
     * 判定依賴內容——空節點不構成素材。
     *
     * 注意：角色卡（workflowKind === "character"）是**跨型別覆蓋**，不在這裡表達，
     * 由 canvas-resource-references 在查登入檔之前先行判定。
     */
    resourceKind?: (node: CanvasNodeData) => CanvasResourceKind | null;
    /** 作為生成節點時的生成模式；不設表示該型別不產生生成行為 */
    generationMode?: (node: CanvasNodeData) => CanvasGenerationMode | null;
    /** 是否顯示右側輸出連線點；預設為 true，消費型終點節點可關閉。 */
    showOutputConnection?: boolean;
    /** 若設定，作為目標時只接受這些上游節點型別。 */
    acceptsInputKind?: CanvasNodeInputKind | CanvasNodeInputKind[];
    /** 限制直接輸入數量；轉換節點等一進一齣節點通常為 1。 */
    maxInputCount?: number;
    /**
     * 作為上游輸入被參考素材容量校驗計數時的類別；
     * 不設表示不參與計數（生成配置、背板）。與 resourceKind 不同，計數不看內容。
     */
    inputKind?: CanvasNodeInputKind;
    plugin?: {
        pluginId: string;
        renderer: PluginCanvasNodeContribution["renderer"];
        schema: Record<string, unknown>;
    };
};

export function canvasNodeDefinitionFromPlugin(pluginId: string, contribution: PluginCanvasNodeContribution): CanvasNodeDefinition {
    return {
        type: contribution.id,
        label: contribution.label,
        icon: null,
        defaultTitle: contribution.defaultTitle,
        defaultSize: contribution.defaultSize,
        defaultMetadata: { pluginId, pluginNodeId: contribution.id, pluginData: {}, content: "" },
        minSize: { width: Math.min(contribution.defaultSize.width, 220), height: Math.min(contribution.defaultSize.height, 160) },
        showInCreateMenu: true,
        showOutputConnection: contribution.showOutputConnection,
        acceptsInputKind: contribution.acceptsInputKind,
        maxInputCount: contribution.maxInputCount,
        plugin: { pluginId, renderer: contribution.renderer, schema: contribution.schema },
    };
}
