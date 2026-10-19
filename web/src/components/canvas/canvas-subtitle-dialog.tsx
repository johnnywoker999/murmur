import "./canvas-media-editors.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, ColorPicker, Dropdown, Input, InputNumber, Progress, Segmented } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Switch } from "@/components/ui/base/switch";
import { Captions, FileDown, FileUp, ListPlus, LoaderCircle, Plus, Scissors, Sparkles, Trash2 } from "lucide-react";
import { reportOwnedMediaSave, saveOwnedOrBrowserBlob } from "@/services/desktop-media-save";

import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { resolveMediaUrl } from "@/services/file-storage";
import { cacheResourceObjectUrl } from "@/services/resource-blob-cache";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { parseSrt, serializeSrtEntries } from "@/lib/timeline/srt-parser";
import { DEFAULT_MAX_CHARS_PER_ENTRY, MAX_CHARS_PER_ENTRY_LIMIT, MIN_CHARS_PER_ENTRY, resegmentSrtEntries, splitLongEntry } from "@/lib/timeline/srt-resegment";
import { buildFallbackHighlights, remapHighlightsAfterResegment } from "@/lib/timeline/subtitle-highlights";
import { generateSubtitleHighlights, type SubtitleHighlightProgress } from "@/lib/timeline/subtitle-highlight-runner";
import { createDefaultSubtitleStyle, type SrtEntry, type SubtitleHighlight, type SubtitlePosition, type SubtitleStyle } from "@/types/timeline";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { SubtitleHighlightedText } from "./canvas-subtitle-text";
import { CanvasTranscriptionControls } from "./canvas-transcription-controls";

type CanvasSubtitleDialogProps = {
    node: CanvasNodeData;
    open: boolean;
    projectId: string;
    config: AiConfig;
    onClose: () => void;
    onSave: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
};

