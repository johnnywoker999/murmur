// 時間線摘要作為上下文傳送給文本模型，模型輸出必須通過 ai-command-schema 校驗。
// 小批命令直接進入統一 dispatch，大批命令先由使用者確認；宿主拒絕無效命令並顯示 saveError。
// 請求顯式攜帶使用者選擇的文本模型，不能沿用可能指向圖片模型的全域性預設值。
import { useRef, useState, useEffect } from "react";
import { Bot, Loader2, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { requestImageQuestion } from "@/services/api/image";
import type { AiTextMessage } from "@/services/api/image-contracts";
import { useConfigStore, useEffectiveConfig, modelOptionLabel } from "@/stores/use-config-store";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import { summarizeTimeline } from "@/lib/timeline/timeline-summary";
import {
    buildAiEditingSystemPrompt,
    parseAiCommandPlan,
    validateAiCommandBatch,
    type AiCommandPlan,
    type AiCommandBatchVerdict,
} from "@/lib/timeline/ai-command-schema";

type UiEntry =
    | { kind: "user"; id: string; text: string }
    | { kind: "assistant"; id: string; text: string }
    | { kind: "error"; id: string; text: string; retry: string }
    | { kind: "preview"; id: string; plan: AiCommandPlan };

const FAILED_MARK = "（上一輪指令被宿主拒絕）";
const RETRY_MODIFY_PREFIX = "宿主拒絕了上一輪輸出，錯誤：";
const MAX_VISIBLE_RAW = 240;
const PREVIEW_HEAD = "以下指令將直接修改時間線，請確認後執行：";
// 空態建議指令：點選直接傳送（對應參考圖的 suggestion chips）。
const SUGGESTED_PROMPTS = [
    "把第二段素材換成封面圖",
    "刪掉所有片段之間的空隙",
    "給全部字幕加上黑色描邊",
    "當前時間線一共有多少片段？",
];

/** 指令行人類可讀摘要（op + payload 截斷），用於執行彙報與預覽清單。 */
function commandLine(cmd: { op: string; payload?: unknown }, index: number): string {
    const brief = JSON.stringify(cmd.payload);
    const trimmed = brief.length > 96 ? `${brief.slice(0, 96)}…` : brief;
    return `${index + 1}. ${cmd.op} ${trimmed}`;
}

function describePlan(plan: AiCommandPlan): string {
    const lines = plan.commands.map((c, i) => commandLine(c, i));
    return [plan.reasoning?.trim(), `已提交 ${plan.commands.length} 條指令：`, ...lines]
        .filter((line): line is string => Boolean(line))
        .join("\n");
}


export function EditorAiAssistant() {
    const { project, dispatch } = useEditorStoreContext();
    const updateConfig = useConfigStore((s) => s.updateConfig);
    const effective = useEffectiveConfig();
    const textModels = effective.textModels ?? [];
    const defaultModel =
        effective.textModel && textModels.includes(effective.textModel) ? effective.textModel : textModels[0] ?? "";
    // 使用者在本面板顯式選擇過的模型優先；未選擇時跟隨全域性 textModel / 首個文本模型。
    const [model, setModel] = useState("");
    const modelValue = model || defaultModel || "";
    const [entries, setEntries] = useState<UiEntry[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const historyRef = useRef<AiTextMessage[]>([]);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // 條目 id 走 ref（非模組級可變變數）：StrictMode 雙呼叫 updater 時也無跨元件副作用。
    const idSeqRef = useRef(0);
    function nextId(): string {
        idSeqRef.current += 1;
        return `msg-${idSeqRef.current}`;
    }

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [entries, busy]);

    function onModelChange(value: string): void {
        setModel(value);
        updateConfig("textModel", value);
    }

    function patchEntry(id: string, text: string): void {
        setEntries((prev) =>
            prev.map((e) => {
                if (e.id !== id || e.kind === "preview") return e;
                return { ...e, text };
            }),
        );
    }

    function appendToEntry(id: string, delta: string): void {
        setEntries((prev) =>
            prev.map((e) => {
                if (e.id !== id || e.kind === "preview") return e;
                return { ...e, text: e.text + delta };
            }),
        );
    }

    /** 逐條 dispatch 並把目標條目替換為“已提交 N 條指令”彙報氣泡。
     *  預覽確認卡因此整卡替換、按鈕解除安裝，重複點選不會二次提交同一批指令。 */
    function applyPlan(targetId: string, plan: AiCommandPlan): void {
        for (const cmd of plan.commands) dispatch(cmd);
        const report = describePlan(plan);
        setEntries((prev) =>
            prev.map((e) => (e.id === targetId ? { kind: "assistant", id: targetId, text: report } : e)),
        );
        pushHistory({
            role: "assistant",
            content: `已提交 ${plan.commands.length} 條指令：${plan.commands.map((c) => c.op).join("、")}`,
        });
        setBusy(false);
    }

    function dropEntry(id: string): void {
        setEntries((prev) => prev.filter((e) => e.id !== id));
    }

    function pushHistory(msg: AiTextMessage): void {
        historyRef.current = [...historyRef.current, msg];
    }

    function failTurn(assistantId: string, reason: string, userText: string, fixable: boolean): void {
        patchEntry(
            assistantId,
            `指令未應用：${reason.slice(0, MAX_VISIBLE_RAW)}${reason.length > MAX_VISIBLE_RAW ? "…" : ""}`,
        );
        pushHistory({ role: "assistant", content: FAILED_MARK });
        const retry = fixable ? `${RETRY_MODIFY_PREFIX}${reason}。請只輸出修正後的命令 JSON。` : userText;
        const errId = nextId();
        setEntries((prev) => [...prev, { kind: "error", id: errId, text: reason, retry }]);
        setBusy(false);
    }

    async function send(rawOverride?: string): Promise<void> {
        const text = (rawOverride ?? input).trim();
        if (!text || busy || !project || !modelValue) return;
        setInput("");
        const userId = nextId();
        const assistantId = nextId();
        setEntries((prev) => [...prev, { kind: "user", id: userId, text }]);
        setEntries((prev) => [...prev, { kind: "assistant", id: assistantId, text: "" }]);
        setBusy(true);

        const userMsg: AiTextMessage = { role: "user", content: text };
        const history = [...historyRef.current, userMsg];
        try {
            // 同時覆寫 model 與 textModel，繞過 config.model 可能是影像模型的預設值問題。
            const answer = await requestImageQuestion(
                {
                    ...effective,
                    model: modelValue,
                    textModel: modelValue,
                    systemPrompt: buildAiEditingSystemPrompt(summarizeTimeline(project)),
                },
                history,
                (delta) => appendToEntry(assistantId, delta),
            );
            patchEntry(assistantId, answer);
            settleAnswer(assistantId, answer, text);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            patchEntry(assistantId, `請求失敗：${reason.slice(0, MAX_VISIBLE_RAW)}`);
            const errId = nextId();
            setEntries((prev) => [...prev, { kind: "error", id: errId, text: reason, retry: text }]);
            setBusy(false);
        }
    }

    function settleAnswer(assistantId: string, answer: string, userText: string): void {
        if (!project) {
            failTurn(assistantId, "編輯器專案已不可用，無法校驗指令。", userText, false);
            return;
        }
        let plan: AiCommandPlan;
        try {
            plan = parseAiCommandPlan(answer);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            failTurn(assistantId, reason, userText, true);
            return;
        }
        if (plan.commands.length === 0) {
            const visible = plan.reasoning?.trim() || answer;
            patchEntry(assistantId, visible);
            pushHistory({ role: "assistant", content: visible });
            setBusy(false);
            return;
        }
        const verdict: AiCommandBatchVerdict = validateAiCommandBatch(project, plan);
        if (!verdict.ok) {
            failTurn(
                assistantId,
                `命令校驗失敗：${verdict.op}（第 ${verdict.index + 1} 條）：${verdict.error}`,
                userText,
                true,
            );
            return;
        }
        if (plan.commands.length <= 3) {
            applyPlan(assistantId, plan);
            return;
        }
        patchEntry(assistantId, plan.reasoning?.trim() || `${PREVIEW_HEAD}共 ${plan.commands.length} 條。`);
        const previewId = nextId();
        setEntries((prev) => [...prev, { kind: "preview", id: previewId, plan }]);
        pushHistory({
            role: "assistant",
            content: `輸出 ${plan.commands.length} 條指令，等待使用者確認後執行。`,
        });
        setBusy(false);
    }

    function confirmPreview(entryId: string): void {
        const entry = entries.find(
            (e): e is Extract<UiEntry, { kind: "preview" }> => e.id === entryId && e.kind === "preview",
        );
        if (!entry || busy) return;
        // applyPlan 會把預覽卡整卡替換為彙報氣泡：按鈕解除安裝，重複點選不會二次提交同一批指令。
        applyPlan(entryId, entry.plan);
    }

    function dropPreview(entryId: string): void {
        dropEntry(entryId);
    }

    function retry(entryId: string): void {
        const entry = entries.find(
            (e): e is Extract<UiEntry, { kind: "error" }> => e.id === entryId && e.kind === "error",
        );
        if (!entry || busy) return;
        void send(entry.retry);
    }

    const hasProject = Boolean(project);
    const ready = hasProject && Boolean(modelValue);
    const canSend = ready && !busy && input.trim().length > 0;
    const placeholder = !hasProject
        ? "編輯器尚未就緒"
        : !modelValue
          ? "未檢測到文本模型，請先在「AI 設定」啟用文本渠道"
          : "描述編輯意圖，或提問當前時間線…";

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--director-sequencer-surface)]">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--director-sequencer-border)] px-3 py-2">
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--director-dock-fg)]/50">
                    對話模型
                </span>
                {textModels.length > 0 ? (
                    <select
                        value={modelValue}
                        onChange={(e) => onModelChange(e.target.value)}
                        disabled={busy}
                        aria-label="選擇文本對話模型"
                        title="選擇文本對話模型"
                        className="h-7 min-w-0 flex-1 rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-control-hover)] px-1.5 text-xs text-[var(--director-dock-fg)] outline-none focus:border-[var(--director-accent)] disabled:opacity-50 [&>option]:bg-[var(--director-sequencer-surface-raised)] [&>option]:text-[var(--director-dock-fg)]"
                    >
                        {textModels.map((m) => (
                            <option key={m} value={m}>
                                {modelOptionLabel(effective, m)}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="text-[11px] text-[var(--director-warning)]">
                        未檢測到可用文本模型，請先配置渠道
                    </span>
                )}
            </div>
            <div
                ref={scrollRef}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
            >
                {entries.length === 0 && (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
                        <div className="grid size-10 place-items-center rounded-full bg-[var(--director-dock-active-surface)]">
                            <Bot className="size-4 text-[var(--director-dock-fg)]/80" />
                        </div>
                        <p className="text-xs text-[var(--director-dock-fg)]/70">AI 剪輯助手</p>
                        <p className="max-w-[240px] text-[11px] leading-relaxed text-[var(--director-dock-fg)]/50">
                            基於當前時間線提問，或描述編輯意圖（如"把第二段素材換成封面圖"）。
                            修改指令會先在宿主側校驗，數量超過 3 條時需你確認後才執行。
                        </p>
                        <div className="flex max-w-[260px] flex-wrap items-center justify-center gap-1.5">
                            {SUGGESTED_PROMPTS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    disabled={!ready || busy}
                                    onClick={() => void send(s)}
                                    className="rounded-full border border-[var(--director-sequencer-border)] px-2 py-1 text-[10px] text-[var(--director-dock-fg)]/70 transition-colors hover:border-[var(--director-accent)] hover:text-[var(--director-accent)] disabled:opacity-40"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {entries.map((entry) => {
                    if (entry.kind === "user") {
                        return (
                            <div
                                key={entry.id}
                                className="max-w-[86%] self-end whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-[var(--director-accent)] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--director-on-accent)]"
                            >
                                {entry.text}
                            </div>
                        );
                    }
                    if (entry.kind === "assistant") {
                        return (
                            <div
                                key={entry.id}
                                className="max-w-[92%] self-start whitespace-pre-wrap break-words rounded-xl rounded-bl-sm border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--director-dock-fg)]"
                            >
                                {entry.text || (
                                    <span className="inline-flex items-center gap-1.5 text-[var(--director-dock-fg)]/60">
                                        <Loader2 className="size-3 animate-spin" />
                                        思考中…
                                    </span>
                                )}
                            </div>
                        );
                    }
                    if (entry.kind === "error") {
                        return (
                            <div
                                key={entry.id}
                                className="max-w-[92%] self-start overflow-hidden rounded-xl rounded-bl-sm border border-[var(--director-danger)]/40 bg-[var(--director-danger)]/10 px-2.5 py-1.5"
                            >
                                <div className="flex items-start gap-1.5">
                                    <ShieldAlert className="mt-0.5 size-3 shrink-0 text-[var(--director-danger)]" />
                                    <div className="min-w-0">
                                        <p className="text-[11px] leading-relaxed text-[var(--director-danger)]">
                                            {entry.text}
                                        </p>
                                        {entry.retry && (
                                            <button
                                                type="button"
                                                onClick={() => retry(entry.id)}
                                                disabled={busy}
                                                className="mt-1 inline-flex items-center gap-1 rounded border border-[var(--director-sequencer-border)] px-1.5 py-0.5 text-[10px] text-[var(--director-dock-fg)]/80 hover:bg-[var(--director-control-hover)] disabled:opacity-40"
                                            >
                                                <RotateCcw className="size-2.5" />
                                                修正後重試
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div
                            key={entry.id}
                            className="max-w-[92%] self-start overflow-hidden rounded-xl rounded-bl-sm border border-[var(--director-warning)]/40 bg-[var(--director-warning)]/10"
                        >
                            <p className="border-b border-[var(--director-warning)]/25 px-2.5 py-1.5 text-[11px] font-medium text-[var(--director-dock-fg)]">
                                {PREVIEW_HEAD}
                            </p>
                            <div className="max-h-44 overflow-y-auto px-2.5 py-1.5">
                                {entry.plan.commands.map((cmd, i) => (
                                    <p
                                        key={i}
                                        className="py-0.5 font-mono text-[10px] leading-relaxed text-[var(--director-dock-fg)]/80"
                                    >
                                        {commandLine(cmd, i)}
                                    </p>
                                ))}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 border-t border-[var(--director-warning)]/25 px-2.5 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => dropPreview(entry.id)}
                                    disabled={busy}
                                    className="rounded-md border border-[var(--director-sequencer-border)] px-2 py-1 text-[10px] text-[var(--director-dock-fg)]/80 hover:bg-[var(--director-control-hover)] disabled:opacity-40"
                                >
                                    放棄
                                </button>
                                <button
                                    type="button"
                                    onClick={() => confirmPreview(entry.id)}
                                    disabled={busy}
                                    className="flex items-center gap-1 rounded-md bg-[var(--director-accent)] px-2 py-1 text-[10px] font-medium text-[var(--director-on-accent)] hover:bg-[var(--director-accent-hover)] disabled:opacity-40"
                                >
                                    確認執行（{entry.plan.commands.length}）
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--director-sequencer-border)] p-2.5">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void send();
                        }
                    }}
                    disabled={!ready || busy}
                    placeholder={placeholder}
                    className="min-w-0 flex-1 rounded-md border border-[var(--director-sequencer-border)] bg-[var(--director-control-hover)] px-2 py-1.5 text-xs text-[var(--director-dock-fg)] placeholder:text-[var(--director-dock-fg)]/40 focus:border-[var(--director-accent)] focus:outline-none disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!canSend}
                    aria-label={modelValue ? "傳送" : "無可用文本模型"}
                    title={modelValue ? "傳送" : "請先選擇文本模型"}
                    className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--director-accent)] text-[var(--director-on-accent)] hover:bg-[var(--director-accent-hover)] disabled:opacity-40"
                >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </button>
            </div>
        </div>
    );
}
