import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    CircleDot,
    Download,
    Loader2,
    Maximize,
    Minimize,
    PanelRightClose,
    PanelRightOpen,
    Redo2,
    Sparkles,
    Undo2,
    X,
} from "lucide-react";

import type { ProjectAsset, ProjectDetail, ShotArtifact } from "@/services/api/projects";
import { linkProjectAsset, listProjectAssets } from "@/services/api/projects";
import { useEditorSlots, type EditorSlotRegistration } from "@/lib/plugins/editor-slot-registry";
import { pluginMayRenderEditorSlot } from "@/lib/plugins/plugin-permission-check";
import { EditorStoreProvider } from "@/components/editor/editor-context";
import { createEditorStore } from "@/stores/editor/editor-store";
import { registerDesktopUpdatePreparation } from "@/services/desktop-update-preparation";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import type { TimelineProject } from "@/types/timeline";

const EDITOR_TIMELINE_KEY = "editor-timeline";

/**
 * 為尚未產生本地時間線的專案建立一個可編輯的初始時間線。
 * 該時間線只寫入當前使用者與專案作用域的本地儲存，不代表服務端已有成片資料。
 */
function createEmptyEditorTimeline(): TimelineProject {
    // 沒有真實素材時返回空時間線，避免把不存在的 demo node 當成可剪輯資產。
    // 使用者新增素材後由編輯器命令建立軌道和片段；空專案不應被偽造為已有成片。
    return normalizeTimelineProject({ version: 2, tracks: [], clips: [], durationMs: 0 });
}

/** 插槽堆疊：只渲染通過許可權檢查的外掛貢獻；無可用外掛時顯示明確的缺失能力提示。
 *  缺許可權外掛不渲染，改為一行診斷提示；無貢獻時顯示空態（停用外掛可見）。 */
function SlotStack({ slots, emptyHint }: { slots: EditorSlotRegistration[]; emptyHint: string }) {
    const allowed = slots.filter((slot) => pluginMayRenderEditorSlot(slot.pluginId, slot.slot).allowed);
    const denied = slots.filter((slot) => !pluginMayRenderEditorSlot(slot.pluginId, slot.slot).allowed);
    if (allowed.length === 0 && denied.length === 0) {
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="max-w-md text-sm text-[var(--director-dock-fg)]">{emptyHint}</p>
            </div>
        );
    }
    return (
        <>
            {allowed.map((slot) => (
                <div key={slot.id} className="min-h-0 flex-1 overflow-hidden">
                    {slot.render({ pluginId: slot.pluginId })}
                </div>
            ))}
            {denied.map((slot) => {
                const verdict = pluginMayRenderEditorSlot(slot.pluginId, slot.slot);
                const missing =
                    verdict.allowed === false && verdict.reason === "missing-permission" ? verdict.missing : null;
                return (
                    <div
                        key={slot.id}
                        title={`外掛 ${slot.pluginId} 缺少 ${missing ?? "註冊"}，已按 fail-closed 拒絕渲染`}
                        className="flex min-h-8 shrink-0 items-center gap-2 bg-[var(--director-danger)]/10 px-3 text-[11px] text-[var(--director-danger)]"
                    >
                        <AlertTriangle className="size-3 shrink-0" />
                        <span className="truncate">
                            {missing
                                ? `外掛 ${slot.pluginId} 缺少 ${missing} 許可權，已停用該面板。`
                                : `外掛 ${slot.pluginId} 未註冊，已停用該面板。`}
                        </span>
                    </div>
                );
            })}
        </>
    );
}

