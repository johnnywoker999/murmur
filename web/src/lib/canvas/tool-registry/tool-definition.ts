import type { ReactNode } from "react";
import type { MouseEvent } from "react";

import type { CanvasAlignmentMode } from "@/lib/canvas/canvas-layout";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasNodeTypeId, CanvasToolMode, CanvasWorkspaceMode } from "@/types/canvas";

/** 工具欄標識——每個工具欄有獨立的登入檔與偏好 */
export type ToolbarId = "main" | "selection" | "node-hover" | "add-node-menu";
export type NodeToolbarGroup = "primary" | "portrait" | "viewpoint" | "lighting" | "panorama" | "process" | "workspace" | "utility" | "more";

/** 工具分類——用於分組渲染、危險隔離與 separator 自動插入 */
export type ToolCategory =
    | "navigation"
    | "history"
    | "create"
    | "appearance"
    | "selection"
    | "layout"
    | "arrange"
    | "danger"
    | "node-state"
    | "resource";

/** 所有工具欄回撥的聚合型別。工具定義通過 ctx.handlers.onXxx 訪問 */
export type ToolbarHandlers = {
    // 主工具欄——畫布操作
    onToolChange: (tool: CanvasToolMode) => void;
    onDeselect: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
    // 主工具欄——建立節點
    onAddText: () => void;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddScript: () => void;
    onAddFrame: () => void;
    onAddFolder: () => void;
    onAddDrawing: () => void;
    onAddWorkflow: () => void;
    /**
     * 擴充套件節點（Markdown / SVG / HTML / 全景 / 對比 / 圖表 / 調色）統一走這一個入口。
     * 不給每種擴充套件節點單開一個 onAddXxx —— 那會讓 ToolbarHandlers 隨節點數線性膨脹，
     * 而它們的建立邏輯完全一致（都只是 createNode(type)）。
     */
    onAddExtensionNode: (type: CanvasNodeTypeId) => void;
    onChooseStyle: () => void;
    onOpenDirector: () => void;
    // 主工具欄——資源
    onUpload: () => void;
    onOpenMyAssets: () => void;
    onOpenProjectCharacters: () => void;
    onOpenGenerationHistory: () => void;
    onOpenShortcuts: () => void;
    // 主工具欄——外觀
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    // 主工具欄——面板開關（元件內部狀態，由元件實現）
    onToggleAddPanel: (event: MouseEvent<HTMLElement>) => void;
    onToggleAppearancePanel: (event: MouseEvent<HTMLElement>) => void;
    onToggleSettingsPanel: () => void;
    // 主工具欄——刪除選中
    onDeleteSelected: () => void;
    // 多選工具欄
    onAlign: (mode: CanvasAlignmentMode) => void;
    onArrange: (mode: "row" | "column" | "grid" | "flow") => void;
    onCreateStoryboard: () => void;
    onCreateReferenceGroup: () => void;
    onBatchConnect: () => void;
    onMergeVideos: () => void;
    /** 只有畫布頁的多選工具欄提供這個入口；主工具欄不裝配它。 */
    onAskAssistant?: () => void;
    // 節點懸停工具欄——節點操作（均接收當前節點）
    onNodeInfo: (node: CanvasNodeData) => void;
    onNodeDelete: (node: CanvasNodeData) => void;
    onNodeRetry: (node: CanvasNodeData) => void;
    onNodeEditText: (node: CanvasNodeData) => void;
    onNodeDecreaseFont: (node: CanvasNodeData) => void;
    onNodeIncreaseFont: (node: CanvasNodeData) => void;
    onNodeToggleDialog: (node: CanvasNodeData) => void;
    onNodeAnnotate: (node: CanvasNodeData) => void;
    onNodeGenerateImage: (node: CanvasNodeData) => void;
    onNodeUpload: (node: CanvasNodeData) => void;
    onNodeDownload: (node: CanvasNodeData) => void;
    onNodeSaveAsset: (node: CanvasNodeData) => void;
    onNodeMaskEdit: (node: CanvasNodeData) => void;
    onNodeEmotion: (node: CanvasNodeData) => void;
    onNodePortraitTexture: (node: CanvasNodeData) => void;
    onNodeCrop: (node: CanvasNodeData) => void;
    onNodeSplit: (node: CanvasNodeData) => void;
    onNodeUpscale: (node: CanvasNodeData) => void;
    onNodeSuperResolve: (node: CanvasNodeData) => void;
    onNodeAngle: (node: CanvasNodeData) => void;
    onNodeViewImage: (node: CanvasNodeData) => void;
    onNodeExtractVideoFrames: (node: CanvasNodeData, preset?: "current" | "first" | "last") => void;
    onNodeExtractAudioFromVideo: (node: CanvasNodeData) => void;
    onNodeTrimVideoSegments: (node: CanvasNodeData) => void;
    onNodeCropVideo: (node: CanvasNodeData) => void;
    onNodeDepthCapture: (node: CanvasNodeData) => void;
    onNodeSubtitles: (node: CanvasNodeData) => void;
    onNodeTimeline: (node: CanvasNodeData) => void;
    onNodeReversePrompt: (node: CanvasNodeData) => void;
    onNodeToggleFreeResize: (node: CanvasNodeData) => void;
    onNodeToggleLocked: (node: CanvasNodeData) => void;
    onNodeCopyPrompt: (node: CanvasNodeData) => void;
};

