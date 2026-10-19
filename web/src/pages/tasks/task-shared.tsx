import { explainGenerationError, shouldBlockManualRetry } from "@/lib/generation-error";
import type { GenerationTask, TaskStatus } from "@/services/api/task-center";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";

export function getTaskCanvasContext(task: GenerationTask, canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>) {
    if (!task.projectId) return { canvasName: "未繫結畫布", projectName: "" };
    const canvas = canvasById.get(task.projectId);
    if (canvas) return { canvasName: canvas.title || "未命名畫布", projectName: canvas.projectId ? projectNameById.get(canvas.projectId) || "" : "" };
    const projectName = projectNameById.get(task.projectId);
    return projectName ? { canvasName: "專案級任務", projectName } : { canvasName: `未載入或已移除的畫布 · ${task.projectId}`, projectName: "" };
}

export function isTaskFailed(task: GenerationTask) {
    return task.status === "failed" || task.status === "cancelled";
}

export function taskAttentionReason(task: GenerationTask) {
    if (task.status === "cancelled") return providerCancelStatusLabel(task);
    const explanation = explainGenerationError({ code: task.errorCode, message: task.error }, { taskId: task.id, providerRequestId: task.providerRequestId, model: task.model, createdAt: task.createdAt, stage: task.stage });
    const text = explanation.message.trim();
    if (text.startsWith("{") || text.startsWith("[")) return explanation.reason || "生成失敗，開啟詳情檢視原因";
    if (explanation.moderation) return explanation.message;
    if (task.error || task.errorCode) return explanation.message;
    return task.stage || "生成失敗，開啟詳情檢視原因";
}

export function taskRetryBlocked(task: GenerationTask) {
    return shouldBlockManualRetry({ code: task.errorCode, message: task.error }, task.stage);
}

export function providerCancelStatusLabel(task: GenerationTask) {
    if (task.providerCancelStatus === "requested") return "已請求上游取消，正在等待確認";
    if (task.providerCancelStatus === "confirmed") return "上游已確認取消";
    if (task.providerCancelStatus === "uncertain") {
        return task.providerCancelError || "上游無法確認取消，狀態待確認";
    }
    return "任務已取消，可按原輸入重新提交";
}

export function statusDotClassName(status: TaskStatus) {
    if (status === "succeeded") return "task-record-dot is-success";
    if (status === "running") return "task-record-dot is-active is-pulsing";
    if (status === "queued") return "task-record-dot is-queued";
    if (status === "failed") return "task-record-dot is-failed";
    return "task-record-dot is-idle";
}

export function taskMediaKind(task: GenerationTask): "text" | "image" | "video" {
    const value = `${task.type} ${task.operation || ""}`.toLowerCase();
    if (value.includes("video") || value.includes("影片")) return "video";
    if (value.includes("image") || value.includes("圖片") || value.includes("畫面")) return "image";
    return "text";
}

export function TaskDate({ value }: { value?: string }) {
    if (!value) return <span className="text-xs text-foreground/38">-</span>;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return <span className="text-xs text-foreground/38">-</span>;
    const compact = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    return (
        <time className="task-record-date-value" dateTime={date.toISOString()} title={date.toLocaleString()}>
            {compact}
        </time>
    );
}

export function formatModelName(config: AiConfig, task: GenerationTask) {
    const raw = (task.model || task.provider || "").trim();
    const model = raw.includes("::") ? raw.split("::").pop()?.trim() || raw : raw;

    // 工作流名稱是任務快照，不屬於模型渠道，不能交給模型展示名解析器再次對映成“系統模型”。
    if (task.provider === "runninghub") return raw || "工作流";
    if (!model) return "工作流";
    if (model === "version-router") return "版本對比工作流";
    if (model === "workflow-router") return "工作流路由";
    if (model === "internal-agent") return "內建工作流";
    if (model === "openai-compatible") return "OpenAI 相容介面";
    return modelDisplayName(config, raw);
}
