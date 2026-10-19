import { parseBackendGenerationResult } from "@/services/api/generation-task";
import type { GenerationTask } from "@/services/api/task-center";

export type RecoverableCreationTextMessage = {
    mode?: string;
    status?: string;
    content: string;
    error?: string;
    taskIds?: string[];
};

export type CreationTextTaskRecovery = {
    status: "done" | "error" | "cancelled";
    content: string;
    error?: string;
    taskIds: string[];
};

// 頁面過載後只依賴後端任務終態恢復訊息，不復用已經中斷的瀏覽器請求。
export function recoverCreationTextTask(message: RecoverableCreationTextMessage, tasks: GenerationTask[]): CreationTextTaskRecovery | null {
    if (message.mode !== "text" || (message.status !== "streaming" && message.status !== "pending")) return null;

    const taskIds = new Set(message.taskIds || []);
    const matches = tasks.filter((task) => taskIds.has(task.id));
    if (!matches.length || matches.some((task) => task.status === "queued" || task.status === "running")) return null;

    const nextTaskIds = Array.from(new Set([...(message.taskIds || []), ...matches.map((task) => task.id)]));
    const succeeded = matches.find((task) => task.status === "succeeded");
    if (succeeded) {
        try {
            const text = parseBackendGenerationResult(succeeded).text;
            if (!text?.trim()) throw new Error("後端任務沒有返回文本");
            return { status: "done", content: text, error: undefined, taskIds: nextTaskIds };
        } catch (error) {
            return { status: "error", content: "生成失敗", error: error instanceof Error ? error.message : "文本任務結果格式錯誤", taskIds: nextTaskIds };
        }
    }
    if (matches.every((task) => task.status === "cancelled")) {
        return { status: "cancelled", content: "已停止", error: undefined, taskIds: nextTaskIds };
    }
    const failed = matches.find((task) => task.status === "failed");
    return { status: "error", content: "生成失敗", error: failed?.error || "文本任務已失敗", taskIds: nextTaskIds };
}
