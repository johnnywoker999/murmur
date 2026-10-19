import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Dropdown } from "antd";
import { AlignLeft, ArrowRight, AudioLines, Check, ChevronDown, ChevronUp, CircleUserRound, Clapperboard, FolderKanban, ImagePlus, Images, MoreHorizontal, MousePointer2, Palette, Pencil, Plus, PlusCircle, ScanLine, Sparkles, Type, Upload, Video, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import type { CanvasCreateCommand } from "@/components/canvas/canvas-create-menu";
import type { CanvasShortDramaProgress, CanvasShortDramaStepId } from "@/lib/canvas/canvas-short-drama";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasLinkedProjectEmptyState({ projectName, hasChapter, onAddFirstChapter, onOpenAssets, onAddText }: { projectName: string; hasChapter: boolean; onAddFirstChapter: () => void; onOpenAssets: () => void; onAddText: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-16 pt-20">
            <div className="pointer-events-auto w-full max-w-[440px] rounded-lg border p-3 shadow-sm backdrop-blur" data-canvas-no-zoom style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
                <div className="flex items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}><FolderKanban className="size-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{projectName}</h2><p className="mt-0.5 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>專案畫布為空</p></div></div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button type="button" disabled={!hasChapter} onClick={onAddFirstChapter} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium disabled:opacity-35" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Plus className="size-3.5 shrink-0" /><span className="truncate">新增首章</span></button>
                    <button type="button" onClick={onOpenAssets} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Images className="size-3.5 shrink-0" /><span className="truncate">專案資產</span></button>
                    <button type="button" onClick={onAddText} className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[var(--fs-label)] font-medium" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}><Type className="size-3.5 shrink-0" /><span className="truncate">新建文本</span></button>
                </div>
            </div>
        </div>
    );
}

export function CanvasShortDramaEmptyState({ onCreatePipeline, onStartFreeform, onUpload, onAddText, onAddScript }: {
    onCreatePipeline: () => void;
    onStartFreeform: () => void;
    onUpload: () => void;
    onAddText: () => void;
    onAddScript: () => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const focusStyle = { "--tw-ring-color": theme.accent.primary } as CSSProperties;
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-20 pt-36">
            <div className="pointer-events-auto w-full max-w-[760px]" data-canvas-no-zoom>
                <div className="mb-4 text-center">
                    <h2 className="text-lg font-semibold">從哪裡開始？</h2>
                    <p className="mt-1 text-sm" style={{ color: theme.node.muted }}>選擇一條主路徑，之後仍可隨時切換。</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                    <PathCard
                        icon={<Clapperboard className="size-5" />}
                        title="自己創作"
                        description="搭好短劇骨架，再逐鏡頭編輯和生成。"
                        action="建立短劇流水線"
                        accent={theme.accent.primary}
                        theme={theme}
                        focusStyle={focusStyle}
                        onClick={onCreatePipeline}
                    />
                    <PathCard
                        icon={<Plus className="size-5" />}
                        title="自由空白畫布"
                        description="不預設流程，自由新增文本、圖片、音訊和影片。"
                        action="從空白畫布開始"
                        accent={theme.node.muted}
                        theme={theme}
                        focusStyle={focusStyle}
                        onClick={onStartFreeform}
                    />
                </div>
                <div className="mt-3 flex justify-center">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "upload", icon: <Upload className="size-4" />, label: "匯入素材", onClick: onUpload },
                                { key: "text", icon: <Type className="size-4" />, label: "新建文本", onClick: onAddText },
                                { key: "storyboard", icon: <Clapperboard className="size-4" />, label: "新建空白分鏡", onClick: onAddScript },
                            ],
                        }}
                    >
                        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10" style={{ color: theme.node.muted, ...focusStyle }}>
                            <MoreHorizontal className="size-4" />其他起點<ChevronDown className="size-3" />
                        </button>
                    </Dropdown>
                </div>
            </div>
        </div>
    );
}

