import { AudioLines, Captions, Clapperboard, Download, FolderPlus, Images, Image as ImageIcon, Info, LoaderCircle, Lock, Maximize2, MessageSquare, Minus, Music2, Plus, RefreshCw, Scissors, Settings2, Trash2, Unlock, Upload, UserRound, Video, WandSparkles } from "lucide-react";

import { explainGenerationError } from "@/lib/generation-error";
import { canvasNodeFailureExplanation, canRecoverOrRetryDepthCapture } from "@/lib/canvas/canvas-depth-capture";
import { registerToolbarTools, type ToolContext, type ToolDefinition } from "@/lib/canvas/tool-registry";
import { CanvasNodeType } from "@/types/canvas";
import { canOpenCanvasNodePromptPanel } from "@/lib/canvas/canvas-node-semantics";

// 節點狀態判定輔助函式——從 ToolContext 派生
function isImage(ctx: ToolContext) { return ctx.node?.type === CanvasNodeType.Image; }
function isVideo(ctx: ToolContext) { return ctx.node?.type === CanvasNodeType.Video; }
function isAudio(ctx: ToolContext) { return ctx.node?.type === CanvasNodeType.Audio; }
function isText(ctx: ToolContext) { return ctx.node?.type === CanvasNodeType.Text; }
function isConfig(ctx: ToolContext) { return ctx.node?.type === CanvasNodeType.Config; }
function hasMediaPayload(ctx: ToolContext) {
    return Boolean(ctx.nodeMetadata?.content || ctx.nodeMetadata?.storageKey || ctx.nodeMetadata?.previewContent);
}
function hasImage(ctx: ToolContext) { return isImage(ctx) && hasMediaPayload(ctx); }
function hasVideo(ctx: ToolContext) { return isVideo(ctx) && hasMediaPayload(ctx); }
function hasAudio(ctx: ToolContext) { return isAudio(ctx) && Boolean(ctx.nodeMetadata?.content || ctx.nodeMetadata?.storageKey); }
function isCharacterReference(ctx: ToolContext) { return isText(ctx) && ctx.nodeMetadata?.workflowKind === "character" && Boolean(ctx.nodeMetadata?.characterAssetId); }
function isEditableText(ctx: ToolContext) { return isText(ctx) && !isCharacterReference(ctx); }
function canOpenDialog(ctx: ToolContext) { return isEditableText(ctx) || ((isImage(ctx) || isVideo(ctx) || isAudio(ctx)) && canOpenCanvasNodePromptPanel(ctx.node)); }
function simpleMode(ctx: ToolContext) { return ctx.workspaceMode === "simple"; }
function isImageBatchRoot(ctx: ToolContext) { return isImage(ctx) && Boolean(ctx.nodeMetadata?.isBatchRoot && ctx.nodeMetadata.batchChildIds?.length); }
function opensSavedHistory(ctx: ToolContext) { return Boolean(ctx.node && canvasNodeFailureExplanation(ctx.node).category === "result_target_unavailable"); }
function canRetry(ctx: ToolContext) {
    if (ctx.nodeMetadata?.fileUpload) return false;
    const explanation = ctx.node ? canvasNodeFailureExplanation(ctx.node) : explainGenerationError(ctx.nodeMetadata?.errorDetails || ctx.nodeMetadata?.generationErrorCode, { stage: ctx.nodeMetadata?.taskStage });
    const blocked = explanation.uncertain || (explanation.category === "download_failed" && !(ctx.node && canRecoverOrRetryDepthCapture(ctx.node)));
    const batchHasFailures = isImageBatchRoot(ctx) && (ctx.nodeMetadata?.batchFailedCount || (ctx.nodeMetadata?.status === "error" ? 1 : 0)) > 0;
    return (ctx.nodeMetadata?.status === "error" || (batchHasFailures && ctx.nodeMetadata?.status !== "loading")) && !blocked;
}

