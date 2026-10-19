import { useCallback, useEffect, useRef, useState } from "react";

import {
    advanceDirectorOnboarding,
    createDirectorOnboardingGate,
    loadDirectorOnboardingProgress,
    resetDirectorOnboardingProgress,
    resolveDirectorOnboardingView,
    type DirectorOnboardingAction,
    type DirectorOnboardingProgress,
    type DirectorOnboardingStorage,
    type DirectorOnboardingView,
} from "@/lib/canvas/director/director-onboarding";

/**
 * 導演臺首次上手引導浮層。
 *
 * 硬約束：
 * - 非阻塞。不是 dialog，沒有遮罩，不搶焦點，不做焦點陷阱：引導旁邊就是要動手的工作臺，
 *   任何模態化都會把「照著做」變成「先關掉」。因此用 role="region" 而不是 role="dialog"。
 * - 只用原生 button。三個動作都是真正的按鈕，鍵盤 Tab/Enter/Space 與讀屏天然可用。
 * - 只用既有 token（CSS 變數 + Tailwind 佈局類），不新增全域性 CSS，不寫顏色/圓角/字號字面值。
 * - 讀不到持久進度（IndexedDB 失敗）時不展示：無法確認使用者是否已經跳過，就不要再騷擾他。
 */

type DirectorOnboardingController = {
    /** null 表示不展示：未載入完、已跳過、已完成、或持久層不可用。 */
    view: DirectorOnboardingView | null;
    /** 有動作在寫盤。用於停用按鈕，避免連點產生併發寫。 */
    busy: boolean;
    next: () => void;
    back: () => void;
    dismiss: () => void;
    complete: () => void;
    /** 重新開始引導。已跳過/已完成的使用者只能靠它回到第一步。 */
    reset: () => void;
};

/**
 * 引導狀態接線。
 *
 * scope 變化（切賬號）會重新載入並丟棄在途結果：generation 守衛保證舊賬號的進度
 * 不會落到新賬號的介面上。enabled 為 false 或 scope 為空時不讀盤、不展示。
 *
 * 併發防寫用 gateRef（同步閉包鎖）而不是隻靠 busy state：同一 tick 內的重複呼叫
 * （雙擊、程式化連點）在 busy state 反映到下一次渲染之前就已經發生，只看 state 擋不住。
 *
 * 關鍵邊界：gateRef 在換代（scope/enabled 變化）時必須整體替換成全新例項，而不是對
 * 共享的舊例項呼叫 release()。原因：如果舊一代的寫入仍在途，release 共享例項會把
 * 剛為新一代騰出來的鎖也一起放開；而新一代鎖上之後，舊寫入 .finally() 裡如果重新讀
 * `gateRef.current`（這時已經指向新一代的鎖）去 release，會把新一代還在寫的鎖誤放掉——
 * generation 守衛只保護展示狀態，保護不了鎖。因此 run() 必須在拿鎖的同一刻把
 * `gateRef.current` 同步捕獲進區域性變數 `gate`，tryEnter/release 全部作用在這份捕獲上，
 * 絕不在 .then/.catch/.finally 裡重新讀取 `gateRef.current`。
 */
export function useDirectorOnboarding({ scope, enabled = true, storage }: { scope: string; enabled?: boolean; storage?: DirectorOnboardingStorage }): DirectorOnboardingController {
    const [progress, setProgress] = useState<DirectorOnboardingProgress | null>(null);
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const gateRef = useRef(createDirectorOnboardingGate());
    const normalizedScope = scope.trim();
    const active = enabled && normalizedScope.length > 0;

    useEffect(() => {
        generation.current += 1;
        const current = generation.current;
        // 換新例項而不是 release 舊例項：舊例項可能仍被上一代在途的寫入持有。
        gateRef.current = createDirectorOnboardingGate();
        setProgress(null);
        setBusy(false);
        if (!active) return;
        void loadDirectorOnboardingProgress(normalizedScope, storage)
            .then((loaded) => {
                if (generation.current === current) setProgress(loaded);
            })
            .catch(() => {
                // 持久層不可用：保持不展示。引導不值得為它彈錯誤提示。
            });
    }, [active, normalizedScope, storage]);

    const run = useCallback(
        (action: DirectorOnboardingAction) => {
            if (!active || !progress) return;
            // 同步捕獲本次呼叫時刻的鎖例項：即使換代把 gateRef.current 換成新例項，
            // 這次呼叫後續的 tryEnter/release 也只作用在捕獲到的這一份上。
            const gate = gateRef.current;
            // 同步攔截：拿不到鎖說明上一次呼叫還沒落盤，本次直接放棄，不基於同一份舊 progress 重複發起寫入。
            if (!gate.tryEnter()) return;
            const current = generation.current;
            setBusy(true);
            void advanceDirectorOnboarding(normalizedScope, progress, action, storage)
                .then((next) => {
                    if (generation.current === current) setProgress(next);
                })
                .catch(() => {
                    // 寫盤失敗：停在當前步驟，使用者可以再點一次。絕不在介面上假裝已前進。
                })
                .finally(() => {
                    // 釋放捕獲的 gate，不是 gateRef.current —— 換代後 ref 可能已經指向
                    // 新一代的鎖，重新讀取會把新一代還在寫的鎖誤放掉。
                    gate.release();
                    if (generation.current === current) setBusy(false);
                });
        },
        [active, progress, normalizedScope, storage],
    );

    const next = useCallback(() => run("next"), [run]);
    const back = useCallback(() => run("back"), [run]);
    const dismiss = useCallback(() => run("dismiss"), [run]);
    const complete = useCallback(() => run("complete"), [run]);
    const reset = useCallback(() => {
        if (!active) return;
        const gate = gateRef.current;
        if (!gate.tryEnter()) return;
        // A restart supersedes the pending load for this scope. Advancing the
        // generation prevents that older read from restoring a completed or
        // dismissed progress record after the reset has landed.
        generation.current += 1;
        const current = generation.current;
        setBusy(true);
        void resetDirectorOnboardingProgress(normalizedScope, storage)
            .then((next) => {
                if (generation.current === current) setProgress(next);
            })
            .catch(() => {
                if (generation.current !== current) return;
                // 重置失敗後把同一 scope 的持久進度重新讀回來。重置開始時已經讓舊讀取
                // 失效，若這裡不補讀，載入期觸發重置的使用者會一直停在 progress=null。
                return loadDirectorOnboardingProgress(normalizedScope, storage)
                    .then((loaded) => {
                        if (generation.current === current) setProgress(loaded);
                    })
                    .catch(() => {
                        // 持久層仍不可用時繼續隱藏；標題欄入口允許使用者稍後再次嘗試。
                    });
            })
            .finally(() => {
                gate.release();
                if (generation.current === current) setBusy(false);
            });
    }, [active, normalizedScope, storage]);

    return { view: progress ? resolveDirectorOnboardingView(progress) : null, busy, next, back, dismiss, complete, reset };
}

