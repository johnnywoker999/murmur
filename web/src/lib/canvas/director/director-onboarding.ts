import { localForageStorageForScope } from "@/lib/localforage-storage";
import type { DirectorMode } from "@/lib/canvas/director/director-modes";

/**
 * 導演臺首次上手引導。
 *
 * 為什麼存在：導演臺把模板、四個一級模式、物件操作、儲存/匯出堆在同一個工作臺裡，
 * 第一次進來的人沒有任何線索該先做什麼。引導給出一條確定的最短路徑。
 *
 * 硬約束：
 * - 純狀態機 + 持久化，絕不觸碰 DirectorScene，也不寫 undo/redo 歷史：
 *   引導是「使用者看到什麼提示」，不是場景內容。
 * - 進度按使用者隔離。所有匯出 API 必須顯式收到非空 scope，禁止內部兜底成 guest ——
 *   預設 scope 會讓 A 賬號的引導狀態洩漏給 B 賬號。
 * - 只用 localforage（走 localForageStorageForScope），不用 localStorage：
 *   與專案裡其他使用者態持久化保持同一條通道。
 * - 缺失、損壞、版本不符的持久資料一律回落到初始進度；只有儲存層本身失敗才向上拋。
 */

export type DirectorOnboardingStepId = "actor" | "move" | "pose" | "path" | "camera" | "apply";

/** active 才展示。dismissed（使用者跳過）與 completed（走完）都不再展示，且不可被 next/back 喚醒。 */
export type DirectorOnboardingStatus = "active" | "dismissed" | "completed";

/**
 * 進度 schema 版本。
 * 步驟集合發生語義變化（增刪步驟、改變順序）時必須 +1：
 * 舊進度裡的 stepId 在新步驟表裡可能不存在，繼續沿用會把使用者卡在不存在的步驟上。
 */
export const DIRECTOR_ONBOARDING_VERSION = 2;

/** localforage 鍵名。真實鍵由 localForageStorageForScope 追加 `:user:<scope>`。 */
export const DIRECTOR_ONBOARDING_KEY = "director-onboarding-v2";

export type DirectorOnboardingStep = {
    id: DirectorOnboardingStepId;
    title: string;
    /** 一句話說清「在哪兒點什麼」，不解釋概念。 */
    detail: string;
    /**
     * 該步驟應該在哪個一級模式裡完成。
     * 模式巡覽步驟本身沒有單一歸屬，故為 undefined —— 由 UI 決定是否代為切換模式。
     */
    mode?: DirectorMode;
};

/** 引導步驟按首次使用的最短操作路徑排列：新增演員 → 移動 → 調姿 → 軌跡 → CAM → 應用。 */
export const DIRECTOR_ONBOARDING_STEPS: DirectorOnboardingStep[] = [
    { id: "actor", title: "新增並選中演員", detail: "在左側「快速新增」點演員；模板已有演員時，直接在場景樹或視口選中它。", mode: "layout" },
    { id: "move", title: "把演員移動到表演位置", detail: "保持擺場模式，在底部 dock 選移動工具（W），拖動軸手柄；右欄可輸入精確座標。", mode: "layout" },
    { id: "pose", title: "調整演員姿態", detail: "切到姿態模式，在右側選擇姿勢預設；模型有骨骼時還可選擇手臂、腿和軀幹微調。", mode: "pose" },
    { id: "path", title: "記錄一段走位", detail: "切到動畫模式，在起點和終點分別移動播放頭、擺放演員並記錄 Transform 關鍵幀，再播放預覽。", mode: "animate" },
    { id: "camera", title: "用 CAM 檢查構圖", detail: "切到攝影機模式，再點視口工具欄 CAM；調整焦距、焦點和機位，確認安全框內的畫面。", mode: "camera" },
    { id: "apply", title: "應用到鏡頭", detail: "確認場景、姿態、走位和 CAM 構圖後，點頂欄「應用到鏡頭」生成靜幀並回寫畫布。", mode: "camera" },
];

export type DirectorOnboardingProgress = {
    version: number;
    status: DirectorOnboardingStatus;
    stepId: DirectorOnboardingStepId;
};

export const directorOnboardingInitial: DirectorOnboardingProgress = {
    version: DIRECTOR_ONBOARDING_VERSION,
    status: "active",
    stepId: DIRECTOR_ONBOARDING_STEPS[0].id,
};