export const nodeHoverToolbarTools: ToolDefinition[] = [
    // 基礎工具組
    {
        id: "info",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => isCharacterReference(ctx) ? "檢視角色詳情" : "檢視節點資訊",
        displayLabel: (ctx) => isCharacterReference(ctx) ? "角色詳情" : "節點資訊",
        icon: (ctx) => isCharacterReference(ctx) ? <UserRound className="size-3.5" /> : <Info className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 10,
        nodeToolbar: {
            group: (ctx) => isCharacterReference(ctx) || (!isImage(ctx) && !isVideo(ctx) && !isAudio(ctx) && !isEditableText(ctx) && !isConfig(ctx)) ? "primary" : "more",
            order: 10,
            section: "節點管理",
        },
        run: (ctx) => ctx.handlers.onNodeInfo(ctx.node!),
    },
    {
        id: "delete",
        toolbar: "node-hover",
        category: "node-state",
        label: "移除節點",
        displayLabel: "移除節點",
        icon: <Trash2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 20,
        nodeToolbar: { group: "more", order: 1000, section: "危險操作" },
        danger: true,
        run: (ctx) => ctx.handlers.onNodeDelete(ctx.node!),
    },
    // 節點操作工具組——通過 applicable 謂詞實現上下文感知
    {
        id: "retry",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => opensSavedHistory(ctx) ? "從生成歷史取回原結果" : ctx.node && canRecoverOrRetryDepthCapture(ctx.node) && ctx.nodeMetadata?.taskStatus === "succeeded" ? "恢復原任務的深度影片" : isImageBatchRoot(ctx) ? "重試批次中的失敗圖片" : "重新生成",
        displayLabel: (ctx) => opensSavedHistory(ctx) ? "生成歷史" : ctx.node && canRecoverOrRetryDepthCapture(ctx.node) && ctx.nodeMetadata?.taskStatus === "succeeded" ? "恢復結果" : isImageBatchRoot(ctx) ? "重試失敗項" : "重試",
        icon: <RefreshCw className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 30,
        nodeToolbar: { group: "primary", order: 5 },
        applicable: canRetry,
        run: (ctx) => ctx.handlers.onNodeRetry(ctx.node!),
    },
    {
        id: "extractFrames",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => ctx.extractingVideoFrames ? "正在擷取關鍵幀" : "擷取當前幀、首幀或尾幀",
        displayLabel: (ctx) => ctx.extractingVideoFrames ? "處理中" : "關鍵幀擷取",
        icon: (ctx) => ctx.extractingVideoFrames ? <LoaderCircle className="size-3.5 animate-spin" /> : <Images className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 40,
        nodeToolbar: { group: "process", order: 10, section: "提取素材", description: "選取畫面，儲存為圖片節點" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingVideoFrames,
        run: (ctx) => ctx.handlers.onNodeExtractVideoFrames(ctx.node!),
    },
    {
        id: "extractAudio",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => ctx.extractingAudio ? "正在分離音影片" : "從影片中分離音訊並生成獨立音訊節點",
        displayLabel: (ctx) => ctx.extractingAudio ? "處理中" : "音影片分離",
        icon: (ctx) => ctx.extractingAudio ? <LoaderCircle className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 42,
        nodeToolbar: { group: "process", order: 20, section: "提取素材", description: "生成音訊節點，保留原影片聲音" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingAudio || ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeExtractAudioFromVideo(ctx.node!),
    },
    {
        id: "trimRegenerate",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => ctx.trimmingVideo ? "正在剪輯影片" : "剪輯一個或多個影片片段",
        displayLabel: (ctx) => ctx.trimmingVideo ? "處理中" : "影片剪輯",
        icon: (ctx) => ctx.trimmingVideo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 44,
        nodeToolbar: { group: "primary", order: 10, description: "擷取一段或多段，生成獨立影片節點" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingAudio || ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeTrimVideoSegments(ctx.node!),
    },
    {
        id: "cropVideo",
        toolbar: "node-hover",
        category: "node-state",
        label: "裁切影片畫面",
        displayLabel: "畫面裁切",
        icon: <Scissors className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 46,
        // Keep the compact primary row focused on the two high-frequency
        // actions; crop remains available from the secondary menu.
        nodeToolbar: { group: "more", order: 30, section: "影片處理", description: "按比例裁切影片畫面" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeCropVideo(ctx.node!),
    },
    {
        id: "depthCapture",
        toolbar: "node-hover",
        category: "node-state",
        label: "生成近白遠黑的深度動作參考影片",
        displayLabel: "深度動作捕捉",
        icon: <WandSparkles className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 47,
        nodeToolbar: { group: "more", order: 40, section: "影片處理", description: "本地生成深度參考影片；首次需下載元件，CPU 處理可能較慢" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeDepthCapture(ctx.node!),
    },
    {
        id: "saveAsset",
        toolbar: "node-hover",
        category: "node-state",
        label: "加入我的素材",
        displayLabel: "儲存到素材庫",
        icon: <FolderPlus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 50,
        nodeToolbar: { group: "more", order: 40, section: "素材" },
        applicable: (ctx) => hasImage(ctx) || hasVideo(ctx) || isEditableText(ctx),
        run: (ctx) => ctx.handlers.onNodeSaveAsset(ctx.node!),
    },
    {
        id: "download",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => hasAudio(ctx) ? "下載音訊" : hasVideo(ctx) ? "下載影片" : "下載圖片",
        displayLabel: "下載",
        icon: <Download className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 60,
        nodeToolbar: { group: "utility", order: 20 },
        applicable: (ctx) => hasImage(ctx) || hasVideo(ctx) || hasAudio(ctx),
        run: (ctx) => ctx.handlers.onNodeDownload(ctx.node!),
    },
    {
        id: "edit",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => isEditableText(ctx) ? "呼叫文本模型生成內容" : "編輯",
        displayLabel: (ctx) => isEditableText(ctx) ? "文本生成" : "生成設定",
        icon: <MessageSquare className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 70,
        nodeToolbar: { group: (ctx) => isEditableText(ctx) ? "primary" : "more", order: 20, section: "生成資訊" },
        applicable: canOpenDialog,
        run: (ctx) => ctx.handlers.onNodeToggleDialog(ctx.node!),
    },
    {
        id: "editText",
        toolbar: "node-hover",
        category: "node-state",
        label: "放大編輯文本",
        displayLabel: "放大編輯",
        icon: <Maximize2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 80,
        nodeToolbar: { group: "primary", order: 30 },
        applicable: isEditableText,
        run: (ctx) => ctx.handlers.onNodeEditText(ctx.node!),
    },
    {
        id: "generateImage",
        toolbar: "node-hover",
        category: "node-state",
        label: "用文本生圖",
        displayLabel: "生圖",
        icon: <ImageIcon className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 90,
        nodeToolbar: { group: "primary", order: 40 },
        applicable: isEditableText,
        run: (ctx) => ctx.handlers.onNodeGenerateImage(ctx.node!),
    },
    {
        id: "config",
        toolbar: "node-hover",
        category: "node-state",
        label: "生成配置",
        displayLabel: "生成配置",
        icon: <Settings2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 100,
        nodeToolbar: { group: "primary", order: 10 },
        applicable: (ctx) => isConfig(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeToggleDialog(ctx.node!),
    },
    {
        id: "decreaseFont",
        toolbar: "node-hover",
        category: "node-state",
        label: "減小字號",
        displayLabel: "縮小",
        icon: <Minus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 110,
        nodeToolbar: { group: "process", order: 10 },
        applicable: (ctx) => isEditableText(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeDecreaseFont(ctx.node!),
    },
    {
        id: "increaseFont",
        toolbar: "node-hover",
        category: "node-state",
        label: "增大字號",
        displayLabel: "放大",
        icon: <Plus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 120,
        nodeToolbar: { group: "process", order: 20 },
        applicable: (ctx) => isEditableText(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeIncreaseFont(ctx.node!),
    },
    {
        id: "uploadImage",
        toolbar: "node-hover",
        category: "node-state",
        label: "上傳圖片",
        displayLabel: "上傳圖片",
        icon: <Upload className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 130,
        nodeToolbar: { group: "primary", order: 10 },
        applicable: (ctx) => isImage(ctx) && !hasImage(ctx),
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    {
        id: "uploadVideo",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => hasVideo(ctx) ? "替換影片" : "上傳影片",
        displayLabel: (ctx) => hasVideo(ctx) ? "替換影片" : "上傳影片",
        icon: <Video className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 140,
        nodeToolbar: { group: (ctx) => hasVideo(ctx) ? "more" : "primary", order: 45, section: "素材" },
        // Empty video nodes are generation composers, not upload targets. Keep
        // the upload affordance only for an existing video where it is a
        // deliberate "replace" action; the empty node should expose its
        // prompt composer below the node instead of an upload action above it.
        applicable: hasVideo,
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    {
        id: "subtitles",
        toolbar: "node-hover",
        category: "node-state",
        label: "編輯字幕",
        displayLabel: "字幕",
        icon: <Captions className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 145,
        nodeToolbar: { group: "primary", order: 20 },
        applicable: (ctx) => hasVideo(ctx) || hasAudio(ctx),
        run: (ctx) => ctx.handlers.onNodeSubtitles(ctx.node!),
    },
    {
        id: "timeline",
        toolbar: "node-hover",
        category: "node-state",
        label: "時間線編輯",
        displayLabel: "進入剪輯",
        icon: <Clapperboard className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 148,
        nodeToolbar: { group: "workspace", order: 30, section: "專案剪輯", description: "開啟專案時間線，定位到當前素材" },
        // Keep the video editing entry hidden until the editing workflow is ready.
        applicable: hasAudio,
        run: (ctx) => ctx.handlers.onNodeTimeline(ctx.node!),
    },
    {
        id: "uploadAudio",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => hasAudio(ctx) ? "替換音訊" : "上傳音訊",
        displayLabel: (ctx) => hasAudio(ctx) ? "替換音訊" : "上傳音訊",
        icon: <Music2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 150,
        nodeToolbar: { group: (ctx) => hasAudio(ctx) ? "more" : "primary", order: 45, section: "素材" },
        applicable: isAudio,
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    // 節點鎖定——獨立分類，自動插入前置分隔符
    {
        id: "node-lock",
        toolbar: "node-hover",
        category: "navigation",
        label: (ctx) => ctx.nodeMetadata?.locked ? "解鎖節點" : "鎖定位置和尺寸",
        displayLabel: "鎖定位置與尺寸",
        icon: (ctx) => ctx.nodeMetadata?.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 160,
        nodeToolbar: { group: "more", order: 900, section: "節點管理" },
        active: (ctx) => Boolean(ctx.nodeMetadata?.locked),
        run: (ctx) => ctx.handlers.onNodeToggleLocked(ctx.node!),
    },
];

registerToolbarTools(nodeHoverToolbarTools);
