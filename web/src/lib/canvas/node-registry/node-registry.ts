import type { CanvasNodeData, CanvasNodeTypeId } from "@/types/canvas";
import type { PluginCanvasNodeContribution } from "@/lib/plugins/plugin-types";

import { canvasNodeDefinitionFromPlugin, type CanvasNodeDefinition } from "./node-definition";

/** 模組級登入檔 */
const definitions = new Map<CanvasNodeTypeId, CanvasNodeDefinition>();
/** 節點型別 → 歸屬方。內建節點歸屬 "builtin"，為後續擴充套件留出隔離位。 */
const ownerByType = new Map<CanvasNodeTypeId, string>();

/** 未註冊型別的兜底最小尺寸——與非媒體節點的歷史下限一致 */
const FALLBACK_MIN_SIZE = { width: 220, height: 160 } as const;

/** 批次註冊節點定義 */
export function registerNodeDefinitions(defs: CanvasNodeDefinition[], ownerId = "builtin") {
    const ids = new Set<string>();
    for (const def of defs) {
        const owner = ownerByType.get(def.type);
        if (ids.has(def.type) || (owner && owner !== ownerId)) throw new Error(`節點型別重複或歸屬衝突：${def.type}`);
        ids.add(def.type);
    }
    for (const def of defs) {
        definitions.set(def.type, def);
        ownerByType.set(def.type, ownerId);
    }
}

/** Registers schema-driven canvas nodes from the unified plugin manifest. */
export function registerPluginCanvasNodes(pluginId: string, nodes: PluginCanvasNodeContribution[]) {
    registerNodeDefinitions(nodes.map((node) => canvasNodeDefinitionFromPlugin(pluginId, node)), pluginId);
}

/**
 * 登出某歸屬方的全部節點定義。
 * 只刪歸屬該 ownerId 的條目——內建節點不會被其他歸屬方的增刪波及。
 */
export function unregisterNodeDefinitions(ownerId: string) {
    for (const [type, owner] of ownerByType) {
        if (owner !== ownerId) continue;
        definitions.delete(type);
        ownerByType.delete(type);
    }
}

export function getNodeDefinition(type: CanvasNodeTypeId) {
    return definitions.get(type);
}

export function getNodeOwnerId(type: CanvasNodeTypeId) {
    return ownerByType.get(type) || "builtin";
}

export function listNodeDefinitions() {
    return [...definitions.values()];
}

/** 新增節點選單可見的節點定義 */
export function listCreatableNodeDefinitions() {
    return listNodeDefinitions().filter((def) => def.showInCreateMenu);
}

/** UI 短標籤 */
export function getNodeLabel(type: CanvasNodeTypeId) {
    return definitions.get(type)?.label || "未知節點";
}

/** 列表/搜尋標籤，預設派生自 label */
export function getNodeListLabel(type: CanvasNodeTypeId) {
    const def = definitions.get(type);
    if (!def) return "未知節點";
    return def.listLabel || `${def.label}節點`;
}

export function getNodeIcon(type: CanvasNodeTypeId) {
    return definitions.get(type)?.icon ?? null;
}

/** 手動拉伸的最小尺寸 */
export function getNodeMinSize(type: CanvasNodeTypeId) {
    return definitions.get(type)?.minSize ?? FALLBACK_MIN_SIZE;
}

/** 拉伸時是否鎖定寬高比 */
export function shouldKeepAspectRatio(node: CanvasNodeData) {
    return definitions.get(node.type)?.keepAspectRatio?.(node) ?? false;
}

/**
 * 該節點作為 @ 引用素材時的型別，非素材返回 null。
 * 只按型別判定——角色卡那類跨型別覆蓋由呼叫方在此之前處理。
 */
export function getNodeResourceKind(node: CanvasNodeData) {
    return definitions.get(node.type)?.resourceKind?.(node) ?? null;
}

/** 該節點作為生成節點時的生成模式，不產生生成行為返回 null */
export function getNodeGenerationMode(node: CanvasNodeData) {
    return definitions.get(node.type)?.generationMode?.(node) ?? null;
}

/** 該節點作為上游輸入被計數時的類別，不參與計數返回 undefined */
export function getNodeInputKind(type: CanvasNodeTypeId) {
    return definitions.get(type)?.inputKind;
}

export function getNodeAcceptedInputKind(type: CanvasNodeTypeId) {
    return definitions.get(type)?.acceptsInputKind;
}

export function getNodeAcceptedInputKinds(type: CanvasNodeTypeId) {
    const accepted = definitions.get(type)?.acceptsInputKind;
    if (!accepted) return [];
    return Array.isArray(accepted) ? accepted : [accepted];
}

export function getNodeMaxInputCount(type: CanvasNodeTypeId) {
    return definitions.get(type)?.maxInputCount;
}
