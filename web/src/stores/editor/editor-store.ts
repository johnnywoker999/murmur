// 編輯器狀態機（ADR-0002）：命令唯一入口 + 有界快照撤銷 + 1.5s 防抖儲存。
// - dispatch：同步 apply 命令，失敗（fail-closed）不改狀態、錯誤進 saveError 供 UI 上報
// - 儲存層依賴注入（saveTimeline），當前由頁面繫結本地儲存；儲存序列化防止舊快照覆蓋新狀態
// - previewGesture/commitGesture/cancelGesture：拖拽等連續手勢期間只改渲染態，
//   鬆手提交時一次性入歷史（手勢不逐幀汙染撤銷棧）

import { create, type StoreApi, type UseBoundStore } from "zustand";

import type { TimelineProject } from "@/types/timeline";
import {
    createEditorHistory,
    pushEditorHistory,
    redoEditorHistory,
    undoEditorHistory,
    type EditorHistory,
} from "@/lib/timeline/editor-history";
import { getEditorCommandRegistry, type EditCommand, type EditorCommandRegistry } from "@/lib/timeline/editor-commands";

export type SaveTimeline = (project: TimelineProject) => Promise<void>;

export const EDITOR_SAVE_DEBOUNCE_MS = 1500;

export type EditorStore = {
    /** 編輯器當前專案；null 表示尚未載入（進入編輯器前由 load 注入）。 */
    project: TimelineProject | null;
    history: EditorHistory | null;
    /** 手勢預覽進行中（drag/trim 未鬆手）：期間 dispatch/undo/redo 被拒絕。 */
    inPreview: boolean;
    isDirty: boolean;
    saving: boolean;
    saveError: string | null;
    lastSavedAt: number | null;
    /** 當前選中片段 id（檢查器/預覽聯動；純 UI 狀態，不入命令歷史）。 */
    selectedClipId: string | null;
    selectClip: (id: string | null) => void;
    /** 播放頭位置（監視器與時間線面板共享的 transport，毫秒；純 UI 狀態，不入命令歷史）。 */
    transportMs: number;
    setTransportMs: (ms: number) => void;
    /** 載入/切換專案：重置歷史與儲存狀態（資料由外部傳入，不觸發儲存）。 */
    load: (project: TimelineProject) => void;
    /** 應用一條編輯命令（唯一修改入口）。 */
    dispatch: (cmd: EditCommand) => void;
    undo: () => void;
    redo: () => void;
    /** 手勢預覽：臨時應用命令到渲染態，不入歷史。 */
    previewGesture: (cmd: EditCommand) => void;
    /** 提交預覽：預覽態作為一次歷史入棧並觸發儲存。 */
    commitGesture: () => void;
    /** 取消預覽：丟棄預覽態，回到手勢前狀態。 */
    cancelGesture: () => void;
    /** 立即儲存（離開編輯器/解除安裝前呼叫）。 */
    flushSave: () => Promise<void>;
    hasActiveSave: () => boolean;
};

export type EditorStoreOptions = {
    saveTimeline?: SaveTimeline;
    registry?: EditorCommandRegistry;
    debounceMs?: number;
};

/**
 * 建立一個專案級時間線狀態容器。
 *
 * 狀態容器不負責服務端持久化：saveTimeline 是呼叫方注入的本地儲存介面卡，
 * 這裡僅保證命令、撤銷歷史和儲存佇列的一致性。儲存失敗必須保留 isDirty，
 * 讓 UI 能提示未落盤並在下一次變更或解除安裝沖刷時重試。
 */
