import "./canvas-media-editors.css";
import { App, Button, Dropdown, Input, InputNumber, Progress } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Tooltip } from "@/components/ui/base/tooltip";
// 二期：多軌時間線編輯彈窗。
// 資料來源是專案級 TimelineProject：影片/音訊節點自動入軌，字幕條目轉字幕片段。
// 互動：拖拽移動片段（吸附播放頭/片段邊緣）、左右邊緣裁剪、刪除、播放頭跳轉。

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { Captions, Clapperboard, FolderOpen, Library, Lock, LockOpen, Maximize2, MoreHorizontal, Music2, Plus, Scissors, Trash2, Upload, Video, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { saveOwnedOrBrowserVideoBlob } from "@/services/desktop-media-save";
import { captureUserScope } from "@/lib/user-scope-guard";

import { CanvasTimelineRuler } from "./canvas-timeline-ruler";
import { CanvasTimelinePreview } from "./canvas-timeline-preview";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { buildTimelineFromNodes, isNodeInTimeline, syncTimelineSubtitleClips } from "@/lib/timeline/timeline-build";
import { canPlaceAt, clampClipDurationByNeighbors, findNearestAvailablePlacement } from "@/lib/timeline/timeline-placement";
import { computeSnap } from "@/lib/timeline/timeline-snap";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_VIDEO_TRACK_ID, normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime, getTimelineTrackWidth, getFitTimelineZoom, zoomIn, zoomOut } from "@/lib/timeline/timeline-view";
import { exportTimelineToMp4 } from "@/lib/timeline/timeline-export";
import { getVisibleMediaClips, type TimelineRenderSource } from "@/lib/timeline/timeline-to-ffmpeg";
import type { CanvasNodeData } from "@/types/canvas";
import type { SrtEntry, TimelineClip, TimelineDirectMedia, TimelineProject } from "@/types/timeline";

const MIN_CLIP_DURATION_MS = 100;
const TRACK_ROW_HEIGHT = 52;
const SNAP_THRESHOLD_PX = 8;
const BASE_PX_PER_SECOND = 96;

type CanvasTimelineDialogProps = {
    node: CanvasNodeData;
    open: boolean;
    nodes: CanvasNodeData[];
    timeline: TimelineProject | null;
    onClose: () => void;
    onOpenSubtitleDialog?: (nodeId: string) => void;
    onSave: (timeline: TimelineProject) => void | Promise<void>;
    onSaveSubtitles: (nodeId: string, entries: SrtEntry[]) => void;
    /** 開啟專案素材庫選擇器（由頁面層接線） */
    onOpenAssetLibrary?: () => void;
    /** 開啟專案資產庫選擇器（由頁面層接線） */
    onOpenProjectAssets?: () => void;
    /** 上傳本地音影片並返回直連媒體描述（僅時間線作用域，不建立畫布節點） */
    onUploadLocalFiles: (files: File[]) => Promise<TimelineDirectMedia[]>;
    /** 頁面層持有：素材庫/上傳建立節點後，呼叫該引用把節點加入時間線草稿 */
    addNodeToTimelineRef?: MutableRefObject<((node: CanvasNodeData) => void) | null>;
    /** 頁面層持有：素材庫/專案資產直連媒體（不落畫布）入軌通道 */
    addMediaToTimelineRef?: MutableRefObject<((media: TimelineDirectMedia) => void) | null>;
    /** 把合成結果儲存為新影片節點放回畫布（頁面層接線） */
    onCreateAssembledNode: (blob: Blob, title: string) => Promise<CanvasNodeData | null>;
};

export async function runTimelineDialogSaveAttempt(save: () => Promise<void>, close: () => void) {
    try {
        await save();
        close();
        return undefined;
    } catch (error) {
        return error;
    }
}

type ClipDragMode = "move" | "trim-start" | "trim-end";

type DragState =
    | { mode: "move"; clipId: string; startClientX: number; originalStartMs: number }
    | { mode: "trim-start"; clipId: string; startClientX: number; originalStartMs: number; originalDurationMs: number; originalSourceStartMs: number }
    | { mode: "trim-end"; clipId: string; startClientX: number; originalStartMs: number; originalDurationMs: number }
    | null;

