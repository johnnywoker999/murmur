import { ApiError } from "@/services/api/request";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { projectSyncProgress, useSyncProgressStore } from "@/stores/use-sync-progress-store";
import { getActiveUserScope } from "@/lib/user-scope";
import { isUserScopeAbandonedError } from "@/lib/user-scope-guard";

export class CanvasBackendSubmitPausedError extends Error {
    constructor(message = "畫布有未處理的外部改動，本次未提交") {
        super(message);
        this.name = "CanvasBackendSubmitPausedError";
    }
}

export class CanvasStaleScopeError extends Error {
    constructor(message = "賬號已切換，未提交畫布") {
        super(message);
        this.name = "CanvasStaleScopeError";
    }
}

/** 409 還可能表示節點/任務身份衝突，只有版本衝突才能進入草稿合併和重試。 */
export function isCanvasRevisionConflict(error: unknown) {
    if (!(error instanceof ApiError)) return false;
    return error.reason === "stale_revision" || error.status === 428 || (error.status === 409 && (!error.reason || error.reason === "conflict"));
}

export function isCanvasSubmitControlError(error: unknown) {
    return error instanceof CanvasBackendSubmitPausedError || error instanceof CanvasStaleScopeError || isUserScopeAbandonedError(error);
}

/**
 * 後端按 revision 原子拒絕（陳舊提交）後的收尾：先把本地內容落成草稿，
 * 再把該畫布標成衝突並暫停自動提交。不靜默重試，也不改寫本地內容。
 *
 * 草稿模組在載入期回到本模組的呼叫方，因此這裡用動態匯入打破載入環，
 * 同時保證只有真的發生陳舊拒絕時才付出這次載入成本。
 */
export async function handleRejectedCanvasBackendSave(id: string, project: CanvasProject | null | undefined, error: unknown, scope = getActiveUserScope()) {
    if (!isCanvasRevisionConflict(error)) return false;
    if (project) {
        try {
            const { preserveCanvasSyncDraft } = await import("@/services/canvas-sync-drafts");
            await preserveCanvasSyncDraft(project, scope);
        } catch (draftError) {
            console.error("畫布衝突草稿保留失敗", { id, error: draftError });
        }
    }
    pauseCanvasBackendSubmit(id, scope);
    return true;
}

export function pauseCanvasBackendSubmit(id: string, scope = getActiveUserScope(), message = "畫布已被其他入口修改，本次改動未提交；現有內容已保留在本機") {
    useSyncProgressStore.getState().setProjectProgress(id, { phase: "conflict", message }, scope);
}

/** 衝突後暫停自動提交，避免同一份過時 revision 反覆提交。 */
export function canvasBackendSubmitPaused(id: string, scope = getActiveUserScope()) {
    return projectSyncProgress(id, scope)?.phase === "conflict";
}

/** 後端已接受這次提交：解除暫停，畫布恢復自動儲存。 */
export function resumeCanvasBackendSubmit(id: string, scope = getActiveUserScope()) {
    if (!canvasBackendSubmitPaused(id, scope)) return;
    useSyncProgressStore.getState().setProjectProgress(id, { phase: "done", message: "畫布已儲存" }, scope);
}
