import { useCallback, useState } from "react";

const FOCUS_MODE_KEY = "canvas-focus-mode-v2";

// 預設策略：小屏首次進入時自動沉浸；使用者顯式退出後必須保持退出，
// 否則小屏條件會立刻把頂欄和“新建畫布”入口重新隱藏。
function readInitialPreference(): boolean {
    const stored = window.localStorage.getItem(FOCUS_MODE_KEY);
    if (stored !== null) return stored === "true";
    return window.innerWidth < 1024;
}

export function useFocusMode() {
    const [userPreference, setUserPreference] = useState<boolean>(readInitialPreference);
    const focusMode = userPreference;

    const persist = useCallback((next: boolean) => {
        setUserPreference(next);
        try {
            window.localStorage.setItem(FOCUS_MODE_KEY, String(next));
        } catch {
            // 忽略 localStorage 不可用場景，專注模式仍可在本次會話生效。
        }
    }, []);

    const enterFocusMode = useCallback(() => persist(true), [persist]);
    const exitFocusMode = useCallback(() => persist(false), [persist]);
    const toggleFocusMode = useCallback(() => persist(!userPreference), [persist, userPreference]);

    return {
        focusMode,
        enterFocusMode,
        exitFocusMode,
        toggleFocusMode,
    };
}
