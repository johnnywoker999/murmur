import { ScanSearch, Sparkles } from "lucide-react";
import { createElement } from "react";

import type { FloatingDockEntry } from "@/components/ui/aceternity/floating-dock";
import { ART_CRITIQUE_NODE_TYPE } from "@/lib/art-critique/contracts";
import { listCreatableNodeDefinitions } from "@/lib/canvas/node-registry";

import type { AddNodeMenuCommand, AddNodeMenuContext, NodeToolbarGroup, ToolCategory, ToolContext, ToolDefinition, ToolbarId, ToolbarPrefs } from "./tool-definition";

/** 模組級登入檔 */
const registry = new Map<ToolbarId, ToolDefinition[]>();
const addNodeMenuRegistry: AddNodeMenuCommand[] = [];

/** 批次註冊工具到指定工具欄 */
export function registerToolbarTools(tools: ToolDefinition[]) {
    for (const tool of tools) {
        const list = registry.get(tool.toolbar) ?? [];
        // Vite HMR/桌面開發容器可能重複執行定義模組。登入檔必須是
        // 冪等的，否則每次熱更新都會再追加一份按鈕，最終導致工具欄
        // 出現 2x/3x 重複 DOM。按穩定 id 覆蓋，保留原有順序。
        const existingIndex = list.findIndex((item) => item.id === tool.id);
        if (existingIndex >= 0) list[existingIndex] = tool;
        else list.push(tool);
        registry.set(tool.toolbar, list);
    }
}

/** 註冊新增節點選單命令 */
export function registerAddNodeMenuCommands(commands: AddNodeMenuCommand[]) {
    for (const command of commands) {
        const existingIndex = addNodeMenuRegistry.findIndex((item) => item.id === command.id);
        if (existingIndex >= 0) addNodeMenuRegistry[existingIndex] = command;
        else addNodeMenuRegistry.push(command);
    }
}

/** 獲取某工具欄全部已註冊工具（按 defaultOrder 升序） */
export function getToolbarTools(toolbar: ToolbarId): ToolDefinition[] {
    const tools = registry.get(toolbar) ?? [];
    return [...new Map(tools.map((tool) => [tool.id, tool])).values()].sort((a, b) => a.defaultOrder - b.defaultOrder);
}

/** 獲取新增節點選單全部命令（按 defaultOrder 升序） */
export function getAddNodeMenuCommands(): AddNodeMenuCommand[] {
    return [...new Map(addNodeMenuRegistry.map((command) => [command.id, command])).values()].sort((a, b) => a.defaultOrder - b.defaultOrder);
}

/**
 * 將已註冊的外掛畫布節點轉換為新增選單命令。
 * 這部分按需生成，避免遠端/延遲載入的外掛必須在工具定義模組初始化前完成註冊。
 */
function getPluginNodeMenuCommands(): AddNodeMenuCommand[] {
    return listCreatableNodeDefinitions()
        .filter((definition) => Boolean(definition.plugin))
        .map((definition, index) => {
            const pluginId = definition.plugin!.pluginId;
            const FallbackIcon = definition.type === ART_CRITIQUE_NODE_TYPE ? ScanSearch : Sparkles;
            return {
                id: definition.type,
                label: definition.label,
                icon: definition.icon || createElement(FallbackIcon, { "aria-hidden": true }),
                section: "node",
                defaultOrder: 1000 + index,
                applicable: (ctx: AddNodeMenuContext) => !ctx.enabledPluginIds || ctx.enabledPluginIds.has(pluginId),
                run: (ctx: AddNodeMenuContext) => ctx.handlers.onAddExtensionNode(definition.type),
            };
        });
}

/** 預設偏好：全部工具按 defaultOrder 排列；defaultVisible 為 false 的進入 hidden */
export function defaultToolbarPrefs(toolbar: ToolbarId): ToolbarPrefs {
    const tools = getToolbarTools(toolbar);
    return {
        order: tools.map((tool) => tool.id),
        hidden: tools.filter((tool) => !tool.defaultVisible).map((tool) => tool.id),
    };
}

/**
 * 解析工具欄條目——核心函式
 *
 * 流程：過濾 applicable → 應用使用者排序 → 過濾使用者隱藏 → 生成 FloatingDockEntry（含 separator 分組）
 */
