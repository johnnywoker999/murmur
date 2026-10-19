import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";

import { ART_CRITIQUE_NODE_TYPE, ART_CRITIQUE_PLUGIN_ID, artCritiqueSourceFingerprint, createDefaultArtCritiqueState } from "@/lib/art-critique/contracts";
import { prepareAnalysisNodeAction } from "../analysis-node-action";

const manifest: PluginManifest = {
    apiVersion: "beeftv.plugin/v1",
    id: ART_CRITIQUE_PLUGIN_ID,
    name: "AI 審美批改",
    version: "0.1.0",
    description: "分析圖片的構圖、色彩、光線和比例問題，輸出結構化批改報告與視覺化標註。prepare-input 準備節點；canvas_start_art_critique 準備並啟動分析；canvas_read_plugin_node 讀取結果。",
    author: "內建工具",
    surfaces: ["node", "fullscreen"],
    permissions: ["canvas.read", "canvas.write", "media.read", "ai.text"],
    trusted: true,
    runtime: { backend: "trusted-backend", web: "declarative" },
    contributes: {
        canvasNodes: [
            {
                id: ART_CRITIQUE_NODE_TYPE,
                label: "AI 審美批改",
                defaultTitle: "AI 審美批改",
                defaultSize: { width: 560, height: 420 },
                schema: { type: "object", properties: { artCritique: { type: "object" } } },
                renderer: "declarative",
                acceptsInputKind: "image",
                showOutputConnection: false,
            },
        ],
    },
};

export const artCritiquePlugin: RegisteredPlugin = {
    manifest,
    agentActions: [prepareAnalysisNodeAction(ART_CRITIQUE_NODE_TYPE, "AI 審美批改", () => ({ artCritique: createDefaultArtCritiqueState() }))],
    readAgentNode: (node, snapshot) => {
        const state = node.metadata?.artCritique;
        const sources = snapshot.nodes.filter((item) => item.type === "image" && snapshot.connections.some((edge) => edge.fromNodeId === item.id && edge.toNodeId === node.id));
        const currentReport = state?.report && sources.length === 1 && state.report.sourceFingerprint === artCritiqueSourceFingerprint(sources[0]) ? state.report : undefined;
        return { status: state?.report && !currentReport ? "stale" : state?.status || "idle", stage: state?.analysisStage, stageTaskIds: state?.stageTaskIds, sourceNodeId: state?.sourceNodeId, summary: currentReport?.summary, strengths: currentReport?.strengths, issues: currentReport?.issues, options: currentReport?.options, error: state?.errorMessage, execution: "已有報告僅在輸入指紋一致時返回；canvas_start_art_critique 準備分析，使用者確認後執行。" };
    },
};

registerPlugin(artCritiquePlugin);
