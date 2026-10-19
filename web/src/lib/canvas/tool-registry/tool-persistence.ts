import { scopedLocalStorage } from "@/lib/user-scope";

import type { ToolbarId, ToolbarPrefs } from "./tool-definition";

const STORAGE_VERSION = "v1";
const storageKey = (toolbar: ToolbarId) => `canvas-toolbar-prefs-${toolbar}-${STORAGE_VERSION}`;

export const CANVAS_MODE_TOOL_ID = "tool-canvas-mode";
export const LEGACY_CANVAS_MODE_TOOL_IDS = ["tool-move", "tool-box-select"] as const;

/**
 * 讀取工具欄偏好。缺失或解析失敗時返回 null（由呼叫方決定是否用預設值）
 */
export function readToolbarPrefs(toolbar: ToolbarId): ToolbarPrefs | null {
    try {
        const stored = scopedLocalStorage.getItem(storageKey(toolbar));
        if (!stored) return null;
        const parsed = JSON.parse(stored) as unknown;
        if (!isPrefsShape(parsed)) return null;
        const prefs: ToolbarPrefs = { order: Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === "string") : [], hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => typeof id === "string") : [] };
        return migrateToolbarPrefs(toolbar, prefs);
    } catch {
        return null;
    }
}

export function persistToolbarPrefs(toolbar: ToolbarId, prefs: ToolbarPrefs) {
    try {
        scopedLocalStorage.setItem(storageKey(toolbar), JSON.stringify(prefs));
    } catch {
        // 瀏覽器停用本地儲存時保留當前會話內的選擇
    }
}

export function clearToolbarPrefs(toolbar: ToolbarId) {
    try {
        scopedLocalStorage.removeItem(storageKey(toolbar));
    } catch {
        // 忽略
    }
}

function isPrefsShape(value: unknown): value is Partial<ToolbarPrefs> {
    return typeof value === "object" && value !== null;
}

/** 把舊的抓手/框選兩個獨立按鈕偏好合併成一個開關項 */
export function migrateToolbarPrefs(toolbar: ToolbarId, prefs: ToolbarPrefs): ToolbarPrefs {
    if (toolbar !== "main") return prefs;
    const legacyIds = new Set<string>(LEGACY_CANVAS_MODE_TOOL_IDS);
    const hasLegacy = prefs.order.some((id) => legacyIds.has(id)) || prefs.hidden.some((id) => legacyIds.has(id));
    if (!hasLegacy) {
        return insertNewMainToolbarTools(prefs);
    }

    const order = prefs.order.filter((id) => id !== CANVAS_MODE_TOOL_ID && !legacyIds.has(id));
    const firstLegacyIndex = prefs.order.findIndex((id) => legacyIds.has(id));
    const insertAt = firstLegacyIndex >= 0 ? Math.min(firstLegacyIndex, order.length) : 0;
    order.splice(insertAt, 0, CANVAS_MODE_TOOL_ID);

    const hiddenLegacy = LEGACY_CANVAS_MODE_TOOL_IDS.filter((id) => prefs.hidden.includes(id));
    const hidden = prefs.hidden.filter((id) => id !== CANVAS_MODE_TOOL_ID && !legacyIds.has(id));
    if (hiddenLegacy.length === LEGACY_CANVAS_MODE_TOOL_IDS.length) hidden.push(CANVAS_MODE_TOOL_ID);

    return insertNewMainToolbarTools({ order, hidden });
}

/** Add newly introduced LibTV-compatible entries without resetting a user's
 * existing order or visibility choices. */
function insertNewMainToolbarTools(prefs: ToolbarPrefs): ToolbarPrefs {
    if (prefs.order.includes("tool-portrait-studio") || prefs.hidden.includes("tool-portrait-studio")) return prefs;
    const order = [...prefs.order];
    const styleIndex = order.indexOf("tool-style");
    order.splice(styleIndex >= 0 ? styleIndex : order.length, 0, "tool-portrait-studio");
    return { ...prefs, order };
}
