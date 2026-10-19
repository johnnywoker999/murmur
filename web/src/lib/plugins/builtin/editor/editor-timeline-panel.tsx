// 渲染鏈路：store.project（當前命令狀態）→ 軌道/片段絕對定位 → 拖拽手勢
// （moveClip / trimClip）經 previewGesture 逐幀預覽、commitGesture 一次性入歷史。
// 手勢數學與渲染同源（同一 pxPerMs），保證拖拽所見即所得。
// 撤銷、重做和儲存由編輯器宿主統一處理，本面板只負責時間線互動和可視狀態。

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Film, Magnet, Maximize, MousePointer2, Music2, Plus, Scissors, Slice, Subtitles, Trash2, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import {
    formatTimelineTime,
    getFitTimelineZoom,
    getRulerTickStep,
    getTimelinePxPerMs,
    getTimelineVisualEndMs,
    zoomIn,
    zoomOut,
} from "@/lib/timeline/timeline-view";
import { getAudioTracks, getSubtitleTracks, getVisualTracks } from "@/lib/timeline/timeline-tracks";
import { TRACK_KIND_BASE_LABELS } from "@/lib/timeline/editor-commands";
import { computeSnap } from "@/lib/timeline/timeline-snap";
import type { TimelineClip, TimelineProject, TimelineTrack, TimelineTrackKind } from "@/types/timeline";

const MIN_VISUAL_END_MS = 1_000;
const SNAP_MS = 10;
const TRIM_HANDLE_PX = 8;
// 軌道標籤列寬度（w-48）：軌道徽標 + 軌道名 + 可見/靜音/移除按鈕。
// 時間線內容寬度必須補上該列，否則片段區 flex-1 只到
// trackWidth - 192，末端片段被 overflow-hidden 裁掉且無法滾動到達。
const LABEL_COLUMN_PX = 192;
// 剃刀/播放頭分割兩側的最小保留時長（毫秒），避免切出空片段。
const MIN_SPLIT_MS = 100;

// 不可移除軌道的原因文案（title 懸停與點選提示共用，單一來源）。
const trackRemoveBlockedReason = (kind: TimelineTrack["kind"]) => `${TRACK_KIND_BASE_LABELS[kind]}軌道至少保留一條，無法移除`;

// 工具條按鈕顏色角色（唯一來源，各按鈕內不得重複字面量顏色）：
// 常態 = 次級前景 + hover 弱背景；選中/按下 = 反白塊 + 強前景（中性，無 accent 藍圖示）。
const TOOL_FG_IDLE = "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]";
const TOOL_FG_ACTIVE = "bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]";

type GestureMode = "move" | "trim-start" | "trim-end" | null;

// 工具模式隻影響指標手勢解釋；時間線資料修改仍必須通過命令分發。
type TimelineTool = "select" | "razor";

type GestureState = {
    mode: Exclude<GestureMode, null>;
    pointerId: number;
    startClientX: number;
    originStartMs: number;
    originDurationMs: number;
    originSourceStartMs: number;
};


