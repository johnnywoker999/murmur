import { applyStyleExecutionPlan, createStyleProfileSnapshot, parseStyleProfile, resolveStyleExecutionPlan, serializeStyleProfile, type StyleExecutionPlan, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";
import { logicalModelIDForConfig, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasStyleExecutionRuntime = {
    profile: StyleProfileSnapshot;
    profileJson: string;
    plan: StyleExecutionPlan;
    prompt: string;
};

export function resolveCanvasStyleExecution(nodes: CanvasNodeData[], sourceNode: CanvasNodeData | undefined, prompt: string, config: AiConfig, mode: "image" | "video"): CanvasStyleExecutionRuntime | null {
    const styleNode = nodes.find((node) => node.metadata?.workflowKind === "styleboard");
    if (!styleNode || sourceNode?.metadata?.workflowKind === "styleboard") return null;
    const profile = parseStyleProfile(styleNode.metadata?.styleProfileJson) || legacyStyleNodeProfile(styleNode);
    if (!profile) return null;
    const requestConfig = resolveModelRequestConfig(config, config.model);
    const plan = resolveStyleExecutionPlan(profile, { mode, model: requestConfig.model, interfaceType: requestConfig.interfaceType || requestConfig.apiFormat });
    // 平臺模型的真實供應模型由後端入隊時路由，前端只能預覽，最終相容性由後端重算。
    if (plan.status === "blocked" && !logicalModelIDForConfig(config)) throw new Error(`當前模型無法完整執行專案畫風：${plan.warnings.join("；")}。請切換模型，或在專案設定中停用對應畫風資產`);
    return { profile, profileJson: serializeStyleProfile(profile), plan, prompt: applyStyleExecutionPlan(prompt, plan) };
}

function legacyStyleNodeProfile(node: CanvasNodeData) {
    const prompt = String(node.metadata?.content || node.metadata?.prompt || "").trim();
    const presetId = String(node.metadata?.stylePresetId || "").trim();
    if (!prompt || !presetId) return null;
    return createStyleProfileSnapshot({
        presetId,
        title: node.title.replace(/^(?:專案)?畫風\s*[·：:]?\s*/, "").trim() || node.title,
        description: node.metadata?.workflowDescription || "歷史專案畫風規範",
        tags: [],
        prompt,
        assets: [],
        source: "user",
        revision: 1,
    });
}
