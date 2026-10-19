import { nanoid } from "nanoid";

import type { CanvasBatchOperation, CanvasBatchReferenceColumn, CanvasBatchRow, CanvasBatchTableData, CanvasConnection, CanvasNodeData } from "@/types/canvas";

export const TRY_ON_BATCH_PROMPT = "參考圖1是人物原圖，參考圖2是目標服裝。保持人物身份、五官、姿態和背景不變，將人物服裝替換為參考圖2中的款式。準確還原服裝版型、顏色、材質、紋理和裝飾細節，穿著關係自然，光影與原圖一致。";
export const CREATIVE_BATCH_PROMPT = "基於參考圖創作一張新的商業圖片，保留主體身份和關鍵產品細節，畫面構圖完整，光影自然。";
export const BATCH_REFERENCE_HANDLE_PREFIX = "batch-reference:";
/** 兩行工具欄（操作欄 44 + 全域性提示詞 36 + 分隔 1）之後，對準錶頭中線。 */
export const BATCH_REFERENCE_HANDLE_TOP = 102;
export const BATCH_REFERENCE_HANDLE_GAP = 40;
export const MIN_BATCH_REFERENCE_COLUMNS = 1;
export const MAX_BATCH_REFERENCE_COLUMNS = 6;
const LEGACY_BATCH_TABLE_WIDTH = 900;

/** 舊預設 900 寬的批次創作表升級到當前預設尺寸，已經手動改過寬度的節點保持原樣。 */
export function promoteLegacyBatchTableSize(node: CanvasNodeData): CanvasNodeData {
    if (node.type !== "batch-table" || node.width !== LEGACY_BATCH_TABLE_WIDTH) return node;
    return { ...node, width: 1280, height: Math.max(node.height, 560) };
}

export function defaultBatchReferenceColumns(): CanvasBatchReferenceColumn[] {
    return [
        { id: "reference-1", label: "參考圖 1" },
        { id: "reference-2", label: "參考圖 2" },
        { id: "reference-3", label: "參考圖 3" },
    ];
}

export function batchReferenceColumns(table?: CanvasBatchTableData) {
    const columns = table?.referenceColumns;
    if (!columns?.length) return defaultBatchReferenceColumns();
    return columns;
}

export function batchReferenceHandleId(columnId: string) {
    return `${BATCH_REFERENCE_HANDLE_PREFIX}${columnId}`;
}

export function batchReferenceMentionToken(index: number) {
    return `@參考圖${index + 1}`;
}

export function batchReferenceColumnId(handleId?: string) {
    return handleId?.startsWith(BATCH_REFERENCE_HANDLE_PREFIX) ? handleId.slice(BATCH_REFERENCE_HANDLE_PREFIX.length) : undefined;
}

export function batchReferenceHandleY(node: CanvasNodeData, handleId?: string) {
    if (node.type !== "batch-table") return undefined;
    const columnId = batchReferenceColumnId(handleId);
    const columns = batchReferenceColumns(node.metadata?.batchTable);
    const index = columnId ? columns.findIndex((column) => column.id === columnId) : 0;
    if (index < 0) return undefined;
    return node.position.y + BATCH_REFERENCE_HANDLE_TOP + index * BATCH_REFERENCE_HANDLE_GAP;
}

export function batchReferenceHandleAtY(node: CanvasNodeData, worldY: number, hitRadius = 18) {
    if (node.type !== "batch-table") return undefined;
    const columns = batchReferenceColumns(node.metadata?.batchTable);
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    columns.forEach((_, index) => {
        const distance = Math.abs(worldY - (node.position.y + BATCH_REFERENCE_HANDLE_TOP + index * BATCH_REFERENCE_HANDLE_GAP));
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    });
    return nearestIndex >= 0 && nearestDistance <= hitRadius ? batchReferenceHandleId(columns[nearestIndex].id) : undefined;
}

export function removeLastBatchReferenceColumn(table: CanvasBatchTableData): CanvasBatchTableData | null {
    const columns = batchReferenceColumns(table);
    if (columns.length <= MIN_BATCH_REFERENCE_COLUMNS) return null;
    const nextColumns = columns.slice(0, -1).map((column, index) => ({ ...column, label: `參考圖 ${index + 1}` }));
    return {
        ...table,
        referenceColumns: nextColumns,
        rows: table.rows.map((row) => ({ ...row, inputNodeIds: nextColumns.map((_, index) => row.inputNodeIds[index] || "") })),
    };
}

