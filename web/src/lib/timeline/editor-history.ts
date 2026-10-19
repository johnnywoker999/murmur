// 時間線快照撤銷（ADR-0002）：有界 200 層 undo/redo 棧。
// 純函式式結構，便於 zustand 以 set(createEditorHistory(...)) 直接換新引用。
// 快照依賴命令層不可變更新：歷史中儲存的是結構共享的全量物件，不做深複製。

import type { TimelineProject } from "@/types/timeline";

export const HISTORY_LIMIT = 200;

export type EditorHistory = {
    /** 棧底為最舊，棧頂（末尾）為最近一次歷史。 */
    undoStack: TimelineProject[];
    redoStack: TimelineProject[];
    current: TimelineProject;
};

export function createEditorHistory(initial: TimelineProject): EditorHistory {
    return { undoStack: [], redoStack: [], current: initial };
}

/**
 * 提交一次新狀態：舊 current 入 undo 棧，清空 redo（新分支），
 * 超過 HISTORY_LIMIT 時丟棄最舊快照。
 */
export function pushEditorHistory(history: EditorHistory, next: TimelineProject): EditorHistory {
    const undoStack = [...history.undoStack, history.current];
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    return { undoStack, redoStack: [], current: next };
}

/** 無可撤銷時返回 null（呼叫方保持當前狀態不變）。 */
export function undoEditorHistory(history: EditorHistory): EditorHistory | null {
    const prev = history.undoStack.at(-1);
    if (prev === undefined) return null;
    return {
        undoStack: history.undoStack.slice(0, -1),
        redoStack: [...history.redoStack, history.current],
        current: prev,
    };
}

export function redoEditorHistory(history: EditorHistory): EditorHistory | null {
    const next = history.redoStack.at(-1);
    if (next === undefined) return null;
    return {
        undoStack: [...history.undoStack, history.current],
        redoStack: history.redoStack.slice(0, -1),
        current: next,
    };
}

export function canUndo(history: EditorHistory): boolean {
    return history.undoStack.length > 0;
}

export function canRedo(history: EditorHistory): boolean {
    return history.redoStack.length > 0;
}
