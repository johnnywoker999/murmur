// 瀏覽器內近似預覽：真實媒體幀（storageKey → resolveMediaUrl）+ 播放頭 + 時間碼。
// 預覽只保證時序一致；最終畫面、編碼和濾鏡結果以語義計劃匯出為準。
//
// 播放模型：時間線 transport（store.transportMs）與監視器共享。
// - 本地 playbackRef 以 rAF 逐幀推進（60fps 時間碼），節流回寫 store（~80ms），
//   驅動時間線播放頭；外部 scrub（時間線標尺）經 transportMs 回推本地時鐘。
// - <video> 元素從動於時鍾：播放時 play()、暫停時 pause()、位置偏差 > 閾值才硬 seek，
//   播放速率同步 playbackRate —— 畫面與聲音由瀏覽器管線真實推進（不再純讀時間碼）。
// - 靜音跟隨所在音訊/影片軌道（muted），不再硬編碼 muted（否則"有聲音"永遠不成立）。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    Captions,
    ChevronDown,
    Download,
    Film,
    Gauge,
    Image as ImageIcon,
    LoaderCircle,
    Pause,
    Play,
    SkipBack,
    SkipForward,
    StepBack,
    StepForward,
    Type,
    Video,
    Volume2,
} from "lucide-react";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { resolveMediaUrl } from "@/services/file-storage";
import { useResourceVideoPlayback } from "@/hooks/use-resource-video-playback";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { TimelineClip, TimelineProject } from "@/types/timeline";

// 本地播放時鐘 → store.transportMs 的回寫節流（毫秒）。太密會讓時間線面板每幀重渲染。
const STORE_PUSH_INTERVAL_MS = 80;
// 外部 seek 與本地時鐘差超過該值（毫秒）視為"拖動跳轉"：先暫停再跟隨，避免播放中搶時鐘。
const SEEK_JUMP_MS = 500;
// 影片元素位置校正閾值（秒）：僅當偏差超過該值才硬 seek，避免逐幀寫 currentTime。
const VIDEO_SEEK_TOLERANCE_S = 0.35;

function getClipAtTime(project: TimelineProject, timeMs: number): TimelineClip | null {
    // 隱藏軌道（visible === false）上的片段不參與預覽合成。
    const hiddenTrackIds = new Set(project.tracks.filter((t) => t.visible === false).map((t) => t.id));
    const visible = (clip: TimelineClip) => !hiddenTrackIds.has(clip.trackId);
    return (
        project.clips.find((clip) => visible(clip) && clip.kind === "video" && clip.startMs <= timeMs && timeMs < clip.startMs + clip.durationMs) ??
        project.clips.find((clip) => visible(clip) && clip.kind === "image" && clip.startMs <= timeMs && timeMs < clip.startMs + clip.durationMs) ??
        null
    );
}

function useClipMediaUrl(clip: TimelineClip | null): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        if (!clip || clip.kind === "video") return;
        const direct = clip.directMedia;
        const source = direct?.dataUrl ?? direct?.url ?? direct?.storageKey;
        if (direct?.storageKey) {
            resolveMediaUrl(direct.storageKey, direct.url ?? "")
                .catch(() => null)
                .then((resolved) => {
                    if (!cancelled && resolved) setUrl(resolved);
                });
        } else if (source) {
            setUrl(source);
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clip?.id, clip?.kind, clip?.nodeId, clip?.directMedia?.storageKey, clip?.directMedia?.url, clip?.directMedia?.dataUrl]);
    return url;
}

/** clip 內部當前應播放的源時間（毫秒）：transport 相對 clip 起點 + 源起點偏移。 */
function clipSourceTimeMs(clip: TimelineClip, transportMs: number): number {
    return Math.max(0, transportMs - clip.startMs + (clip.sourceStartMs ?? 0));
}

function clipKindLabel(kind: TimelineClip["kind"]): string {
    switch (kind) {
        case "video":
            return "影片";
        case "image":
            return "圖片";
        case "audio":
            return "音訊";
        case "subtitle":
            return "字幕";
        case "text":
            return "文字";
    }
}

function clipDisplayTitle(clip: TimelineClip): string {
    return clip.directMedia?.title || clip.title || clip.text || clip.nodeId || clip.id;
}

function ClipKindIcon({ kind, className }: { kind: TimelineClip["kind"]; className?: string }) {
    const Icon =
        kind === "video" ? Video : kind === "image" ? ImageIcon : kind === "audio" ? Volume2 : kind === "subtitle" ? Captions : Type;
    return <Icon className={className} />;
}