export type DirectorOnboardingAction = "next" | "back" | "dismiss" | "complete" | "reset";

/**
 * 引導狀態機。
 *
 * 關鍵不變數：
 * - 只有 reset 能讓已 dismissed/completed 的引導重新活過來。next/back/dismiss/complete
 *   在非 active 狀態下是恆等變換，否則「跳過引導」會被後續任何一次誤觸重新拉起來。
 * - 在最後一步 next 等於完成：完成必須是終態，而不是停在最後一步繼續可 next。
 * - 首步 back 保持不動，不越界，也不隱式關閉引導。
 * - 當前 stepId 不在步驟表裡（舊資料、被外部改寫）時回到初始進度，而不是把 -1 當下標繼續算。
 */
export function reduceDirectorOnboarding(progress: DirectorOnboardingProgress, action: DirectorOnboardingAction): DirectorOnboardingProgress {
    if (action === "reset") return directorOnboardingInitial;
    if (progress.status !== "active") return progress;
    if (action === "dismiss") return { ...progress, status: "dismissed" };
    if (action === "complete") return { ...progress, status: "completed" };

    const index = DIRECTOR_ONBOARDING_STEPS.findIndex((step) => step.id === progress.stepId);
    if (index < 0) return directorOnboardingInitial;

    if (action === "back") {
        if (index === 0) return progress;
        return { ...progress, stepId: DIRECTOR_ONBOARDING_STEPS[index - 1].id };
    }

    const next = DIRECTOR_ONBOARDING_STEPS[index + 1];
    if (!next) return { ...progress, status: "completed" };
    return { ...progress, stepId: next.id };
}

export type DirectorOnboardingView = {
    step: DirectorOnboardingStep;
    /** 1 起數，直接用於「第 N 步 / 共 M 步」。 */
    position: number;
    total: number;
    isFirst: boolean;
    isLast: boolean;
};

/**
 * 展示態。返回 null 表示不該顯示引導 —— 元件層只看這一個判據，
 * 不自己再拼 status 與步驟下標，避免出現第二套可見性規則。
 */
export function resolveDirectorOnboardingView(progress: DirectorOnboardingProgress): DirectorOnboardingView | null {
    if (progress.status !== "active") return null;
    const index = DIRECTOR_ONBOARDING_STEPS.findIndex((step) => step.id === progress.stepId);
    if (index < 0) return null;
    return {
        step: DIRECTOR_ONBOARDING_STEPS[index],
        position: index + 1,
        total: DIRECTOR_ONBOARDING_STEPS.length,
        isFirst: index === 0,
        isLast: index === DIRECTOR_ONBOARDING_STEPS.length - 1,
    };
}

function isStepId(value: unknown): value is DirectorOnboardingStepId {
    return typeof value === "string" && DIRECTOR_ONBOARDING_STEPS.some((step) => step.id === value);
}

function isStatus(value: unknown): value is DirectorOnboardingStatus {
    return value === "active" || value === "dismissed" || value === "completed";
}

/**
 * 解析持久進度。
 *
 * 引導是提示，不是內容：任何無法確信的持久值都當成「沒有進度」，寧可再引導一次，
 * 也不要把使用者卡在一個無法解釋的狀態裡。覆蓋：非 JSON、非物件、陣列、版本不符、
 * status/stepId 不在列舉內。
 */
export function parseDirectorOnboardingProgress(raw: string | null | undefined): DirectorOnboardingProgress {
    if (!raw) return directorOnboardingInitial;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return directorOnboardingInitial;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return directorOnboardingInitial;
    const candidate = parsed as Partial<DirectorOnboardingProgress>;
    if (candidate.version !== DIRECTOR_ONBOARDING_VERSION) return directorOnboardingInitial;
    if (!isStatus(candidate.status) || !isStepId(candidate.stepId)) return directorOnboardingInitial;
    return { version: DIRECTOR_ONBOARDING_VERSION, status: candidate.status, stepId: candidate.stepId };
}

/** 只要求讀寫能力：既是測試注入記憶體實現的接縫，也避免依賴 zustand StateStorage 的全量介面。 */
export type DirectorOnboardingStorage = {
    getItem: (name: string) => string | null | Promise<string | null>;
    setItem: (name: string, value: string) => void | Promise<void>;
};

