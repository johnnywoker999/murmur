// 編輯器外掛執行期許可權校驗，預設拒絕未知外掛和缺失許可權。
// v2 外掛貢獻 editorSlots 或代發 timeline 命令時，manifest.permissions 必須覆蓋對應能力域；
// v1 外掛不貢獻 editorSlots，因此不經過這條插槽許可權路徑。本模組只做純判定，
// 接入點分別位於插槽渲染（SlotStack）和宿主命令代發通道。

import { getRegisteredPlugin } from "@/lib/plugins/plugin-registry";
import type { EditorPluginPermission, EditorSlotKind } from "@/lib/plugins/plugin-types";

/** 每個編輯器插槽所需的最小許可權域；新增插槽必須補表，否則會因找不到許可權而拒絕渲染。 */
export const EDITOR_SLOT_REQUIRED_PERMISSION: Record<EditorSlotKind, EditorPluginPermission> = {
    "timeline-panel": "timeline.command",
    "preview-renderer": "timeline.read",
    inspector: "timeline.command",
    "asset-ingest": "timeline.command",
    "subtitle-tool": "timeline.command",
    "transcription-provider": "timeline.command",
    "export-renderer": "export.run",
    "ai-assistant": "timeline.read",
};

export type EditorSlotPermissionVerdict =
    | { allowed: true }
    | { allowed: false; reason: "plugin-not-registered" | "missing-permission"; missing: EditorPluginPermission | null };

/** fail-closed 許可權判定：許可權集缺失或未包含 required 一律拒絕。 */
export function checkEditorPermission(permissions: ReadonlySet<string> | null, required: EditorPluginPermission): boolean {
    return permissions !== null && permissions.has(required);
}

export function requiredPermissionForEditorSlot(slot: EditorSlotKind): EditorPluginPermission {
    return EDITOR_SLOT_REQUIRED_PERMISSION[slot];
}

/** 查詢外掛的許可權集（未註冊返回 null）。 */
export function pluginPermissions(pluginId: string): ReadonlySet<string> | null {
    const registered = getRegisteredPlugin(pluginId);
    if (!registered) return null;
    return new Set(registered.manifest.permissions ?? []);
}

/** 判定某外掛是否被允許渲染某編輯器插槽（fail-closed；v2 註冊即被檢，缺失許可權拒渲染）。 */
export function pluginMayRenderEditorSlot(pluginId: string, slot: EditorSlotKind): EditorSlotPermissionVerdict {
    const permissions = pluginPermissions(pluginId);
    if (permissions === null) {
        return { allowed: false, reason: "plugin-not-registered", missing: null };
    }
    const required = EDITOR_SLOT_REQUIRED_PERMISSION[slot];
    if (!permissions.has(required)) {
        return { allowed: false, reason: "missing-permission", missing: required };
    }
    return { allowed: true };
}

/** 宿主命令代發通道的許可權斷言：未註冊外掛或未宣告目標許可權時拋錯，呼叫方必須阻止命令執行。 */
export function assertEditorPermission(pluginId: string, permission: EditorPluginPermission): void {
    const permissions = pluginPermissions(pluginId);
    if (permissions === null) {
        throw new Error(`外掛 ${pluginId} 未註冊，無法代發 ${permission} 命令`);
    }
    if (!permissions.has(permission)) {
        throw new Error(`外掛 ${pluginId} 缺少 ${permission} 許可權，命令已被拒絕`);
    }
}
