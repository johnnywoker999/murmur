import type { GenerationRetryContext } from "@/lib/canvas/canvas-project-generation";
import { formatVideoResolutionLabel as videoResolutionLabel, VIDEO_RESOLUTION_OPTIONS } from "@/lib/video-generation-options";
import type { CreationAttachment, CreationMode } from "./creation-assets";
import type { CreationReference } from "./creation-references";

export type { CreationMode };

export type CreationStatus = "streaming" | "pending" | "done" | "error" | "cancelled";
export type CreationSettings = { ratio: string; seconds: string; quality: string; videoQuality: string; count: string };
export type CreationRetryContext = GenerationRetryContext & { retryContextsByBatchIndex?: GenerationRetryContext[] };

export type CreationMessage = {
    id: string;
    role: "user" | "assistant";
    mode?: CreationMode;
    content: string;
    reasoning?: string;
    createdAt: string;
    status?: CreationStatus;
    model?: string;
    resultUrls?: string[];
    error?: string;
    generationErrorCode?: string;
    generationOperation?: string;
    attachments?: CreationAttachment[];
    references?: CreationReference[];
    settings?: CreationSettings;
    taskIds?: string[];
    clientOperationId?: string;
    retryOf?: string;
    attemptGroupId?: string;
    generationStage?: string;
    generationEffectKeys?: string[];
};
export type CreationConversationConflict = {
    revision: number;
    document: CreationConversation;
};

export type CreationConversation = {
    id: string;
    title: string;
    updatedAt: string;
    canvasId?: string;
    messages: CreationMessage[];
    conflictRemote?: CreationConversationConflict;
};

export const modeLabels: Record<CreationMode, string> = { text: "文本", image: "圖片", video: "影片" };
// LibTV 的創作入口以“鏡頭/影片”作為首次進入的主路徑；使用者切換後的模式
// 仍由本地偏好記憶，因此這裡隻影響沒有歷史偏好的新工作區。
export const defaultCreationMode: CreationMode = "video";
export const shotScriptLabels: Record<CreationMode, string> = { text: "創作思路", image: "畫面指令", video: "鏡頭指令碼" };
export const ratioOptions = [
    { value: "1:1", label: "方形" },
    { value: "16:9", label: "橫屏" },
    { value: "9:16", label: "豎屏" },
    { value: "4:3", label: "標準橫屏" },
    { value: "3:4", label: "標準豎屏" },
    { value: "21:9", label: "寬銀幕" },
];
export const qualityOptions = [
    { value: "auto", label: "自動", description: "由模型決定" },
    { value: "low", label: "低", description: "更快生成" },
    { value: "medium", label: "中", description: "均衡模式" },
    { value: "high", label: "高", description: "優先細節" },
    { value: "xhigh", label: "超高", description: "更多細節，生成更慢" },
    { value: "max", label: "最高", description: "最高質量，生成更慢" },
    // grok2api / xAI Imagine：quality 對映 resolution
    { value: "1k", label: "1K", description: "標準清晰度" },
    { value: "2k", label: "2K", description: "更高畫質晰度" },
];
export const resolutionOptions = VIDEO_RESOLUTION_OPTIONS.map((value) => ({ value: String(value), label: videoResolutionLabel(value) }));
export const countOptions = ["1", "2", "3", "4"];
export const conversationTimeFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
export const messageTimeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

export const historyDayFormatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });

export type CreationShotRailEntry = { key: string; ordinal: number; user: CreationMessage; result?: CreationMessage };