export function reorderBatchReferenceColumns(table: CanvasBatchTableData, fromColumnId: string, toColumnId: string): CanvasBatchTableData {
    const columns = batchReferenceColumns(table);
    const fromIndex = columns.findIndex((column) => column.id === fromColumnId);
    const toIndex = columns.findIndex((column) => column.id === toColumnId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return table;
    const nextColumns = [...columns];
    const [moved] = nextColumns.splice(fromIndex, 1);
    nextColumns.splice(toIndex, 0, moved);
    return {
        ...table,
        referenceColumns: nextColumns.map((column, index) => ({ ...column, label: `參考圖 ${index + 1}` })),
        rows: table.rows.map((row) => ({
            ...row,
            inputNodeIds: nextColumns.map((column) => {
                const oldIndex = columns.findIndex((item) => item.id === column.id);
                return row.inputNodeIds[oldIndex] || "";
            }),
        })),
    };
}

export function moveBatchReferenceCell(table: CanvasBatchTableData, sourceRowId: string, sourceColumnIndex: number, targetRowId: string, targetColumnIndex: number): CanvasBatchTableData {
    if (sourceRowId === targetRowId && sourceColumnIndex === targetColumnIndex) return table;
    if (sourceColumnIndex < 0 || targetColumnIndex < 0) return table;
    const referenceCount = Math.max(batchReferenceColumns(table).length, sourceColumnIndex + 1, targetColumnIndex + 1);
    const sourceRow = table.rows.find((row) => row.id === sourceRowId);
    const targetRow = table.rows.find((row) => row.id === targetRowId);
    if (!sourceRow || !targetRow) return table;
    const nextRows = table.rows.map((row) => ({ ...row, inputNodeIds: Array.from({ length: referenceCount }, (_, index) => row.inputNodeIds[index] || "") }));
    const nextSource = nextRows.find((row) => row.id === sourceRowId)!;
    const nextTarget = nextRows.find((row) => row.id === targetRowId)!;
    const sourceNodeId = nextSource.inputNodeIds[sourceColumnIndex];
    if (!sourceNodeId) return table;
    const targetNodeId = nextTarget.inputNodeIds[targetColumnIndex];
    nextTarget.inputNodeIds[targetColumnIndex] = sourceNodeId;
    nextSource.inputNodeIds[sourceColumnIndex] = targetNodeId || "";
    return { ...table, rows: nextRows };
}

export function batchPromptForRow(table: CanvasBatchTableData, row: CanvasBatchRow) {
    return table.globalPrompt?.trim() || row.prompt;
}

export function batchInputColumns(node: CanvasNodeData, connections: CanvasConnection[]) {
    const columns = batchReferenceColumns(node.metadata?.batchTable);
    const indexById = new Map(columns.map((column, index) => [column.id, index]));
    const result = columns.map(() => [] as string[]);
    connections.filter((connection) => connection.toNodeId === node.id && connection.relation !== "batch-output").forEach((connection) => {
        const columnId = batchReferenceColumnId(connection.toHandleId);
        const index = columnId ? indexById.get(columnId) : 0;
        if (index === undefined || result[index].includes(connection.fromNodeId)) return;
        result[index].push(connection.fromNodeId);
    });
    return result;
}

export function createBatchRow(operation: CanvasBatchOperation, inputNodeIds: string[] = []): CanvasBatchRow {
    return {
        id: `batch-row-${nanoid()}`,
        enabled: true,
        inputNodeIds,
        prompt: operation === "try_on" ? TRY_ON_BATCH_PROMPT : CREATIVE_BATCH_PROMPT,
    };
}

/** 手工追加任務時沿用上一行的參考圖，但重新使用當前任務型別的預設提示詞。 */
export function createInheritedBatchRow(operation: CanvasBatchOperation, rows: CanvasBatchRow[]) {
    return createBatchRow(operation, [...(rows.at(-1)?.inputNodeIds || [])]);
}

/**
 * Connected try-on inputs follow the reference layout: all model/person images first,
 * followed by one shared garment image. Users can still edit any row afterwards.
 */
export function createBatchRowsFromInputs(operation: CanvasBatchOperation, inputNodeIds: string[]) {
    if (operation === "creative") return inputNodeIds.map((id) => createBatchRow(operation, [id]));
    if (inputNodeIds.length < 2) return [];
    const garmentId = inputNodeIds.at(-1)!;
    return inputNodeIds.slice(0, -1).map((personId) => createBatchRow(operation, [personId, garmentId]));
}

/**
 * Zip equally sized columns and broadcast singleton columns across every row.
 *
 * 同步連線是增量操作：匹配到的行更新參考圖，未被本次連線覆蓋的手工行繼續保留。
 * 這樣使用者在表格內追加或編輯的任務不會因為再次點選“同步連線”而被刪除。
 */
export function createBatchRowsFromColumns(operation: CanvasBatchOperation, columns: string[][], previousRows: CanvasBatchRow[] = []) {
    const rowCount = Math.max(0, ...columns.map((column) => column.length));
    const unmatchedRows = [...previousRows];
    const synchronizedRows = Array.from({ length: rowCount }, (_, rowIndex) => {
        const inputNodeIds = columns.flatMap((column) => {
            const input = column.length === 1 ? column[0] : column[rowIndex];
            return input ? [input] : [];
        });
        let previousIndex = unmatchedRows.findIndex((row) => sameBatchInputs(row.inputNodeIds, inputNodeIds));
        if (previousIndex < 0 && inputNodeIds[0]) previousIndex = unmatchedRows.findIndex((row) => row.inputNodeIds[0] === inputNodeIds[0]);
        const previous = previousIndex >= 0 ? unmatchedRows.splice(previousIndex, 1)[0] : undefined;
        const inputsUnchanged = previous && previous.inputNodeIds.length === inputNodeIds.length && previous.inputNodeIds.every((id, index) => id === inputNodeIds[index]);
        return {
            ...createBatchRow(operation, inputNodeIds),
            ...(previous ? { id: previous.id, enabled: previous.enabled, prompt: previous.prompt } : {}),
            ...(inputsUnchanged && previous?.outputNodeId ? { outputNodeId: previous.outputNodeId } : {}),
            inputNodeIds,
        };
    });
    return [...synchronizedRows, ...unmatchedRows];
}

function sameBatchInputs(left: string[], right: string[]) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}
