// 時間線與字幕的共享資料模型。第一期落字幕資料；第二期起時間線軌道/片段在此持久化。

export type SrtEntry = {
    index: number;
    startMs: number;
    endMs: number;
    text: string;
};

export type SubtitleHighlight = {
    entryIndex: number;
    start: number;
    end: number;
    highlightText: string;
    sourceText: string;
};

export type SubtitlePosition = "top" | "bottom" | "center";
export type SubtitleHighlightAnimation = "pop" | "wipe" | "none";

export type SubtitleStyle = {
    fontSize: number;
    color: string;
    position: SubtitlePosition;
    highlightEnabled: boolean;
    highlightBackgroundColor: string;
    highlightTextColor: string;
    highlightPaddingX: number;
    highlightPaddingY: number;
    highlightRadius: number;
    highlightAnimation: SubtitleHighlightAnimation;
    /** 單條字幕最多字元數，超過則自動切分。預設 35，範圍 20~60 */
    maxCharsPerEntry: number;
    /** 是否啟用自動切分。預設 true */
    autoResegment: boolean;
};

export function createDefaultSubtitleStyle(): SubtitleStyle {
    return {
        fontSize: 18,
        color: "#ffffff",
        position: "bottom",
        highlightEnabled: true,
        highlightBackgroundColor: "#111111",
        highlightTextColor: "#ffd54a",
        highlightPaddingX: 6,
        highlightPaddingY: 2,
        highlightRadius: 4,
        highlightAnimation: "pop",
        maxCharsPerEntry: 35,
        autoResegment: true,
    };
}

export type TimelineTrackKind = "video" | "audio" | "subtitle" | "text" | "image";

export type TimelineTrack = {
    id: string;
    kind: TimelineTrackKind;
    label: string;
    order: number;
    locked?: boolean;
    /** 軌道可見性（預覽/匯出跳過不可見軌）。undefined = true。 */
    visible?: boolean;
    /** 軌道靜音（音訊軌在播放/匯出時靜音）。undefined = false。 */
    muted?: boolean;
};

export type TimelineClipKind = "video" | "audio" | "subtitle" | "text" | "image";

/** 僅時間線作用域的直連媒體（不落畫布）：素材庫/專案資產/本地上傳在時間線內直接入軌時使用。 */
export type TimelineDirectMedia = {
    /** 源素材 id（本地資產 id / 上傳檔案 id），用於生成時間線內唯一 nodeId 字首 */
    id: string;
    /** 遠端素材庫記錄；本地上傳成功後必須存在。 */
    assetId?: string;
    kind: "video" | "audio" | "image" | "text";
    title: string;
    storageKey?: string;
    url?: string;
    dataUrl?: string;
    content?: string;
    durationMs?: number;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

export type TimelineClip = {
    id: string;
    kind: TimelineClipKind;
    nodeId: string;
    trackId: string;
    startMs: number;
    durationMs: number;
    title?: string;
    /** 源素材內裁剪起點（毫秒），用於匯出階段定位原始檔片段 */
    sourceStartMs?: number;
    /** 源素材總時長（毫秒），用於 UI 限制裁剪上限 */
    sourceDurationMs?: number;
    volume?: number;
    fadeInMs?: number;
    fadeOutMs?: number;
    /** 字幕片段：對應源影片節點 subtitleEntries 的下標（-1 表示未關聯） */
    subtitleEntryIndex?: number;
    /** 字幕片段文本快照，時間線內直接展示，不與節點雙向同步 */
    text?: string;
    /** 僅時間線作用域的直連媒體；存在時預覽/匯出優先從該欄位解析，不再回畫布查節點 */
    directMedia?: TimelineDirectMedia;
};

export type TimelineProject = {
    version: 2;
    tracks: TimelineTrack[];
    clips: TimelineClip[];
    /** 時間線總時長（毫秒），取所有片段末端最大值 */
    durationMs: number;
    updatedAt?: string;
};
