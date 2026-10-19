import type { CanvasOperation, CanvasSnapshot } from "./canvas-operation-contract";
import { createStoryboardRow } from "./canvas-project-domain";
import type { StoryboardRow } from "@/types/canvas";
import { inspectStoryboardReadiness } from "./canvas-storyboard-context";
import { createShortDramaPipeline } from "./canvas-short-drama";

export function buildAgentStoryboardDraft(input: { title: string; prompt: string; x: number; y: number }): CanvasOperation[] {
    if (!input.title.trim() || !input.prompt.trim()) throw new Error("待拆鏡節點需要標題和原始劇本");
    const node = createShortDramaPipeline({ x: input.x - 180, y: input.y }).nodes[2];
    return [{ type: "add_node", id: node.id, nodeType: node.type, title: input.title, position: node.position, width: node.width, height: node.height,
        metadata: { ...node.metadata, composerContent: input.prompt, workflowDescription: "待專業拆鏡，尚未生成鏡頭" } }];
}

const textFields = ["plotDescription", "dialogue", "videoMotionPrompt", "imageGenerationPrompt", "camera", "motion", "shotSize", "emotion", "lightingAndAtmosphere", "audioEffects", "narrativeIntent", "viewerPOV", "performanceBlocking", "timeBeats", "continuityOut", "negativePrompt"] as const;

export function validateAgentStoryboardCreation(ops: CanvasOperation[]) {
    for (const op of ops) {
        if (op.type !== "add_node" || op.nodeType !== "script") continue;
        const rows = op.metadata?.storyboard?.rows;
        if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some((row) => !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0 || !row.videoMotionPrompt?.trim())) throw new Error("分鏡節點必須包含真實鏡頭行。請使用 canvas_create_workflow 的 script.shots 填寫每鏡時長和影片提示詞，不能僅填正文；已有分鏡使用 canvas_edit_storyboard");
    }
    return ops;
}

export function readAgentStoryboard(snapshot: CanvasSnapshot, nodeId: string) {
    const node = snapshot.nodes.find((item) => item.id === nodeId && item.type === "script");
    if (!node) throw new Error("未找到當前畫布的分鏡指令碼節點，請先查詢真實節點");
    return { node, rows: node.metadata?.storyboard?.rows || [], readiness: inspectStoryboardReadiness(snapshot.nodes) };
}

export function buildAgentStoryboardOperations(snapshot: CanvasSnapshot, input: Record<string, unknown>): CanvasOperation[] {
    if (typeof input.nodeId !== "string") throw new Error("需要分鏡節點 nodeId");
    const { node, rows } = readAgentStoryboard(snapshot, input.nodeId);
    const action = input.action;
    const rowId = typeof input.rowId === "string" ? input.rowId : "";
    const index = rows.findIndex((row) => row.id === rowId);
    let next = rows.slice();
    if (action === "remove") {
        if (index < 0) throw new Error("分鏡行不存在，請重新讀取分鏡表");
        // Removing a row never deletes its existing generated assets.
        next.splice(index, 1);
    } else if (action === "append" || action === "update") {
        if (action === "update" && index < 0) throw new Error("分鏡行不存在，請重新讀取分鏡表");
        const raw = input.patch;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("需要分鏡內容 patch");
        const data = raw as Record<string, unknown>;
        const patch: Partial<StoryboardRow> = {};
        for (const [key, value] of Object.entries(data)) {
            if (key === "durationSeconds") {
                if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("分鏡時長必須是大於零的數字");
                patch.durationSeconds = value;
            } else if (textFields.includes(key as typeof textFields[number])) {
                if (typeof value !== "string" || value.length > 20_000) throw new Error(`分鏡欄位 ${key} 需要不超過 20000 字元的文本`);
                patch[key as typeof textFields[number]] = value;
            } else throw new Error(`不能通過分鏡編輯修改欄位 ${key}；已有素材關聯與任務狀態由系統維護`);
        }
        if (!Object.keys(patch).length) throw new Error("未提供需要修改的分鏡內容");
        if (action === "append") {
            if (rows.length >= 100) throw new Error("單個分鏡表最多 100 行");
            if (!patch.videoMotionPrompt?.trim() && !patch.plotDescription?.trim()) throw new Error("新增鏡頭需要畫面描述或影片提示詞");
            next.push(createStoryboardRow(rows.length + 1, patch));
        } else next[index] = { ...rows[index], ...patch };
    } else throw new Error("分鏡操作必須是 append、update 或 remove");
    next = next.map((row, i) => ({ ...row, shotNumber: i + 1 }));
    return [{ type: "update_node", id: node.id, metadata: { storyboard: {
        rows: next,
        visibleColumns: node.metadata?.storyboard?.visibleColumns || ["shotNumber", "durationSeconds", "videoMotionPrompt", "dialogue", "assets"],
        referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [],
    } } }];
}
