import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type PluginManifest, type RegisteredPlugin } from "../plugin-types";

export const RUNNINGHUB_PLUGIN_ID = "runninghub-workflow-provider";

export type WorkflowProvider = "runninghub";

export function workflowPluginId(provider: WorkflowProvider) {
	return RUNNINGHUB_PLUGIN_ID;
}

export function workflowProviderPluginEnabled(statuses: Record<string, string>, provider: WorkflowProvider) {
    return statuses[workflowPluginId(provider)] === "enabled";
}

function workflowContributions(providerId: string, label: string) {
    return (["image", "video", "audio"] as const).map((capability) => ({
        id: `${providerId}-${capability}`,
        label: `${label} · ${{ image: "圖片", video: "影片", audio: "音訊" }[capability]}`,
        providerId,
        capability,
        parameters: [],
    }));
}

const runningHubManifest: PluginManifest = {
        id: RUNNINGHUB_PLUGIN_ID,
        name: "RunningHub 工作流",
        version: "1.0.0",
        publishedAt: "2026-08-25",
        updatedAt: "2026-08-25",
        apiVersion: PLUGIN_API_VERSION,
        description: "在畫布中拉取並執行 RunningHub Workflow 與 App，按工作流欄位生成圖片、影片和音訊。",
        documentation:
            "# RunningHub 工作流\n\n該外掛把 RunningHub 的 Workflow / App 接入畫布工作流節點。API Key、工作流引數和欄位對映仍由宿主安全儲存並提交，外掛本身不接觸金鑰。\n\n在外掛設定中可以開啟完整的 RunningHub 配置頁，拉取工作流、編輯欄位對映並測試請求。",
        author: "內建工作流",
        surfaces: ["node", "settings"],
        permissions: ["generation.run", "external.open"],
        trusted: true,
        runtime: { backend: "trusted-backend", web: "trusted-backend" },
        contributes: { workflows: workflowContributions(RUNNINGHUB_PLUGIN_ID, "RunningHub") },
};

registerPlugin({ manifest: runningHubManifest } satisfies RegisteredPlugin);
