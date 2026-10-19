import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

export function normalizeTheme(value: unknown): ThemeName {
    return value === "light" ? "light" : "dark";
}

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme?: string) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
        }),
        {
            name: "infinite-canvas:theme_store",
            // 持久化恢復校驗：舊版本/壞 session 寫入的非法值回退到 dark，
            // 避免 canvasThemes[非法值] = undefined 觸發 "reading 'node'" 崩潰
            merge: (persisted, current) => ({ ...current, theme: normalizeTheme((persisted as Partial<ThemeStore> | null)?.theme) }),
        },
    ),
);
