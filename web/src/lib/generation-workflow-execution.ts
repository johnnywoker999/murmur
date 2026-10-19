import { normalizeRunningHubCapability, type AiConfig, type RunningHubCapability, type RunningHubWorkflowKind, type WorkflowFieldMapping } from "@/stores/use-config-store";
import { workflowProviderPluginEnabled } from "@/lib/plugins/builtin/workflows";
import { usePluginStore } from "@/stores/use-plugin-store";

export type GenerationWorkflowMode = "text" | "image" | "video" | "audio";

export type GenerationWorkflowExecution = {
	provider: "runninghub";
    kind: RunningHubWorkflowKind;
    capability: RunningHubCapability;
    interfaceType: string;
    name: string;
    taskModel: string;
    providerModel: string;
    workflowId: string;
    webappId: string;
    workflowJson: Record<string, unknown>;
    workflowFields: WorkflowFieldMapping[];
};

// 畫布樣式計劃、任務記錄和後端協議必須共用同一個工作流選擇結果，避免再次回退到普通模型。
export function resolveGenerationWorkflowExecution(config: AiConfig, mode: GenerationWorkflowMode): GenerationWorkflowExecution | null {
    const workflowProvider = mode === "text" ? "model" : config.taskWorkflowProvider || "model";
    if (workflowProvider === "model") return null;

    if (workflowProvider === "runninghub") {
        if (!workflowProviderPluginEnabled(usePluginStore.getState().runtimeStatuses, "runninghub")) throw new Error("RunningHub 工作流外掛未啟用");
        const runningHub = config.runningHub;
        const workflowId = runningHub.workflowId.trim();
        const kind = runningHub.selectedKind === "app" ? "app" : "workflow";
        // RunningHub 工作流的引數拉取、提交和輪詢固定使用積分 API Key；企業級 Key 只用於素材上傳。
        const apiKey = runningHub.apiKey;
        if (!runningHub.enabled || !runningHub.baseUrl.trim() || !apiKey.trim() || !workflowId) {
            throw new Error("RunningHub 工作流配置不完整，請填寫積分 API Key 並選擇已儲存條目");
        }
        const workflow = runningHub.workflows.find((item) => item.workflowId.trim() === workflowId && (item.kind === "app" ? "app" : "workflow") === kind);
        if (!workflow) throw new Error("當前 RunningHub 工作流條目不存在，請重新選擇已儲存條目");
        const capability = normalizeRunningHubCapability(workflow.capability, normalizeRunningHubCapability(runningHub.capability));
        assertWorkflowCapability("RunningHub", capability, mode);
        const webappId = kind === "app" ? (workflow.webappId || workflow.workflowId).trim() : "";
        const name = workflow.title?.trim() || webappId || workflowId;
        return {
            provider: "runninghub",
            kind,
            capability,
            interfaceType: `runninghub-workflow-${capability}`,
            name,
            taskModel: workflowTaskModel("RunningHub · ", name),
            providerModel: workflowId,
            workflowId: kind === "workflow" ? workflowId : "",
            webappId,
            workflowJson: workflow.workflowJson || {},
            workflowFields: workflow.fields || [],

		};
	}

	throw new Error("未知工作流提供方");
}

function assertWorkflowCapability(providerName: string, capability: RunningHubCapability, mode: GenerationWorkflowMode) {
    if (capability === mode) return;
    const capabilityName = workflowCapabilityName(capability);
    const modeName = workflowCapabilityName(mode);
    throw new Error(`${providerName} 已儲存條目的用途為${capabilityName}，當前節點是${modeName}生成，請切換匹配的工作流`);
}

function workflowCapabilityName(value: GenerationWorkflowMode) {
    if (value === "video") return "影片";
    if (value === "audio") return "音訊";
    if (value === "text") return "文本";
    return "圖片";
}

function workflowTaskModel(prefix: string, name: string) {
    return `${prefix}${Array.from(name)
        .slice(0, Math.max(0, 120 - prefix.length))
        .join("")}`;
}