export function resolveToolbarEntries(toolbar: ToolbarId, ctx: ToolContext, prefs: ToolbarPrefs | null): FloatingDockEntry[] {
    const tools = resolveToolbarTools(toolbar, ctx, prefs);
    return buildEntriesWithSeparators(tools, ctx);
}

/**
 * 解析工具欄工具——返回過濾排序後的 ToolDefinition[]（不含 separator）。
 * 供需要後處理工具列表的場景使用（如節點懸停工具欄合併圖片工具）。
 */
export function resolveToolbarTools(toolbar: ToolbarId, ctx: ToolContext, prefs: ToolbarPrefs | null): ToolDefinition[] {
    const allTools = getToolbarTools(toolbar);
    const applicableTools = allTools.filter((tool) => !tool.applicable || tool.applicable(ctx));
    const effectivePrefs = prefs ?? defaultToolbarPrefs(toolbar);
    const hiddenSet = new Set(effectivePrefs.hidden);
    const visibleTools = applicableTools.filter((tool) => !hiddenSet.has(tool.id));
    const orderIndex = new Map(effectivePrefs.order.map((id, index) => [id, index]));
    return [...visibleTools].sort((a, b) => {
        const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.defaultOrder - b.defaultOrder;
    });
}

/** 將節點工具定義解析為唯一的 Dock 展示層級和排序。 */
export function resolveNodeToolbarPlacement(tool: ToolDefinition, ctx: ToolContext): { group: NodeToolbarGroup; order: number } {
    const placement = tool.nodeToolbar;
    return {
        group: typeof placement?.group === "function" ? placement.group(ctx) : placement?.group || "more",
        order: typeof placement?.order === "function" ? placement.order(ctx) : placement?.order ?? tool.defaultOrder,
    };
}

/** 解析新增節點選單命令——合併外掛節點後按 applicable 過濾並排序。 */
export function resolveAddNodeMenuCommands(ctx: AddNodeMenuContext): AddNodeMenuCommand[] {
    return [...getAddNodeMenuCommands(), ...getPluginNodeMenuCommands()].filter((command) => !command.applicable || command.applicable(ctx)).sort((a, b) => a.defaultOrder - b.defaultOrder);
}

/**
 * 將工具列表轉為 FloatingDockEntry，按 category 邊界自動插入 separator。
 * danger 類工具會被包裹在 is-danger-group 容器中實現視覺隔離。
 */
function buildEntriesWithSeparators(tools: ToolDefinition[], ctx: ToolContext): FloatingDockEntry[] {
    const entries: FloatingDockEntry[] = [];
    let prevCategory: ToolCategory | null = null;
    let separatorIndex = 0;
    for (const tool of tools) {
        if (prevCategory !== null && prevCategory !== tool.category) {
            entries.push({ kind: "separator", id: `sep-${tool.toolbar}-${separatorIndex}` });
            separatorIndex += 1;
        }
        entries.push(toolToEntry(tool, ctx));
        prevCategory = tool.category;
    }
    return entries;
}

function toolToEntry(tool: ToolDefinition, ctx: ToolContext): FloatingDockEntry {
    if (tool.switchGroup) {
        return {
            kind: "switch",
            id: tool.id,
            label: resolveText(tool.label, ctx),
            value: tool.switchGroup.value(ctx),
            options: tool.switchGroup.options,
            onChange: (value) => tool.switchGroup?.onChange(ctx, value),
        };
    }
    return {
        kind: "command",
        id: tool.id,
        label: resolveText(tool.label, ctx),
        displayLabel: tool.displayLabel ? resolveText(tool.displayLabel, ctx) : undefined,
        icon: resolveIcon(tool.icon, ctx),
        active: tool.active?.(ctx),
        disabled: tool.disabled?.(ctx),
        danger: tool.danger,
        prominent: tool.prominent,
        expands: tool.expands,
        onClick: (event) => tool.run(ctx, event),
    };
}

function resolveText(value: string | ((ctx: ToolContext) => string), ctx: ToolContext): string {
    return typeof value === "function" ? value(ctx) : value;
}

function resolveIcon(value: ToolDefinition["icon"], ctx: ToolContext) {
    return typeof value === "function" ? value(ctx) : value;
}
