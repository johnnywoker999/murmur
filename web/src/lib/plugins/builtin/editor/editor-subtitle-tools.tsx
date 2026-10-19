// SRT 匯入匯出（複用 srt-parser）+ 「從節點重建字幕片段」命令（快照契約：
// 節點 subtitleEntries 權威 → 重建時間線字幕快照，替換過期快照，單向顯式同步）。
// 時間線字幕片段是節點字幕的只讀快照；AI 高亮只寫權威節點字幕。
// 當前預覽不渲染字幕高亮，因此本工具不重複發起 AI 請求，避免產生兩份互相漂移的結果。

import { useMemo, useState } from "react";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import { parseSrt, serializeSrtEntries } from "@/lib/timeline/srt-parser";
import { getSubtitleTracks } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import type { SrtEntry, TimelineClip } from "@/types/timeline";

const DEFAULT_SRT_NODE_ID = "srt-import";

export function EditorSubtitleTools() {
    const { project, dispatch } = useEditorStoreContext();
    const [srtText, setSrtText] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    const subtitleClips = useMemo(
        () => (project?.clips ?? []).filter((c) => c.kind === "subtitle").sort((a, b) => a.startMs - b.startMs),
        [project],
    );
    const subtitleTracks = useMemo(() => (project ? getSubtitleTracks(project.tracks) : []), [project]);

    // SRT 匯入：解析文本 → rebuildSubtitleClips 以 DEFAULT_SRT_NODE_ID 為權威節點重建
    // 字幕快照。確定性 id（nodeId:subtitle:index）保證重複匯入原地替換，不堆積漂移。
    const importSrt = () => {
        const entries = parseSrt(srtText);
        if (entries.length === 0) {
            setMessage("未解析到有效 SRT 條目");
            return;
        }
        dispatch({
            op: "rebuildSubtitleClips",
            payload: { nodeId: DEFAULT_SRT_NODE_ID, entries, trackId: subtitleTracks[0]?.id },
        });
        setMessage(`已從節點 ${DEFAULT_SRT_NODE_ID} 重建 ${entries.length} 條字幕快照`);
    };

    // SRT 匯出：當前時間線字幕快照 → 序列化 → 下載 .srt（往返一致）。
    const exportSrt = () => {
        if (subtitleClips.length === 0) {
            setMessage("時間線上沒有字幕片段");
            return;
        }
        const entries: SrtEntry[] = subtitleClips.map((clip, idx) => ({
            index: clip.subtitleEntryIndex ?? idx + 1,
            startMs: clip.startMs,
            endMs: clip.startMs + clip.durationMs,
            text: clip.text ?? "",
        }));
        const content = serializeSrtEntries(entries);
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subtitles.srt";
        a.click();
        URL.revokeObjectURL(url);
        setMessage(`已匯出 ${entries.length} 條字幕`);
    };

    return (
        <div className="flex h-full flex-col bg-[var(--director-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-control-hover)] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--director-dock-fg-strong)]">時間線字幕</span>
                        <span className="text-[10px] text-[var(--director-dock-fg)]/60">{subtitleClips.length} 條</span>
                    </div>
                    {subtitleClips.length === 0 ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-[var(--director-dock-fg)]/55">暫無字幕快照。貼上 SRT 匯入後，字幕會重建到時間線。</p>
                    ) : (
                        <ul className="mt-2 space-y-1">
                            {subtitleClips.slice(0, 6).map((clip) => (
                                <SubtitleRow key={clip.id} clip={clip} />
                            ))}
                            {subtitleClips.length > 6 && (
                                <li className="pt-1 text-[10px] text-[var(--director-dock-fg)]/50">…共 {subtitleClips.length} 條</li>
                            )}
                        </ul>
                    )}
                </div>

                <label className="mb-3 block">
                    <span className="mb-1 block text-[11px] text-[var(--director-dock-fg)]/70">SRT 文本（匯入）</span>
                    <textarea
                        value={srtText}
                        onChange={(e) => setSrtText(e.target.value)}
                        rows={8}
                        placeholder={"1\n00:00:00,500 --> 00:00:02,500\n你好，MURMUR AI"}
                        className="w-full resize-y rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-control-hover)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--director-dock-fg-strong)] outline-none focus:border-[var(--workspace-accent)]/60"
                    />
                </label>

                <div className="mb-3 flex gap-2">
                    <button
                        type="button"
                        onClick={importSrt}
                        disabled={!srtText.trim()}
                        className="flex-1 rounded-md bg-[var(--director-accent)] px-2 py-1.5 text-xs font-medium text-[var(--director-on-accent)] hover:bg-[var(--director-accent-hover)] disabled:opacity-40"
                    >
                        匯入（重建字幕）
                    </button>
                    <button
                        type="button"
                        onClick={exportSrt}
                        disabled={subtitleClips.length === 0}
                        className="flex-1 rounded-md border border-[var(--director-sequencer-border)] px-2 py-1.5 text-xs text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:opacity-40"
                    >
                        匯出 SRT
                    </button>
                </div>

                <div className="rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-control-hover)] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--director-dock-fg-strong)]">AI 高亮</span>
                        <span className="rounded-full bg-[var(--director-dock-active-surface)] px-1.5 py-0.5 text-[10px] text-[var(--director-dock-fg)]/80">可用</span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--director-dock-fg)]/55">
                        AI 字幕高亮與關鍵詞標註已實現，入口在畫布「字幕」彈窗（點選字幕 → AI 高亮，走 ai.text 許可權）。
                        時間線字幕片段由該字幕快照重建而來；待編輯器預覽支援字幕文本渲染後，高亮會隨快照同步到這裡。
                    </p>
                </div>

                {message && <p className="mt-2 text-[11px] text-[var(--director-dock-fg)]/70">{message}</p>}
            </div>
        </div>
    );
}


function SubtitleRow({ clip }: { clip: TimelineClip }) {
    return (
        <li className="flex items-baseline gap-2 rounded border border-[var(--director-sequencer-border)]/70 bg-[var(--director-control-hover)]/60 px-1.5 py-1">
            <span className="shrink-0 tabular-nums text-[10px] text-[var(--director-dock-fg)]/60">
                {formatTimelineTime(clip.startMs)} – {formatTimelineTime(clip.startMs + clip.durationMs)}
            </span>
            <span className="truncate text-[11px] text-[var(--director-dock-fg)]/80">{clip.text ?? ""}</span>
        </li>
    );
}
