import { canonicalize } from "json-canonicalize";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

// These fields describe local viewing / synchronization, not an edit to the document.
export function canvasContentSnapshot(project: CanvasProject) {
    const { viewport: _viewport, updatedAt: _updatedAt, revision: _revision, remoteContentHash: _hash, ...content } = project;
    return { ...content, projectId: content.projectId || undefined };
}

export function sameCanvasContent(left: CanvasProject | undefined, right: CanvasProject | undefined) {
    if (left === right) return true;
    if (!left || !right) return false;
    const a = canvasContentSnapshot(left) as Record<string, unknown>;
    const b = canvasContentSnapshot(right) as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((key) => a[key] === b[key] || canonicalize(a[key]) === canonicalize(b[key]));
}

export async function canvasContentHash(project: CanvasProject) {
    const serialized = canonicalize(canvasContentSnapshot(project));
    // LAN HTTP deployments may lack Web Crypto. Keep an exact baseline there;
    // a lossy checksum could incorrectly discard an unsaved draft during login.
    if (!globalThis.crypto?.subtle) return `json:${serialized}`;
    const bytes = new TextEncoder().encode(serialized);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * 只比較畫布檔案內容，忽略本機檢視偏好。
 *
 * 複用 `canvasContentSnapshot` 的同一套「非檔案欄位」規則（它已經排除視口、時間戳、
 * revision 與遠端雜湊），而不是另立一份欄位白名單：白名單會靜默漏掉沒列進去的檔案
 * 欄位（例如 folderId、projectId、canvasTitle），讓使用者未確認的編輯被當成「本地乾淨」。
 *
 * 兩處刻意容忍的不對稱，都不代表使用者編輯過檔案：
 * 1. 畫布外觀偏好（appearance/backgroundMode/showImageInfo）：服務端由客戶端決定是否寫入，
 *    外部寫入產生的畫布常常沒有它們；套用外部 revision 時本機外觀也不會被覆蓋
 *    （見 canvas-external-revision.ts）。
 * 2. 一側缺失、另一側為空值：應用自己會給 nodes/connections/chatSessions/activeChatId
 *    這類欄位補預設空值。只有「缺失 vs 非空值」才算差異，因此 folderId 從無到有、
 *    projectId/canvasTitle 被設定、節點被刪除都會如實識別。
 */
const CANVAS_VIEW_PREFERENCE_KEYS = new Set(["appearance", "backgroundMode", "showImageInfo"]);

/**
 * 服務端擁有、應用從不編輯的後設資料。
 *
 * `createdAt` 由服務端在首次寫入時確定，`updateProject` 也不會改動它；外部寫入產生的
 * 畫布檔案可能沒有這個欄位，缺失不代表使用者編輯過內容。
 */
const CANVAS_SERVER_OWNED_KEYS = new Set(["createdAt"]);

function isEmptyDefaultValue(value: unknown) {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
    return value === "";
}

export function sameCanvasDocument(left: CanvasProject | undefined, right: CanvasProject | undefined) {
    if (left === right) return true;
    if (!left || !right) return false;
    const a = canvasContentSnapshot(left) as Record<string, unknown>;
    const b = canvasContentSnapshot(right) as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (CANVAS_VIEW_PREFERENCE_KEYS.has(key) || CANVAS_SERVER_OWNED_KEYS.has(key)) continue;
        const presentInA = Object.hasOwn(a, key) && a[key] !== undefined;
        const presentInB = Object.hasOwn(b, key) && b[key] !== undefined;
        if (!presentInA || !presentInB) {
            const present = presentInA ? a[key] : b[key];
            if (isEmptyDefaultValue(present)) continue;
            return false;
        }
        if (a[key] !== b[key] && canonicalize(a[key]) !== canonicalize(b[key])) return false;
    }
    return true;
}
