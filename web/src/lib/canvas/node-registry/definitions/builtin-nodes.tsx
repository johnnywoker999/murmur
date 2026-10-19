import { ChartColumn, Clapperboard, Code, Columns2, FileText, Globe, Image as ImageIcon, Music2, PanelTop, Palette, Pencil, Settings2, Shapes, Sparkles, Table2, Type, Video, WandSparkles } from "lucide-react";

import { NODE_SPECS } from "@/constant/canvas";
import { MEDIA_NODE_MIN_SIZE } from "@/lib/canvas/canvas-node-size";
import { canOpenCanvasNodePromptPanel } from "@/lib/canvas/canvas-node-semantics";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import type { CanvasNodeDefinition } from "../node-definition";
import { registerNodeDefinitions } from "../node-registry";

/** 非媒體節點的拉伸下限 */
const DEFAULT_MIN_SIZE = { width: 220, height: 160 } as const;

/**
 * 每種內建節點的自有特徵。
 *
 * 尺寸、預設標題與初始 metadata 不在這裡重複——它們的資料來源是 constant/canvas.ts 的
 * NODE_SPECS，下方裝配時統一讀取。
 *
 * 內建節點保持集中定義；第三方節點通過同一 registry 以名稱空間 ID 動態註冊。
 */
const BUILTIN_NODE_TRAITS = {
    [CanvasNodeType.Image]: {
        label: "圖片",
        icon: <ImageIcon />,
        minSize: MEDIA_NODE_MIN_SIZE,
        keepAspectRatio: (node: CanvasNodeData) => !node.metadata?.freeResize,
        showInCreateMenu: true,
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content || node.metadata?.storageKey ? "image" : null),
        generationMode: (node: CanvasNodeData) => canOpenCanvasNodePromptPanel(node) ? "image" : null,
        inputKind: "image",
    },
    [CanvasNodeType.Text]: {
        label: "文本",
        icon: <Type />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content || node.metadata?.prompt ? "text" : null),
        generationMode: () => "text",
        inputKind: "text",
    },
    [CanvasNodeType.Drawing]: {
        label: "繪圖",
        icon: <Pencil />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        // 繪圖產出的是影像，所以作為素材與輸入都按圖片計。
        resourceKind: (node: CanvasNodeData) => (node.metadata?.drawingId ? "image" : null),
        inputKind: "image",
    },
    [CanvasNodeType.Script]: {
        label: "分鏡指令碼",
        icon: <Clapperboard />,
        // 分鏡指令碼的表格佈局需要更寬的下限；高度仍由內容動態撐開（見 canvas-node.tsx）。
        minSize: { width: 800, height: DEFAULT_MIN_SIZE.height },
        showInCreateMenu: true,
        generationMode: () => "text",
        inputKind: "text",
    },
    [CanvasNodeType.Skill]: {
        label: "技能",
        icon: <Sparkles />,
        minSize: DEFAULT_MIN_SIZE,
        // 技能節點由技能庫插入，不佔建立選單格位。
        showInCreateMenu: false,
        // 技能注入的是提示詞文本，故按文本素材計。
        resourceKind: (node: CanvasNodeData) => (node.metadata?.skillSnapshot || node.metadata?.content ? "text" : null),
        inputKind: "text",
    },
    [CanvasNodeType.Config]: {
        label: "生成配置",
        icon: <Settings2 />,
        minSize: DEFAULT_MIN_SIZE,
        // 生成配置由連線時自動建立。
        showInCreateMenu: false,
        // 生成模式由使用者在配置節點上選擇，預設按圖片。
        generationMode: (node: CanvasNodeData) => node.metadata?.generationMode || "image",
        // 不設 inputKind：配置節點本身不是參考素材，不參與容量計數。
    },
    [CanvasNodeType.Video]: {
        label: "影片",
        icon: <Video />,
        minSize: MEDIA_NODE_MIN_SIZE,
        keepAspectRatio: () => true,
        showInCreateMenu: true,
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content || node.metadata?.storageKey ? "video" : null),
        generationMode: (node: CanvasNodeData) => canOpenCanvasNodePromptPanel(node) ? "video" : null,
        inputKind: "video",
    },
    [CanvasNodeType.Audio]: {
        label: "音訊",
        icon: <Music2 />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content ? "audio" : null),
        generationMode: (node: CanvasNodeData) => canOpenCanvasNodePromptPanel(node) ? "audio" : null,
        inputKind: "audio",
    },
    [CanvasNodeType.Frame]: {
        label: "背板",
        // 背板在列表裡就叫「背板」，不是「背板節點」——顯式釘住，避免被 label 派生改寫。
        listLabel: "背板",
        icon: <PanelTop />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        // 背板只是視覺容器，既不是素材也不參與計數。
    },
    [CanvasNodeType.Markdown]: {
        label: "Markdown",
        icon: <FileText />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        // 渲染的是 Markdown 原始碼，作為素材與輸入都按文本計。
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content ? "text" : null),
        inputKind: "text",
        // 不設 generationMode：它是展示節點，自身不發起生成。
    },
    [CanvasNodeType.Svg]: {
        label: "SVG",
        icon: <Shapes />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        // 內容是 SVG 原始碼，按文本素材計；渲染成圖但不產出圖片資源。
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content ? "text" : null),
        inputKind: "text",
    },
    [CanvasNodeType.Html]: {
        label: "HTML",
        icon: <Code />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        resourceKind: (node: CanvasNodeData) => (node.metadata?.content ? "text" : null),
        inputKind: "text",
    },
    [CanvasNodeType.Panorama]: {
        label: "全景",
        icon: <Globe />,
        minSize: MEDIA_NODE_MIN_SIZE,
        showInCreateMenu: true,
        // 檢視器：消費上游圖片，自身不作為素材被引用，故不設 resourceKind。
        inputKind: "image",
    },
    [CanvasNodeType.Compare]: {
        label: "對比",
        icon: <Columns2 />,
        minSize: MEDIA_NODE_MIN_SIZE,
        showInCreateMenu: true,
        // 只看不產出：消費兩張上游圖片，自身不作為素材。
        inputKind: "image",
    },
    [CanvasNodeType.Chart]: {
        label: "圖表",
        icon: <ChartColumn />,
        minSize: DEFAULT_MIN_SIZE,
        showInCreateMenu: true,
        inputKind: "text",
    },
    [CanvasNodeType.BatchTable]: { label: "批次創作表", icon: <Table2 />, minSize: { width: 1080, height: 420 }, showInCreateMenu: true, acceptsInputKind: "image", inputKind: "text", resourceKind: () => null },
    [CanvasNodeType.Director]: { label: "導演臺", icon: <Clapperboard />, minSize: { width: 320, height: 320 }, showInCreateMenu: true, resourceKind: () => null },
    [CanvasNodeType.MediaConversion]: { label: "轉換", icon: <WandSparkles />, minSize: { width: 400, height: 360 }, showInCreateMenu: true, resourceKind: (node: CanvasNodeData) => { const c = node.metadata?.mediaConversion; return c?.status === "completed" && c.resultStorageKey ? (c.outputKind === "video" ? "video" : "image") : null; }, acceptsInputKind: ["image", "video"], maxInputCount: 1, inputKind: "image" },
    [CanvasNodeType.ColorGrade]: {
        label: "調色",
        icon: <Palette />,
        minSize: MEDIA_NODE_MIN_SIZE,
        showInCreateMenu: true,
        // 無條件返回 image：它的圖來自上游而不是自身 metadata，用「有沒有 content」判斷
        // 會讓它永遠不被當成素材、從而進不了生成輸入。沒有上游時由
        // readReferenceImage 返回 null 跳過，不需要在這裡提前判空。
        resourceKind: () => "image",
        inputKind: "image",
    },
} satisfies Record<string, Omit<CanvasNodeDefinition, "type" | "defaultTitle" | "defaultSize" | "defaultMetadata">>;

export const BUILTIN_NODE_DEFINITIONS: CanvasNodeDefinition[] = (Object.keys(BUILTIN_NODE_TRAITS) as CanvasNodeType[]).map((type) => {
    const spec = NODE_SPECS[type];
    return {
        type,
        ...BUILTIN_NODE_TRAITS[type],
        defaultTitle: spec.title,
        defaultSize: { width: spec.width, height: spec.height },
        defaultMetadata: spec.metadata,
    };
});

registerNodeDefinitions(BUILTIN_NODE_DEFINITIONS);