/** 工具執行時可見的上下文。工具定義通過純函式讀取狀態 */
export type ToolContext = {
    selectedCount: number;
    selectedNodeTypes: Set<CanvasNodeTypeId>;
    selectedVideoCount: number;
    canvasTool: CanvasToolMode;
    workspaceMode: CanvasWorkspaceMode;
    isProjectLinked: boolean;
    canUndo: boolean;
    canRedo: boolean;
    /** 節點懸停工具欄專用——當前懸停/選中的節點 */
    node?: CanvasNodeData;
    /** 便捷訪問 node.metadata（node 為空時為 undefined） */
    nodeMetadata?: CanvasNodeMetadata;
    /** 影片畫面提取中（節點懸停工具欄用） */
    extractingVideoFrames: boolean;
    /** 影片音訊提取/片段擷取進行中（節點懸停工具欄用） */
    extractingAudio: boolean;
    trimmingVideo: boolean;
    /** 合併影片中（多選工具欄用） */
    mergingVideos: boolean;
    /** 主工具欄面板開關狀態（僅主工具欄使用） */
    addPanelOpen: boolean;
    appearancePanelOpen: boolean;
    settingsPanelOpen: boolean;
    handlers: ToolbarHandlers;
};

/** 新增節點選單隻依賴建立動作，避免右鍵選單為工具欄狀態補無意義欄位。 */
export type AddNodeMenuContext = {
    workspaceMode: CanvasWorkspaceMode;
    isProjectLinked: boolean;
    /** 內建應用外掛的啟用狀態；未宣告時視為未提供 gating 資訊。 */
    enabledPluginIds?: ReadonlySet<string>;
    handlers: Pick<ToolbarHandlers,
        | "onAddText"
        | "onAddImage"
        | "onAddVideo"
        | "onAddAudio"
        | "onAddScript"
        | "onAddFrame"
        | "onAddFolder"
        | "onAddDrawing"
        | "onAddWorkflow"
        | "onAddExtensionNode"
        | "onChooseStyle"
        | "onOpenDirector"
        | "onUpload"
        | "onOpenMyAssets"
        | "onOpenProjectCharacters"
        | "onOpenGenerationHistory"
    >;
};

/** 工具定義——登入檔的基本單元 */
export type ToolDefinition = {
    id: string;
    toolbar: ToolbarId;
    category: ToolCategory;
    label: string | ((ctx: ToolContext) => string);
    /** Dock 標籤模式下的短文案，預設用 label */
    displayLabel?: string | ((ctx: ToolContext) => string);
    icon: ReactNode | ((ctx: ToolContext) => ReactNode);
    /** 使用者預設可見（可被 prefs 覆蓋） */
    defaultVisible: boolean;
    /** 預設排序權重，升序 */
    defaultOrder: number;
    /** 節點工具條的展示層級；由登入檔統一決定，避免元件按工具 ID 二次編排。 */
    nodeToolbar?: {
        group: NodeToolbarGroup | ((ctx: ToolContext) => NodeToolbarGroup);
        order?: number | ((ctx: ToolContext) => number);
        section?: string;
        description?: string;
    };
    active?: (ctx: ToolContext) => boolean;
    disabled?: (ctx: ToolContext) => boolean;
    /** 危險操作——渲染時隔離到獨立分組 */
    danger?: boolean;
    /** 主入口強調態——用於保持畫布核心動作的視覺優先順序。 */
    prominent?: boolean;
    /** 面板展開型工具——使用 aria-expanded 而非 aria-pressed */
    expands?: boolean;
    /** 互斥開關：在 dock 中渲染為分段切換，而不是兩個獨立按鈕 */
    switchGroup?: {
        value: (ctx: ToolContext) => string;
        options: Array<{ id: string; label: string; icon: ReactNode; value: string }>;
        onChange: (ctx: ToolContext, value: string) => void;
    };
    /** 上下文可見性謂詞——返回 false 時工具不渲染（不受 prefs 控制） */
    applicable?: (ctx: ToolContext) => boolean;
    /** 執行動作。event 來自 Dock 按鈕點選 */
    run: (ctx: ToolContext, event?: MouseEvent<HTMLElement>) => void;
};

/** 新增節點選單命令：專案級動作與真正的節點建立分開呈現。 */
export type AddNodeMenuCommand = {
    id: string;
    label: string;
    icon: ReactNode;
    badge?: string;
    /** 前端保留入口但暫時不可用時的說明；不會執行 run。 */
    disabledReason?: string;
    // extension：展示與加工類擴充套件節點。單獨一區，避免擠散 node 區調好的四列網格。
    section: "node" | "workflow" | "project" | "resource";
    defaultOrder: number;
    applicable?: (ctx: AddNodeMenuContext) => boolean;
    run: (ctx: AddNodeMenuContext) => void;
};

/** 使用者偏好——排序與顯隱 */
export type ToolbarPrefs = {
    /** 工具 id 按顯示順序排列 */
    order: string[];
    /** 使用者隱藏的工具 id */
    hidden: string[];
};