export function CanvasTimelineDialog({
    node,
    open,
    nodes,
    timeline,
    onClose,
    onOpenSubtitleDialog,
    onSave,
    onSaveSubtitles,
    onOpenAssetLibrary,
    onOpenProjectAssets,
    onUploadLocalFiles,
    addNodeToTimelineRef,
    addMediaToTimelineRef,
    onCreateAssembledNode,
}: CanvasTimelineDialogProps) {
    const { message } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const [draft, setDraft] = useState<TimelineProject>(() => buildTimelineFromNodes([]));
    const [playheadMs, setPlayheadMs] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [finalizingExport, setFinalizingExport] = useState(false);
    const finalizingExportRef = useRef(false);
    const exportControllerRef = useRef<AbortController | null>(null);
    useEffect(() => {
        if (!open) exportControllerRef.current?.abort();
        return () => exportControllerRef.current?.abort();
    }, [open]);
    const [saving, setSaving] = useState(false);
    const [exportPercent, setExportPercent] = useState(0);
    const [exportDetail, setExportDetail] = useState("");
    const dragRef = useRef<DragState>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const trackAreaRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const addGroupProbeRef = useRef<HTMLDivElement>(null);
    const moreBtnRef = useRef<HTMLSpanElement>(null);

    const initializedRef = useRef(false);

    // 開啟彈窗：優先複用專案時間線，否則從畫布節點自動構建；播放頭定位到觸發節點片段。
    // 僅首次開啟時構建草稿：素材上傳/素材庫插入會觸發 nodes 變化，不能因此重建草稿丟棄編輯。
    useEffect(() => {
        if (!open) {
            initializedRef.current = false;
            return;
        }
        if (initializedRef.current) return;
        initializedRef.current = true;
        const base = timeline ? normalizeTimelineProject(timeline) : buildTimelineFromNodes(nodes);
        const next = timeline ? syncTimelineSubtitleClips(base, nodes) : base;
        setDraft(next);
        setPlayheadMs(0);
        setZoomLevel(1);
        setSelectedClipId(null);
        setPreviewPlaying(false);
        const triggerClip = next.clips.find((clip) => clip.nodeId === node.id);
        if (triggerClip) setPlayheadMs(triggerClip.startMs);
    }, [open, node.id, nodes, timeline]);

    const pxPerMs = (BASE_PX_PER_SECOND / 1_000) * zoomLevel;
    const durationMs = Math.max(1_000, draft.durationMs);
    const [viewportWidth, setViewportWidth] = useState(900);
    const trackWidth = useMemo(() => getTimelineTrackWidth(durationMs, zoomLevel, viewportWidth), [durationMs, zoomLevel, viewportWidth]);

    useEffect(() => {
        if (!open) return;
        const measure = () => {
            setViewportWidth(trackAreaRef.current?.clientWidth || 900);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (trackAreaRef.current) observer.observe(trackAreaRef.current);
        return () => observer.disconnect();
    }, [open]);

    // 工具欄自適應：按鈕總數過多或容器變窄時，把「新增素材/上傳本地/素材庫/專案資產」收進「更多」選單，
    // 工具欄保持單行不換行；容器變寬後自動恢復內聯展示。
    // 素材組用隱藏探針測量自然寬度，展開/收起兩種形態下算出的核心區寬度一致，判定不隨當前狀態震盪。
    const [addGroupCollapsed, setAddGroupCollapsed] = useState(false);
    const toolbarObserverRef = useRef<ResizeObserver | null>(null);
    const measureToolbar = useCallback(() => {
        const el = toolbarRef.current;
        const probe = addGroupProbeRef.current;
        if (!el || !probe) return;
        const addGroupWidth = probe.offsetWidth;
        const shownAddWidth = addGroupCollapsed ? (moreBtnRef.current?.offsetWidth ?? 56) : addGroupWidth;
        const expandedWidth = el.scrollWidth - shownAddWidth + addGroupWidth;
        setAddGroupCollapsed(expandedWidth > el.clientWidth + 2);
    }, [addGroupCollapsed]);
    const ensureToolbarObserved = useCallback(() => {
        const el = toolbarRef.current;
        if (!el || toolbarObserverRef.current) return;
        const observer = new ResizeObserver(measureToolbar);
        toolbarObserverRef.current = observer;
        observer.observe(el);
        measureToolbar();
    }, [measureToolbar]);
    useEffect(() => {
        if (!open) return;
        // AntD Modal 內容經門戶延遲掛載，首次 effect 時 toolbarRef 可能為空；
        // afterOpenChange 兜底確保動畫結束後一定完成測量與觀察。
        ensureToolbarObserved();
        return () => {
            toolbarObserverRef.current?.disconnect();
            toolbarObserverRef.current = null;
        };
    }, [open, ensureToolbarObserved]);

    const applyDraft = (updater: (current: TimelineProject) => TimelineProject) => {
        setDraft((current) => {
            const next = updater(current);
            const endMs = next.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            return { ...next, durationMs: Math.max(endMs, 1_000) };
        });
    };

    const updateClip = (clipId: string, patch: Partial<TimelineClip>) => {
        applyDraft((current) => ({
            ...current,
            clips: current.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
        }));
    };

    const updateSelectedMediaNumbers = (patch: Partial<TimelineClip>) => {
        if (!selectedClipId) return;
        updateClip(selectedClipId, patch);
    };

    const moveClip = (clipId: string, candidateStartMs: number) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const snapped = snapEnabled
            ? computeSnap({
                  candidateMs: candidateStartMs,
                  playheadMs,
                  clips: draft.clips,
                  excludeClipId: clipId,
                  pxPerMs,
                  thresholdPx: SNAP_THRESHOLD_PX,
                  enabled: true,
              })
            : { snappedMs: candidateStartMs, targets: [] };
        const nextStartMs = Math.max(0, Math.round(snapped.snappedMs));
        const result = canPlaceAt({
            trackId: clip.trackId,
            startMs: nextStartMs,
            durationMs: clip.durationMs,
            excludeClipId: clipId,
            clips: draft.clips,
        });
        if (!result.ok) return;
        updateClip(clipId, { startMs: nextStartMs });
    };

    // 裁剪統一基於拖動起點快照計算，避免“當前值 + 累計 delta”造成的漂移與越界。
    const trimClipStart = (clipId: string, deltaMs: number, original: { startMs: number; durationMs: number; sourceStartMs: number }) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const rightEdgeMs = original.startMs + original.durationMs;
        // 向左延長最多到原始檔起點：時間軸起點不能早於 original.start - sourceStart。
        const minStartMs = clip.sourceStartMs === undefined ? 0 : Math.max(0, original.startMs - original.sourceStartMs);
        const newStartMs = Math.max(minStartMs, Math.min(rightEdgeMs - MIN_CLIP_DURATION_MS, original.startMs + deltaMs));
        const newDurationMs = rightEdgeMs - newStartMs;
        // 源內裁剪：sourceStart 必須落在 [0, sourceDuration - newDuration]，右緣不越源。
        const sourceDurationMs = clip.sourceDurationMs;
        let sourceStartMs = original.sourceStartMs + (newStartMs - original.startMs);
        if (sourceDurationMs !== undefined) {
            sourceStartMs = Math.max(0, Math.min(Math.max(0, sourceDurationMs - newDurationMs), sourceStartMs));
        }
        const collision = canPlaceAt({
            trackId: clip.trackId,
            startMs: newStartMs,
            durationMs: newDurationMs,
            excludeClipId: clipId,
            clips: draft.clips,
        });
        if (!collision.ok) return;
        updateClip(clipId, {
            startMs: Math.round(newStartMs),
            durationMs: Math.round(newDurationMs),
            ...(clip.sourceStartMs !== undefined ? { sourceStartMs: Math.round(sourceStartMs) } : {}),
        });
    };

    const trimClipEnd = (clipId: string, deltaMs: number, original: { startMs: number; durationMs: number }) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const maxDurationMs = clip.sourceDurationMs !== undefined && clip.sourceStartMs !== undefined ? Math.max(0, clip.sourceDurationMs - clip.sourceStartMs) : undefined;
        const maxDuration = clampClipDurationByNeighbors({
            clipId,
            startMs: original.startMs,
            requestedDurationMs: original.durationMs + deltaMs,
            trackId: clip.trackId,
            clips: draft.clips,
            maxDurationMs,
        });
        const newDurationMs = Math.max(MIN_CLIP_DURATION_MS, maxDuration);
        updateClip(clipId, { durationMs: Math.round(newDurationMs) });
    };

    const handleClipPointerDown = (event: React.PointerEvent<HTMLDivElement>, clipId: string, mode: ClipDragMode) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        setSelectedClipId(clipId);
        if (mode === "move") {
            dragRef.current = { mode, clipId, startClientX: event.clientX, originalStartMs: clip.startMs };
        } else if (mode === "trim-start") {
            dragRef.current = {
                mode,
                clipId,
                startClientX: event.clientX,
                originalStartMs: clip.startMs,
                originalDurationMs: clip.durationMs,
                originalSourceStartMs: clip.sourceStartMs || 0,
            };
        } else {
            dragRef.current = { mode, clipId, startClientX: event.clientX, originalStartMs: clip.startMs, originalDurationMs: clip.durationMs };
        }
    };

    const handleClipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (!event.isPrimary) return;
        const deltaMs = Math.round((event.clientX - drag.startClientX) / Math.max(pxPerMs, 1e-6));
        if (drag.mode === "move") {
            moveClip(drag.clipId, drag.originalStartMs + deltaMs);
        } else if (drag.mode === "trim-start") {
            trimClipStart(drag.clipId, deltaMs, {
                startMs: drag.originalStartMs,
                durationMs: drag.originalDurationMs,
                sourceStartMs: drag.originalSourceStartMs,
            });
        } else {
            trimClipEnd(drag.clipId, deltaMs, {
                startMs: drag.originalStartMs,
                durationMs: drag.originalDurationMs,
            });
        }
    };

    const handleClipPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        dragRef.current = null;
        try {
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
        } catch {
            // 指標已釋放或未捕獲時忽略
        }
    };

    const deleteSelectedClip = () => {
        if (!selectedClipId) {
            message.info("請先點選選中一個片段");
            return;
        }
        applyDraft((current) => ({
            ...current,
            clips: current.clips.filter((clip) => clip.id !== selectedClipId),
        }));
        setSelectedClipId(null);
    };

    const removeClip = (clipId: string) => {
        applyDraft((current) => ({
            ...current,
            clips: current.clips.filter((clip) => clip.id !== clipId),
        }));
        if (selectedClipId === clipId) setSelectedClipId(null);
    };

    const addNodeToTimeline = (targetNode: CanvasNodeData) => {
        const kind = targetNode.type === "video" ? "video" : targetNode.type === "audio" ? "audio" : null;
        if (!kind) return;
        const trackId = kind === "video" ? DEFAULT_VIDEO_TRACK_ID : DEFAULT_AUDIO_TRACK_ID;
        const targetTrack = draft.tracks.find((track) => track.id === trackId);
        if (!targetTrack || targetTrack.locked) {
            message.warning(kind === "video" ? "影片軌已鎖定或不存在" : "音訊軌已鎖定或不存在");
            return;
        }
        const durationMs = targetNode.metadata?.durationMs && targetNode.metadata.durationMs > 0 ? Math.round(targetNode.metadata.durationMs) : 4_000;
        const placement = findNearestAvailablePlacement({
            targetStartMs: playheadMs,
            durationMs,
            trackId,
            clips: draft.clips,
        });
        // 找不到可用空隙時（目標位置衝突且無足夠間隙）回退到軌道末尾追加，避免片段重疊破壞後續放置/匯出。
        const startMs = placement.fits ? placement.startMs : draft.clips.filter((item) => item.trackId === trackId).reduce((max, item) => Math.max(max, item.startMs + item.durationMs), 0);
        const clip: TimelineClip = {
            id: `clip-${targetNode.id}-${Date.now()}`,
            kind,
            nodeId: targetNode.id,
            trackId,
            startMs,
            durationMs,
            title: targetNode.title || (kind === "video" ? "影片片段" : "音訊片段"),
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
            ...(kind === "audio" ? { volume: 1, fadeInMs: 0, fadeOutMs: 0 } : {}),
        };
        applyDraft((current) => ({ ...current, clips: [...current.clips, clip] }));
        setSelectedClipId(clip.id);
        message.success(`已新增「${clip.title}」到時間線`);
    };

    // 把“新增節點”能力暴露給頁面層（素材庫/本地上傳建立節點後回填到草稿）。
    useEffect(() => {
        if (!addNodeToTimelineRef) return;
        addNodeToTimelineRef.current = addNodeToTimeline;
        return () => {
            addNodeToTimelineRef.current = null;
        };
    }, [addNodeToTimeline, addNodeToTimelineRef]);

    // 直連媒體（僅時間線作用域，不落畫布）：素材庫/專案資產/本地上傳直接入軌。
    const addDirectMediaToTimeline = (media: TimelineDirectMedia) => {
        const kind = media.kind === "video" ? "video" : media.kind === "audio" ? "audio" : null;
        if (!kind) {
            message.info("圖片/文本素材暫不支援直接入軌，請先在畫布中新增節點");
            return;
        }
        const trackId = kind === "video" ? DEFAULT_VIDEO_TRACK_ID : DEFAULT_AUDIO_TRACK_ID;
        const targetTrack = draft.tracks.find((track) => track.id === trackId);
        if (!targetTrack || targetTrack.locked) {
            message.warning(kind === "video" ? "影片軌已鎖定或不存在" : "音訊軌已鎖定或不存在");
            return;
        }
        const durationMs = media.durationMs && media.durationMs > 0 ? Math.round(media.durationMs) : 4_000;
        const placement = findNearestAvailablePlacement({
            targetStartMs: playheadMs,
            durationMs,
            trackId,
            clips: draft.clips,
        });
        const clip: TimelineClip = {
            id: `clip-media-${media.id}-${Date.now()}`,
            kind,
            nodeId: `timeline-media-${media.id}-${Date.now()}`,
            trackId,
            startMs: placement.startMs,
            durationMs,
            title: media.title || (kind === "video" ? "影片片段" : "音訊片段"),
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
            directMedia: media,
            ...(kind === "audio" ? { volume: 1, fadeInMs: 0, fadeOutMs: 0 } : {}),
        };
        applyDraft((current) => ({ ...current, clips: [...current.clips, clip] }));
        setSelectedClipId(clip.id);
        message.success(`已新增「${clip.title}」到時間線`);
    };

    // 把“直連媒體入軌”能力暴露給頁面層（時間線作用域插入不重複落畫布）。
    useEffect(() => {
        if (!addMediaToTimelineRef) return;
        addMediaToTimelineRef.current = addDirectMediaToTimeline;
        return () => {
            addMediaToTimelineRef.current = null;
        };
    }, [addDirectMediaToTimeline, addMediaToTimelineRef]);

    // 播放頭處分割：把影片/音訊片段切成兩段，右段源內起點整體後移，保持原始檔內容連續。
    const splitClipAtPlayhead = () => {
        const clip = draft.clips.find((item) => (item.kind === "video" || item.kind === "audio") && playheadMs > item.startMs && playheadMs < item.startMs + item.durationMs);
        if (!clip) {
            message.info("請先將播放頭移動到片段內部，再執行分割");
            return;
        }
        const cutMs = playheadMs - clip.startMs;
        if (cutMs < MIN_CLIP_DURATION_MS || clip.durationMs - cutMs < MIN_CLIP_DURATION_MS) {
            message.warning("分割點太靠近片段邊緣");
            return;
        }
        const left: TimelineClip = { ...clip, id: `${clip.id}-left-${Date.now()}`, durationMs: Math.round(cutMs) };
        const right: TimelineClip = {
            ...clip,
            id: `${clip.id}-right-${Date.now()}`,
            startMs: playheadMs,
            durationMs: Math.round(clip.durationMs - cutMs),
            sourceStartMs: (clip.sourceStartMs || 0) + Math.round(cutMs),
            sourceDurationMs: clip.sourceDurationMs !== undefined ? Math.max(0, Math.round(clip.sourceDurationMs - cutMs)) : Math.round(clip.durationMs - cutMs),
        };
        applyDraft((current) => ({ ...current, clips: [...current.clips.filter((item) => item.id !== clip.id), left, right] }));
        setSelectedClipId(left.id);
        message.success("已在播放頭處分割片段");
    };

    const handleLocalUpload = async (files: FileList | null) => {
        const list = files ? Array.from(files) : [];
        if (!list.length) return;
        const medias = await onUploadLocalFiles(list);
        for (const media of medias) addDirectMediaToTimeline(media);
    };

    const handleClose = () => {
        if (saving || finalizingExportRef.current) return;
        exportControllerRef.current?.abort();
        onClose();
    };

    const handleSave = async () => {
        if (saving) return;
        if (exportControllerRef.current) return;
        // 互通修復：時間線草稿只在開啟時初始化，期間節點字幕可能在字幕彈窗中被清空（或節點資料被外部更新）。
        // 儲存前以節點當前字幕為準做定向校準：節點字幕已為空時，剔除草稿殘留的舊字幕片段並回寫空陣列，
        // 避免「清空後重開影片節點舊字幕復活」；節點仍有字幕時保留草稿內使用者的時間線編輯（拖動/刪減/文本）。
        const clearedSubtitleNodeIds = new Set(nodes.filter((item) => (item.metadata?.subtitleEntries?.length ?? 0) === 0).map((item) => item.id));
        const base = normalizeTimelineProject({ ...draft, updatedAt: new Date().toISOString() });
        const reconciledClips = clearedSubtitleNodeIds.size ? base.clips.filter((clip) => !(clip.kind === "subtitle" && clearedSubtitleNodeIds.has(clip.nodeId))) : base.clips;
        const normalized = normalizeTimelineProject({ ...base, clips: reconciledClips });
        setSaving(true);
        const error = await runTimelineDialogSaveAttempt(async () => {
            await onSave(normalized);
            // 整合方向：時間線字幕片段與節點字幕互通。儲存時按影片節點回寫 subtitleEntries（含空陣列）。
            // 回寫集合 = 專案時間線原有字幕節點 ∪ 校準後仍有字幕片段的節點 ∪ 節點當前仍有字幕資料的節點：
            // 覆蓋“首次開啟時間線（專案尚無 timeline）時刪除字幕片段”這類 timeline 為空導致的漏回寫，
            // 保證刪除全部字幕片段後節點字幕被同步清空，重開影片節點不再顯示舊字幕。
            const previousSubtitleNodeIds = new Set((timeline?.clips || []).filter((clip) => clip.kind === "subtitle").map((clip) => clip.nodeId));
            const nextSubtitleNodeIds = new Set(normalized.clips.filter((clip) => clip.kind === "subtitle").map((clip) => clip.nodeId));
            const nodeSubtitleNodeIds = new Set(nodes.filter((item) => (item.metadata?.subtitleEntries?.length ?? 0) > 0).map((item) => item.id));
            const subtitleNodeIds = new Set([...previousSubtitleNodeIds, ...nextSubtitleNodeIds, ...nodeSubtitleNodeIds]);
            subtitleNodeIds.forEach((subNodeId) => {
                onSaveSubtitles(subNodeId, buildSubtitleEntriesForNode(subNodeId, normalized));
            });
            message.success("時間線已儲存");
        }, onClose);
        if (error) message.error(error instanceof Error ? error.message : "時間線儲存失敗，請重試");
        setSaving(false);
    };

    // 組裝匯出：把當前草稿按片段順序合成一個 MP4 Blob（匯出下載與生成新片段共用）。
    const runExport = async (): Promise<Blob> => {
        if (exportControllerRef.current) throw new Error("正在匯出，請等待當前操作完成");
        const mediaClips = getVisibleMediaClips(draft);
        if (!mediaClips.length) throw new Error("時間線沒有可渲染的媒體片段");
        const sources: TimelineRenderSource[] = [];
        for (const clip of mediaClips) {
            const sourceNode = nodes.find((item) => item.id === clip.nodeId);
            const media = clip.directMedia;
            if (sources.some((source) => source.nodeId === clip.nodeId)) continue;
            if (!sourceNode && !media) throw new Error("找不到素材：" + (clip.title || clip.nodeId));
            sources.push({
                nodeId: clip.nodeId,
                fileName: "input-" + sources.length + ".mp4",
                durationMs: clip.sourceDurationMs || clip.durationMs,
                storageKey: media ? media.storageKey : sourceNode?.metadata?.storageKey,
                url: media ? media.url || media.dataUrl || media.content : sourceNode?.metadata?.content || undefined,
            });
        }
        if (!sources.length) throw new Error("找不到素材");
        setExporting(true);
        const controller = new AbortController();
        exportControllerRef.current = controller;
        setExportPercent(0);
        setExportDetail("準備匯出");
        try {
            return await exportTimelineToMp4(normalizeTimelineProject(draft), sources, {
                signal: controller.signal,
                onProgress: ({ percent, detail }) => {
                    setExportPercent(percent);
                    setExportDetail(detail);
                },
            });
        } finally {
            if (controller.signal.aborted) throw new DOMException("匯出已取消", "AbortError");
        }
    };

    const finishExport = () => {
        exportControllerRef.current = null;
        finalizingExportRef.current = false;
        setExporting(false);
        setFinalizingExport(false);
        setExportPercent(0);
        setExportDetail("");
    };

    const handleExport = async () => {
        if (exportControllerRef.current) return;
        const expectedScope = captureUserScope();
        try {
            const blob = await runExport();
            finalizingExportRef.current = true;
            setFinalizingExport(true);
            setExportDetail("正在儲存成片");
            const saved = await saveOwnedOrBrowserVideoBlob((node.title || "成片") + ".mp4", blob, expectedScope);
            if (saved === "saved") message.success("成片匯出完成");
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) message.error(error instanceof Error ? error.message : "匯出失敗");
        } finally {
            finishExport();
        }
    };

    // 組裝能力閉環：合成結果不落地下載，而是作為新影片節點放回畫布，可繼續編輯字幕與樣式。
    const handleCreateAssembledNode = async () => {
        if (exportControllerRef.current) return;
        try {
            const blob = await runExport();
            finalizingExportRef.current = true;
            setFinalizingExport(true);
            setExportDetail("正在儲存新片段");
            const created = await onCreateAssembledNode(blob, (node.title || "成片") + "-新片段");
            if (created) message.success("已生成新影片片段並放到畫布，可繼續編輯字幕與樣式");
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) message.error(error instanceof Error ? error.message : "生成新片段失敗");
        } finally {
            finishExport();
        }
    };

    const addableNodes = nodes.filter((item) => (item.type === "video" || item.type === "audio") && Boolean(item.metadata?.content || item.metadata?.storageKey) && !isNodeInTimeline(item.id, draft));

    const selectedSubtitleClip = selectedClipId ? draft.clips.find((clip) => clip.id === selectedClipId && clip.kind === "subtitle") || null : null;
    const selectedMediaClip = selectedClipId ? draft.clips.find((clip) => clip.id === selectedClipId && (clip.kind === "video" || clip.kind === "audio")) || null : null;
    const selectedMediaRightEdgeMs = selectedMediaClip ? selectedMediaClip.startMs + selectedMediaClip.durationMs : 0;
    const selectedMediaMinStartMs = selectedMediaClip ? (selectedMediaClip.sourceStartMs ? Math.max(0, selectedMediaClip.startMs - selectedMediaClip.sourceStartMs) : 0) : 0;
    const selectedMediaMaxStartMs = selectedMediaClip ? Math.max(selectedMediaMinStartMs, selectedMediaRightEdgeMs - MIN_CLIP_DURATION_MS) : 0;
    const selectedMediaSourceDurationMs = selectedMediaClip?.sourceDurationMs;
    const selectedMediaMaxDurationMs = selectedMediaSourceDurationMs !== undefined ? Math.max(MIN_CLIP_DURATION_MS, selectedMediaSourceDurationMs) : 3_600_000;
    const selectedMediaMaxSourceStartMs = selectedMediaSourceDurationMs !== undefined ? Math.max(0, selectedMediaSourceDurationMs - (selectedMediaClip?.durationMs || 0)) : 3_600_000;
    const hasVideoClips = draft.clips.some((clip) => clip.kind === "video");

    // 時間線全域性時間 → 影片節點本地時間：以該節點影片片段起點為 0 基準重建 SrtEntry。
    // source 傳儲存時校準後的時間線（normalized）：節點字幕已清空時直接回寫空陣列，
    // 避免草稿殘留的舊字幕片段把節點上已清空的字幕重新寫回。
    const buildSubtitleEntriesForNode = (subNodeId: string, source: TimelineProject = draft): SrtEntry[] => {
        const currentNode = nodes.find((item) => item.id === subNodeId);
        if ((currentNode?.metadata?.subtitleEntries?.length ?? 0) === 0) return [];
        const videoClip = source.clips.find((clip) => clip.nodeId === subNodeId && clip.kind === "video");
        const baseMs = videoClip?.startMs ?? 0;
        return source.clips
            .filter((clip) => clip.nodeId === subNodeId && clip.kind === "subtitle" && Boolean(clip.text))
            .sort((a, b) => a.startMs - b.startMs)
            .map((clip, index) => ({
                index: index + 1,
                startMs: Math.max(0, Math.round(clip.startMs - baseMs)),
                endMs: Math.max(0, Math.round(clip.startMs + clip.durationMs - baseMs)),
                text: (clip.text || "").trim(),
            }));
    };

    const trackLabel = (trackId: string) => draft.tracks.find((track) => track.id === trackId)?.label || trackId;
    const renderTrackRow = (trackId: string, label: string) => {
        const clips = draft.clips.filter((clip) => clip.trackId === trackId).sort((a, b) => a.startMs - b.startMs);
        return (
            <div key={trackId} className="relative border-b" style={{ height: TRACK_ROW_HEIGHT, borderColor: theme.timeline.trackBorder, background: theme.timeline.trackFill }}>
                {clips.map((clip) => {
                    const isSelected = clip.id === selectedClipId;
                    const left = Math.round(clip.startMs * pxPerMs);
                    const width = Math.max(8, Math.round(clip.durationMs * pxPerMs));
                    const isSubtitle = clip.kind === "subtitle";
                    const clipFill = isSubtitle ? theme.timeline.clipSubtitle : clip.kind === "audio" ? theme.timeline.clipAudio : theme.timeline.clipVideo;
                    return (
                        <div
                            key={clip.id}
                            data-timeline-clip-id={clip.id}
                            data-timeline-clip-kind={clip.kind}
                            data-selected={isSelected}
                            data-timeline-clip-node-id={clip.nodeId}
                            className={`absolute top-1 flex h-[calc(100%-8px)] cursor-grab touch-none select-none items-center overflow-hidden rounded-md border text-xs leading-none active:cursor-grabbing`}
                            style={{
                                left,
                                width,
                                background: isSelected ? theme.accent.primary : clipFill,
                                borderColor: isSelected ? theme.timeline.clipSelectedBorder : theme.timeline.trackBorder,
                                color: isSelected ? theme.accent.onPrimary : theme.node.text,
                            }}
                            onPointerDown={(event) => handleClipPointerDown(event, clip.id, "move")}
                            onPointerMove={handleClipPointerMove}
                            onPointerUp={handleClipPointerUp}
                            onPointerCancel={handleClipPointerUp}
                            onClick={(event) => event.stopPropagation()}
                            title={`${clip.title || label} · ${formatTimelineTime(clip.startMs)}~${formatTimelineTime(clip.startMs + clip.durationMs)}`}
                        >
                            {!isSubtitle ? (
                                <div
                                    className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100"
                                    style={{ background: theme.timeline.handle }}
                                    onPointerDown={(event) => handleClipPointerDown(event, clip.id, "trim-start")}
                                />
                            ) : null}
                            <span className="pointer-events-none min-w-0 flex-1 truncate px-2">{clip.title || trackLabel(clip.trackId)}</span>
                            {!isSubtitle ? (
                                <div className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100" style={{ background: theme.timeline.handle }} onPointerDown={(event) => handleClipPointerDown(event, clip.id, "trim-end")} />
                            ) : null}
                        </div>
                    );
                })}
                <div className="pointer-events-none absolute inset-y-0" style={{ left: Math.round(playheadMs * pxPerMs), width: 2, background: theme.timeline.playhead }} />
            </div>
        );
    };

    const title = (
        <div className="flex min-w-0 items-center gap-2.5 pr-10">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                <Clapperboard className="size-4" />
            </span>
            <div className="min-w-0">
                <div className="truncate text-[var(--fs-heading-lg)] font-semibold leading-6 tracking-[-0.02em]">多軌時間線</div>
            </div>
        </div>
    );

    return (
        <AppModal
            className="canvas-timeline-dialog"
            title={title}
            open={open}
            centered
            footer={null}
            // Keep the desktop LibTV proportions while allowing the editor to
            // remain usable on narrow screens instead of rendering a clipped
            // fixed-width modal.
            width="min(1360px, calc(100vw - 32px))"
            destroyOnHidden
            onCancel={handleClose}
            afterOpenChange={(visible) => {
                if (visible) ensureToolbarObserved();
            }}
            flush
        >
            <div className="media-editor-body timeline-editor-body flex flex-col text-sm" style={{ color: theme.node.text }}>
                <div ref={toolbarRef} className="canvas-timeline-toolbar media-editor-toolbar flex flex-wrap items-center gap-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <span className="min-w-24 rounded-md border px-2 py-1 text-xs font-semibold tabular-nums" style={{ borderColor: theme.toolbar.border, background: theme.node.fill, color: theme.accent.primary }}>
                        {formatTimelineTime(playheadMs)}
                    </span>
                    <Tooltip title={snapEnabled ? "關閉吸附" : "開啟吸附"}>
                        <Button size="small" icon={<Scissors className="size-3.5" />} onClick={() => setSnapEnabled((value) => !value)}>
                            {snapEnabled ? "吸附開" : "吸附關"}
                        </Button>
                    </Tooltip>
                    <Button size="small" aria-label="縮小時間線" title="縮小時間線" icon={<ZoomOut className="size-3.5" />} onClick={() => setZoomLevel((value) => zoomOut(value))} />
                    <Button size="small" aria-label="放大時間線" title="放大時間線" icon={<ZoomIn className="size-3.5" />} onClick={() => setZoomLevel((value) => zoomIn(value))} />
                    <Button size="small" icon={<Maximize2 className="size-3.5" />} onClick={() => setZoomLevel(getFitTimelineZoom(durationMs, viewportWidth))}>
                        適應
                    </Button>
                    {addGroupCollapsed ? (
                        <Dropdown
                            trigger={["click"]}
                            placement="bottomLeft"
                            menu={{
                                items: [
                                    ...(addableNodes.length
                                        ? [
                                              {
                                                  key: "add",
                                                  label: "新增素材",
                                                  icon: <Plus className="size-3.5" />,
                                                  children: addableNodes.map((item) => ({
                                                      key: item.id,
                                                      label: (
                                                          <span className="inline-flex max-w-56 items-center gap-2 truncate">
                                                              {item.type === "video" ? <Video className="size-3.5" /> : <Music2 className="size-3.5" />}
                                                              {item.title || "未命名素材"}
                                                          </span>
                                                      ),
                                                      onClick: () => addNodeToTimeline(item),
                                                  })),
                                              },
                                          ]
                                        : []),
                                    { key: "upload", label: "上傳本地", icon: <Upload className="size-3.5" />, onClick: () => uploadInputRef.current?.click() },
                                    { key: "library", label: "素材庫", icon: <Library className="size-3.5" />, disabled: !onOpenAssetLibrary, onClick: () => onOpenAssetLibrary?.() },
                                    { key: "assets", label: "專案資產", icon: <FolderOpen className="size-3.5" />, disabled: !onOpenProjectAssets, onClick: () => onOpenProjectAssets?.() },
                                ],
                            }}
                        >
                            <span ref={moreBtnRef}>
                                <Button size="small" icon={<MoreHorizontal className="size-3.5" />}>
                                    更多
                                </Button>
                            </span>
                        </Dropdown>
                    ) : (
                        <>
                            <Dropdown
                                trigger={["click"]}
                                placement="bottomLeft"
                                disabled={!addableNodes.length}
                                menu={{
                                    items: addableNodes.map((item) => ({
                                        key: item.id,
                                        label: (
                                            <span className="inline-flex max-w-56 items-center gap-2 truncate">
                                                {item.type === "video" ? <Video className="size-3.5" /> : <Music2 className="size-3.5" />}
                                                {item.title || "未命名素材"}
                                            </span>
                                        ),
                                        onClick: () => addNodeToTimeline(item),
                                    })),
                                }}
                            >
                                <Button size="small" icon={<Plus className="size-3.5" />} disabled={!addableNodes.length}>
                                    新增素材
                                </Button>
                            </Dropdown>
                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => uploadInputRef.current?.click()}>
                                上傳本地
                            </Button>
                            <Button size="small" icon={<Library className="size-3.5" />} disabled={!onOpenAssetLibrary} onClick={() => onOpenAssetLibrary?.()}>
                                素材庫
                            </Button>
                            <Button size="small" icon={<FolderOpen className="size-3.5" />} disabled={!onOpenProjectAssets} onClick={() => onOpenProjectAssets?.()}>
                                專案資產
                            </Button>
                        </>
                    )}
                    <div ref={addGroupProbeRef} aria-hidden="true" className="invisible pointer-events-none absolute left-0 top-0 flex items-center gap-2">
                        <Dropdown trigger={["click"]} placement="bottomLeft" disabled={!addableNodes.length} menu={{ items: [] }}>
                            <Button size="small" icon={<Plus className="size-3.5" />}>
                                新增素材
                            </Button>
                        </Dropdown>
                        <Button size="small" icon={<Upload className="size-3.5" />}>
                            上傳本地
                        </Button>
                        <Button size="small" icon={<Library className="size-3.5" />}>
                            素材庫
                        </Button>
                        <Button size="small" icon={<FolderOpen className="size-3.5" />}>
                            專案資產
                        </Button>
                    </div>
                    <input
                        ref={uploadInputRef}
                        type="file"
                        accept="video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            void handleLocalUpload(event.target.files);
                            event.target.value = "";
                        }}
                    />
                    <Button size="small" icon={<Scissors className="size-3.5" />} onClick={splitClipAtPlayhead}>
                        分割
                    </Button>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedClipId} onClick={deleteSelectedClip}>
                        刪除片段
                    </Button>
                </div>

                <CanvasTimelinePreview clips={draft.clips} nodes={nodes} playheadMs={playheadMs} playing={previewPlaying} theme={theme} onTogglePlay={() => setPreviewPlaying((value) => !value)} onPlayheadChange={setPlayheadMs} />

                <div className="timeline-editor-tracks flex min-h-0 flex-1">
                    <div className="flex w-44 shrink-0 flex-col border-r" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="shrink-0 border-b" style={{ height: 32, borderColor: theme.toolbar.border }} />
                        {draft.tracks
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((track) => (
                                <div key={track.id} className="flex items-center gap-2 border-b px-3" style={{ height: TRACK_ROW_HEIGHT, borderColor: theme.toolbar.border }}>
                                    <span className="grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                                        {track.kind === "video" ? "V" : track.kind === "audio" ? "A" : "S"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs">{track.label}</span>
                                    {track.locked ? <Lock className="size-3 opacity-40" /> : <LockOpen className="size-3 opacity-40" />}
                                </div>
                            ))}
                    </div>

                    <div ref={trackAreaRef} className="thin-scrollbar min-w-0 flex-1 overflow-auto" data-canvas-no-zoom>
                        <div ref={scrollRef} style={{ width: trackWidth }} className="min-h-full">
                            <CanvasTimelineRuler
                                pxPerMs={pxPerMs}
                                durationMs={durationMs}
                                playheadMs={playheadMs}
                                width={trackWidth}
                                theme={theme}
                                onSeek={(ms) => {
                                    setPreviewPlaying(false);
                                    setPlayheadMs(ms);
                                }}
                            />
                            {draft.tracks
                                .slice()
                                .sort((a, b) => a.order - b.order)
                                .map((track) => renderTrackRow(track.id, track.label))}
                        </div>
                    </div>
                </div>

                {exporting ? (
                    <div className="border-t px-4 py-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <Progress percent={exportPercent} size="small" format={() => exportDetail} />
                        <Button
                            size="small"
                            disabled={finalizingExport}
                            onClick={() => {
                                if (!finalizingExportRef.current) exportControllerRef.current?.abort();
                            }}
                        >
                            取消匯出
                        </Button>
                    </div>
                ) : null}

                {selectedSubtitleClip ? (
                    <div className="border-t px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                            <span className="font-semibold" style={{ color: theme.accent.primary }}>
                                字幕編輯
                            </span>
                            <span className="opacity-45">修改後儲存將同步寫回對應影片節點的字幕資料</span>
                            {onOpenSubtitleDialog ? (
                                <Button size="small" className="ml-auto" icon={<Captions className="size-3.5" />} onClick={() => onOpenSubtitleDialog(selectedSubtitleClip.nodeId)}>
                                    精細編輯（SRT/高亮/樣式）
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex items-start gap-3">
                            <Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} value={selectedSubtitleClip.text || ""} placeholder="字幕文本" className="flex-1" onChange={(event) => updateClip(selectedSubtitleClip.id, { text: event.target.value })} />
                            <div className="flex shrink-0 items-center gap-1.5 text-xs">
                                <InputNumber size="small" min={0} step={100} value={selectedSubtitleClip.startMs} onChange={(startMs) => updateClip(selectedSubtitleClip.id, { startMs: startMs ?? 0 })} className="w-28" />
                                <span className="opacity-40">→</span>
                                <InputNumber
                                    size="small"
                                    min={0}
                                    step={100}
                                    value={selectedSubtitleClip.startMs + selectedSubtitleClip.durationMs}
                                    onChange={(endMs) => updateClip(selectedSubtitleClip.id, { durationMs: Math.max(MIN_CLIP_DURATION_MS, (endMs ?? 0) - selectedSubtitleClip.startMs) })}
                                    className="w-28"
                                />
                                <span className="opacity-40">毫秒</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {selectedMediaClip ? (
                    <div className="border-t px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                            <span className="font-semibold" style={{ color: theme.accent.primary }}>
                                片段編輯
                            </span>
                            <span className="min-w-0 flex-1 truncate opacity-45">{selectedMediaClip.title || trackLabel(selectedMediaClip.trackId)}</span>
                            <Button size="small" icon={<Scissors className="size-3.5" />} onClick={splitClipAtPlayhead}>
                                在播放頭分割
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                            <span className="opacity-50">起點</span>
                            <InputNumber
                                size="small"
                                min={selectedMediaMinStartMs}
                                max={selectedMediaMaxStartMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.startMs}
                                onChange={(value) => updateSelectedMediaNumbers({ startMs: Math.max(selectedMediaMinStartMs, Math.min(selectedMediaMaxStartMs, value ?? selectedMediaClip.startMs)) })}
                            />
                            <span className="opacity-50">時長</span>
                            <InputNumber
                                size="small"
                                min={MIN_CLIP_DURATION_MS}
                                max={selectedMediaMaxDurationMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.durationMs}
                                onChange={(value) => updateSelectedMediaNumbers({ durationMs: Math.max(MIN_CLIP_DURATION_MS, Math.min(selectedMediaMaxDurationMs, value ?? selectedMediaClip.durationMs)) })}
                            />
                            <span className="opacity-50">源內起點</span>
                            <InputNumber
                                size="small"
                                min={0}
                                max={selectedMediaMaxSourceStartMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.sourceStartMs ?? 0}
                                onChange={(value) => updateSelectedMediaNumbers({ sourceStartMs: Math.max(0, Math.min(selectedMediaMaxSourceStartMs, value ?? (selectedMediaClip.sourceStartMs || 0))) })}
                            />
                            <span className="opacity-50">源內結束</span>
                            <span className="tabular-nums" style={{ color: theme.accent.primary }}>
                                {formatTimelineTime((selectedMediaClip.sourceStartMs || 0) + selectedMediaClip.durationMs)}
                            </span>
                            <span className="ml-auto hidden opacity-45 sm:inline">數值微調精確裁剪，播放頭處可分割；拖拽手柄快速裁剪</span>
                        </div>
                    </div>
                ) : null}

                <div className="media-editor-footer flex flex-wrap items-center gap-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <span className="text-xs opacity-60">
                        總時長 {formatTimelineTime(durationMs)} · {draft.clips.length} 個片段 · {draft.tracks.length} 條軌道
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="small" type="primary" icon={<Clapperboard className="size-3.5" />} loading={exporting} disabled={!hasVideoClips} onClick={() => void handleExport()}>
                            匯出成片
                        </Button>
                        <Button size="small" icon={<Wand2 className="size-3.5" />} loading={exporting} disabled={!hasVideoClips} onClick={() => void handleCreateAssembledNode()}>
                            生成新片段
                        </Button>
                        <Button size="small" disabled={saving || finalizingExport} onClick={handleClose}>
                            取消
                        </Button>
                        <Button size="small" type="primary" loading={saving} disabled={saving || exporting || !draft.clips.length} onClick={() => void handleSave()}>
                            儲存
                        </Button>
                    </div>
                </div>
            </div>
        </AppModal>
    );
}