export function CanvasSubtitleDialog({ node, open, projectId, config, onClose, onSave }: CanvasSubtitleDialogProps) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [entries, setEntries] = useState<SrtEntry[]>([]);
    const [highlights, setHighlights] = useState<SubtitleHighlight[]>([]);
    const [style, setStyle] = useState<SubtitleStyle>(createDefaultSubtitleStyle);
    const [running, setRunning] = useState(false);
    const [transcriptionRunning, setTranscriptionRunning] = useState(false);
    const busy = running || transcriptionRunning;
    const [progress, setProgress] = useState<SubtitleHighlightProgress | null>(null);
    const [videoUrl, setVideoUrl] = useState("");
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
    const [previewBoxWidth, setPreviewBoxWidth] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [videoError, setVideoError] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const previewBoxRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    // 開啟彈窗時從節點 metadata 同步字幕資料；關閉後解除安裝，重開重新讀取。
    useEffect(() => {
        if (!open) return;
        setEntries(node.metadata?.subtitleEntries || []);
        setHighlights(node.metadata?.subtitleHighlights || []);
        setStyle(node.metadata?.subtitleStyle || createDefaultSubtitleStyle());
        setRunning(false);
        setProgress(null);
    }, [open, node]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    // 開啟彈窗時解析影片地址，用於字幕疊加預覽。
    // 遠端資源優先走節點同款快取下載（物件 URL），失敗再退回資源代理地址。
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setCurrentTimeMs(0);
        setVideoSize(null);
        setVideoError(false);
        const storageKey = node.metadata?.storageKey || "";
        const fallback = node.metadata?.content || "";
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
    }, [open, node]);

    // 監聽預覽容器與視口尺寸，影片按解析度等比縮放，不撐滿也不變形。
    useEffect(() => {
        if (!open || !videoUrl) return;
        const measure = () => {
            setPreviewBoxWidth(previewBoxRef.current?.clientWidth || 0);
            setViewportHeight(window.innerHeight);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (previewBoxRef.current) observer.observe(previewBoxRef.current);
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [open, videoUrl]);

    const previewDisplay = useMemo(() => {
        if (!videoSize || videoSize.height <= 0) return null;
        const maxHeight = Math.round((viewportHeight || window.innerHeight) * 0.45);
        const maxWidth = Math.max(1, previewBoxWidth || 800);
        const ratio = videoSize.width / videoSize.height;
        let width = Math.min(maxWidth, videoSize.width);
        let height = width / ratio;
        if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * ratio);
        }
        return { width: Math.round(width), height: Math.round(height) };
    }, [previewBoxWidth, videoSize, viewportHeight]);

    const highlightByEntry = new Map(highlights.map((item) => [item.entryIndex, item]));
    const activeEntry = entries.find((entry) => currentTimeMs >= entry.startMs && currentTimeMs < entry.endMs);
    const activeHighlight = activeEntry ? highlightByEntry.get(activeEntry.index) : undefined;
    const activePositionClass = style.position === "top" ? "top-3" : style.position === "center" ? "top-1/2 -translate-y-1/2" : "bottom-4";

    const updateEntry = (position: number, patch: Partial<SrtEntry>) => {
        setEntries((current) => current.map((entry, idx) => (idx === position ? { ...entry, ...patch } : entry)));
    };

    const renumber = (list: SrtEntry[]) => list.map((entry, idx) => ({ ...entry, index: idx + 1 }));

    const normalizeEntries = (list: SrtEntry[]) =>
        renumber(
            list
                .filter((entry) => entry.text.trim())
                .map((entry) => ({ ...entry, startMs: Math.max(0, entry.startMs), endMs: Math.max(0, entry.endMs) }))
                .sort((a, b) => a.startMs - b.startMs || a.index - b.index),
        );

    const addEntry = () => {
        setEntries((current) => {
            const last = current[current.length - 1];
            const startMs = last ? last.endMs : 0;
            return [...current, { index: current.length + 1, startMs, endMs: startMs + 2_000, text: "" }];
        });
    };

    const deleteEntry = (position: number) => {
        const removed = entries[position];
        if (!removed) return;
        const next = normalizeEntries(entries.filter((_, idx) => idx !== position));
        const { remapped } = remapHighlightsAfterResegment(highlights, next);
        // 互通加固：逐條刪除立即持久化到節點並同步時間線，與「清空全部」行為一致，
        // 避免刪除後直接關閉彈窗（未點儲存）導致重開影片節點舊字幕復活。
        setEntries(next);
        setHighlights(next.length ? remapped : []);
        onSave(node.id, {
            subtitleEntries: next,
            subtitleHighlights: next.length ? remapped : [],
            subtitleStyle: style,
            subtitleUpdatedAt: new Date().toISOString(),
        });
        message.success(next.length ? "已刪除該條字幕並同步到影片節點與時間線" : "字幕已清空並同步到影片節點與時間線");
    };

    const splitEntry = (position: number) => {
        const entry = entries[position];
        if (!entry || !entry.text.trim()) {
            message.warning("該條字幕沒有可切分的內容");
            return;
        }
        const segments = splitLongEntry(entry, Math.max(2, Math.ceil(entry.text.length / 2)));
        const next = renumber([...entries.slice(0, position), ...segments, ...entries.slice(position + 1)]);
        setEntries(next);
        const { remapped } = remapHighlightsAfterResegment(highlights, next);
        setHighlights(remapped);
    };

    const seekToEntry = (entry: SrtEntry) => {
        const video = videoRef.current;
        if (video) {
            video.currentTime = Math.max(0, entry.startMs / 1000);
            setCurrentTimeMs(entry.startMs);
        }
    };

    const resegmentAll = () => {
        if (!entries.length) return;
        const maxChars = style.maxCharsPerEntry || DEFAULT_MAX_CHARS_PER_ENTRY;
        const next = resegmentSrtEntries(entries, maxChars);
        if (next.length === entries.length) {
            message.info(`所有字幕均未超過單條上限 ${maxChars} 字，無需切分；可在“字幕樣式”中調低上限後重試`);
            return;
        }
        setEntries(next);
        const { remapped, dropped } = remapHighlightsAfterResegment(highlights, next);
        setHighlights(remapped);
        message.success(`自動切分完成：${entries.length} 條 → ${next.length} 條`);
        if (dropped.length) message.info(`已移除 ${dropped.length} 條未能匹配的舊高亮`);
    };

    const importSrt = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const parsed = parseSrt(String(reader.result || ""));
            if (!parsed.length) {
                message.warning("未解析到有效字幕：檔案需為 SRT 格式（序號 + 時間碼 + 正文），純文本請用“匯入文本”");
                return;
            }
            const autoSegmented = style.autoResegment ? resegmentSrtEntries(parsed, style.maxCharsPerEntry || DEFAULT_MAX_CHARS_PER_ENTRY) : parsed;
            setEntries(renumber(autoSegmented));
            setHighlights([]);
            message.success(autoSegmented.length > parsed.length ? `已匯入 ${parsed.length} 條字幕，按單條上限自動切分為 ${autoSegmented.length} 條` : `已匯入 ${parsed.length} 條字幕`);
        };
        reader.readAsText(file);
    };

    // 純文本匯入：一行一條字幕，按影片時長平均分配起止時間；影片時長未知時按每條 4 秒估算。
    const importPlainText = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const lines = String(reader.result || "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            if (!lines.length) {
                message.warning("文本中沒有可匯入的內容");
                return;
            }
            const durationMs = node.metadata?.durationMs;
            const stepMs = durationMs && durationMs > 0 ? durationMs / lines.length : 4_000;
            const entries: SrtEntry[] = lines.map((text, idx) => ({
                index: idx + 1,
                startMs: Math.round(idx * stepMs),
                endMs: Math.round((idx + 1) * stepMs),
                text,
            }));
            setEntries(entries);
            setHighlights([]);
            message.success(durationMs && durationMs > 0 ? `已匯入 ${entries.length} 條字幕，按影片時長 ${formatDurationMs(durationMs)} 平均分配` : `已匯入 ${entries.length} 條字幕（影片時長未知，按每條 4 秒估算）`);
        };
        reader.readAsText(file);
    };

    const exportSrt = () => {
        const content = serializeSrtEntries(entries);
        if (!content) {
            message.warning("暫無字幕可匯出");
            return;
        }
        void reportOwnedMediaSave(message, saveOwnedOrBrowserBlob(`${node.title || "subtitle"}.srt`, new Blob([content], { type: "text/plain;charset=utf-8" })));
    };

    const runAiHighlight = async () => {
        if (!entries.length) {
            message.warning("請先新增字幕內容");
            return;
        }
        if (!isAiConfigReady(config, config.textModel)) {
            // 未配置文本模型時本地回退：按終止標點取首段作為高亮，保證功能不中斷。
            setHighlights(buildFallbackHighlights(entries));
            message.info("未配置可用的文本模型，已使用本地標點高亮");
            return;
        }
        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        setProgress({ batchIndex: 0, batchTotal: 1, processedEntries: 0, totalEntries: entries.length, percent: 0 });
        try {
            const nextHighlights = await generateSubtitleHighlights(entries, {
                projectId,
                nodeId: node.id,
                config,
                signal: controller.signal,
                onProgress: setProgress,
            });
            setHighlights(nextHighlights);
            message.success(`已生成 ${nextHighlights.length} 條關鍵詞高亮`);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            message.error(error instanceof Error ? error.message : "關鍵詞高亮生成失敗");
        } finally {
            setRunning(false);
            setProgress(null);
            abortRef.current = null;
        }
    };

    const cancelAiHighlight = () => {
        abortRef.current?.abort();
    };

    const handleSave = () => {
        const normalized = normalizeEntries(entries);
        const { remapped } = remapHighlightsAfterResegment(highlights, normalized);
        onSave(node.id, {
            subtitleEntries: normalized,
            subtitleHighlights: normalized.length ? remapped : [],
            subtitleStyle: style,
            subtitleUpdatedAt: new Date().toISOString(),
        });
        message.success(normalized.length ? "字幕已儲存" : "字幕已清空並儲存");
        onClose();
    };

    const formatDurationMs = (ms: number) => {
        const seconds = Math.round(ms / 1000);
        return seconds >= 60 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${seconds}秒`;
    };

    const previewBlock = (
        <div className="flex min-h-0 flex-col gap-2">
            <div ref={previewBoxRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border" style={{ borderColor: theme.toolbar.border, background: "#000" }}>
                {videoUrl ? (
                    <div className="relative" style={previewDisplay ? { width: previewDisplay.width, height: previewDisplay.height } : { width: "100%", maxWidth: 640, aspectRatio: "16 / 9" }}>
                        <video
                            ref={videoRef}
                            className="block h-full w-full"
                            src={videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(event) => {
                                const video = event.currentTarget;
                                if (video.videoWidth > 0 && video.videoHeight > 0) {
                                    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
                                }
                            }}
                            onError={() => setVideoError(true)}
                            onTimeUpdate={(event) => setCurrentTimeMs(Math.round(event.currentTarget.currentTime * 1000))}
                        />
                        {videoError ? <div className="absolute inset-0 grid place-items-center text-xs opacity-70">影片預覽載入失敗，請檢查素材是否仍然可用</div> : null}
                        {activeEntry ? (
                            <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${activePositionClass}`}>
                                <span className="rounded-lg px-2 py-0.5 text-center leading-7" style={{ background: "rgba(0,0,0,.62)", color: style.color, fontSize: style.fontSize, borderRadius: style.highlightRadius, maxWidth: "90%" }}>
                                    <SubtitleHighlightedText text={activeEntry.text} highlight={activeHighlight} style={style} />
                                </span>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="grid h-40 w-full max-w-[640px] place-items-center px-4 text-center text-xs opacity-60">{videoError ? "影片預覽載入失敗，請檢查素材是否仍然可用" : "暫無影片素材可預覽，可先在節點上傳或生成影片"}</div>
                )}
            </div>
            <div className="shrink-0 text-center text-xs opacity-40">點選字幕條目可跳轉預覽</div>
        </div>
    );

    const styleControls = (
        <>
            <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                <span>字號</span>
                <InputNumber size="small" min={12} max={40} value={style.fontSize} onChange={(fontSize) => setStyle((current) => ({ ...current, fontSize: fontSize ?? current.fontSize }))} className="w-20" />
            </label>
            <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                <span>顏色</span>
                <ColorPicker size="small" value={style.color} onChange={(color) => setStyle((current) => ({ ...current, color: color.toHexString() }))} />
            </label>
            <div className="text-xs opacity-70">
                <div className="mb-1">位置</div>
                <Segmented
                    block
                    size="small"
                    value={style.position}
                    options={[
                        { label: "頂部", value: "top" },
                        { label: "居中", value: "center" },
                        { label: "底部", value: "bottom" },
                    ]}
                    onChange={(position) => setStyle((current) => ({ ...current, position: position as SubtitlePosition }))}
                />
            </div>
            <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                <span>單條上限</span>
                <span className="flex items-center gap-1">
                    <InputNumber
                        size="small"
                        min={MIN_CHARS_PER_ENTRY}
                        max={MAX_CHARS_PER_ENTRY_LIMIT}
                        value={style.maxCharsPerEntry}
                        onChange={(maxCharsPerEntry) => setStyle((current) => ({ ...current, maxCharsPerEntry: maxCharsPerEntry ?? DEFAULT_MAX_CHARS_PER_ENTRY }))}
                        className="w-20"
                    />
                    <span className="opacity-40">字</span>
                </span>
            </label>
            <div className="border-t pt-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="mb-2 flex items-center justify-between text-xs font-medium opacity-55">
                    <span>關鍵詞高亮</span>
                    <Switch size="sm" checked={style.highlightEnabled} onChange={(highlightEnabled) => setStyle((current) => ({ ...current, highlightEnabled }))} />
                </div>
                <div className="space-y-2.5">
                    <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>背景色</span>
                        <ColorPicker size="small" value={style.highlightBackgroundColor} onChange={(color) => setStyle((current) => ({ ...current, highlightBackgroundColor: color.toHexString() }))} />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>文字色</span>
                        <ColorPicker size="small" value={style.highlightTextColor} onChange={(color) => setStyle((current) => ({ ...current, highlightTextColor: color.toHexString() }))} />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>內邊距 X</span>
                        <InputNumber size="small" min={0} max={24} value={style.highlightPaddingX} onChange={(highlightPaddingX) => setStyle((current) => ({ ...current, highlightPaddingX: highlightPaddingX ?? 0 }))} className="w-20" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>內邊距 Y</span>
                        <InputNumber size="small" min={0} max={24} value={style.highlightPaddingY} onChange={(highlightPaddingY) => setStyle((current) => ({ ...current, highlightPaddingY: highlightPaddingY ?? 0 }))} className="w-20" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>圓角</span>
                        <InputNumber size="small" min={0} max={24} value={style.highlightRadius} onChange={(highlightRadius) => setStyle((current) => ({ ...current, highlightRadius: highlightRadius ?? 0 }))} className="w-20" />
                    </label>
                </div>
            </div>
        </>
    );

    const entriesBlock = (
        <div className="thin-scrollbar min-h-0 space-y-2 overflow-y-auto pr-1">
            {entries.length ? (
                entries.map((entry, idx) => {
                    const highlight = highlightByEntry.get(entry.index);
                    return (
                        <div
                            key={`${entry.index}-${idx}`}
                            className="subtitle-editor-entry cursor-pointer rounded-xl border p-2.5 transition-colors"
                            data-active={activeEntry?.index === entry.index}
                            title="點選跳轉到該條字幕時間"
                            style={{ background: theme.node.fill, borderColor: activeEntry?.index === entry.index ? theme.accent.primary : theme.node.stroke }}
                            onClick={(event) => {
                                const target = event.target as HTMLElement;
                                if (target.closest("input,button,textarea")) return;
                                seekToEntry(entry);
                            }}
                        >
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                                    {idx + 1}
                                </span>
                                <InputNumber size="small" disabled={busy} min={0} step={100} value={entry.startMs} onChange={(startMs) => updateEntry(idx, { startMs: startMs ?? 0 })} className="w-32" aria-label={`第 ${idx + 1} 條開始時間（毫秒）`} />
                                <span className="text-xs opacity-40">→</span>
                                <InputNumber size="small" disabled={busy} min={0} step={100} value={entry.endMs} onChange={(endMs) => updateEntry(idx, { endMs: endMs ?? 0 })} className="w-32" aria-label={`第 ${idx + 1} 條結束時間（毫秒）`} />
                                <button
                                    type="button"
                                    title="切分這條字幕"
                                    className="ml-auto grid size-7 place-items-center rounded-lg border transition-colors hover:opacity-75"
                                    style={{ borderColor: theme.toolbar.border }}
                                    disabled={busy}
                                    onClick={() => splitEntry(idx)}
                                >
                                    <Scissors className="size-3.5" />
                                </button>
                                <button
                                    type="button"
                                    title="刪除這條字幕"
                                    className="grid size-7 place-items-center rounded-lg border text-red-500 transition-colors hover:opacity-75"
                                    style={{ borderColor: theme.toolbar.border }}
                                    disabled={busy}
                                    onClick={() => deleteEntry(idx)}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                            <Input.TextArea disabled={busy} value={entry.text} autoSize={{ minRows: 1, maxRows: 3 }} placeholder="字幕文本" className="mt-2" onChange={(event) => updateEntry(idx, { text: event.target.value })} />
                            {highlight ? (
                                <div className="mt-1.5 text-xs" style={{ color: theme.accent.primary }}>
                                    重點：{highlight.highlightText}
                                </div>
                            ) : null}
                        </div>
                    );
                })
            ) : (
                <div className="grid h-40 place-items-center text-center">
                    <div className="text-xs opacity-45">
                        <ListPlus className="mx-auto mb-2 size-8" />
                        匯入字幕、自動轉寫或新增第一條字幕
                    </div>
                </div>
            )}
        </div>
    );

    const title = (
        <div className="flex min-w-0 items-center gap-2.5 pr-10">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                <Captions className="size-4" />
            </span>
            <div className="min-w-0">
                <div className="truncate text-[var(--fs-heading-lg)] font-semibold leading-6 tracking-[-0.02em]">字幕編輯</div>
                <div className="truncate text-xs opacity-45">{node.title || "影片節點"}</div>
            </div>
        </div>
    );

    return (
        <AppModal className="canvas-subtitle-dialog" title={title} open={open} centered footer={null} width="min(1280px, calc(100vw - 32px))" destroyOnHidden onCancel={onClose} flush>
            <div className="media-editor-body subtitle-editor-body flex flex-col text-sm" style={{ color: theme.node.text }}>
                <CanvasTranscriptionControls
                    key={`${projectId}:${node.id}:${node.metadata?.storageKey || ""}`}
                    projectId={projectId}
                    nodeId={node.id}
                    resourceId={resourceIdFromStorageKey(node.metadata?.storageKey || "")}
                    disabled={busy}
                    onRunningChange={setTranscriptionRunning}
                    onResult={(next) => {
                        setEntries(next);
                        setHighlights([]);
                    }}
                />
                <div className="media-editor-toolbar flex flex-wrap items-center gap-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".srt"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) importSrt(file);
                            event.target.value = "";
                        }}
                    />
                    <input
                        ref={textInputRef}
                        type="file"
                        accept=".txt,text/plain"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) importPlainText(file);
                            event.target.value = "";
                        }}
                    />
                    <Dropdown
                        trigger={["click"]}
                        disabled={busy}
                        menu={{
                            items: [
                                { key: "srt", label: "匯入 SRT", onClick: () => fileInputRef.current?.click() },
                                { key: "text", label: "匯入文本", onClick: () => textInputRef.current?.click() },
                            ],
                        }}
                    >
                        <Button size="small" disabled={busy} icon={<FileUp className="size-3.5" />}>
                            匯入字幕
                        </Button>
                    </Dropdown>
                    <Button size="small" icon={<FileDown className="size-3.5" />} disabled={!entries.length} onClick={exportSrt}>
                        匯出 SRT
                    </Button>
                    <Button size="small" icon={<Scissors className="size-3.5" />} disabled={!entries.length || busy} onClick={resegmentAll}>
                        自動切分
                    </Button>
                    <Button size="small" icon={<Plus className="size-3.5" />} disabled={busy} onClick={addEntry}>
                        新增字幕
                    </Button>
                    <Button
                        size="small"
                        danger
                        icon={<Trash2 className="size-3.5" />}
                        disabled={!entries.length || busy}
                        onClick={() =>
                            modal.confirm({
                                title: "清空全部字幕",
                                content: `將刪除全部 ${entries.length} 條字幕及關鍵詞高亮，此操作不可撤銷。`,
                                okText: "清空",
                                okButtonProps: { danger: true },
                                cancelText: "取消",
                                onOk: () => {
                                    // 互通加固：清空全部立即持久化到節點並同步時間線，避免清空後直接關閉彈窗（未點儲存）導致重開影片節點舊字幕復活。
                                    onSave(node.id, {
                                        subtitleEntries: [],
                                        subtitleHighlights: [],
                                        subtitleStyle: style,
                                        subtitleUpdatedAt: new Date().toISOString(),
                                    });
                                    setEntries([]);
                                    setHighlights([]);
                                    message.success("已清空全部字幕並同步到影片節點與時間線");
                                },
                            })
                        }
                    >
                        清空全部
                    </Button>
                    <Button
                        size="small"
                        type={running ? "default" : "primary"}
                        icon={running ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        disabled={!entries.length || transcriptionRunning}
                        onClick={running ? cancelAiHighlight : () => void runAiHighlight()}
                    >
                        {running ? "取消高亮" : "AI 關鍵詞高亮"}
                    </Button>
                </div>

                {progress && running ? (
                    <div className="border-b px-4 py-2" style={{ borderColor: theme.toolbar.border }}>
                        <Progress percent={progress.percent} size="small" format={() => `${progress.processedEntries}/${progress.totalEntries} 條 · 批次 ${progress.batchIndex}/${progress.batchTotal}`} />
                    </div>
                ) : null}

                <div className="subtitle-editor-workspace">
                    <section className="media-editor-pane subtitle-editor-list" aria-label="字幕列表">
                        <div className="media-editor-pane-heading">
                            <h2>字幕列表</h2>
                            <span>{entries.length} 條</span>
                        </div>
                        {entriesBlock}
                    </section>
                    <section className="media-editor-pane subtitle-editor-preview" aria-label="影片預覽">
                        <div className="media-editor-pane-heading">
                            <h2>預覽</h2>
                        </div>
                        {previewBlock}
                    </section>
                    <section className="media-editor-pane subtitle-editor-style" aria-label="字幕樣式">
                        <div className="media-editor-pane-heading">
                            <h2>字幕樣式</h2>
                        </div>
                        <div className="thin-scrollbar min-h-0 space-y-4 overflow-y-auto">{styleControls}</div>
                    </section>
                </div>

                <div className="media-editor-footer flex items-center justify-between gap-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <div className="text-xs opacity-45">
                        {entries.length} 條字幕 · 單條上限 {style.maxCharsPerEntry || DEFAULT_MAX_CHARS_PER_ENTRY} 字
                    </div>
                    <div className="flex items-center gap-2">
                        <Button disabled={busy} onClick={onClose}>
                            取消
                        </Button>
                        <Button type="primary" disabled={busy} onClick={handleSave}>
                            儲存
                        </Button>
                    </div>
                </div>
            </div>
        </AppModal>
    );
}