/** 面板 Tab 條（Concat 式分類/屬性切換）：只渲染啟用槽，全部槽始終註冊。 */
function PanelTabs({
    tabs,
    active,
    onChange,
    trailing,
}: {
    tabs: { id: string; label: string }[];
    active: string;
    onChange: (id: string) => void;
    trailing?: React.ReactNode;
}) {
    return (
        <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-1.5">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    className={`h-7 rounded-md px-2.5 text-xs transition-colors ${
                        active === tab.id
                            ? "bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]"
                            : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                    }`}
                >
                    {tab.label}
                </button>
            ))}
            <div className="flex-1" />
            {trailing}
        </div>
    );
}

/** 頂部工具欄（Concat 主選單區）：專案名 + 全域性撤銷/重做 + 儲存狀態 + 匯出主按鈕。 */
function EditorTopBar({
    onExport,
    isFullscreen,
    onToggleFullscreen,
    aiOpen,
    onToggleAi,
}: {
    onExport: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    aiOpen: boolean;
    onToggleAi: () => void;
}) {
    const { project, history, isDirty, saving, saveError, undo, redo } = useEditorStoreContext();
    const canUndo = (history?.undoStack.length ?? 0) > 0;
    const canRedo = (history?.redoStack.length ?? 0) > 0;

    return (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3">
            <button
                type="button"
                aria-label="撤銷"
                title="撤銷（Cmd/Ctrl+Z）"
                onClick={undo}
                disabled={!canUndo}
                className="grid size-8 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-35"
            >
                <Undo2 className="size-4" />
            </button>
            <button
                type="button"
                aria-label="重做"
                title="重做（Cmd/Ctrl+Shift+Z）"
                onClick={redo}
                disabled={!canRedo}
                className="grid size-8 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] disabled:pointer-events-none disabled:opacity-35"
            >
                <Redo2 className="size-4" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5">
                <span className="grid size-8 place-items-center" title={saveError ?? (saving ? "儲存中" : isDirty ? "有未儲存的更改" : "已儲存")}>
                    {saveError ? (
                        <AlertTriangle className="size-4 text-[var(--director-danger)]" aria-label="儲存失敗" />
                    ) : saving ? (
                        <Loader2 className="size-4 animate-spin text-[var(--director-dock-fg)]" aria-label="儲存中" />
                    ) : isDirty ? (
                        <CircleDot className="size-3.5 text-[var(--director-warning)]" aria-label="未儲存" />
                    ) : (
                        <Check className="size-4 text-[var(--director-success)]" aria-label="已儲存" />
                    )}
                </span>
                <button
                    type="button"
                    aria-label="AI 剪輯助手"
                    aria-pressed={aiOpen}
                    title="AI 剪輯助手（編輯意圖轉時間線指令）"
                    onClick={onToggleAi}
                    className={`grid size-8 place-items-center rounded-md transition-colors ${
                        aiOpen
                            ? "bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]"
                            : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                    }`}
                >
                    <Sparkles className="size-4" />
                </button>
                <button
                    type="button"
                    aria-label={isFullscreen ? "退出全屏" : "全屏編輯"}
                    title={isFullscreen ? "退出全屏（Esc）" : "全屏編輯"}
                    onClick={onToggleFullscreen}
                    className="grid size-8 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                >
                    {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                </button>
                <button
                    type="button"
                    aria-label="匯出"
                    title="匯出"
                    onClick={onExport}
className="grid size-8 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)] hover:text-[var(--director-dock-fg-strong)]"
                >
                    <Download className="size-4" />
                </button>
            </div>
        </header>
    );
}

/** 底部狀態列：時長 / 片段數 / 軌道數 / 快捷鍵提示。 */
function EditorStatusBar({ projectName }: { projectName: string }) {
    const { project } = useEditorStoreContext();
    const clipCount = project?.clips.length ?? 0;
    const trackCount = project?.tracks.length ?? 0;
    const durationMs = project?.durationMs ?? 0;

    return (
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] px-3 text-[10px] text-[var(--director-dock-fg)]">
            <span className="truncate text-[var(--director-dock-fg-strong)]">{projectName}</span>
            <span className="tabular-nums">時長 {formatTimelineTime(durationMs)}</span>
            <span>片段 {clipCount}</span>
            <span>軌道 {trackCount}</span>
            <div className="flex-1" />
            <span className="hidden sm:inline">⌘Z 撤銷 · ⇧⌘Z 重做 · 拖拽移動 / 邊緣裁剪片段</span>
        </footer>
    );
}

export default function ProjectEditorView({ detail }: { detail: ProjectDetail }) {
    // 插槽註冊（全部 8 種始終註冊；左/右欄 Tab 決定當前渲染哪個）。
    const previewSlots = useEditorSlots("preview-renderer");
    const timelineSlots = useEditorSlots("timeline-panel");
    const assetSlots = useEditorSlots("asset-ingest");
    const transcriptionSlots = useEditorSlots("transcription-provider");
    const inspectorSlots = useEditorSlots("inspector");
    const subtitleSlots = useEditorSlots("subtitle-tool");
    const exportSlots = useEditorSlots("export-renderer");
    const aiSlots = useEditorSlots("ai-assistant");

    const [leftTab, setLeftTab] = useState("asset");
    const [rightTab, setRightTab] = useState("inspector");

    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [assets, setAssets] = useState<ProjectAsset[]>(detail.assets);
    const workbenchRef = useRef<HTMLDivElement | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    // AI 助手浮層由頂欄按鈕開啟，支援 Esc 和遮罩點選關閉，避免長期遮擋編輯區。
    const [aiOpen, setAiOpen] = useState(false);
    useEffect(() => {
        if (!aiOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAiOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [aiOpen]);

    // 底部時間線高度（px）：分隔條拖拽調整（120–480）。
    const [timelineH, setTimelineH] = useState(240);
    const splitterRef = useRef<{ startY: number; startH: number } | null>(null);
    const scope = getActiveUserScope();
    const projectId = detail.project.id;
    const assetOwnerKey = JSON.stringify([scope, projectId]);
    const activeAssetOwnerKeyRef = useRef(assetOwnerKey);
    const assetRefreshSequenceRef = useRef(0);
    activeAssetOwnerKeyRef.current = assetOwnerKey;

    const refreshAssets = useCallback(async (): Promise<ProjectAsset[] | null> => {
        const requestedOwnerKey = assetOwnerKey;
        const requestSequence = assetRefreshSequenceRef.current + 1;
        assetRefreshSequenceRef.current = requestSequence;
        try {
            const list = (await listProjectAssets(projectId)).assets;
            // 專案、賬號或重新整理序號變化都說明當前響應已經過期；舊響應不得覆蓋新上下文的素材快照。
            if (
                activeAssetOwnerKeyRef.current !== requestedOwnerKey ||
                assetRefreshSequenceRef.current !== requestSequence
            ) {
                return null;
            }
            setAssets(list);
            return list;
        } catch (error) {
            // 過期請求的錯誤不屬於當前編輯器上下文，也不應產生誤導性告警。
            if (activeAssetOwnerKeyRef.current !== requestedOwnerKey) return null;
            // 資產列表屬於讀展示路徑：保留當前快照，避免網路抖動讓編輯器清空素材。
            // 但不能把快照當成同步成功；記錄專案上下文，便於定位並在下次進入時重試。
            console.warn("重新整理專案素材列表失敗，已保留當前快照", { projectId, scope, error });
            return null;
        }
    }, [assetOwnerKey, projectId, scope]);

    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === workbenchRef.current);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    const toggleFullscreen = () => {
        const operation = document.fullscreenElement
            ? document.exitFullscreen()
            : workbenchRef.current?.requestFullscreen();
        void operation?.catch((error) => {
            console.warn("切換編輯器全屏狀態失敗", { projectId, error });
        });
    };

    const detailAssetsRef = useRef(detail.assets);
    detailAssetsRef.current = detail.assets;

    // 掛載、切換專案或切換賬號時先恢復詳情快照，再以服務端列表校準。
    // detail.assets 只用於切換瞬間佔位；refreshAssets 內部負責丟棄過期和亂序響應。
    useEffect(() => {
        setAssets(detailAssetsRef.current);
        void refreshAssets();
        return () => {
            // 使當前 owner 下仍在途的請求失效，避免元件解除安裝後提交 state。
            assetRefreshSequenceRef.current += 1;
        };
    }, [assetOwnerKey, refreshAssets]);

    const store = useMemo(
        () =>
            createEditorStore({
                saveTimeline: async (project: TimelineProject) => {
                    await localForageStorageForScope(scope).setItem(`${EDITOR_TIMELINE_KEY}:${projectId}`, JSON.stringify(project));
                },
            }),
        [projectId, scope],
    );

    useEffect(() => {
        const unregister = registerDesktopUpdatePreparation(async () => {
            if (store.getState().inPreview) throw new Error("請先完成當前剪輯操作。");
            await store.getState().flushSave();
            const saved = store.getState();
            // The editor records save failures in state rather than rejecting.
            if (saved.isDirty || saved.saving || saved.saveError) throw new Error("剪輯內容尚未儲存完成。");
        }, () => store.getState().hasActiveSave());
        return () => {
            // Start the final write before unregistering so the update guard
            // keeps observing it after this editor disappears.
            void store.getState().flushSave().catch(error => {
                console.error("編輯器解除安裝前儲存時間線失敗，待下次操作重試", { error });
            });
            unregister();
        };
    }, [store]);

    // 進入編輯器時只加載當前使用者和專案作用域的本地時間線；沒有真實資料時保持空時間線，禁止注入虛構片段。
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const storage = localForageStorageForScope(scope);
                const raw = await storage.getItem(`${EDITOR_TIMELINE_KEY}:${projectId}`);
                let loaded = createEmptyEditorTimeline();
                if (raw) {
                    try {
                        loaded = normalizeTimelineProject(JSON.parse(raw));
                    } catch (error) {
                        // 本地歷史資料屬於讀展示路徑：壞記錄不能阻塞編輯器啟動，
                        // 但必須記錄專案和儲存鍵，後續可按鍵清理或遷移，而不是把壞資料偽裝成有效時間線。
                        console.warn("讀取編輯器本地時間線失敗，已使用空時間線", {
                            projectId,
                            storageKey: `${EDITOR_TIMELINE_KEY}:${projectId}`,
                            error,
                        });
                    }
                }
                if (!cancelled) store.getState().load(loaded);
            } catch (error) {
                // IndexedDB/localforage 不可用時不寫入空時間線，避免覆蓋可能仍可恢復的本地資料。
                console.error("讀取編輯器本地時間線儲存失敗，保留編輯器初始狀態", { projectId, error });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [scope, projectId, store]);

    // 畫布產物自動同步：detail.shotArtifacts 中當前採用(storyboard/action_board/
    // 分鏡/匯出成片，且 ready + 有資源)尚未作為素材進本專案時，自動
    // linkProjectAsset(source=canvas) 併入素材庫 —— 剪輯器“素材選項”直接可用畫布產物。
    // 後端冪等（已連結直接返回）；單個失敗不阻塞其餘資源，但會記錄告警，
    // 下次進入編輯器時再次嘗試補同步。
    // 該集合只表示“當前使用者、當前專案會話已處理過”，切換賬號或專案時必須清空，避免跨作用域複用 resource ID。
    const syncedCanvasResourcesRef = useRef<Set<string>>(new Set());
    const syncedAssetOwnerKeyRef = useRef(assetOwnerKey);
    useEffect(() => {
        if (syncedAssetOwnerKeyRef.current === assetOwnerKey) return;
        syncedAssetOwnerKeyRef.current = assetOwnerKey;
        syncedCanvasResourcesRef.current.clear();
    }, [assetOwnerKey]);
    const canvasSyncKeys = detail.shotArtifacts
        .filter(
            (a): a is ShotArtifact & { resourceId: string } =>
                a.selected &&
                a.status === "ready" &&
                !!a.resourceId &&
                ["storyboard", "action_board", "start_frame", "end_frame", "video", "delivery"].includes(a.type),
        )
        .map((a) => `resource:${a.resourceId}`)
        .join(",");
    useEffect(() => {
        if (!canvasSyncKeys) return;
        const keys = canvasSyncKeys.split(",");
        // 已同步過的(本會話 ref)或已存在於專案素材的(storageKey 命中)均跳過 ——
        // storageKey 與 assetFromUploadedResource 合成格式一致(resource:<id>)。
        const existing = new Set(assets.map((a) => a.storageKey));
        const pending = keys.filter((key) => !syncedCanvasResourcesRef.current.has(key) && !existing.has(key));
        if (!pending.length) return;
        let cancelled = false;
        void (async () => {
            for (const key of pending) {
                if (cancelled) break;
                const resourceId = key.slice("resource:".length);
                try {
                    await linkProjectAsset(projectId, { assetId: resourceId, category: "material", source: "canvas" });
                    // 請求返回時元件可能已經切換專案；舊請求不能把結果記入新專案的會話集合。
                    if (cancelled) break;
                    syncedCanvasResourcesRef.current.add(key);
                } catch (error) {
                    // 單個資源同步失敗不阻塞其他資源；失敗項不加入已完成集合，
                    // 這樣下次進入編輯器仍會重試，而不是把未同步偽裝成成功。
                    console.warn("畫布產物同步到專案素材失敗", { projectId, resourceId, error });
                }
            }
            if (!cancelled) {
                // 統一經過帶 owner 與請求序號校驗的重新整理入口，防止同步後的舊請求覆蓋新專案快照。
                await refreshAssets();
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [assets, canvasSyncKeys, projectId, refreshAssets]);

    return (
        <EditorStoreProvider store={store} host={{ projectId, assets, refreshAssets }}>
            <div ref={workbenchRef} className="editor-workbench relative flex h-full min-h-0 flex-col bg-[var(--director-workspace-bg)]">
                <EditorTopBar
                    onExport={() => setRightTab("export")}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                    aiOpen={aiOpen}
                    onToggleAi={() => setAiOpen((v) => !v)}
                />
                {/* AI 助手浮層：常駐掛載、隨開關顯隱，關閉再開保留會話與輸入（狀態在 SlotStack 內）。 */}
                <div className={aiOpen ? "contents" : "hidden"}>
                    <button
                        type="button"
                        aria-label="關閉 AI 助手"
                        tabIndex={-1}
                        className="fixed inset-0 z-30 cursor-default bg-transparent"
                        onClick={() => setAiOpen(false)}
                    />
                    <div className="absolute right-2 top-14 z-40 flex h-[640px] max-h-[calc(100%-3.75rem)] w-[460px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface)] shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--director-sequencer-border)] px-3">
                            <Sparkles className="size-4 text-[var(--director-dock-fg)]/80" />
                            <span className="text-xs font-medium text-[var(--director-dock-fg-strong)]">AI 剪輯助手</span>
                            <span className="hidden truncate text-[10px] text-[var(--director-dock-fg)]/45 sm:inline">
                                編輯意圖 → 時間線指令（宿主校驗）
                            </span>
                            <div className="flex-1" />
                            <button
                                type="button"
                                aria-label="關閉"
                                title="關閉（Esc）"
                                onClick={() => setAiOpen(false)}
                                className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                            >
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <SlotStack slots={aiSlots} emptyHint="AI 助手外掛未載入。" />
                        </div>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
                    {/* 上區：左欄 + 預覽 + 右欄 */}
                    <div className="flex min-h-0 flex-1 gap-2">
                        {/* 左欄：素材 / 轉寫（Tab 化） */}
                        <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--director-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                            <PanelTabs
                                tabs={[
                                    { id: "asset", label: "素材" },
                                    { id: "transcription", label: "轉寫" },
                                ]}
                                active={leftTab}
                                onChange={setLeftTab}
                            />
                            {leftTab === "asset" ? (
                                <SlotStack slots={assetSlots} emptyHint="素材庫外掛未載入。" />
                            ) : (
                                <SlotStack slots={transcriptionSlots} emptyHint="轉寫外掛未載入。" />
                            )}
                        </aside>

                        {/* 中欄：預覽（佔滿剩餘高度） */}
                        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-[var(--director-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                            <SlotStack slots={previewSlots} emptyHint="預覽外掛未載入。" />
                        </main>

                        {/* 右欄：檢查 / 字幕 / 匯出（Tab 化，可摺疊為窄條；AI 助手已移至頂欄浮層） */}
                        {rightCollapsed ? (
                            <aside className="flex h-full w-9 shrink-0 flex-col items-center overflow-hidden rounded-xl bg-[var(--director-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                <button
                                    type="button"
                                    aria-label="展開檢查器"
                                    title="展開檢查器"
                                    onClick={() => setRightCollapsed(false)}
                                    className="mt-1.5 grid size-8 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                                >
                                    <PanelRightOpen className="size-4" />
                                </button>
                            </aside>
                        ) : (
                            <aside className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--director-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                <PanelTabs
                                    tabs={[
                                        { id: "inspector", label: "檢查" },
                                        { id: "subtitle", label: "字幕" },
                                        { id: "export", label: "匯出" },
                                    ]}
                                    active={rightTab}
                                    onChange={setRightTab}
                                    trailing={
                                        <button
                                            type="button"
                                            aria-label="摺疊檢查器"
                                            title="摺疊檢查器"
                                            onClick={() => setRightCollapsed(true)}
                                            className="grid size-7 place-items-center rounded-md text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                                        >
                                            <PanelRightClose className="size-3.5" />
                                        </button>
                                    }
                                />
                                {rightTab === "inspector" ? (
                                    <SlotStack slots={inspectorSlots} emptyHint="檢查器外掛未載入。" />
                                ) : rightTab === "subtitle" ? (
                                    <SlotStack slots={subtitleSlots} emptyHint="字幕工具外掛未載入。" />
                                ) : (
                                    <SlotStack slots={exportSlots} emptyHint="匯出外掛未載入。" />
                                )}
                            </aside>
                        )}
                    </div>

                    {/* 預覽/時間線拖拽分隔條（pointer capture，data-canvas-no-zoom 防畫布縮放） */}
                    <div
                        className="group relative z-10 -my-1 flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="調整時間線高度"
                        data-canvas-no-zoom
                        onPointerDown={(e) => {
                            splitterRef.current = { startY: e.clientY, startH: timelineH };
                            e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                            const drag = splitterRef.current;
                            if (!drag) return;
                            const next = drag.startH - (e.clientY - drag.startY);
                            setTimelineH(Math.min(480, Math.max(120, next)));
                        }}
                        onPointerUp={() => {
                            splitterRef.current = null;
                        }}
                        onPointerCancel={() => {
                            splitterRef.current = null;
                        }}
                    >
                        <div className="h-1 w-10 rounded-full bg-[var(--director-sequencer-border)] transition-colors group-hover:bg-[var(--director-dock-fg-strong)]/60" />
                    </div>

                    {/* 時間線：橫跨編輯面板全寬（左欄到右欄） */}
                    <div className="flex h-full shrink-0 flex-col overflow-hidden rounded-xl bg-[var(--director-sequencer-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ height: `${timelineH}px` }}>
                        <SlotStack slots={timelineSlots} emptyHint="時間線面板外掛未載入。" />
                    </div>
                </div>

                <EditorStatusBar projectName={detail.project.name} />
            </div>
        </EditorStoreProvider>
    );
}