export function createEditorStore(options: EditorStoreOptions = {}): UseBoundStore<StoreApi<EditorStore>> {
    const registry = options.registry ?? getEditorCommandRegistry();
    const saveTimeline = options.saveTimeline;
    const debounceMs = options.debounceMs ?? EDITOR_SAVE_DEBOUNCE_MS;

    return create<EditorStore>((set, get) => {
        let saveTimer: ReturnType<typeof setTimeout> | null = null;
        // 儲存序列鏈：避免並行儲存導致舊快照後落地覆蓋新狀態
        let saveChain: Promise<void> = Promise.resolve();
        let pendingSaves = 0;

        const setSaveError = (err: unknown) =>
            set({ saveError: err instanceof Error ? err.message : String(err) });

        const performSave = (): Promise<void> => {
            const { project } = get();
            if (!project) return Promise.resolve();
            set({ saving: true });
            pendingSaves += 1;
            const chain = saveChain
                .then(() => saveTimeline!(project))
                .then(
                    () => set({ saving: false, isDirty: false, saveError: null, lastSavedAt: Date.now() }),
                    (err: unknown) => set({ saving: false, saveError: err instanceof Error ? err.message : String(err), isDirty: true }),
                ).finally(() => { pendingSaves -= 1; });
            saveChain = chain;
            return chain;
        };

        const scheduleSave = () => {
            if (!saveTimeline) return; // 未注入儲存層：保持 dirty，由上層決定持久化時機
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                if (get().isDirty) performSave();
            }, debounceMs);
        };

        return {
            project: null,
            history: null,
            inPreview: false,
            isDirty: false,
            saving: false,
            saveError: null,
            lastSavedAt: null,
            selectedClipId: null,
            transportMs: 0,

            selectClip: (id) => set({ selectedClipId: id }),

            setTransportMs: (ms) => set({ transportMs: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : 0 }),

            load: (project) => {
                if (saveTimer) {
                    clearTimeout(saveTimer);
                    saveTimer = null;
                }
                set({ project, history: createEditorHistory(project), inPreview: false, isDirty: false, saving: false, saveError: null, lastSavedAt: null, selectedClipId: null, transportMs: 0 });
            },

            dispatch: (cmd) => {
                const { project, history, inPreview } = get();
                if (!project || !history) return;
                if (inPreview) {
                    set({ saveError: "cannot dispatch while a gesture preview is active; commit or cancel first" });
                    return;
                }
                let next: TimelineProject;
                try {
                    next = registry.apply(project, cmd);
                } catch (err) {
                    setSaveError(err);
                    return;
                }
                set({ project: next, history: pushEditorHistory(history, next), isDirty: true, saveError: null });
                scheduleSave();
            },

            undo: () => {
                const { project, history, inPreview } = get();
                if (!project || !history || inPreview) return;
                const next = undoEditorHistory(history);
                if (!next) return;
                set({ project: next.current, history: next, isDirty: true });
                scheduleSave();
            },

            redo: () => {
                const { project, history, inPreview } = get();
                if (!project || !history || inPreview) return;
                const next = redoEditorHistory(history);
                if (!next) return;
                set({ project: next.current, history: next, isDirty: true });
                scheduleSave();
            },

            previewGesture: (cmd) => {
                const { project, history } = get();
                if (!project || !history) return;
                // 手勢進行中允許基於當前預覽態繼續應用（拖拽每幀呼叫）；
                // 預覽始終從手勢前歷史提交，因此預覽期間不觸碰歷史。
                let next: TimelineProject;
                try {
                    next = registry.apply(project, cmd);
                } catch (err) {
                    setSaveError(err);
                    return;
                }
                set({ project: next, inPreview: true });
            },

            commitGesture: () => {
                const { project, history, inPreview } = get();
                if (!project || !history || !inPreview) return;
                set({ project, history: pushEditorHistory(history, project), inPreview: false, isDirty: true, saveError: null });
                scheduleSave();
            },

            cancelGesture: () => {
                const { history, inPreview } = get();
                if (!history || !inPreview) return;
                set({ project: history.current, history, inPreview: false });
            },

            flushSave: async () => {
                if (saveTimer) {
                    clearTimeout(saveTimer);
                    saveTimer = null;
                }
                if (get().isDirty && saveTimeline) await performSave();
            },
            hasActiveSave: () => pendingSaves > 0 || saveTimer !== null,
        };
    });
}