export function EditorTimelinePanel() {
    const { project, dispatch, previewGesture, commitGesture, cancelGesture, selectedClipId, selectClip, transportMs, setTransportMs } =
        useEditorStoreContext();

    const containerRef = useRef<HTMLDivElement>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [activeTool, setActiveTool] = useState<TimelineTool>("select");
    // 播放頭與監視器共享同一 transport（store）：拖動標尺即時驅動監視器 seek，播放時監視器回寫推進。
    const playheadMs = transportMs;
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    // 點選不可移除軌道 X 時的原因提示（2.2s 後自動消失）。
    const [removeBlockedHint, setRemoveBlockedHint] = useState<{ id: number; text: string } | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setViewportWidth(el.clientWidth);
        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if (width) setViewportWidth(width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!removeBlockedHint) return;
        const timer = window.setTimeout(() => setRemoveBlockedHint(null), 2200);
        return () => window.clearTimeout(timer);
    }, [removeBlockedHint]);

    if (!project) return <div className="flex h-full items-center justify-center text-sm text-[var(--director-dock-fg)]">時間線未載入</div>;

    const visualEndMs = Math.max(MIN_VISUAL_END_MS, getTimelineVisualEndMs(project.clips));
    // 畫素/毫秒由縮放級別獨立決定（不隨時長漂移）：拖動片段時軌道隨內容等比擴充套件，
    // 手勢對映與渲染同源，末片段向右拖不再被舊實現（trackWidth 隨時長階梯跳變）釘住。
    const pxPerMs = getTimelinePxPerMs(zoomLevel);
    const trackWidth = Math.max(viewportWidth, Math.ceil(visualEndMs * pxPerMs));
    // 內容寬度 = 邏輯軌道寬度 + 標籤列；標籤列 sticky 固定後，滾動到最右端時
    // 末端片段仍完整可見（flex-1 片段區 = 內容寬度 - 標籤列 ≥ 軌道寬度）。
    const contentWidth = Math.max(viewportWidth, trackWidth + LABEL_COLUMN_PX);

    const visualTracks = getVisualTracks(project.tracks);
    const audioTracks = getAudioTracks(project.tracks);
    const subtitleTracks = getSubtitleTracks(project.tracks);
    const clipAtPlayhead =
        project.clips.find(
            (clip) =>
                clip.kind !== "subtitle" &&
                clip.startMs + MIN_SPLIT_MS <= playheadMs &&
                playheadMs <= clip.startMs + clip.durationMs - MIN_SPLIT_MS,
        ) ?? null;
    const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;

    const handleSplitAtPlayhead = () => {
        if (!clipAtPlayhead) return;
        dispatch({ op: "splitClip", payload: { id: clipAtPlayhead.id, splitAtMs: playheadMs } });
    };
    const handleDeleteSelected = () => {
        if (!selectedClip) return;
        dispatch({ op: "removeClip", payload: { id: selectedClip.id } });
        selectClip(null);
    };
    const handleScrub = (ms: number) => {
        setTransportMs(Math.max(0, Math.min(visualEndMs, Math.round(ms))));
    };
    const handleFitWidth = () => {
        const availViewport = Math.max(320, viewportWidth - LABEL_COLUMN_PX);
        setZoomLevel(getFitTimelineZoom(visualEndMs, availViewport));
    };
    const handleAddTrack = (kind: TimelineTrackKind) => {
        setAddMenuOpen(false);
        dispatch({ op: "addTrack", payload: { kind } });
    };
    const handleRemoveTrack = (trackId: string) => {
        dispatch({ op: "removeTrack", payload: { trackId } });
        // 選中片段若落在被刪軌道上，需同步清空，否則留下懸掛選中態。
        if (selectedClipId) {
            const clip = project.clips.find((c) => c.id === selectedClipId);
            if (clip && clip.trackId === trackId) selectClip(null);
        }
    };
    const handleToggleTrackFlag = (trackId: string, flag: "visible" | "muted", value: boolean) => {
        dispatch({ op: "setTrackFlag", payload: { trackId, flag, value } });
    };

    const handleRemoveTrackBlocked = (kind: TimelineTrack["kind"]) => {
        setRemoveBlockedHint({ id: Date.now(), text: trackRemoveBlockedReason(kind) });
    };

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-[var(--director-sequencer-surface)]">
            {/* 工具條：左側編輯工具，右側縮放/時碼（撤銷/重做在宿主頂欄） */}
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3">
                {/* 工具模式：選擇 / 剃刀 */}
                <div className="flex items-center gap-0.5 rounded-md bg-[var(--director-control-hover)] p-0.5">
                    <button
                        type="button"
                        aria-label="選擇工具"
                        aria-pressed={activeTool === "select"}
                        title="選擇工具"
                        onClick={() => setActiveTool("select")}
                        className={`grid size-6 place-items-center rounded-[6px] transition-colors ${
                            activeTool === "select" ? TOOL_FG_ACTIVE : TOOL_FG_IDLE
                        }`}
                    >
                        <MousePointer2 className="size-4" />
                    </button>
                    <button
                        type="button"
                        aria-label="剃刀工具"
                        aria-pressed={activeTool === "razor"}
                        title="剃刀工具：點選片段在遊標處分割"
                        onClick={() => setActiveTool((tool) => (tool === "razor" ? "select" : "razor"))}
                        className={`grid size-6 place-items-center rounded-[6px] transition-colors ${
                            activeTool === "razor" ? TOOL_FG_ACTIVE : TOOL_FG_IDLE
                        }`}
                    >
                        <Slice className="size-4" />
                    </button>
                </div>
                <div className="mx-1 h-5 w-px bg-[var(--director-sequencer-border)]" />
                {/* 在播放頭分割當前片段 */}
                <button
                    type="button"
                    aria-label="在播放頭分割"
                    disabled={!clipAtPlayhead}
                    title="在播放頭分割片段"
                    onClick={handleSplitAtPlayhead}
                    className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                    <Scissors className="size-4" />
                </button>
                {/* 刪除選中片段 */}
                <button
                    type="button"
                    aria-label="刪除選中片段"
                    disabled={!selectedClip}
                    title="刪除選中片段"
                    onClick={handleDeleteSelected}
                    className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                    <Trash2 className="size-4" />
                </button>
                <div className="mx-1 h-5 w-px bg-[var(--director-sequencer-border)]" />
                {/* 吸附開關 */}
                <button
                    type="button"
                    aria-label="吸附"
                    aria-pressed={snapEnabled}
                    title="吸附（拖動與時間刻度對齊）"
                    onClick={() => setSnapEnabled((v) => !v)}
                    className={`grid size-7 place-items-center rounded-md transition-colors ${
                        snapEnabled ? TOOL_FG_ACTIVE : TOOL_FG_IDLE
                    }`}
                >
                    <Magnet className="size-4" />
                </button>
                {/* 新增軌道 */}
                <div className="relative">
                    <button
                        type="button"
                        aria-label="新增軌道"
                        aria-expanded={addMenuOpen}
                        title="新增軌道"
                        onClick={() => setAddMenuOpen((v) => !v)}
                        className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE}`}
                    >
                        <Plus className="size-4" />
                    </button>
                    {addMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                            <div className="absolute left-0 top-8 z-50 min-w-32 overflow-hidden rounded-lg border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] py-1 shadow-xl">
                                <button
                                    type="button"
                                    onClick={() => handleAddTrack("video")}
                                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${TOOL_FG_IDLE}`}
                                >
                                    <Film className="size-3.5" />
                                    影片軌道
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAddTrack("audio")}
                                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${TOOL_FG_IDLE}`}
                                >
                                    <Music2 className="size-3.5" />
                                    音訊軌道
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAddTrack("subtitle")}
                                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${TOOL_FG_IDLE}`}
                                >
                                    <Subtitles className="size-3.5" />
                                    字幕軌道
                                </button>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex-1" />
                {/* 播放頭時碼 */}
                <span className="w-16 text-right text-xs tabular-nums text-[var(--director-dock-fg)]">{formatTimelineTime(playheadMs)}</span>
                <span className="text-xs tabular-nums text-[var(--director-dock-fg)]">片段 {project.clips.length}</span>
                <div className="mx-1 h-5 w-px bg-[var(--director-sequencer-border)]" />
                {/* 適應寬度 */}
                <button
                    type="button"
                    aria-label="適應寬度"
                    title="適應寬度"
                    onClick={handleFitWidth}
                    className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE}`}
                >
                    <Maximize className="size-4" />
                </button>
                <button
                    type="button"
                    aria-label="縮小時間線"
                    title="縮小時間線"
                    onClick={() => setZoomLevel((z) => zoomOut(z))}
                    className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE}`}
                >
                    <ZoomOut className="size-4" />
                </button>
                <span className="w-10 text-center text-xs tabular-nums text-[var(--director-dock-fg)]">{Math.round(zoomLevel * 100)}%</span>
                <button
                    type="button"
                    aria-label="放大時間線"
                    title="放大時間線"
                    onClick={() => setZoomLevel((z) => zoomIn(z))}
                    className={`grid size-7 place-items-center rounded-md ${TOOL_FG_IDLE}`}
                >
                    <ZoomIn className="size-4" />
                </button>
            </div>

            {/* 時間線主體 */}
            <div ref={containerRef} className="director-scroll min-h-0 flex-1 overflow-auto bg-[var(--director-sequencer-surface)]" data-canvas-no-zoom>
                {project.clips.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--director-dock-fg)]">
                        <Scissors className="size-8" />
                        <p className="text-sm">從素材庫加入素材後即可開始剪輯</p>
                    </div>
                ) : (
                    <div className="relative min-w-full" style={{ width: contentWidth }}>
                        <TimelineRuler
                            pxPerMs={pxPerMs}
                            endMs={visualEndMs}
                            playheadMs={playheadMs}
                            snapEnabled={snapEnabled}
                            onScrub={handleScrub}
                        />
                        {[
                            { label: "視覺軌道", tracks: visualTracks },
                            { label: "音訊軌道", tracks: audioTracks },
                            { label: "字幕軌道", tracks: subtitleTracks },
                        ]
                            .filter((group) => group.tracks.length > 0)
                            .map((group) => (
                                <div key={group.label}>
                                    {group.tracks.map((track) => (
                                        <TrackRow
                                            key={track.id}
                                            track={track}
                                            project={project}
                                            pxPerMs={pxPerMs}
                                            onGesture={previewGesture}
                                            onCommit={commitGesture}
                                            onCancel={cancelGesture}
                                            selectedClipId={selectedClipId}
                                            razorActive={activeTool === "razor"}
                                            snapEnabled={snapEnabled}
                                            playheadMs={playheadMs}
                                            onSelectClip={selectClip}

                                            removable={project.tracks.filter((t) => t.kind === track.kind).length > 1}
                                             onRemoveTrack={handleRemoveTrack}
                                             onRemoveBlocked={handleRemoveTrackBlocked}
                                            onToggleTrackFlag={handleToggleTrackFlag}
                                            onSplitClip={(clipId, splitAtMs) =>
                                                dispatch({ op: "splitClip", payload: { id: clipId, splitAtMs } })
                                            }
                                        />
                                    ))}
                                </div>
                            ))}

                        {/* 播放頭：貫穿標尺與全部軌道，與標尺拖動同源（視覺/音訊/字幕均覆蓋） */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 z-[14] w-px bg-[var(--director-danger)]"
                            style={{ left: LABEL_COLUMN_PX + playheadMs * pxPerMs }}
                        >
                            <div className="absolute -left-[5px] top-0 size-2.5 rotate-45 rounded-[2px] bg-[var(--director-danger)]" />
                        </div>
                    </div>
                )}

            {/* 點選不可移除軌道 X 時的原因提示（短暫居中浮現，不攔截互動） */}
            {removeBlockedHint && (
                <div
                    key={removeBlockedHint.id}
                    role="status"
                    aria-live="polite"
                    className="pointer-events-none absolute left-1/2 top-12 z-50 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3 py-1.5 text-xs text-[var(--director-dock-fg-strong)] shadow-lg"
                >
                    {removeBlockedHint.text}
                </div>
            )}
            </div>
        </div>
    );
}

