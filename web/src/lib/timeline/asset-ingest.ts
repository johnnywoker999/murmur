// 資產到時間線片段的純轉換：只做型別對映和結構組裝，不讀取網路或修改編輯器狀態。
// 資產是"僅時間線作用域"的直連媒體：nodeId 用 `asset:<id>` 字首（不指向畫布節點），
// 預覽/匯出從 directMedia 解析媒體，不回畫布查節點。

import type { ProjectAsset } from "@/services/api/projects";
import type { TimelineClip, TimelineClipKind } from "@/types/timeline";

const MEDIA_TYPE_TO_KIND: Record<string, TimelineClipKind | undefined> = {
    video: "video",
    audio: "audio",
    image: "image",
    text: "text",
};

export function assetToClipKind(mediaType: string): TimelineClipKind | null {
    return MEDIA_TYPE_TO_KIND[mediaType] ?? null;
}

export type MakeClipFromAssetOptions = {
    /** 目標軌道 id（呼叫方已按 kind 選好軌道）。 */
    trackId: string;
    /** 時間線起點（毫秒，通常為該軌道當前末尾）。 */
    startMs: number;
    /** 預設時長（毫秒）；資產無時長後設資料時使用。 */
    defaultDurationMs?: number;
    /** 時間線內唯一 id（呼叫方負責去重，通常 `asset:<id>:<n>`）。 */
    id?: string;
};

export function makeClipFromAsset(asset: ProjectAsset, options: MakeClipFromAssetOptions): TimelineClip | null {
    const kind = assetToClipKind(asset.mediaType);
    if (!kind) return null;
    if (kind === "text") return null; // 文本資產不直接入軌（走字幕/文字工具）
    return {
        id: options.id ?? `asset:${asset.id}`,
        kind,
        nodeId: `asset:${asset.id}`,
        trackId: options.trackId,
        startMs: options.startMs,
        durationMs: asset.durationMs && asset.durationMs > 0 ? asset.durationMs : (options.defaultDurationMs ?? 3_000),
        title: asset.title,
        directMedia: {
            id: asset.id,
            kind: kind === "subtitle" ? "text" : kind,
            title: asset.title,
            storageKey: asset.storageKey,
        },
    };
}
