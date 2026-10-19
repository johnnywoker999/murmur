// 從畫布節點構建時間線資料：影片/音訊節點自動入軌，字幕條目轉成字幕片段。
// 構建是單向快照：時間線儲存後使用者可自由拖拽，重新構建不覆蓋已有時間線。

import type { CanvasNodeData } from "@/types/canvas";
import type { SrtEntry, TimelineClip, TimelineProject } from "@/types/timeline";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_SUBTITLE_TRACK_ID, DEFAULT_VIDEO_TRACK_ID, createDefaultTracks } from "./timeline-tracks";
import { getTimelineVisualEndMs } from "./timeline-view";

function nodeDurationMs(node: CanvasNodeData, fallbackMs = 4_000): number {
    const durationMs = node.metadata?.durationMs;
    return durationMs && durationMs > 0 ? Math.round(durationMs) : fallbackMs;
}

/**
 * 從畫布節點生成時間線片段。
 * - 影片節點 → 影片軌片段（順序排布，首尾相接）；
 * - 音訊節點 → 音訊軌片段（順序排布）；
 * - 影片節點的字幕條目 → 字幕軌片段（相對該影片片段起點偏移）。
 */
export function buildTimelineFromNodes(nodes: CanvasNodeData[]): TimelineProject {
    const videoNodes = nodes.filter((node) => node.type === "video" && Boolean(node.metadata?.content || node.metadata?.storageKey));
    const audioNodes = nodes.filter((node) => node.type === "audio" && Boolean(node.metadata?.content || node.metadata?.storageKey));
    const clips: TimelineClip[] = [];

    let videoCursorMs = 0;
    for (const node of videoNodes) {
        const durationMs = nodeDurationMs(node);
        clips.push({
            id: `clip-${node.id}`,
            kind: "video",
            nodeId: node.id,
            trackId: DEFAULT_VIDEO_TRACK_ID,
            startMs: videoCursorMs,
            durationMs,
            title: node.title || "影片片段",
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
        });

        const entries = node.metadata?.subtitleEntries || [];
        for (const entry of entries) {
            const startMs = videoCursorMs + Math.max(0, entry.startMs);
            const endMs = videoCursorMs + Math.max(entry.startMs, Math.min(entry.endMs, durationMs));
            clips.push({
                id: `clip-${node.id}-sub-${entry.index}`,
                kind: "subtitle",
                nodeId: node.id,
                trackId: DEFAULT_SUBTITLE_TRACK_ID,
                startMs,
                durationMs: Math.max(100, endMs - startMs),
                title: entry.text || "字幕",
                sourceStartMs: entry.startMs,
                sourceDurationMs: Math.max(0, entry.endMs - entry.startMs),
                subtitleEntryIndex: entry.index,
                text: entry.text,
            });
        }
        videoCursorMs += durationMs;
    }

    let audioCursorMs = 0;
    for (const node of audioNodes) {
        const durationMs = nodeDurationMs(node);
        clips.push({
            id: `clip-${node.id}`,
            kind: "audio",
            nodeId: node.id,
            trackId: DEFAULT_AUDIO_TRACK_ID,
            startMs: audioCursorMs,
            durationMs,
            title: node.title || "音訊片段",
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
            volume: 1,
            fadeInMs: 0,
            fadeOutMs: 0,
        });
        audioCursorMs += durationMs;
    }

    return {
        version: 2,
        tracks: createDefaultTracks(),
        clips,
        durationMs: getTimelineVisualEndMs(clips),
        updatedAt: new Date().toISOString(),
    };
}

/** 判斷某個節點是否已經出現在時間線中（按 nodeId 去重）。 */
export function isNodeInTimeline(nodeId: string, timeline: TimelineProject | null | undefined): boolean {
    return Boolean(timeline?.clips.some((clip) => clip.nodeId === nodeId));
}

