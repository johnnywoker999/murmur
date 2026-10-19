/**
 * 助手剛改過的節點在畫布上短暫點亮。
 *
 * 畫布剛拉到新內容時節點可能還沒掛上，所以分幾次嘗試；找不到就安靜放過，
 * 這只是定位提示，不該影響畫布本身。
 */
const HIGHLIGHT_CLASS = "canvas-assistant-touched";
const RETRY_DELAYS = [0, 220, 600];

export function highlightAssistantNodes(container: HTMLElement | null, nodeIds: readonly string[], durationMs = 3000) {
    if (!container || !nodeIds.length || typeof window === "undefined") return;
    const marked = new Set<string>();
    for (const delay of RETRY_DELAYS) {
        window.setTimeout(() => {
            for (const id of nodeIds) {
                if (marked.has(id)) continue;
                const element = container.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
                if (!element) continue;
                marked.add(id);
                element.classList.add(HIGHLIGHT_CLASS);
                window.setTimeout(() => element.classList.remove(HIGHLIGHT_CLASS), durationMs);
            }
        }, delay);
    }
}