export function CanvasFreeformEmptyState({ commands, onOpenAssistant }: { commands: CanvasCreateCommand[]; onOpenAssistant?: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const [connectionsHintOpen, setConnectionsHintOpen] = useState(true);
    useEffect(() => {
        try {
            setConnectionsHintOpen(window.localStorage.getItem("canvas:connections-hint-dismissed") !== "1");
        } catch {
            // 本地儲存不可用時保留首次提示，不影響畫布操作。
        }
    }, []);
    const createCommands = commands.map((command) => ({
        ...command,
        onClick: command.onClick,
    }));
    const commandById = new Map(createCommands.map((command) => [command.id, command]));
    const quickStarts = [
        { id: "script", label: "故事指令碼生成", icon: <ScanLine className="size-4" />, commandId: "script", accent: "#9bcf6b" },
        { id: "character", label: "角色三檢視", icon: <CircleUserRound className="size-4" />, commandId: "image", accent: "#ff6266" },
        { id: "reference-video", label: "全能參考生影片", icon: <ImagePlus className="size-4" />, commandId: "video", badge: "Lib SD 2.5", accent: "#8ec5ff" },
        { id: "audio-video", label: "音訊生影片", icon: <AudioLines className="size-4" />, commandId: "audio", badge: "Lib SD 2.5", accent: "#b58be8" },
    ];
    // These four shortcuts stay implemented, but remain hidden until their
    // corresponding workflows are ready for release.
    const showQuickStarts = false;
    return (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-4 pb-20 pt-24">
            <div className="pointer-events-none select-none flex w-full max-w-[984px] flex-col items-center justify-center text-center" style={{ color: theme.node.text }}>
                <div className="relative -top-2 flex items-center justify-center gap-1.5 text-sm font-medium tracking-tight">
                    <span className="relative inline-grid size-5 place-items-center" aria-hidden="true">
                        <PlusCircle className="size-[18px] opacity-80" />
                        <MousePointer2 className="absolute -bottom-1 -right-1 size-3.5 fill-current stroke-[1.5]" />
                    </span>
                    <span>雙擊畫布 <span className="mx-1 opacity-45">·</span> 自由生成節點</span>
                </div>
                {onOpenAssistant ? (
                    <button
                        type="button"
                        className="mt-1.5 rounded-md px-2.5 py-1 text-xs opacity-70 transition-opacity hover:opacity-100"
                        style={{ color: theme.node.muted }}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onClick={onOpenAssistant}
                    >
                        或讓助手搭個草案 <span className="ml-1 opacity-70">⌘J</span>
                    </button>
                ) : null}
                {showQuickStarts ? <div className="mt-6 grid w-full max-w-[984px] grid-cols-2 gap-2 sm:grid-cols-4">
                    {quickStarts.map((item) => {
                        const command = commandById.get(item.commandId);
                        if (!command) return null;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                disabled={Boolean(command.disabledReason)}
                                aria-disabled={Boolean(command.disabledReason)}
                                aria-description={command.disabledReason}
                                aria-label={item.label}
                                onDoubleClick={(event) => event.stopPropagation()}
                                onClick={() => { if (!command.disabledReason) command.onClick(); }}
                                className={`group flex min-h-[56px] min-w-0 flex-row items-center gap-3 rounded-lg border px-3 py-2 text-left shadow-sm outline-none transition focus-visible:ring-2 motion-reduce:transition-none ${command.disabledReason ? "cursor-not-allowed opacity-40 grayscale" : "hover:-translate-y-0.5 hover:brightness-105 motion-reduce:hover:translate-y-0"}`}
                                style={{ background: theme.node.fill, borderColor: theme.node.stroke, boxShadow: theme.node.shadow, "--tw-ring-color": theme.accent.primary } as CSSProperties}
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-md" style={{ color: "#fff", background: item.accent, boxShadow: `0 6px 16px ${item.accent}33` }}>{item.icon}</span>
                                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                    <span className="min-w-0 text-xs font-medium leading-4 sm:truncate">{item.label}</span>
                                    {(command.disabledReason ? "正在開發" : item.badge) ? <span className="shrink-0 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium max-[480px]:hidden" style={{ color: theme.node.muted }}>{command.disabledReason ? "正在開發" : item.badge}</span> : null}
                                </span>
                            </button>
                        );
                    })}
                </div> : null}
                <button type="button" aria-label="新增第一項" className="sr-only" tabIndex={-1} onClick={() => commandById.get("text")?.onClick()} />
            </div>
            {connectionsHintOpen ? (
                <div
                    className="canvas-connections-hint pointer-events-auto fixed bottom-[52px] left-[176px] z-[var(--z-toolbar)] flex min-w-[218px] items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium shadow-lg max-sm:hidden"
                    style={{ background: "#6fe8e5", color: "#10292a" }}
                >
                    <span>點選可顯示/隱藏畫布上的連線</span>
                    <button
                        type="button"
                        aria-label="關閉連線提示"
                        className="grid size-4 shrink-0 place-items-center rounded-full transition hover:bg-black/10"
                        onClick={() => {
                            setConnectionsHintOpen(false);
                            try { window.localStorage.setItem("canvas:connections-hint-dismissed", "1"); } catch { /* ignore */ }
                        }}
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function PathCard({ icon, title, description, action, accent, theme, focusStyle, onClick }: {
    icon: ReactNode;
    title: string;
    description: string;
    action: string;
    accent: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    focusStyle: CSSProperties;
    onClick: () => void;
}) {
    return (
        <section className="flex min-h-[176px] flex-col rounded-lg border p-4 shadow-sm backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <span className="grid size-9 place-items-center rounded-md" style={{ background: `${accent}16`, color: accent }}>{icon}</span>
            <div className="mt-3 text-base font-semibold">{title}</div>
            <p className="mt-1 min-h-10 text-sm leading-5" style={{ color: theme.node.muted }}>{description}</p>
            <button type="button" className="mt-auto inline-flex h-9 w-full items-center justify-between rounded-md border px-3 text-sm font-semibold outline-none transition hover:brightness-105 focus-visible:ring-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, ...focusStyle }} onClick={onClick}>
                <span>{action}</span><ArrowRight className="size-4" />
            </button>
        </section>
    );
}

export function CanvasShortDramaGuide({ progress, collapsed, onToggle, onSkip, onStepClick }: {
    progress: CanvasShortDramaProgress;
    collapsed: boolean;
    onToggle: () => void;
    onSkip: () => void;
    onStepClick: (stepId: CanvasShortDramaStepId) => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    if (!progress.active || collapsed) return null;
    return (
        <div data-canvas-no-zoom className="absolute left-1/2 top-[var(--canvas-topbar-offset)] z-[var(--z-toolbar)] flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-sm backdrop-blur" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <div className="hide-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto">
                <div className="flex shrink-0 items-center px-[var(--space-1)]">
                    {progress.steps.map((step, index) => (
                        <Fragment key={step.id}>
                            {index ? (
                                <span
                                    aria-hidden
                                    className="shrink-0 rounded-full transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ width: "var(--flow-step-track-width)", height: "var(--flow-step-track-height)", background: step.status === "pending" ? theme.node.stroke : theme.accent.primary }}
                                />
                            ) : null}
                            <button
                                type="button"
                                aria-current={step.status === "current" ? "step" : undefined}
                                className="flex h-8 shrink-0 items-center gap-[var(--flow-step-gap)] rounded-md px-[var(--space-1-half)] outline-none transition-colors motion-reduce:transition-none hover:bg-black/5 focus-visible:ring-1 focus-visible:ring-inset dark:hover:bg-white/10"
                                style={{ "--tw-ring-color": theme.accent.primary } as CSSProperties}
                                onClick={() => onStepClick(step.id)}
                            >
                                <span
                                    className="grid shrink-0 place-items-center rounded-full font-semibold transition-all duration-150 motion-reduce:transition-none"
                                    style={{
                                        width: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        height: step.status === "current" ? "var(--flow-step-node-current)" : "var(--flow-step-node)",
                                        background: step.status === "pending" ? "transparent" : theme.accent.primary,
                                        border: step.status === "pending" ? "var(--stroke-2) solid var(--cn-stroke)" : "none",
                                        color: step.status === "pending" ? theme.node.muted : theme.accent.onPrimary,
                                        boxShadow: step.status === "current" ? "var(--flow-step-current-glow)" : undefined,
                                        fontSize: step.status === "current" ? "var(--fs-body)" : "var(--fs-caption)",
                                    }}
                                >
                                    {step.status === "completed" ? <Check className="size-3.5" /> : index + 1}
                                </span>
                                <span
                                    className="whitespace-nowrap text-[var(--fs-caption)] font-semibold transition-colors duration-150 motion-reduce:transition-none"
                                    style={{ color: step.status === "current" ? theme.accent.primary : step.status === "completed" ? theme.node.text : theme.node.muted }}
                                >
                                    {step.label}
                                </span>
                            </button>
                        </Fragment>
                    ))}
                </div>
            </div>
            <span className="mx-1 h-4 w-px shrink-0" style={{ background: theme.toolbar.border }} />
            {!progress.completed ? <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[var(--fs-label)] outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10" style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties} onClick={onSkip}><X className="size-3" />跳過導引</button> : null}
            <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10" style={{ color: theme.node.muted, "--tw-ring-color": theme.accent.primary } as CSSProperties} onClick={onToggle} aria-label="摺疊短劇流程"><ChevronUp className="size-3.5" /></button>
        </div>
    );
}

export function CanvasStylePlaceholderNodeContent({ onChoose }: { onChoose: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    return (
        <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center" style={{ color: theme.node.text }}>
            <span className="grid size-10 place-items-center rounded-md" style={{ background: `${theme.accent.primary}16`, color: theme.accent.primary }}><Palette className="size-5" /></span>
            <div className="mt-3 text-sm font-semibold">專案畫風</div>
            <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>待選擇</div>
            <button type="button" className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium outline-none transition hover:brightness-105 focus-visible:ring-2" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, "--tw-ring-color": theme.accent.primary } as CSSProperties} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onChoose(); }}><Sparkles className="size-3.5" />選擇畫風</button>
        </div>
    );
}

export function CanvasStoryInputNodeContent({ node, onEdit }: { node: CanvasNodeData; onEdit: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const content = (node.metadata?.content || "").replace(/\s+/g, " ").trim();
    return (
        <div className="flex h-full w-full flex-col overflow-hidden p-4" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.itemHover, color: theme.node.muted }}><AlignLeft className="size-4" /></span><span className="truncate text-sm font-semibold">故事梗概</span></div>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-hidden border-t pt-3 text-xs leading-6" style={{ borderColor: theme.node.stroke, color: content ? theme.node.muted : theme.node.placeholder }}>{content || "寫下題材、角色、衝突和結局方向…"}</div>
            <button type="button" className="mt-3 inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10" style={{ color: theme.node.text, "--tw-ring-color": theme.accent.primary } as CSSProperties} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onEdit(); }}><Pencil className="size-3.5" />編輯故事</button>
        </div>
    );
}
