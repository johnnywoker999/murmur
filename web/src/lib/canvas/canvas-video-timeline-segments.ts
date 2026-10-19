import { collectUpstreamVideoNodes } from "@/lib/canvas/canvas-resource-references";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";
import type { TimelineClip, TimelineProject } from "@/types/timeline";

export type CanvasTimelineSegmentItem = {
    id: string;
    startMs: number;
    endMs: number;
    sourceNodeId?: string;
    sourceStorageKey?: string;
    sourceUrl?: string;
};

export type TimelineImportResult = { ok: true; segments: CanvasTimelineSegmentItem[] } | { ok: false; error: string };

const MIN_TIMELINE_SEGMENT_MS = 100;

export function buildTimelineImportSegments(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[], timeline: TimelineProject | null | undefined, durationMs: number): TimelineImportResult {
    const candidateNodes = collectUpstreamVideoNodes(node.id, nodes, connections);
    const matchesCandidate = (clip: TimelineClip, candidate: CanvasNodeData) => {
        if (candidate.id === clip.nodeId) return true;
        if (candidate.metadata?.assetId && clip.nodeId === candidate.metadata.assetId) return true;
        if (candidate.metadata?.storageKey && clip.directMedia?.storageKey === candidate.metadata.storageKey) return true;
        // 舊資料裡 nodeId 可能被重新生成過；標題一致且唯一時才回退，避免同名影片誤匯入。
        if (candidate.title && clip.title === candidate.title && !clip.directMedia) {
            return candidateNodes.filter((item) => item.title === candidate.title).length === 1;
        }
        return false;
    };
    const clips = (timeline?.clips || []).filter((clip) => clip.kind === "video" && candidateNodes.some((candidate) => matchesCandidate(clip, candidate)));
    if (!clips.length) {
        return { ok: false, error: `未找到「${node.title || "當前影片節點"}」或其上游影片節點在時間線中的片段，請先在時間線中加入對應影片節點` };
    }
    const segments = clips.flatMap((clip) => {
        const matchedNode = candidateNodes.find((candidate) => matchesCandidate(clip, candidate));
        const startMs = Math.max(0, Math.round(clip.sourceStartMs ?? 0));
        const rawEndMs = startMs + Math.max(MIN_TIMELINE_SEGMENT_MS, Math.round(clip.sourceDurationMs || clip.durationMs));
        const sourceDurationMs = matchedNode?.metadata?.durationMs || durationMs;
        const endMs = sourceDurationMs > 0 ? Math.min(sourceDurationMs, rawEndMs) : rawEndMs;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
        return [
            {
                id: `timeline-${clip.id}`,
                startMs,
                endMs,
                sourceNodeId: matchedNode?.id,
                sourceStorageKey: clip.directMedia?.storageKey || matchedNode?.metadata?.storageKey,
                sourceUrl: clip.directMedia?.url || matchedNode?.metadata?.content,
            },
        ];
    });
    if (!segments.length) return { ok: false, error: "時間線片段資料不完整，請先在時間線中重新分割或儲存" };
    return { ok: true, segments };
}
