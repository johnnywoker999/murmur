import { Clock3, Folder, FolderOpen, Layers3, Palette, UploadCloud, UserRound, Workflow } from "lucide-react";

import { getNodeIcon, getNodeLabel } from "@/lib/canvas/node-registry";
import { CANVAS_DEVELOPING_LABEL, getCanvasNodeCreationDisabledReason } from "@/lib/canvas/canvas-feature-availability";
import { registerAddNodeMenuCommands, type AddNodeMenuCommand } from "@/lib/canvas/tool-registry";
import { CanvasNodeType } from "@/types/canvas";

/** 真正建立節點的命令，文案與圖示統一取自節點登入檔。 */
function nodeCommand(type: CanvasNodeType, rest: Omit<AddNodeMenuCommand, "id" | "label" | "icon" | "section">): AddNodeMenuCommand {
    return { id: type, label: getNodeLabel(type), icon: getNodeIcon(type), section: "node", ...rest };
}

export const addNodeMenuCommands: AddNodeMenuCommand[] = [
    // 專案級動作不佔用節點網格，創作節點保持統一排列。
    { id: "style", label: "專案畫風", icon: <Palette />, section: "project", defaultOrder: 10, applicable: (ctx) => !ctx.isProjectLinked, run: (ctx) => ctx.handlers.onChooseStyle() },
    // 創作節點
    nodeCommand(CanvasNodeType.Text, { defaultOrder: 10, run: (ctx) => ctx.handlers.onAddText() }),
    nodeCommand(CanvasNodeType.Image, { defaultOrder: 20, run: (ctx) => ctx.handlers.onAddImage() }),
    nodeCommand(CanvasNodeType.Video, { defaultOrder: 30, run: (ctx) => ctx.handlers.onAddVideo() }),
    nodeCommand(CanvasNodeType.Audio, { defaultOrder: 40, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddAudio() }),
    // 導演臺落在節點分割槽，但它開的是導演工作臺、不是某種畫布節點，故不走登入檔。
    { id: "director", label: "導演臺", icon: <Layers3 />, section: "node", defaultOrder: 50, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onOpenDirector() },
    { ...nodeCommand(CanvasNodeType.MediaConversion, { defaultOrder: 60, run: (ctx) => ctx.handlers.onAddExtensionNode(CanvasNodeType.MediaConversion) }), label: "智慧剪輯", badge: CANVAS_DEVELOPING_LABEL, disabledReason: getCanvasNodeCreationDisabledReason(CanvasNodeType.MediaConversion) },
    { ...nodeCommand(CanvasNodeType.Frame, { defaultOrder: 70, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddFrame() }), label: "逐幀拉片", badge: CANVAS_DEVELOPING_LABEL, disabledReason: getCanvasNodeCreationDisabledReason(CanvasNodeType.Frame) },
    { ...nodeCommand(CanvasNodeType.Script, { defaultOrder: 80, run: (ctx) => ctx.handlers.onAddScript() }), label: "指令碼", badge: CANVAS_DEVELOPING_LABEL, disabledReason: getCanvasNodeCreationDisabledReason(CanvasNodeType.Script) },
    nodeCommand(CanvasNodeType.Drawing, { defaultOrder: 90, run: (ctx) => ctx.handlers.onAddDrawing() }),
    { id: "folder", label: "資料夾", icon: <Folder />, badge: "6 款", section: "node", defaultOrder: 95, run: (ctx) => ctx.handlers.onAddFolder() },
    nodeCommand(CanvasNodeType.BatchTable, { defaultOrder: 100, run: (ctx) => ctx.handlers.onAddExtensionNode(CanvasNodeType.BatchTable) }),
    // 雲端和本地工作流共用獨立配置節點，不進入基礎模型節點的渠道選擇。
    { id: "workflow", label: "工作流", icon: <Workflow />, section: "workflow", defaultOrder: 10, applicable: (ctx) => ctx.workspaceMode !== "simple", run: (ctx) => ctx.handlers.onAddWorkflow() },
    // 匯入資源
    { id: "upload", label: "上傳", icon: <UploadCloud />, section: "resource", defaultOrder: 10, run: (ctx) => ctx.handlers.onUpload() },
    { id: "project-character", label: "新增角色卡", icon: <UserRound />, section: "resource", defaultOrder: 20, applicable: (ctx) => ctx.isProjectLinked, run: (ctx) => ctx.handlers.onOpenProjectCharacters() },
    { id: "generation-history", label: "從生成歷史選擇", icon: <Clock3 />, section: "resource", defaultOrder: 30, run: (ctx) => ctx.handlers.onOpenGenerationHistory() },
    { id: "assets", label: "素材庫", icon: <FolderOpen />, section: "resource", defaultOrder: 40, applicable: (ctx) => !ctx.isProjectLinked, run: (ctx) => ctx.handlers.onOpenMyAssets() },
];

registerAddNodeMenuCommands(addNodeMenuCommands);
