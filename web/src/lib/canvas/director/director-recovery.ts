export type DirectorLoadPhase = "loading" | "ready" | "error";

export type DirectorLoadState = {
    phase: DirectorLoadPhase;
    /** 每次 retry 遞增；晚到的舊 generation 回撥必須被忽略。 */
    generation: number;
};

export type DirectorLoadEvent = { type: "start" } | { type: "loaded"; generation: number } | { type: "failed"; generation: number } | { type: "retry" };

export const directorLoadInitial: DirectorLoadState = { phase: "loading", generation: 0 };

/** 載入狀態機：只接受當前 generation 的結果，retry 遞增 generation 並回到 loading。 */
export function reduceDirectorLoad(state: DirectorLoadState, event: DirectorLoadEvent): DirectorLoadState {
    if (event.type === "start") return { phase: "loading", generation: state.generation };
    if (event.type === "retry") return { phase: "loading", generation: state.generation + 1 };
    if (event.generation !== state.generation) return state;
    return { phase: event.type === "loaded" ? "ready" : "error", generation: state.generation };
}

export type DirectorContextState = "ok" | "lost";

export type DirectorCanvasTarget = {
    addEventListener: (type: string, listener: (event: Event) => void) => void;
    removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

/**
 * WebGL 上下文監聽：lost 必須 preventDefault，否則瀏覽器不會補發 restored。
 * 返回 disposer，隨 renderer / 重試 / unmount 精確摘除。
 */
export function installDirectorContextListeners(target: DirectorCanvasTarget, handlers: { onLost: () => void; onRestored: () => void }) {
    const onLost = (event: Event) => {
        event.preventDefault();
        handlers.onLost();
    };
    const onRestored = () => handlers.onRestored();
    target.addEventListener("webglcontextlost", onLost);
    target.addEventListener("webglcontextrestored", onRestored);
    return () => {
        target.removeEventListener("webglcontextlost", onLost);
        target.removeEventListener("webglcontextrestored", onRestored);
    };
}

/** 載入失敗登記表：物件 id -> 該物件自己的 retry。 */
export type DirectorFailedLoads = Record<string, () => void>;

/** 登記訊號：除載入態外，還包含「物件已解除安裝」這一必須登出的情形。 */
export type DirectorLoadSignal = DirectorLoadPhase | "unmounted";

/**
 * 按訊號登記/登出失敗物件。ready/loading/unmounted 都必須移除，
 * 否則 retry 回到 loading、或物件被刪除後，通知會一直掛著陳舊條目。
 */
export function upsertDirectorFailedLoad(current: DirectorFailedLoads, id: string, signal: DirectorLoadSignal, retry: () => void): DirectorFailedLoads {
    if (signal === "error") return current[id] === retry ? current : { ...current, [id]: retry };
    return removeDirectorFailedLoad(current, id);
}

/** 物件解除安裝（刪除、隱藏、換 URL/kind、Canvas 重建）必須登出自己，不能殘留不存在物件的 Retry。 */
export function removeDirectorFailedLoad(current: DirectorFailedLoads, id: string): DirectorFailedLoads {
    if (!(id in current)) return current;
    const next = { ...current };
    delete next[id];
    return next;
}

/**
 * WebGL capture 可用性：上下文丟失期間不得繼續使用失效 renderer，
 * 恢復後必須重新登記 capture context 才算可用。
 */
export type DirectorCaptureState = { registered: boolean; contextLost: boolean };

export const directorCaptureInitial: DirectorCaptureState = { registered: false, contextLost: false };

export function reduceDirectorCapture(state: DirectorCaptureState, event: "register" | "lost" | "restored" | "reset"): DirectorCaptureState {
    if (event === "register") return { registered: true, contextLost: false };
    if (event === "lost") return { ...state, contextLost: true };
    // restored 只清丟失標記；capture context 需由 renderer 重新登記後才可用。
    if (event === "restored") return { registered: false, contextLost: false };
    return directorCaptureInitial;
}

export function directorCaptureUsable(state: DirectorCaptureState) {
    return state.registered && !state.contextLost;
}

/**
 * 上下文恢復的完整序列，生產 handler 與測試必須共用同一個實現。
 * reduceDirectorCapture("restored") 會把 registered 置回 false，
 * 因此恢復後必須用當前 renderer 重新登記 capture context，否則
 * capture/record/readCameraTransform 會永久不可用（只有手動重建 Canvas 才恢復）。
 * 順序：先復位可用性 -> 再登記新 context -> 最後請求重繪。
 */
export function restoreDirectorCapture<TContext>(input: { readContext: () => TContext; onAvailability: (event: "restored") => void; onRegister: (context: TContext) => void; invalidate?: () => void }) {
    input.onAvailability("restored");
    input.onRegister(input.readContext());
    input.invalidate?.();
}

/**
 * 釋放 capture context，生產接線與測試共用。
 * Canvas 子樹因 render error 或重建而解除安裝時必須走這裡：
 * 先清掉指向已銷燬 renderer 的引用，再把可用性打回初態，
 * 否則 ErrorBoundary 顯示恢復頁後「應用到鏡頭」仍會拿到死 renderer。
 * reset 後仍可由新的 renderer 重新 register，不影響重試路徑。
 */
export function releaseDirectorCapture(input: { clearContext: () => void; onAvailability: (event: "reset") => void }) {
    input.clearContext();
    input.onAvailability("reset");
}

/**
 * 載入身份：generation + 解析輸入。展示狀態必須攜帶它，
 * 這樣 prop/retry 變化的第一次 render 就能遮蔽舊資源 —— 不能依賴 effect 之後的 render 才安全。
 */
export function directorLoadIdentity(input: { generation: number; url?: string | null; storageKey?: string | null; kind?: string | null }) {
    return [input.generation, input.url ?? "", input.storageKey ?? "", input.kind ?? ""].join("|");
}

/** render 階段的守衛：identity 不匹配就當作「還沒有可展示資源」。 */
export function resolveDirectorDisplay<TValue>(state: { identity: string; value: TValue } | null, identity: string): TValue | null {
    return state && state.identity === identity ? state.value : null;
}