/** 焦點環與既有 director 控制元件一致：token 化的 outline，不引入新的全域性樣式。 */
const FOCUS_RING = "focus-visible:[outline:var(--stroke-2)_solid_var(--control-focus-ring)] focus-visible:[outline-offset:1px]";

/**
 * 引導卡片。
 *
 * scope 必須由呼叫方顯式傳入已認證使用者 id —— 元件不讀取 guest fallback 或當前活躍
 * scope，避免繞過「顯式使用者 scope」這條邊界。
 */
export function CanvasDirectorOnboarding({ scope, open = true, restartSignal = 0, className, storage }: { scope: string; open?: boolean; restartSignal?: number; className?: string; storage?: DirectorOnboardingStorage }) {
    const { view, busy, next, back, dismiss, reset } = useDirectorOnboarding({ scope, enabled: open, storage });
    const previousRestartSignal = useRef(restartSignal);

    useEffect(() => {
        if (previousRestartSignal.current === restartSignal) return;
        previousRestartSignal.current = restartSignal;
        reset();
    }, [reset, restartSignal]);

    if (!view) return null;

    const { step, position, total, isFirst, isLast } = view;

    return (
        <section
            className={`grid gap-[var(--space-2)] ${className || ""}`}
            aria-label="導演臺上手引導"
            style={{
                padding: "var(--space-3)",
                border: "var(--stroke-1) solid var(--border-semantic)",
                borderRadius: "var(--r-lg)",
                background: "var(--surface)",
                boxShadow: "var(--elevation-overlay)",
                color: "var(--cn-text)",
            }}
        >
            <header className="flex min-w-0 items-center justify-between gap-[var(--space-2)]">
                <p className="m-0 min-w-0 truncate" style={{ fontSize: "var(--fs-label)", fontWeight: 600 }}>
                    {step.title}
                </p>
                <span style={{ flex: "0 0 auto", color: "var(--cn-muted)", fontSize: "var(--fs-tiny)" }}>{`第 ${position} 步 / 共 ${total} 步`}</span>
            </header>

            {/* 步驟切換靠 aria-live 播報，不靠焦點轉移：焦點必須留在使用者正在操作的地方。 */}
            <p className="m-0" aria-live="polite" style={{ color: "var(--cn-muted)", fontSize: "var(--fs-caption)", lineHeight: 1.5 }}>
                {step.detail}
            </p>

            {/* 進度點是純裝飾，真實進度由上面的「第 N 步 / 共 M 步」文本承擔。 */}
            <div className="flex items-center gap-[var(--space-1)]" aria-hidden>
                {Array.from({ length: total }, (_, index) => (
                    <span
                        key={index}
                        style={{
                            width: "var(--space-1-half)",
                            height: "var(--space-1-half)",
                            borderRadius: "var(--r-full)",
                            background: index < position ? "var(--workspace-accent)" : "var(--cn-stroke)",
                        }}
                    />
                ))}
            </div>

            <div className="flex items-center justify-between gap-[var(--space-2)]">
                <button type="button" className={FOCUS_RING} onClick={dismiss} disabled={busy} style={{ height: "var(--space-6)", padding: "0 var(--space-2)", borderRadius: "var(--r-sm)", color: "var(--cn-muted)", fontSize: "var(--fs-tiny)" }}>
                    跳過引導
                </button>
                <div className="flex items-center gap-[var(--space-1)]">
                    <button
                        type="button"
                        className={FOCUS_RING}
                        onClick={back}
                        disabled={busy || isFirst}
                        style={{
                            height: "var(--space-6)",
                            padding: "0 var(--space-3)",
                            border: "var(--stroke-1) solid var(--control-selected-border)",
                            borderRadius: "var(--r-sm)",
                            background: "var(--control-selected-bg)",
                            color: isFirst ? "var(--control-disabled-fg)" : "var(--control-selected-fg)",
                            fontSize: "var(--fs-tiny)",
                        }}
                    >
                        上一步
                    </button>
                    <button
                        type="button"
                        className={FOCUS_RING}
                        onClick={next}
                        disabled={busy}
                        style={{
                            height: "var(--space-6)",
                            padding: "0 var(--space-3)",
                            border: "var(--stroke-1) solid var(--workspace-accent)",
                            borderRadius: "var(--r-sm)",
                            background: "var(--workspace-accent)",
                            color: "var(--btn-solid-fg)",
                            fontSize: "var(--fs-tiny)",
                        }}
                    >
                        {isLast ? "結束引導" : "下一步"}
                    </button>
                </div>
            </div>
        </section>
    );
}
