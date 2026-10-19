import type { DirectorScene } from "@/types/director";
import type { DirectorCloseDecision, DirectorDraftEnvelope, DirectorSaveSnapshot, StorageLike } from "@/lib/canvas/director/director-save";

/**
 * UI 只需要儲存進度，不需要場景本體。
 * 去掉 scene 後 React state 不必再為「還沒有 coordinator」編造一個假場景。
 */
export type DirectorSaveProgress = Omit<DirectorSaveSnapshot, "scene">;

export const idleDirectorSaveProgress: DirectorSaveProgress = {
    revision: 0,
    confirmedRevision: 0,
    status: "saved",
    draftStored: false,
};

/** 從完整快照投影出進度：訂閱回撥必須走它，避免只更新 status 而漏掉確認資訊。 */
export function directorSaveProgress(snapshot: DirectorSaveSnapshot): DirectorSaveProgress {
    return {
        revision: snapshot.revision,
        confirmedRevision: snapshot.confirmedRevision,
        status: snapshot.status,
        draftStored: snapshot.draftStored,
    };
}

/** 頭部狀態展示：文案與語氣必須由狀態唯一決定，元件不得自己拼措辭。 */
export type DirectorSaveIndicator = {
    label: string;
    tone: "idle" | "pending" | "danger";
    /** 未確認或錯誤時提供重試；已儲存態沒有可重試的東西。 */
    retryable: boolean;
    busy: boolean;
};

export function describeDirectorSaveStatus(progress: DirectorSaveProgress): DirectorSaveIndicator {
    const unconfirmed = progress.confirmedRevision < progress.revision;

    if (progress.status === "error") {
        return {
            label: progress.draftStored ? "儲存失敗 · 本地草稿已保留" : "儲存失敗 · 本地草稿也未寫入",
            tone: "danger",
            retryable: true,
            busy: false,
        };
    }
    if (progress.status === "saving") {
        return { label: "正在儲存…", tone: "pending", retryable: false, busy: true };
    }
    if (progress.status === "dirty" || unconfirmed) {
        return { label: "有未儲存修改", tone: "pending", retryable: true, busy: false };
    }
    return { label: "已儲存", tone: "idle", retryable: false, busy: false };
}

/**
 * 是否提示恢復：候選必須比權威場景更新才值得打斷使用者。
 * scene.updatedAt 是 canonical 儲存時間，candidate.baseUpdatedAt 是草稿寫入時的基線；
 * 基線落後於權威說明遠端已儲存過更新的內容，這份草稿是陳舊殘留。
 */
export function shouldOfferDirectorDraftRecovery(input: { candidate: DirectorDraftEnvelope | null; authoritativeScene: DirectorScene | null }): boolean {
    const { candidate, authoritativeScene } = input;
    if (!candidate || !authoritativeScene) return false;
    if (candidate.sceneId !== authoritativeScene.id) return false;
    if (candidate.baseUpdatedAt !== authoritativeScene.updatedAt) return false;
    return candidate.scene.updatedAt > authoritativeScene.updatedAt;
}

/** 關閉決策的使用者可見後果，元件按此分支決定退出/二次確認/留下。 */
export type DirectorCloseOutcome = { kind: "close" } | { kind: "confirm-draft-exit"; message: string } | { kind: "blocked"; message: string };

export function resolveDirectorCloseOutcome(decision: DirectorCloseDecision): DirectorCloseOutcome {
    if (decision === "close") return { kind: "close" };
    if (decision === "offer-draft-exit") {
        return {
            kind: "confirm-draft-exit",
            message: "遠端儲存失敗，但本地草稿已安全儲存。下次開啟這個鏡頭可以恢復，確認離開嗎？",
        };
    }
    return { kind: "blocked", message: "儲存失敗且本地草稿未寫入，已留在導演臺，請重試儲存。" };
}

/**
 * beforeunload 是否要觸發瀏覽器保護：只有「改動未確認」或「錯誤態且沒有安全草稿」才攔。
 * 注意這裡只能同步表達意圖，非同步 flush 無法阻塞解除安裝。
 */
export function shouldBlockDirectorUnload(progress: DirectorSaveProgress): boolean {
    if (progress.confirmedRevision < progress.revision) return true;
    return progress.status === "error" && !progress.draftStored;
}

/**
 * localStorage 不可用（隱私模式、被停用、SSR）時的顯式實現：
 * 讀返回 null，寫和刪都拋，讓 coordinator 如實得到 draftStored=false。
 * 絕不能降級成程式內 Map —— 那會讓彈窗謊稱「下次可恢復」。
 */
export const unavailableDirectorDraftStorage: StorageLike = {
    getItem: () => null,
    setItem: () => {
        throw new Error("localStorage unavailable");
    },
    removeItem: () => {
        throw new Error("localStorage unavailable");
    },
};

/** 純 factory：注入 getter 便於測試不可用分支，不引入額外依賴。 */
export function resolveDirectorDraftStorage(readStorage: () => Storage | null | undefined): StorageLike {
    let local: Storage | null | undefined;
    try {
        local = readStorage();
    } catch {
        return unavailableDirectorDraftStorage;
    }
    if (!local) return unavailableDirectorDraftStorage;

    return {
        getItem: (key) => local.getItem(key),
        setItem: (key, value) => local.setItem(key, value),
        removeItem: (key) => local.removeItem(key),
    };
}
