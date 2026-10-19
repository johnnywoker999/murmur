import { useCallback, useEffect, useRef, useState } from "react";

import { createDirectorSaveCoordinator, type DirectorCloseDecision, type DirectorDraftEnvelope, type DirectorSaveCoordinator } from "@/lib/canvas/director/director-save";
import { directorSaveProgress, idleDirectorSaveProgress, resolveDirectorDraftStorage, type DirectorSaveProgress } from "@/lib/canvas/director/director-save-wiring";
import { recordDirectorDiagnostic } from "@/lib/canvas/director/director-diagnostics-recorder";
import { useUserStore } from "@/stores/use-user-store";
import { registerDesktopUpdatePreparation } from "@/services/desktop-update-preparation";
import type { DirectorScene } from "@/types/director";

export type DirectorSaveController = {
    progress: DirectorSaveProgress;
    /** canonical 提交入口：預覽態與「僅映象」路徑都不得呼叫。 */
    commitScene: (scene: DirectorScene) => void;
    retry: () => Promise<boolean>;
    restoreCandidate: () => DirectorDraftEnvelope | null;
    restoreDraft: (candidate: DirectorDraftEnvelope) => boolean;
    discardDraft: () => boolean;
    prepareClose: () => Promise<DirectorCloseDecision>;
    handlePageHide: () => Promise<boolean>;
};

/**
 * 按 scene.id 持有唯一 coordinator：切換場景或解除安裝時 dispose。
 * persistScene 必須把 request.scene 落到專案狀態，flushPersistence 負責真正落盤。
 */
