/**
 * 導演臺鍵盤快捷鍵解析。
 *
 * 純函式：只把「按鍵事件形狀」對映為語義動作，不碰 DOM、不改場景。
 * 元件層負責註冊監聽與執行動作，因此這裡可以完整單測。
 *
 * 安全邊界：焦點落在任何互動控制元件（輸入框、按鈕、連結、role 型控制元件、
 * 可編輯區域）或其內部時，絕不把按鍵解析為全域性快捷鍵。
 * 否則使用者改名時會誤刪物件、按 Space 啟用按鈕時會誤切換播放。
 */

/**
 * 語義動作。只保留導演臺裡已經存在真實執行路徑的動作：
 * 變換模式（DirectorViewportDock 的 V/R/F，相容 W/E）、刪除選中物件或燈光、
 * 撤銷/重做（頂欄按鈕）、切換選中物件顯隱（檢查器「可見」開關）、
 * 取消選擇、播放/暫停（時間軸 transport）。
 *
 * 聚焦、複製、重新命名沒有對應實現，不在這裡造無處可去的動作。
 */
export type DirectorShortcutAction = { kind: "transform-mode"; mode: "translate" | "rotate" | "scale" } | { kind: "nudge-selected"; direction: "up" | "down" | "left" | "right"; fine?: boolean } | { kind: "delete-selected" } | { kind: "undo" } | { kind: "redo" } | { kind: "toggle-visibility" } | { kind: "deselect" } | { kind: "toggle-play" } | { kind: "open-add-menu" };

/** 只取事件的必要形狀，便於測試構造，也避免耦合真實 KeyboardEvent。 */
export type DirectorKeyEvent = {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    /** 事件目標是否落在互動控制元件內，由呼叫方判定後傳入。 */
    isInteractiveTarget?: boolean;
};

const TRANSFORM_KEYS: Record<string, "translate" | "rotate" | "scale"> = {
    v: "translate",
    r: "rotate",
    f: "scale",
    w: "translate",
    e: "rotate",
};

/**
 * 解析按鍵為動作；不匹配返回 null。
 *
 * 約定：
 * - 互動控制元件語境一律不解析，交還給控制元件本身；
 * - 帶修飾鍵的組合優先（Undo/Redo），避免 Ctrl+R 被當作 rotate；
 * - 單字母快捷鍵不區分大小寫，Shift+W 仍是 translate；
 * - Redo 同時接受 Ctrl/Cmd+Shift+Z 與 Ctrl/Cmd+Y。
 */
export function resolveDirectorShortcut(event: DirectorKeyEvent): DirectorShortcutAction | null {
    if (event.isInteractiveTarget) return null;

    const key = String(event.key || "");
    const lower = key.toLowerCase();
    const accel = Boolean(event.ctrlKey || event.metaKey);

    if (accel) {
        // Alt 組合留給瀏覽器/系統，不搶。
        if (event.altKey) return null;
        if (lower === "z") return event.shiftKey ? { kind: "redo" } : { kind: "undo" };
        if (lower === "y") return { kind: "redo" };
        return null;
    }

    if (event.altKey) return null;

    const arrowDirections: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (arrowDirections[key]) return { kind: "nudge-selected", direction: arrowDirections[key], ...(event.shiftKey ? { fine: true } : {}) };

    if (lower === "a" && event.shiftKey) return { kind: "open-add-menu" };
    if (lower in TRANSFORM_KEYS) return { kind: "transform-mode", mode: TRANSFORM_KEYS[lower] };
    if (key === "Delete" || key === "Backspace") return { kind: "delete-selected" };
    if (lower === "h") return { kind: "toggle-visibility" };
    if (key === "Escape") return { kind: "deselect" };
    if (key === " " || key === "Spacebar") return { kind: "toggle-play" };

    return null;
}

/**
 * 互動控制元件的唯一真源。
 * DIRECTOR_INTERACTIVE_SELECTOR（真實 DOM 的 closest 用）與
 * isDirectorInteractiveNode（單節點判定）都從這裡派生，避免兩處清單漂移。
 */