function TimelineRuler({
    pxPerMs,
    endMs,
    playheadMs,
    snapEnabled,
    onScrub,
}: {
    pxPerMs: number;
    endMs: number;
    playheadMs: number;
    snapEnabled: boolean;
    onScrub: (ms: number) => void;
}) {
    const step = getRulerTickStep(pxPerMs);
    const ticks: number[] = [];
    for (let t = 0; t <= endMs; t += step) ticks.push(t);
    const areaRef = useRef<HTMLDivElement | null>(null);
    const dragPointerRef = useRef<number | null>(null);
    const moveTo = (clientX: number) => {
        const rect = areaRef.current!.getBoundingClientRect();
        let ms = (clientX - rect.left) / pxPerMs;
        if (snapEnabled) ms = Math.round(ms / SNAP_MS) * SNAP_MS;
        onScrub(ms);
    };
    return (
        <div className="sticky top-0 z-10 flex h-6 shrink-0 w-full items-end border-b border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)]">
            {/* 左側空白列與軌道標籤列同寬，保證 0ms 刻度和片段繪製區域使用同一座標原點。 */}
            <div className="sticky left-0 z-10 w-48 shrink-0 self-stretch border-r border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)]">
                {/* 當前播放頭時碼，跟隨拖動即時重新整理 */}
                <span className="absolute bottom-1 right-2 text-[10px] tabular-nums text-[var(--director-danger)]">{formatTimelineTime(playheadMs)}</span>
            </div>
            <div
                ref={areaRef}
                role="slider"
                aria-label="播放頭"
                aria-valuemin={0}
                aria-valuemax={Math.round(endMs)}
                aria-valuenow={Math.round(playheadMs)}
                aria-orientation="horizontal"
                className="relative h-full flex-1 cursor-col-resize select-none touch-none"
                onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    dragPointerRef.current = e.pointerId;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    moveTo(e.clientX);
                }}
                onPointerMove={(e) => {
                    if (dragPointerRef.current === e.pointerId) moveTo(e.clientX);
                }}
                onPointerUp={() => {
                    dragPointerRef.current = null;
                }}
                onPointerCancel={() => {
                    dragPointerRef.current = null;
                }}
            >
                {ticks.map((t) => (
                    <div key={t} className="absolute bottom-0" style={{ left: t * pxPerMs - 1 }}>
                        <div className="h-2 w-px bg-[var(--director-sequencer-muted)]" />
                        <span className="absolute bottom-2.5 left-1 whitespace-nowrap text-[10px] tabular-nums text-[var(--director-dock-fg)]">{formatTimelineTime(t)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TrackRow({
    track,
    project,
    pxPerMs,
    onGesture,
    onCommit,
    onCancel,
    selectedClipId,
    onSelectClip,
    razorActive,
    snapEnabled,
    playheadMs,
    onSplitClip,
    removable,
    onRemoveTrack,
    onRemoveBlocked,
    onToggleTrackFlag,
}: {
    track: TimelineTrack;
    project: TimelineProject;
    pxPerMs: number;
    onGesture: (cmd: { op: string; payload: unknown }) => void;
    onCommit: () => void;
    onCancel: () => void;
    selectedClipId: string | null;
    onSelectClip: (id: string | null) => void;
    razorActive: boolean;
    snapEnabled: boolean;
    playheadMs: number;
    onSplitClip: (clipId: string, splitAtMs: number) => void;
    removable: boolean;
    onRemoveTrack: (trackId: string) => void;
    onRemoveBlocked: (kind: TimelineTrack["kind"]) => void;
    onToggleTrackFlag: (trackId: string, flag: "visible" | "muted", value: boolean) => void;
}) {
    const clips = project.clips.filter((c) => c.trackId === track.id);
    return (
        <div className="group flex h-16 border-b border-[var(--director-sequencer-border)]">
            <div className="sticky left-0 z-10 flex w-48 shrink-0 items-center gap-1 border-r border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-2">
                <TrackBadge kind={track.kind} />
                <div className="min-w-0 flex-1">
                    <div
                        className={`truncate text-xs font-medium ${
                            track.visible === false
                                ? "text-[var(--director-dock-fg)]"
                                : "text-[var(--director-dock-fg-strong)]"
                        }`}
                    >
                        {track.label}
                    </div>
                    <div className="text-[10px] text-[var(--director-dock-fg)]">{clips.length} 個片段</div>
                </div>
                <button
                    type="button"
                    aria-label={track.visible === false ? "顯示軌道" : "隱藏軌道"}
                    title={track.visible === false ? "顯示軌道" : "隱藏軌道"}
                    aria-pressed={track.visible === false}
                    onClick={() => onToggleTrackFlag(track.id, "visible", track.visible === false)}
                    className={`grid size-6 shrink-0 place-items-center rounded-md transition-colors ${
                        track.visible === false
                            ? "bg-[var(--director-control-hover)] text-[var(--director-dock-fg-strong)]"
                            : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                    }`}
                >
                    {track.visible === false ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                    type="button"
                    aria-label={track.muted ? "取消靜音" : "靜音軌道"}
                    title={track.muted ? "取消靜音" : "靜音軌道"}
                    aria-pressed={track.muted === true}
                    onClick={() => onToggleTrackFlag(track.id, "muted", !track.muted)}
                    className={`grid size-6 shrink-0 place-items-center rounded-md transition-colors ${
                        track.muted === true
                            ? "bg-[var(--director-control-hover)] text-[var(--director-dock-fg-strong)]"
                            : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                    }`}
                >
                    {track.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </button>
                <button
                    type="button"
                    aria-label={`移除軌道 ${track.label}`}
                    title={removable ? "移除軌道" : trackRemoveBlockedReason(track.kind)}
                    onClick={() => (removable ? onRemoveTrack(track.id) : onRemoveBlocked(track.kind))}
                    className={`grid size-6 shrink-0 place-items-center rounded-md transition-opacity ${
                        removable
                            ? "text-[var(--director-dock-fg)] opacity-0 hover:bg-[var(--director-control-hover)] hover:text-[var(--director-danger)] focus-visible:opacity-100 group-hover:opacity-100"
                            : "cursor-not-allowed text-[var(--director-dock-fg)] opacity-40 hover:bg-[var(--director-control-hover)] hover:opacity-100 focus-visible:opacity-100"
                    }`}
                >
                    <X className="size-3.5" />
                </button>
            </div>
            <div
                className={`relative flex-1 overflow-hidden bg-[var(--director-sequencer-grid)] transition-opacity ${
                    razorActive ? "cursor-crosshair" : ""
                } ${track.visible === false ? "opacity-40" : ""}`}
                onPointerDown={(e) => {
                    if (razorActive) return;
                    if (e.target === e.currentTarget) onSelectClip(null);
                }}
            >
                {clips.map((clip) => (
                    <ClipItem
                        key={clip.id}
                        clip={clip}
                        pxPerMs={pxPerMs}
                        onGesture={onGesture}
                        onCommit={onCommit}
                        onCancel={onCancel}
                        selected={selectedClipId === clip.id}
                        onSelectClip={onSelectClip}
                        razorActive={razorActive}
                        snapEnabled={snapEnabled}
                        playheadMs={playheadMs}
                        clips={project.clips}
                        onSplitClip={onSplitClip}
                    />
                ))}
            </div>
        </div>
    );
}

function TrackBadge({ kind }: { kind: TimelineTrack["kind"] }) {
    const cls =
        kind === "video" || kind === "image"
            ? "text-[var(--director-dock-fg)]"
            : kind === "audio"
              ? "text-[var(--director-success)]"
              : "text-[var(--director-warning)]";
    return (
        <div className={`grid size-6 shrink-0 place-items-center rounded-md bg-[var(--director-dock-active-surface)] ${cls}`} title={kind}>
            {kind === "subtitle" ? <Subtitles className="size-3.5" /> : kind === "audio" ? <Music2 className="size-3.5" /> : <Film className="size-3.5" />}
        </div>
    );
}

function ClipItem({
    clip,
    pxPerMs,
    onGesture,
    onCommit,
    onCancel,
    selected,
    onSelectClip,
    razorActive,
    snapEnabled,
    playheadMs,
    clips,
    onSplitClip,
}: {
    clip: TimelineClip;
    pxPerMs: number;
    onGesture: (cmd: { op: string; payload: unknown }) => void;
    onCommit: () => void;
    onCancel: () => void;
    selected: boolean;
    onSelectClip: (id: string | null) => void;
    razorActive: boolean;
    snapEnabled: boolean;
    playheadMs: number;
    clips: TimelineClip[];
    onSplitClip: (clipId: string, splitAtMs: number) => void;
}) {
    const gestureRef = useRef<GestureState | null>(null);

    const beginGesture = (e: React.PointerEvent, mode: Exclude<GestureMode, null>) => {
        if (gestureRef.current) return;
        onSelectClip(clip.id);
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        gestureRef.current = {
            mode,
            pointerId: e.pointerId,
            startClientX: e.clientX,
            originStartMs: clip.startMs,
            originDurationMs: clip.durationMs,
            originSourceStartMs: clip.sourceStartMs ?? 0,
        };
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const g = gestureRef.current;
        if (!g || e.pointerId !== g.pointerId) return;
        const deltaMs = (e.clientX - g.startClientX) / pxPerMs;

        if (g.mode === "move") {
            const candidateMs = Math.max(0, g.originStartMs + deltaMs);
            // 移動吸附：候選左邊緣吸附到其他片段邊緣/播放頭；右邊緣吸附則通過“目標邊緣-自身時長”換算回起始點，取偏移更小者
            const leftSnap = computeSnap({
                candidateMs,
                playheadMs,
                clips,
                excludeClipId: clip.id,
                pxPerMs,
                thresholdPx: 8,
                enabled: snapEnabled,
            });
            const rightSnap = computeSnap({
                candidateMs: candidateMs + clip.durationMs,
                playheadMs,
                clips,
                excludeClipId: clip.id,
                pxPerMs,
                thresholdPx: 8,
                enabled: snapEnabled,
            });
            // computeSnap 未命中時返回 { snappedMs: candidateMs, targets: [] }：
            // 只有 targets 非空才算“命中”。若某側未命中而其距離為 0（候選值不變），
            // 直接與另一側命中距離比較會把真正命中的一側丟棄（0 永遠最小）。
            const leftHit = leftSnap.targets.length > 0;
            const rightHit = rightSnap.targets.length > 0;
            let snappedMs = candidateMs;
            if (leftHit && rightHit) {
                const rightAltStartMs = rightSnap.snappedMs - clip.durationMs;
                snappedMs =
                    Math.abs(rightAltStartMs - candidateMs) < Math.abs(leftSnap.snappedMs - candidateMs)
                        ? Math.max(0, rightAltStartMs)
                        : leftSnap.snappedMs;
            } else if (leftHit) {
                snappedMs = leftSnap.snappedMs;
            } else if (rightHit) {
                snappedMs = Math.max(0, rightSnap.snappedMs - clip.durationMs);
            }
            onGesture({ op: "moveClip", payload: { id: clip.id, startMs: snappedMs } });
        } else if (g.mode === "trim-end") {
            const sourceDuration = clip.sourceDurationMs ?? 0;
            const newRightEdge = g.originStartMs + g.originDurationMs + deltaMs;
            const { snappedMs } = computeSnap({
                candidateMs: newRightEdge,
                playheadMs,
                clips,
                excludeClipId: clip.id,
                pxPerMs,
                thresholdPx: 8,
                enabled: snapEnabled,
            });
            let newDurationMs = Math.max(SNAP_MS, snappedMs - g.originStartMs);
            if (sourceDuration > 0) newDurationMs = Math.min(newDurationMs, sourceDuration - g.originSourceStartMs);
            onGesture({ op: "trimClip", payload: { id: clip.id, durationMs: newDurationMs } });
        } else {
            // trim-start：右端保持不動，起始點前移，源起點同步前移
            const sourceDuration = clip.sourceDurationMs ?? 0;
            const rightEdge = g.originStartMs + g.originDurationMs;
            const candidateMs = Math.max(0, Math.min(g.originStartMs + deltaMs, rightEdge - SNAP_MS));
            const { snappedMs } = computeSnap({
                candidateMs,
                playheadMs,
                clips,
                excludeClipId: clip.id,
                pxPerMs,
                thresholdPx: 8,
                enabled: snapEnabled,
            });
            const newStartMs = Math.max(0, Math.min(snappedMs, rightEdge - SNAP_MS));
            let newSourceStartMs = g.originSourceStartMs + (newStartMs - g.originStartMs);
            if (sourceDuration > 0) newSourceStartMs = Math.min(newSourceStartMs, sourceDuration - SNAP_MS);
            onGesture({
                op: "trimClip",
                payload: { id: clip.id, startMs: newStartMs, durationMs: rightEdge - newStartMs, sourceStartMs: Math.max(0, newSourceStartMs) },
            });
        }
    };

    const endGesture = (e: React.PointerEvent) => {
        const g = gestureRef.current;
        if (!g || e.pointerId !== g.pointerId) return;
        gestureRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // pointer capture 可能已被隱式釋放
        }
        onCommit();
    };

    const isSubtitle = clip.kind === "subtitle";
    const isAudio = clip.kind === "audio";
    const left = clip.startMs * pxPerMs;
    const width = clip.durationMs * pxPerMs;
    const label = clip.text || clip.nodeId || clip.id;
    const playheadInside = playheadMs >= clip.startMs && playheadMs <= clip.startMs + clip.durationMs;

    const razorSplitAt = (e: React.PointerEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const atMs = clip.startMs + (e.clientX - rect.left) / pxPerMs;
        const splitMs = Math.round(atMs);
        if (splitMs - clip.startMs < MIN_SPLIT_MS || clip.startMs + clip.durationMs - splitMs < MIN_SPLIT_MS) return;
        onSplitClip(clip.id, splitMs);
    };

    return (
        <div
            className={`group absolute top-1.5 bottom-1.5 select-none rounded-md border text-xs shadow-sm ${
                selected
                    ? "border-[var(--director-accent)] ring-1 ring-[var(--director-accent)]/60 bg-[var(--director-accent)]/25 text-[var(--director-dock-fg-strong)]"
                    : isSubtitle
                      ? "border-[var(--director-warning)]/40 bg-[var(--director-warning)]/15 text-[var(--director-warning)]"
                      : isAudio
                        ? "border-[var(--director-success)]/40 bg-[var(--director-success)]/15 text-[var(--director-success)]"
                        : "border-[var(--director-sequencer-border)] bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]"
            }`}
            style={{ left, width, touchAction: "none" }}
            title={`${label} · ${formatTimelineTime(clip.startMs)} +${formatTimelineTime(clip.durationMs)}`}
            onPointerDown={(e) => {
                // 剃刀模式（字幕除外）：單擊即在遊標處分割；否則開始移動手勢
                if (razorActive && !isSubtitle) {
                    razorSplitAt(e);
                    return;
                }
                beginGesture(e, "move");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
        >
            <div
                className="absolute inset-y-0 left-0 cursor-ew-resize rounded-l-md"
                style={{ width: TRIM_HANDLE_PX }}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    beginGesture(e, "trim-start");
                }}
            />
            <div className="pointer-events-none flex h-full items-center gap-1 px-2">
                <span className="truncate">{label}</span>
            </div>
            {/* 播放頭經過片段時的對齊標線（razor/對齊視覺輔助） */}
            {playheadInside && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-[var(--director-danger)]/60"
                    style={{ left: (playheadMs - clip.startMs) * pxPerMs }}
                />
            )}
            <div
                className="absolute inset-y-0 right-0 cursor-ew-resize rounded-r-md"
                style={{ width: TRIM_HANDLE_PX }}
                onPointerDown={(e) => {
                    e.stopPropagation();
                    beginGesture(e, "trim-end");
                }}
            />
        </div>
    );
}