export function useDirectorSaveCoordinator(input: { sceneId: string | null; initialScene: DirectorScene | null; persistScene: (scene: DirectorScene) => void; flushPersistence: () => void | Promise<void> }): DirectorSaveController {
    const { sceneId, initialScene, persistScene, flushPersistence } = input;

    const coordinatorRef = useRef<DirectorSaveCoordinator | null>(null);
    const persistSceneRef = useRef(persistScene);
    const flushPersistenceRef = useRef(flushPersistence);
    const initialSceneRef = useRef(initialScene);
    const [progress, setProgress] = useState<DirectorSaveProgress>(idleDirectorSaveProgress);

    // scope 取響應式 user id：user-session 先切 active scope 再 setUser，
    // 因此這裡能在使用者變化時重建 coordinator，且不會在播放時每幀讀 localStorage。
    const scope = useUserStore((state) => state.user?.id) ?? "guest";

    // 依賴為空的 effect 每次 render 後都跑，保證 coordinator effect 讀到的是最新回撥。
    useEffect(() => {
        persistSceneRef.current = persistScene;
        flushPersistenceRef.current = flushPersistence;
        initialSceneRef.current = initialScene;
    });

    useEffect(() => {
        const base = initialSceneRef.current;
        if (!sceneId || !base || base.id !== sceneId) {
            coordinatorRef.current = null;
            return;
        }

        let active = true;
        const coordinator = createDirectorSaveCoordinator({
            initialScene: base,
            scope,
            storage: resolveDirectorDraftStorage(() => globalThis.localStorage),
            flush: async (request) => {
                try {
                    // 先把這次 flush 對應的場景寫進專案狀態，再等持久化真正完成。
                    persistSceneRef.current(request.scene);
                    await flushPersistenceRef.current();
                } catch (error) {
                    // 只記錄穩定碼與安全欄位；原始 error 繼續上拋給 coordinator 走 error/draft 語義。
                    recordDirectorDiagnostic("DIRECTOR_SAVE_FLUSH_FAILED", { sceneId: request.scene.id, revision: request.revision });
                    throw error;
                }
            },
        });

        coordinatorRef.current = coordinator;
        setProgress(directorSaveProgress(coordinator.getSnapshot()));

        // 通知裡必須讀完整快照：只搬 status 會讓 confirmedRevision/draftStored 停在舊值，
        // UI 繼續顯示未儲存、beforeunload 也會誤攔。
        const unsubscribe = coordinator.onStatusChange(() => {
            if (!active) return;
            setProgress(directorSaveProgress(coordinator.getSnapshot()));
        });

        const unregisterUpdate = registerDesktopUpdatePreparation(async () => {
            if (!(await coordinator.flushLatest())) throw new Error("導演工作臺尚未儲存完成。");
        }, coordinator.hasActiveSave);

        return () => {
            active = false;
            unsubscribe();
            coordinatorRef.current = null;

            // 解除安裝前把未確認改動推完再 dispose，否則 debounce 裡的最後一次編輯只剩本地草稿。
            const pending = coordinator.getSnapshot();
            if (pending.confirmedRevision < pending.revision) {
                const flushing = coordinator.flushLatest();
                unregisterUpdate();
                void flushing
                    .catch(() => undefined)
                    .finally(() => coordinator.dispose());
                return;
            }
            unregisterUpdate();
            coordinator.dispose();
        };
    }, [sceneId, scope]);

    /** dispose 後 coordinatorRef 為 null，因此解除安裝期的呼叫不會再 setState。 */
    const syncProgress = useCallback(() => {
        const coordinator = coordinatorRef.current;
        if (coordinator) setProgress(directorSaveProgress(coordinator.getSnapshot()));
    }, []);

    /** canonical 提交唯一入口：預覽態和「僅映象當前 draft」都不得呼叫。 */
    const commitScene = useCallback(
        (scene: DirectorScene) => {
            if (!coordinatorRef.current?.edit(scene)) return;
            syncProgress();
        },
        [syncProgress],
    );

    const retry = useCallback(async () => {
        const coordinator = coordinatorRef.current;
        if (!coordinator) return false;
        const result = await coordinator.retry();
        syncProgress();
        return result;
    }, [syncProgress]);

    const restoreCandidate = useCallback(() => coordinatorRef.current?.restoreCandidate() ?? null, []);

    const restoreDraft = useCallback(
        (candidate: DirectorDraftEnvelope) => {
            const coordinator = coordinatorRef.current;
            if (!coordinator?.explicitRestore(candidate)) return false;
            // 恢復後必須回到專案狀態並觸發可靠儲存，否則草稿只活在本地。
            persistSceneRef.current(candidate.scene);
            void coordinator.flushLatest().finally(syncProgress);
            syncProgress();
            return true;
        },
        [syncProgress],
    );

    const discardDraft = useCallback(() => {
        const discarded = coordinatorRef.current?.discardDraft() ?? false;
        syncProgress();
        return discarded;
    }, [syncProgress]);

    const prepareClose = useCallback(async () => {
        const coordinator = coordinatorRef.current;
        if (!coordinator) return "close" as DirectorCloseDecision;
        const decision = await coordinator.prepareClose();
        syncProgress();
        return decision;
    }, [syncProgress]);

    /**
     * pagehide：dirty 時只能走 coordinator.handlePageHide —— 它的 flush 已經
     * persist(request.scene) + await flushPersistence，元件再疊一次就是重複落盤。
     * clean 時 coordinator 不會 flush，因此這裡顯式落盤，保留原有「離開頁面必落盤」語義。
     */
    const handlePageHide = useCallback(async () => {
        const coordinator = coordinatorRef.current;
        try {
            if (!coordinator) {
                await flushPersistenceRef.current();
                return false;
            }
            const pending = coordinator.getSnapshot();
            if (pending.confirmedRevision === pending.revision) {
                await flushPersistenceRef.current();
                return true;
            }
            return await coordinator.handlePageHide();
        } catch {
            return false;
        } finally {
            syncProgress();
        }
    }, [syncProgress]);

    return {
        progress,
        commitScene,
        retry,
        restoreCandidate,
        restoreDraft,
        discardDraft,
        prepareClose,
        handlePageHide,
    };
}
