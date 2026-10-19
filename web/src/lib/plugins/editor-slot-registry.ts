import { useEffect, useReducer } from "react";

import type { EditorSlotKind } from "./plugin-types";

export type EditorSlotRenderer = (context: { pluginId: string }) => React.ReactNode;

export type EditorSlotRegistration = {
    id: number;
    pluginId: string;
    slot: EditorSlotKind;
    priority: number;
    order: number;
    render: EditorSlotRenderer;
};

export type RegisterEditorSlotInput = {
    pluginId: string;
    slot: EditorSlotKind;
    priority?: number;
    render: EditorSlotRenderer;
};

let nextOrder = 0;
let nextId = 0;
const registrations: EditorSlotRegistration[] = [];
const listeners = new Set<() => void>();

function emitChange(): void {
    for (const listener of listeners) listener();
}

/** 訂閱插槽登入檔變化（外掛啟停時 UI 重新整理）。返回取消訂閱函式。 */
export function subscribeEditorSlots(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** React hook：訂閱插槽變化並返回當前插槽貢獻。 */
export function useEditorSlots(slot: EditorSlotKind): EditorSlotRegistration[] {
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => subscribeEditorSlots(force), []);
    return getEditorSlots(slot);
}

/** 註冊一個編輯器插槽貢獻。同 pluginId + slot 重複註冊會覆蓋舊項（冪等，相容 HMR 過載）。返回的解除安裝函式只解除安裝自己註冊的例項。 */
export function registerEditorSlot(input: RegisterEditorSlotInput): () => void {
    unregisterEditorSlot(input.pluginId, input.slot);
    const id = nextId++;
    registrations.push({
        id,
        pluginId: input.pluginId,
        slot: input.slot,
        priority: input.priority ?? 0,
        order: nextOrder++,
        render: input.render,
    });
    return () => {
        unregisterById(id);
        emitChange();
    };
}

function unregisterById(id: number): void {
    const index = registrations.findIndex((r) => r.id === id);
    if (index >= 0) registrations.splice(index, 1);
}

export function unregisterEditorSlot(pluginId: string, slot: EditorSlotKind): void {
    const index = registrations.findIndex((r) => r.pluginId === pluginId && r.slot === slot);
    if (index >= 0) {
        registrations.splice(index, 1);
        emitChange();
    }
}

/** 解除安裝某外掛的全部編輯器插槽貢獻（外掛解除安裝時呼叫）。 */
export function unregisterPluginSlots(pluginId: string): void {
    let changed = false;
    for (let i = registrations.length - 1; i >= 0; i--) {
        if (registrations[i].pluginId === pluginId) {
            registrations.splice(i, 1);
            changed = true;
        }
    }
    if (changed) emitChange();
}

/** 取某插槽的全部貢獻，按 priority 降序、註冊序升序穩定排列。 */
export function getEditorSlots(slot: EditorSlotKind): EditorSlotRegistration[] {
    return registrations
        .filter((r) => r.slot === slot)
        .sort((a, b) => b.priority - a.priority || a.order - b.order);
}