/**
 * scope 歸一化 + 守衛。前後空白裁掉後再校驗/使用，這樣 " user-a " 與 "user-a"
 * 落到同一把生產鍵上，不會分裂成兩份互不可見的進度。
 *
 * 必須在每個匯出的持久化函式入口無條件呼叫 —— 包括呼叫方已經注入自定義 storage 的分支。
 * 之前的實現寫成 `storage ?? localForageStorageForScope(requireScope(scope))`，
 * `??` 短路導致「傳了 storage」時 requireScope 根本不會執行，空 scope 就此繞過校驗。
 */
function requireScope(scope: string) {
    const normalized = scope.trim();
    if (!normalized) throw new Error("缺少導演臺引導的使用者 scope");
    return normalized;
}

/**
 * 讀取進度。
 * 資料髒 -> 初始進度；儲存層（IndexedDB）失敗 -> 向上拋，由呼叫方決定是否隱藏引導，
 * 不在這裡 catch 成預設值假裝讀到了。
 */
export async function loadDirectorOnboardingProgress(scope: string, storage?: DirectorOnboardingStorage): Promise<DirectorOnboardingProgress> {
    const normalizedScope = requireScope(scope);
    const target = storage ?? localForageStorageForScope(normalizedScope);
    return parseDirectorOnboardingProgress(await target.getItem(DIRECTOR_ONBOARDING_KEY));
}

export async function saveDirectorOnboardingProgress(scope: string, progress: DirectorOnboardingProgress, storage?: DirectorOnboardingStorage): Promise<void> {
    const normalizedScope = requireScope(scope);
    const target = storage ?? localForageStorageForScope(normalizedScope);
    await target.setItem(DIRECTOR_ONBOARDING_KEY, JSON.stringify({ version: DIRECTOR_ONBOARDING_VERSION, status: progress.status, stepId: progress.stepId }));
}

/**
 * 推進並持久化。返回新進度；寫失敗向上拋，呼叫方拿到的進度與已落盤的進度保持一致，
 * 不存在「介面前進了但磁碟沒動」這種靜默分叉。
 *
 * scope 校驗必須在「無變化動作提前返回」之前完成：否則對已 dismissed/completed 賬號
 * 呼叫 next 之類的恆等動作會在校驗之前就 return progress，空 scope 也能悄悄跑過去。
 * 無變化的動作仍然不寫盤。
 */
export async function advanceDirectorOnboarding(scope: string, progress: DirectorOnboardingProgress, action: DirectorOnboardingAction, storage?: DirectorOnboardingStorage): Promise<DirectorOnboardingProgress> {
    const normalizedScope = requireScope(scope);
    const next = reduceDirectorOnboarding(progress, action);
    if (next === progress) return progress;
    await saveDirectorOnboardingProgress(normalizedScope, next, storage);
    return next;
}

/**
 * 獨立的重啟 API。不依賴呼叫方持有當前記憶體進度；設定頁的「重新開始引導」
 * 按鈕可以直接落盤初始狀態，對已 dismissed/completed 的賬號同樣生效。
 */
export async function resetDirectorOnboardingProgress(scope: string, storage?: DirectorOnboardingStorage): Promise<DirectorOnboardingProgress> {
    const normalizedScope = requireScope(scope);
    await saveDirectorOnboardingProgress(normalizedScope, directorOnboardingInitial, storage);
    return directorOnboardingInitial;
}

export type DirectorOnboardingGate = {
    /** 嘗試進入互斥區；已有一次未完成的呼叫時返回 false，呼叫方必須放棄本次動作。 */
    tryEnter: () => boolean;
    /** 釋放互斥區。scope/enabled 變化（換賬號）時也要呼叫，否則舊賬號的佔用會永久卡死新賬號。 */
    release: () => void;
};

/**
 * 建立一次性寫鎖：保證同一 tick 內的重複呼叫（雙擊、程式化連點）只有一個能真正發起寫入。
 *
 * 用同步閉包變數而不是 React state 做門禁：state 更新要等到下一次渲染才對外可見，
 * 兩次點選完全可能發生在同一次渲染之間，僅靠 busy state 擋不住這種同步重入。
 * release 是冪等的：未鎖定時呼叫不拋錯，方便在 effect 裡無條件清理。
 */
export function createDirectorOnboardingGate(): DirectorOnboardingGate {
    let locked = false;
    return {
        tryEnter: () => {
            if (locked) return false;
            locked = true;
            return true;
        },
        release: () => {
            locked = false;
        },
    };
}
