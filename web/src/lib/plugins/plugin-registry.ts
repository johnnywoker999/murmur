import type { EditorSlotKind, PluginManifest, PluginManifestV2, RegisteredPlugin } from "./plugin-types";
import { unregisterPluginSlots } from "./editor-slot-registry";
import { registerPluginCanvasNodes, unregisterNodeDefinitions } from "@/lib/canvas/node-registry";

const registeredPlugins = new Map<string, RegisteredPlugin>();

const EDITOR_SLOT_KINDS: EditorSlotKind[] = [
    "timeline-panel",
    "preview-renderer",
    "inspector",
    "asset-ingest",
    "subtitle-tool",
    "transcription-provider",
    "export-renderer",
    "ai-assistant",
];

function assertManifest(manifest: PluginManifest | PluginManifestV2) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw new Error("外掛 ID 必須使用 kebab-case");
    if (!manifest.name.trim() || !manifest.version.trim() || !manifest.apiVersion.trim()) throw new Error("外掛清單缺少名稱、版本或 API 版本");
    const apiVersion: string = manifest.apiVersion;
    if (apiVersion !== "beeftv.plugin/v1" && apiVersion !== "beeftv.plugin/v2") {
        throw new Error(`不支援的外掛 API 版本：${apiVersion}`);
    }
    if (new Set(manifest.permissions).size !== manifest.permissions.length) throw new Error("外掛許可權不能重複");
    if (manifest.apiVersion === "beeftv.plugin/v2") assertManifestV2(manifest);
    else assertManifestV1Contributions(manifest.contributes);
}

function assertManifestV1Contributions(contributes: PluginManifest["contributes"]) {
    if (!contributes || Object.values(contributes).every((value) => !value || value.length === 0)) {
        throw new Error("外掛至少需要宣告一種貢獻能力");
    }
}

function assertManifestV2(manifest: PluginManifestV2) {
    if (manifest.contributes.editorSlots?.length) {
        for (const slot of manifest.contributes.editorSlots) {
            if (!EDITOR_SLOT_KINDS.includes(slot.slot)) throw new Error(`未知的編輯器插槽型別：${slot.slot}`);
            if (slot.priority !== undefined && (typeof slot.priority !== "number" || Number.isNaN(slot.priority))) {
                throw new Error(`編輯器插槽 ${slot.slot} 的 priority 必須是數字`);
            }
        }
    }
    // 貢獻檢查：v1 貢獻欄位或 editorSlots 至少宣告一項（editorSlots 是合法的 v2 獨立貢獻）。
    const { editorSlots, ...v1Contributions } = manifest.contributes;
    if (Object.values(v1Contributions).every((value) => !value || value.length === 0) && !editorSlots?.length) {
        throw new Error("外掛至少需要宣告一種貢獻能力");
    }
}

export function registerPlugin(plugin: RegisteredPlugin) {
    assertManifest(plugin.manifest);
    const actionIds = new Set<string>();
    for (const action of plugin.agentActions || []) {
        if (!action.id.trim() || !action.description.trim() || actionIds.has(action.id) || typeof action.buildOperations !== "function") throw new Error("外掛 Agent 動作需要唯一 ID、說明和操作構建器");
        actionIds.add(action.id);
    }
    const existing = registeredPlugins.get(plugin.manifest.id);
    if (existing && existing.manifest.version !== plugin.manifest.version) {
        throw new Error(`外掛 ${plugin.manifest.id} 已註冊其他版本`);
    }
    if (plugin.manifest.apiVersion === "beeftv.plugin/v2") {
        // v2：編輯器插槽宣告由註冊器提取儲存；UI 渲染函式由外掛 activate() 階段經 registerEditorSlot 提供。
        plugin.editorSlots = plugin.manifest.contributes.editorSlots ?? [];
    }
    if (plugin.manifest.contributes.canvasNodes?.length) {
        registerPluginCanvasNodes(plugin.manifest.id, plugin.manifest.contributes.canvasNodes);
    }
    registeredPlugins.set(plugin.manifest.id, plugin);
}

export function unregisterPlugin(pluginId: string) {
    unregisterNodeDefinitions(pluginId);
    unregisterPluginSlots(pluginId);
    registeredPlugins.delete(pluginId);
}

export function getRegisteredPlugin(pluginId: string) {
    return registeredPlugins.get(pluginId);
}

export function listRegisteredPlugins() {
    return [...registeredPlugins.values()];
}

export function listRegisteredManifests(): Array<PluginManifest | PluginManifestV2> {
    return listRegisteredPlugins().map(({ manifest }) => manifest);
}
