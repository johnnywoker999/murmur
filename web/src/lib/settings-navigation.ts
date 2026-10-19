import { appHref } from "@/lib/app-routing";

export type SettingsSection = "channels" | "models" | "preferences" | "prompts" | "storage";

export function settingsPath(section: SettingsSection = "channels", continueCreation = false) {
    const params = new URLSearchParams({ section });
    if (continueCreation) params.set("continue", "1");
    return `/settings?${params.toString()}`;
}

/**
 * 畫布深層元件沒有路由上下文出口時統一跳轉到正式設定頁，避免重新引入全域性配置彈窗。
 */
export function navigateToSettings(options?: { section?: SettingsSection; continueCreation?: boolean }) {
    const to = settingsPath(options?.section, options?.continueCreation);
    const event = new CustomEvent<{ to: string }>("workspace:navigate", { detail: { to }, cancelable: true });
    if (window.dispatchEvent(event)) window.location.assign(appHref(to));
}