/**
 * 將節點字幕條目同步回專案時間線：按影片片段起點偏移重建該節點的字幕片段；
 * 條目為空陣列時移除該節點全部字幕片段，保證字幕彈窗與時間線互通。
 */
export function syncNodeSubtitlesToTimeline(timeline: TimelineProject, nodeId: string, entries: SrtEntry[]): TimelineProject {
    const videoClip = timeline.clips.find((clip) => clip.nodeId === nodeId && clip.kind === "video");
    const hasSubtitleClips = timeline.clips.some((clip) => clip.nodeId === nodeId && clip.kind === "subtitle");
    if (!videoClip && !hasSubtitleClips) return timeline;
    const baseMs = videoClip?.startMs ?? 0;
    const sourceDurationMs = videoClip?.sourceDurationMs || videoClip?.durationMs || 0;
    const clips = timeline.clips.filter((clip) => !(clip.nodeId === nodeId && clip.kind === "subtitle"));
    for (const entry of entries) {
        const text = (entry.text || "").trim();
        if (!text) continue;
        const startMs = baseMs + Math.max(0, entry.startMs);
        const endMs = baseMs + Math.max(entry.startMs, Math.min(entry.endMs, sourceDurationMs || entry.endMs));
        clips.push({
            id: `clip-${nodeId}-sub-${entry.index}`,
            kind: "subtitle",
            nodeId,
            trackId: DEFAULT_SUBTITLE_TRACK_ID,
            startMs,
            durationMs: Math.max(100, endMs - startMs),
            title: text,
            sourceStartMs: entry.startMs,
            sourceDurationMs: Math.max(0, entry.endMs - entry.startMs),
            subtitleEntryIndex: entry.index,
            text,
        });
    }
    return {
        ...timeline,
        clips,
        durationMs: getTimelineVisualEndMs(clips),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * 開啟時間線彈窗時的兜底同步：以時間線內已有影片片段為錨點，按節點
 * subtitleEntries 重建該節點的字幕片段（刪除舊片段、補齊新增條目）。
 * 僅處理已入軌的節點，避免把未入軌節點的字幕憑空加進時間線。
 */
export function syncTimelineSubtitleClips(timeline: TimelineProject, nodes: CanvasNodeData[]): TimelineProject {
    let changed = false;
    const clips = [...timeline.clips];
    for (const videoClip of timeline.clips) {
        if (videoClip.kind !== "video") continue;
        const node = nodes.find((item) => item.id === videoClip.nodeId);
        if (!node) continue;
        const stale = clips.filter((clip) => clip.kind === "subtitle" && clip.nodeId === videoClip.nodeId);
        if (stale.length) {
            for (const staleClip of stale) {
                const index = clips.indexOf(staleClip);
                if (index >= 0) clips.splice(index, 1);
            }
            changed = true;
        }
        const entries = node.metadata?.subtitleEntries || [];
        const baseMs = videoClip.startMs;
        const sourceDurationMs = videoClip.sourceDurationMs || videoClip.durationMs || 0;
        for (const entry of entries) {
            const text = (entry.text || "").trim();
            if (!text) continue;
            const startMs = baseMs + Math.max(0, entry.startMs);
            const endMs = baseMs + Math.max(entry.startMs, Math.min(entry.endMs, sourceDurationMs || entry.endMs));
            clips.push({
                id: `clip-${videoClip.nodeId}-sub-${entry.index}`,
                kind: "subtitle",
                nodeId: videoClip.nodeId,
                trackId: DEFAULT_SUBTITLE_TRACK_ID,
                startMs,
                durationMs: Math.max(100, endMs - startMs),
                title: text,
                sourceStartMs: entry.startMs,
                sourceDurationMs: Math.max(0, entry.endMs - entry.startMs),
                subtitleEntryIndex: entry.index,
                text,
            });
            changed = true;
        }
    }
    if (!changed) return timeline;
    return {
        ...timeline,
        clips,
        durationMs: getTimelineVisualEndMs(clips),
        updatedAt: new Date().toISOString(),
    };
}
