import { CanvasNodeType } from "@/types/canvas";
import type { CanvasNodeMetadata } from "@/types/canvas";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 720, height: 405, title: "圖片" },
    // LibTV 的文本節點以近似正方形卡片承載提示詞與生成入口，作為首屏復刻基準固定為 350×350。
    [CanvasNodeType.Text]: { width: 350, height: 350, title: "文本節點" },
    [CanvasNodeType.Drawing]: { width: 440, height: 300, title: "繪圖" },
    [CanvasNodeType.Script]: { width: 920, height: 360, title: "分鏡指令碼" },
    [CanvasNodeType.Skill]: { width: 360, height: 220, title: "技能" },
    // 配置節點同時承載模式、渠道、工作流和引數；預留穩定空間，避免控制元件和錯誤狀態互相擠壓。
    [CanvasNodeType.Config]: { width: 480, height: 390, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 720, height: 405, title: "影片" },
    // LibTV renders an empty audio node as a square media card, not a
    // shallow waveform strip; this keeps the empty-state affordance visible.
    [CanvasNodeType.Audio]: { width: 320, height: 320, title: "音訊" },
    [CanvasNodeType.Frame]: { width: 760, height: 520, title: "未命名背板" },
    [CanvasNodeType.Markdown]: { width: 420, height: 320, title: "Markdown" },
    [CanvasNodeType.Svg]: { width: 420, height: 320, title: "SVG" },
    [CanvasNodeType.Html]: { width: 520, height: 380, title: "HTML" },
    [CanvasNodeType.Panorama]: { width: 520, height: 300, title: "全景" },
    [CanvasNodeType.Compare]: { width: 520, height: 320, title: "對比" },
    [CanvasNodeType.Chart]: { width: 480, height: 320, title: "圖表" },
    [CanvasNodeType.ColorGrade]: { width: 420, height: 360, title: "調色" },
    [CanvasNodeType.MediaConversion]: { width: 480, height: 460, title: "轉換" },
    [CanvasNodeType.BatchTable]: { width: 1280, height: 560, title: "批次創作表" },
    [CanvasNodeType.Director]: { width: 640, height: 640, title: "導演臺" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Drawing]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Drawing],
        metadata: { status: "success" },
    },
    [CanvasNodeType.Script]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Script],
        metadata: {
            status: "idle",
            workflowKind: "script",
            storyboard: {
                rows: [],
                visibleColumns: ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
                referenceNodeIds: [],
            },
        },
    },
    [CanvasNodeType.Skill]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Skill],
        metadata: { status: "success" },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Frame]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Frame],
        metadata: { frame: { collapsed: false, expandedWidth: NODE_DEFAULT_SIZE[CanvasNodeType.Frame].width, expandedHeight: NODE_DEFAULT_SIZE[CanvasNodeType.Frame].height } },
    },
    [CanvasNodeType.Markdown]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Markdown],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Svg]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Svg],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Html]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Html],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Panorama]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Panorama],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Compare]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Compare],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.Chart]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Chart],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.ColorGrade]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ColorGrade],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.MediaConversion]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.MediaConversion], metadata: { status: "idle" } },
    [CanvasNodeType.BatchTable]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.BatchTable],
        metadata: {
            status: "idle",
            batchTable: {
                operation: "try_on",
                concurrency: 10,
                referenceColumns: [
                    { id: "reference-1", label: "參考圖 1" },
                    { id: "reference-2", label: "參考圖 2" },
                    { id: "reference-3", label: "參考圖 3" },
                ],
                rows: [],
            },
        },
    },
    [CanvasNodeType.Director]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Director],
        metadata: { status: "idle", workflowKind: "shot" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
