// 時間線確定性摘要：把 TimelineProject 壓縮成穩定、可控長度的中文上下文，供 AI 編輯和診斷使用。
// 同一輸入永遠產出同一輸出（無時間戳/無隨機），供命令引用 id 與 AI 面板上下文注入。

import type { TimelineClip, TimelineProject, TimelineTrack } from "@/types/timeline";

/** 片段逐行列出的上限；超出後摺疊為一行彙總，防止超長時間線撐爆模型上下文。 */
export const SUMMARY_MAX_CLIP_LINES = 60;
/** 標題/文本在摘要中的最大展示長度。 */
export const SUMMARY_MAX_TEXT_CHARS = 24;

const KIND_LABELS: Record<string, string> = {
    video: "影片",
    audio: "音訊",
    subtitle: "字幕",
    text: "文本",
    image: "圖片",
};

export function formatMs(ms: number): string {
    const total = Math.max(0, Math.round(ms));
    const s = Math.floor(total / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
}

function clipLine(clip: TimelineClip): string {
    const label = (clip.title || clip.text || "").trim().slice(0, SUMMARY_MAX_TEXT_CHARS);
    const source = clip.directMedia?.title?.slice(0, SUMMARY_MAX_TEXT_CHARS) ?? "";
    const text = label || source || clip.nodeId.slice(0, 12);
    return `  - clip ${clip.id} | ${clip.kind} | 軌道 ${clip.trackId} | ${clip.startMs}-${clip.startMs + clip.durationMs}ms | ${text}`;
}

function trackLine(track: TimelineTrack): string {
    const flags = [
        track.visible === false ? "隱藏" : null,
        track.muted ? "靜音" : null,
    ]
        .filter(Boolean)
        .join("/");
    return `  - ${track.id} | ${KIND_LABELS[track.kind] ?? track.kind}軌 | ${track.label}${flags ? ` | ${flags}` : ""}`;
}

/** 生成中文時間線摘要（確定性、純文本）。 */
export function summarizeTimeline(project: TimelineProject): string {
    const lines: string[] = [];
    const subtitleClips = project.clips.filter((c) => c.kind === "subtitle");
    const nodeIds = new Set(project.clips.map((c) => c.nodeId));
    const directCount = project.clips.filter((c) => c.directMedia).length;

    lines.push(`時間線：總時長 ${formatMs(project.durationMs)}，${project.tracks.length} 條軌道，${project.clips.length} 個片段（字幕 ${subtitleClips.length}，直連素材 ${directCount}，引用節點 ${nodeIds.size} 個）。`);
    lines.push(`軌道（順序從上到下）：`);
    for (const track of [...project.tracks].sort((a, b) => a.order - b.order)) {
        lines.push(trackLine(track));
    }
    lines.push(`片段：`);
    if (project.clips.length === 0) {
        lines.push(`  （空時間線）`);
    } else {
        const shown = project.clips.slice(0, SUMMARY_MAX_CLIP_LINES);
        for (const clip of shown) {
            lines.push(clipLine(clip));
        }
        const hidden = project.clips.length - shown.length;
        if (hidden > 0) lines.push(`  …其餘 ${hidden} 個片段省略`);
    }
    if (subtitleClips.length > 0) {
        const totalChars = subtitleClips.reduce((sum, c) => sum + (c.text?.length ?? 0), 0);
        lines.push(`字幕共 ${totalChars} 字。`);
    }
    return lines.join("\n");
}