const INTERACTIVE_TAGS = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "OPTION", "LABEL", "SUMMARY"] as const;

/**
 * role 型控制元件：AntD 大量用 role 而非原生標籤表達按鈕、開關、選單項。
 * Space/Delete/Backspace 對這些控制元件都有自己的含義，必須讓它們優先。
 */
const INTERACTIVE_ROLES = [
    "textbox",
    "combobox",
    "spinbutton",
    "searchbox",
    "button",
    "switch",
    "tab",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "slider",
    "checkbox",
    "radio",
    "link",
    "listbox",
    "menu",
    "radiogroup",
    "treeitem",
] as const;

/** 供真實 DOM 的 Element.closest 使用：命中控制元件自身或任何互動祖先。 */
export const DIRECTOR_INTERACTIVE_SELECTOR = [...INTERACTIVE_TAGS.map((tag) => tag.toLowerCase()), ...INTERACTIVE_ROLES.map((role) => `[role="${role}"]`), '[contenteditable="true"]', '[contenteditable=""]'].join(",");

/**
 * 判斷單個節點自身是否是互動控制元件。不看祖先。
 * 祖先由 blocksDirectorShortcut 通過 closest 處理。
 */
export function isDirectorInteractiveNode(target: unknown): boolean {
    if (!target || typeof target !== "object") return false;
    const node = target as { tagName?: unknown; isContentEditable?: unknown; getAttribute?: (name: string) => string | null };
    if (node.isContentEditable === true) return true;

    const tagName = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
    if ((INTERACTIVE_TAGS as readonly string[]).includes(tagName)) return true;

    if (typeof node.getAttribute === "function") {
        const role = node.getAttribute("role");
        if (role && (INTERACTIVE_ROLES as readonly string[]).includes(role)) return true;
        const editable = node.getAttribute("contenteditable");
        if (editable === "" || editable === "true") return true;
    }
    return false;
}

/**
 * 事件目標是否應當阻止全域性快捷鍵。
 *
 * 用 closest 而不是隻看 target 自身：點選按鈕裡的 <svg>/<span> 時
 * event.target 是子元素，只判自身會漏掉整個控制元件。
 * closest 同時覆蓋 SVG 元素（SVGElement 也實現 Element.closest）。
 *
 * 沒有 closest 的目標（window、document、測試替身）退化為單節點判定。
 */
export function blocksDirectorShortcut(target: unknown): boolean {
    if (!target || typeof target !== "object") return false;
    const node = target as { closest?: (selector: string) => unknown };
    if (typeof node.closest === "function") return Boolean(node.closest(DIRECTOR_INTERACTIVE_SELECTOR));
    return isDirectorInteractiveNode(target);
}

/**
 * 指標啟用後釋放焦點，使全域性快捷鍵立刻可用。
 *
 * 為什麼需要：blocksDirectorShortcut 會吃掉聚焦控制元件上的所有全域性快捷鍵（這是刻意的，
 * Space/Delete/Backspace 屬於控制元件自己）。但滑鼠點完一個工具按鈕或場景行之後，
 * 焦點仍留在按鈕上，於是「點選物件 -> 按 Delete」這類主流程會靜默失效。
 *
 * detail === 0 表示鍵盤啟用（Enter/Space 合成的 click），此時必須保留焦點，
 * 否則 Tab 序列會斷、鍵盤使用者會丟失位置。判據與 plugins 頁一致。
 *
 * 導演臺的按鈕分散在 workbench、dock、sequencer 三處，各自沒有公共基元件，
 * 因此這條規則集中在這裡，避免每個 onClick 各寫一遍而慢慢走偏。
 */
export function releaseDirectorFocusAfterPointer(event: { detail: number; currentTarget: { blur?: () => void } }): void {
    if (event.detail === 0) return;
    event.currentTarget.blur?.();
}
