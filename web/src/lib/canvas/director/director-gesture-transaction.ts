import { directorGestureIdle, reduceDirectorGesture } from "./director-animation-semantics";

export type DirectorTransactionHooks<TSnapshot> = {
    /** 讀取當前值；返回 null 表示無法開始/結束事務。 */
    read: () => TSnapshot | null;
    /** 取消路徑：把快照寫回。 */
    restore: (snapshot: TSnapshot) => void;
    /** 成功路徑：恰好呼叫一次。 */
    commit: (from: TSnapshot, to: TSnapshot) => void;
    /** 進入/退出手勢；任何終態都會收到 false。 */
    setActive: (active: boolean) => void;
    /** 取消時結束第三方控制元件內部拖拽狀態。 */
    terminateDrag?: () => void;
};

export type DirectorTransaction<TSnapshot = unknown> = {
    begin: () => void;
    end: (outcome: "commit" | "cancel") => void;
    active: () => boolean;
    snapshot: () => TSnapshot | null;
};

/**
 * 一次手勢一個事務：begin 抓快照，end 恰好產生一個終態。
 * 冪等——非活躍時的 end 是空操作，終態後可以重新 begin。
 */
export function createDirectorTransaction<TSnapshot>(hooks: DirectorTransactionHooks<TSnapshot>): DirectorTransaction<TSnapshot> {
    let state = directorGestureIdle;
    // 快照可能是任何值（含 0 / ""），所以用獨立標記表示「有快照」，不能用真值判斷。
    let snapshot: TSnapshot | null = null;
    let hasSnapshot = false;
    return {
        begin: () => {
            if (state.active) return;
            const current = hooks.read();
            if (current === null || current === undefined) return;
            snapshot = current;
            hasSnapshot = true;
            state = reduceDirectorGesture(state, "start");
            hooks.setActive(true);
        },
        end: (outcome) => {
            if (!state.active) return;
            const base = snapshot;
            const settled = reduceDirectorGesture(state, outcome);
            const hadSnapshot = hasSnapshot;
            snapshot = null;
            hasSnapshot = false;
            state = directorGestureIdle;
            // 先進入終態再結束第三方拖拽：stdlib 在 domElement.ownerDocument 註冊 pointerup，
            // 其 pointerUp({button:0}) 會 dispatch mouseUp 後清 dragging=false / axis=null。
            // 該回撥會回到本事務，此時已非活躍，因此不會二次提交。
            if (outcome === "cancel") hooks.terminateDrag?.();
            if (!hadSnapshot || base === null || base === undefined) {
                hooks.setActive(false);
                return;
            }
            if (settled.committed) {
                const current = hooks.read();
                if (current !== null && current !== undefined) hooks.commit(base, current);
            } else {
                hooks.restore(base);
            }
            hooks.setActive(false);
        },
        active: () => state.active,
        snapshot: () => hasSnapshot ? snapshot : null,
    };
}

export type DirectorListenerTarget = {
    addEventListener: (type: string, listener: (event: Event) => void) => void;
    removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

export type DirectorTerminalTargets = {
    /** 承載 keydown / blur / pointercancel / pointerup 的目標（通常是 window）。 */
    window: DirectorListenerTarget;
    /** 承載 visibilitychange 的目標（通常是 document）。 */
    document: DirectorListenerTarget;
    /** 讀取可見性；hidden 視為「離開」而非「放棄」。 */
    isHidden: () => boolean;
};

/**
 * 無條件安裝終止監聽，絕不以「當前是否有手勢」為安裝條件——
 * 手勢只 mutate 事務內部狀態，不會重跑安裝邏輯。
 * 非活躍時 transaction.end 自身是空操作，因此常駐監聽是安全的。
 *
 * 終態語義（#305 驗收）：
 * - pointerup / window blur / document hidden → commit 當前可見值。
 *   失焦或切頁只是「離開」，使用者已經把物件拖到那裡了，不能把它彈回原位。
 * - Escape / pointercancel → cancel 並恢復快照，這是使用者明確表達的放棄。
 */
export function installDirectorTerminalListeners(transaction: DirectorTransaction, targets: DirectorTerminalTargets) {
    const cancel = () => transaction.end("cancel");
    const commit = () => transaction.end("commit");
    const onKeyDown = (event: Event) => {
        if ((event as KeyboardEvent).key === "Escape") cancel();
    };
    const onVisibility = () => {
        if (targets.isHidden()) commit();
    };
    targets.window.addEventListener("keydown", onKeyDown);
    targets.window.addEventListener("blur", commit);
    targets.window.addEventListener("pointercancel", cancel);
    targets.window.addEventListener("pointerup", commit);
    targets.document.addEventListener("visibilitychange", onVisibility);
    return () => {
        targets.window.removeEventListener("keydown", onKeyDown);
        targets.window.removeEventListener("blur", commit);
        targets.window.removeEventListener("pointercancel", cancel);
        targets.window.removeEventListener("pointerup", commit);
        targets.document.removeEventListener("visibilitychange", onVisibility);
    };
}
