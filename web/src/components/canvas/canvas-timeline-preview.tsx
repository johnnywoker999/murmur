import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { resolveMediaUrl } from "@/services/file-storage";
import { cacheResourceObjectUrl } from "@/services/resource-blob-cache";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { createDefaultSubtitleStyle } from "@/types/timeline";
import type { TimelineClip } from "@/types/timeline";
import type { CanvasNodeData } from "@/types/canvas";
import { CanvasSubtitleOverlay } from "./canvas-subtitle-overlay";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

type CanvasTimelinePreviewProps = {
    clips: TimelineClip[];
    nodes: CanvasNodeData[];
    playheadMs: number;
    playing: boolean;
    theme: CanvasTheme;
    onTogglePlay: () => void;
    onPlayheadChange: (ms: number) => void;
};

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 168;
const AUTO_ADVANCE_GAP_MS = 500;

/**
 * 時間線彈窗的所見即所得預覽：顯示播放頭所在影片片段，併疊加當前字幕。
 * 播放時以影片時間為基準推進播放頭；暫停時播放頭（標尺跳轉）驅動影片畫面。
 */
export function CanvasTimelinePreview({ clips, nodes, playheadMs, playing, theme, onTogglePlay, onPlayheadChange }: CanvasTimelinePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoUrl, setVideoUrl] = useState("");
    const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
    // 源內定位目標（秒）；影片換源後 metadata 尚未載入時先記錄，loadedmetadata 後再應用。
    const targetSeekSecRef = useRef<number | null>(null);

    const videoClips = useMemo(() => clips.filter((clip) => clip.kind === "video").sort((a, b) => a.startMs - b.startMs), [clips]);
    const activeVideoClip = useMemo(() => videoClips.find((clip) => playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs) || null, [playheadMs, videoClips]);
    const activeSubtitleClip = useMemo(() => clips.find((clip) => clip.kind === "subtitle" && playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs && Boolean(clip.text?.trim())) || null, [clips, playheadMs]);
    const activeNode = useMemo(() => (activeVideoClip ? nodes.find((node) => node.id === activeVideoClip.nodeId) || null : null), [activeVideoClip, nodes]);
    const subtitleStyle = activeNode?.metadata?.subtitleStyle || createDefaultSubtitleStyle();
    const activeHighlight = useMemo(() => {
        if (!activeSubtitleClip || activeSubtitleClip.subtitleEntryIndex === undefined || activeSubtitleClip.subtitleEntryIndex < 0 || !activeNode) return undefined;
        // subtitleEntryIndex 與字幕條目 index 同為 1 基，直接匹配，不再 +1（此前高亮永遠匹配不上）。
        return (activeNode.metadata?.subtitleHighlights || []).find((item) => item.entryIndex === activeSubtitleClip.subtitleEntryIndex);
    }, [activeNode, activeSubtitleClip]);

    // 解析當前片段影片地址（與字幕彈窗同一套快取/回退策略）。
    useEffect(() => {
        const node = activeNode;
        const media = activeVideoClip?.directMedia;
        setVideoUrl("");
        setVideoSize(null);
        if (!node && !media) return;
        let cancelled = false;
        // 直連媒體片段（directMedia，不落畫布）與畫布節點走同一套快取/回退解析策略
        const storageKey = node?.metadata?.storageKey || media?.storageKey || "";
        const fallback = node?.metadata?.content || media?.url || "";
        const applyUrl = (url: string) => {
            if (!cancelled) setVideoUrl(url);
        };
        if (resourceIdFromStorageKey(storageKey)) {
            void cacheResourceObjectUrl(storageKey)
                .then((cached) => {
                    if (cancelled) return;
                    if (cached) {
                        setVideoUrl(cached);
                    } else {
                        void resolveMediaUrl(storageKey, fallback).then(applyUrl);
                    }
                })
                .catch(() => {
                    if (!cancelled) void resolveMediaUrl(storageKey, fallback).then(applyUrl);
                });
        } else {
            void resolveMediaUrl(storageKey, fallback).then(applyUrl);
        }
        return () => {
            cancelled = true;
        };
    }, [activeNode, activeVideoClip]);

    // 播放/暫停與外部跳轉（標尺拖動）時同步影片位置；播放前先定位到片段源內起點，
    // 避免裁剪後的片段從原始影片 0s 開始播放；播放期間影片時間反向驅動播放頭，不做回跳。
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeVideoClip || !videoUrl) return;
        const sourceStartSec = (activeVideoClip.sourceStartMs || 0) / 1000;
        const sourceDurationSec = (activeVideoClip.sourceDurationMs || activeVideoClip.durationMs) / 1000;
        const targetSec = sourceStartSec + Math.max(0, playheadMs - activeVideoClip.startMs) / 1000;
        const clampedTargetSec = Math.min(targetSec, sourceStartSec + Math.max(0, sourceDurationSec - 0.05));
        targetSeekSecRef.current = clampedTargetSec;
        if (video.readyState >= 1 && Math.abs(video.currentTime - clampedTargetSec) > 0.05) {
            video.currentTime = clampedTargetSec;
        }
        if (playing) {
            void video.play().catch(() => undefined);
        } else {
            video.pause();
        }
    }, [activeVideoClip, playheadMs, playing, videoUrl]);

    // 影片換源後後設資料載入完成，應用之前記錄的源內定位目標。
    const handleVideoLoadedMetadata = (video: HTMLVideoElement) => {
        if (video.videoWidth > 0 && video.videoHeight > 0) setVideoSize({ width: video.videoWidth, height: video.videoHeight });
        if (targetSeekSecRef.current != null && video.readyState >= 1) {
            const target = Math.min(targetSeekSecRef.current, Math.max(0, (video.duration || 0) - 0.05));
            if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
        }
    };

    const handleTimeUpdate = () => {
        const video = videoRef.current;
        if (!video || !activeVideoClip || !playing) return;
        const sourceStartSec = (activeVideoClip.sourceStartMs || 0) / 1000;
        const timelineMs = activeVideoClip.startMs + Math.round((video.currentTime - sourceStartSec) * 1000);
        onPlayheadChange(Math.max(0, timelineMs));
        const clipEndMs = activeVideoClip.startMs + activeVideoClip.durationMs;
        if (timelineMs >= clipEndMs) {
            const next = videoClips.find((clip) => clip.startMs >= clipEndMs - AUTO_ADVANCE_GAP_MS && clip.id !== activeVideoClip.id);
            if (next) {
                onPlayheadChange(next.startMs);
            } else {
                onTogglePlay();
            }
        }
    };

    const previewDisplay = useMemo(() => {
        if (!videoSize || videoSize.height <= 0) return null;
        const ratio = videoSize.width / videoSize.height;
        let width = PREVIEW_WIDTH;
        let height = width / ratio;
        if (height > PREVIEW_HEIGHT) {
            height = PREVIEW_HEIGHT;
            width = Math.round(height * ratio);
        }
        return { width: Math.round(width), height: Math.round(height) };
    }, [videoSize]);

    return (
        <div className="canvas-timeline-preview flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
            <div className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-black" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }} data-canvas-no-zoom>
                {videoUrl && activeVideoClip ? (
                    <>
                        <div className="relative" style={previewDisplay ? { width: previewDisplay.width, height: previewDisplay.height } : { width: "100%", height: "100%" }}>
                            <video ref={videoRef} className="block h-full w-full" src={videoUrl} playsInline preload="metadata" onLoadedMetadata={(event) => handleVideoLoadedMetadata(event.currentTarget)} onTimeUpdate={handleTimeUpdate} />
                            {activeSubtitleClip ? <CanvasSubtitleOverlay text={activeSubtitleClip.text || ""} highlight={activeHighlight} style={subtitleStyle} /> : null}
                        </div>
                        <button
                            type="button"
                            className="absolute inset-0 z-10 grid place-items-center"
                            aria-label={playing ? "暫停預覽" : "播放預覽"}
                            onClick={(event) => {
                                event.stopPropagation();
                                onTogglePlay();
                            }}
                        >
                            <span className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60">
                                {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                            </span>
                        </button>
                    </>
                ) : (
                    <div className="px-4 text-center text-xs opacity-55">該位置無影片片段</div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                    <span className="truncate font-semibold" style={{ color: theme.accent.primary }}>
                        {activeVideoClip?.title || "無影片片段"}
                    </span>
                    <span className="opacity-45 tabular-nums">{activeVideoClip ? `${formatTimelineTime(activeVideoClip.startMs)} ~ ${formatTimelineTime(activeVideoClip.startMs + activeVideoClip.durationMs)}` : ""}</span>
                </div>
                <div className="mt-1.5 max-h-16 min-h-10 overflow-y-auto rounded-lg border px-2.5 py-1.5 text-xs leading-5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    {activeSubtitleClip ? activeSubtitleClip.text : <span className="opacity-40">此處無字幕，點選字幕片段後在下方編輯</span>}
                </div>
            </div>
        </div>
    );
}