export function EditorPreviewMonitor() {
    const { project, transportMs, setTransportMs } = useEditorStoreContext();
    const durationMs = project?.durationMs ?? 0;

    // 本地播放時鐘（毫秒）：逐幀重新整理本元件；播放態節流回寫 store 驅動時間線播放頭。
    const [playbackMs, setPlaybackMs] = useState(0);
    const playbackRef = useRef(0);
    const [playing, setPlaying] = useState(false);
    const playingRef = useRef(false);
    const [speed, setSpeed] = useState(1);
    const speedRef = useRef(1);
    const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
    const rafRef = useRef<number | null>(null);
    const lastTickRef = useRef<number | null>(null);
    const lastStorePushRef = useRef(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const activeClip = project ? getClipAtTime(project, playbackMs) : null;
    const activeMediaUrl = useClipMediaUrl(activeClip);
    const activeTrack = project?.tracks.find((t) => t.id === activeClip?.trackId) ?? null;

    const storageKey = activeClip?.directMedia?.storageKey || "";
    const mediaResourceId = resourceIdFromStorageKey(storageKey);
    const isVideoClip = activeClip?.kind === "video";
    const videoPlayback = useResourceVideoPlayback(storageKey,
        activeClip?.directMedia?.dataUrl || activeClip?.directMedia?.url || "", isVideoClip);
    const handleMediaError = () => {
        if (isVideoClip && !videoPlayback.requestCompatible()) videoPlayback.fail();
    };
    const videoSrc = isVideoClip ? videoPlayback.url : null;
    const imageSrc = activeClip?.kind === "image" ? activeMediaUrl : null;
    const mediaErrorHint = videoPlayback.error || (videoPlayback.loading ? "正在準備影片預覽…" : null);

    const videoMuted = activeTrack?.muted === true;

    const syncPlayback = useCallback(
        (ms: number) => {
            const t = Math.max(0, Math.min(durationMs, Math.round(ms)));
            playbackRef.current = t;
            setPlaybackMs(t);
            setTransportMs(t);
        },
        [durationMs, setTransportMs],
    );

    const stop = useCallback(() => {
        playingRef.current = false;
        setPlaying(false);
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        lastTickRef.current = null;
        lastStorePushRef.current = 0;
        const v = videoRef.current;
        if (v && !v.paused) v.pause();
        setTransportMs(playbackRef.current);
    }, [setTransportMs]);

    // 外部 transport 變化（時間線標尺 scrub / 跳轉）：回推本地時鐘；
    // 播放中大幅跳動視為拖動跳轉，先暫停避免與本地時鐘互相搶寫。
    useEffect(() => {
        if (transportMs === playbackRef.current) return;
        if (playingRef.current) {
            // 播放中收到的 transport 寫入只可能是自身節流回寫或外部 scrub；
            // 大幅跳動視為拖動/跳轉：暫停並跟隨。小幅忽略，避免本地時鐘被舊回寫值拉回（回跳）。
            if (Math.abs(transportMs - playbackRef.current) > SEEK_JUMP_MS) {
                stop();
                playbackRef.current = transportMs;
                setPlaybackMs(transportMs);
            }
            return;
        }
        playbackRef.current = transportMs;
        setPlaybackMs(transportMs);
        // stop 已是最新引用；transportMs 為唯一驅動源
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transportMs]);

    const toggle = useCallback(() => {
        if (!project || durationMs <= 0) return;
        if (playingRef.current) {
            stop();
            return;
        }
        // 停在末尾再點播放：從頭開始。
        if (playbackRef.current >= durationMs - 50) {
            playbackRef.current = 0;
            setPlaybackMs(0);
            setTransportMs(0);
        }
        playingRef.current = true;
        lastTickRef.current = null;
        setPlaying(true);
        const tick = (now: number) => {
            if (lastTickRef.current === null) lastTickRef.current = now;
            const delta = now - lastTickRef.current;
            lastTickRef.current = now;
            const next = Math.min(durationMs, Math.max(0, playbackRef.current + delta * speedRef.current));
            playbackRef.current = next;
            setPlaybackMs(next);
            if (now - lastStorePushRef.current >= STORE_PUSH_INTERVAL_MS) {
                lastStorePushRef.current = now;
                setTransportMs(next);
            }
            if (next >= durationMs) {
                stop();
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [durationMs, project, stop, setTransportMs]);

    // 專案切換/時長變化時重置播放
    useEffect(() => {
        syncPlayback(0);
        stop();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project, durationMs]);

    useEffect(() => () => stop(), [stop]);

    const stepBy = (deltaMs: number) => {
        if (!project || durationMs <= 0) return;
        syncPlayback(playbackRef.current + deltaMs);
    };

    const changeSpeed = (next: number) => {
        speedRef.current = next;
        setSpeed(next);
    };

    // —— <video> 從動驅動 ——

    const applyVideoPosition = (v: HTMLVideoElement) => {
        if (!activeClip || activeClip.kind !== "video") return;
        const targetS = clipSourceTimeMs(activeClip, playbackRef.current) / 1000;
        const maxS = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : targetS;
        const t = Math.min(targetS, maxS);
        if (Math.abs(v.currentTime - t) > VIDEO_SEEK_TOLERANCE_S) v.currentTime = t;
    };

    // 時鐘推進/外部 seek：校正影片位置（播放同速時偏差小，幾乎不觸發硬 seek）。
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !isVideoClip) return;
        if (v.readyState < HTMLMediaElement.HAVE_METADATA) return;
        applyVideoPosition(v);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playbackMs, videoSrc, activeClip?.id]);

    // 播放/暫停：真實驅動瀏覽器管線（畫面 + 聲音）。
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !isVideoClip) return;
        if (playing) {
            const p = v.play();
            if (p) p.catch(() => {
                // 瀏覽器 autoplay/格式限制：onError 已接管提示與回退。
            });
        } else if (!v.paused) {
            v.pause();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, activeClip?.id, videoSrc]);

    // 變速：同步影片播放速率，保持音畫與時鐘一致。
    useEffect(() => {
        const v = videoRef.current;
        if (v && isVideoClip) v.playbackRate = speed;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speed, videoSrc, activeClip?.id]);

    const handleLoadedMetadata = () => {
        const v = videoRef.current;
        if (!v) return;
        applyVideoPosition(v);
        if (playingRef.current) {
            const p = v.play();
            if (p) p.catch(() => {});
        }
    };

    // 源素材比片段短：video 提前播完 → 把時鐘對齊到片段結尾，讓後續片段/結束自然銜接。
    const handleVideoEnded = () => {
        if (!activeClip || activeClip.kind !== "video") return;
        const clipEndMs = activeClip.startMs + activeClip.durationMs;
        if (clipEndMs >= durationMs - 50) {
            stop();
            syncPlayback(durationMs);
        } else {
            syncPlayback(clipEndMs);
        }
    };

    // 播放條隨監視器面板寬度自適應：窄面板逐級隱藏次要資訊（先“/ 總時長”，再時間碼與速度文字/箭頭），
    // 極窄時讓整條可橫向滾動兜底；走帶按鈕始終固定尺寸，不縮小、不重疊。閾值即對應內容的最小顯示寬度。
    const transportRef = useRef<HTMLDivElement | null>(null);
    const [transportWidth, setTransportWidth] = useState(Number.POSITIVE_INFINITY);
    useLayoutEffect(() => {
        const el = transportRef.current;
        if (!el) return;
        const update = () => setTransportWidth(Math.round(el.getBoundingClientRect().width));
        update();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const compact = transportWidth < 340;
    const hideTotal = !compact && transportWidth < 440;
    const allowScroll = transportWidth < 240;

    const showEmpty = !activeClip || (!videoSrc && !imageSrc);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--director-sequencer-surface)]">
            {/* 頂部資訊條：媒體標題/後設資料常駐在畫面外的標題欄，不再懸浮遮擋畫面內容 */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {activeClip ? (
                        <>
                            <ClipKindIcon kind={activeClip.kind} className="size-3.5 shrink-0 text-[var(--director-dock-fg)]/55" />
                            <span className="truncate text-xs font-medium text-[var(--director-dock-fg-strong)]" title={clipDisplayTitle(activeClip)}>
                                {clipDisplayTitle(activeClip)}
                            </span>
                            <span className="hidden shrink-0 rounded-full bg-[var(--director-dock-active-surface)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--director-dock-fg)]/85 sm:inline-flex">
                                {clipKindLabel(activeClip.kind)}
                            </span>
                            {activeTrack && (
                                <span className="hidden shrink-0 rounded-full border border-[var(--director-sequencer-border)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--director-dock-fg)]/55 md:inline-flex">
                                    {activeTrack.label}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="truncate text-xs text-[var(--director-dock-fg)]/40">預覽監視器</span>
                    )}
                </div>
                {mediaErrorHint && (
                    <span
                        title={mediaErrorHint}
                        className="flex min-w-0 max-w-[42%] items-center gap-1.5 rounded-md bg-[var(--director-danger)]/10 px-2 py-1 text-[11px] text-[var(--director-danger)]"
                    >
                        {videoPlayback.loading ? (
                            <LoaderCircle className="size-3 shrink-0 animate-spin" />
                        ) : (
                            <AlertTriangle className="size-3 shrink-0" />
                        )}
                        <span className="truncate">{mediaErrorHint}</span>
                        {videoPlayback.error && <button type="button" onClick={videoPlayback.retry}>重新載入</button>}
                        {mediaResourceId && (
                            <a
                                href={resourceFileUrl(mediaResourceId)}
                                download
                                title="下載原片，用本地播放器觀看"
                                className="grid size-4 shrink-0 place-items-center rounded hover:bg-[var(--director-danger)]/15"
                            >
                                <Download className="size-3" />
                            </a>
                        )}
                    </span>
                )}
            </div>
            {/* 預覽畫面：恆黑舞臺，佔滿控制條以上剩餘空間（Concat 監視器風格） */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-6">
                {showEmpty ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="grid size-14 place-items-center rounded-xl bg-white/10">
                            <Film className="size-6 text-white/60" />
                        </div>
                        <div className="max-w-xs text-xs leading-relaxed text-white/70">
                            {project && project.clips.length > 0
                                ? activeClip
                                    ? "當前時間點沒有可顯示畫面（字幕或音訊片段）"
                                    : "播放頭位於空白處"
                                : "時間線暫無片段，匯入素材後在此預覽"}
                        </div>
                    </div>
                ) : isVideoClip && videoSrc ? (
                    <video
                        key={`v:${activeClip!.id}:${videoSrc}`}
                        ref={videoRef}
                        src={videoSrc}
                        muted={videoMuted}
                        playsInline
                        preload="auto"
                        className="max-h-full max-w-full rounded-md object-contain shadow-lg"
                        onError={handleMediaError}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={handleVideoEnded}
                    />
                ) : imageSrc ? (
                    <img
                        key={`i:${activeClip!.id}`}
                        src={imageSrc}
                        alt=""
                        className="max-h-full max-w-full rounded-md object-contain shadow-lg"
                        onError={handleMediaError}
                    />
                ) : null}
            </div>

            {/* 播放控制條：畫面下方的獨立一行（Concat 佈局），不懸浮疊加、無進度條；
                播放/暫停用反白塊 + 圖示形態（Play/Pause）表達狀態，圖示保持中性（無 accent 藍）。
                寬度自適應見上方 transportWidth 邏輯。 */}
            <div
                ref={transportRef}
                className={`grid h-11 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3 ${
                    allowScroll ? "overflow-x-auto [scrollbar-width:thin]" : ""
                }`}
            >
                <span className="truncate text-xs tabular-nums text-[var(--director-dock-fg)]">
                    {!compact && formatTimelineTime(playbackMs)}
                    {!compact && !hideTotal && (
                        <span className="opacity-60"> / {formatTimelineTime(durationMs)}</span>
                    )}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                    <button
                        type="button"
                        aria-label="回到開頭"
                        title="回到開頭"
                        onClick={() => syncPlayback(0)}
                        disabled={!project || durationMs <= 0}
                        className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <SkipBack className="size-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="後退 1 秒"
                        title="後退 1 秒"
                        onClick={() => stepBy(-1000)}
                        disabled={!project || durationMs <= 0}
                        className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <StepBack className="size-4" />
                    </button>
                    <button
                        type="button"
                        aria-label={playing ? "暫停" : "播放"}
                        onClick={toggle}
                        disabled={durationMs <= 0}
                        className={`grid size-7 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                            playing
                                ? "bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]"
                                : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                        }`}
                    >
                        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
                    </button>
                    <button
                        type="button"
                        aria-label="前進 1 秒"
                        title="前進 1 秒"
                        onClick={() => stepBy(1000)}
                        disabled={!project || durationMs <= 0}
                        className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <StepForward className="size-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="跳到結尾"
                        title="跳到結尾"
                        onClick={() => syncPlayback(durationMs)}
                        disabled={!project || durationMs <= 0}
                        className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-40"
                    >
                        <SkipForward className="size-4" />
                    </button>
                </div>
                <div className="relative justify-self-end">
                    <button
                        type="button"
                        aria-label="播放速度"
                        title="播放速度"
                        onClick={() => setSpeedMenuOpen((v) => !v)}
                        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                    >
                        <Gauge className="size-3.5" />
                        {!compact && <span className="tabular-nums">{speed}x</span>}
                        {!compact && (
                            <ChevronDown className={`size-3 transition-transform ${speedMenuOpen ? "rotate-180" : ""}`} />
                        )}
                    </button>
                    {speedMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setSpeedMenuOpen(false)} />
                            <div className="absolute bottom-full right-0 z-50 mb-1 w-24 overflow-hidden rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] py-1 shadow-xl">
                                {[0.5, 1, 1.5, 2].map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => {
                                            changeSpeed(s);
                                            setSpeedMenuOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[var(--director-control-hover)] ${
                                            s === speed ? "text-[var(--director-dock-fg-strong)]" : "text-[var(--director-dock-fg)]"
                                        }`}
                                    >
                                        <span>{s}x</span>
                                        {s === speed && <span className="opacity-60">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
