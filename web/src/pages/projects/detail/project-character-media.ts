import { runBackendCanvasGenerationTask } from "@/lib/canvas/canvas-project-generation";
import { PromptTemplateOperation, promptTemplateTaskPlaceholder } from "@/lib/prompts";
import { resolveStyleExecutionPlan, serializeStyleProfile, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";
import { logicalModelIDForConfig, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";

type ProjectStylePrompt = { id: string; title: string; prompt: string; profile?: StyleProfileSnapshot };

export async function generateCharacterTurnaround(input: { projectId: string; assetId: string; versionId: string; name: string; definition: Record<string, unknown>; projectStyle?: ProjectStylePrompt; config: AiConfig }) {
    const promptTemplateVariables = characterTurnaroundVariables(input.name, input.definition, input.projectStyle);
    const generationConfig = { ...input.config, model: input.config.imageModel || input.config.model, count: "1" };
    const requestConfig = resolveModelRequestConfig(generationConfig, generationConfig.model);
    const styleExecutionPlan = input.projectStyle?.profile ? resolveStyleExecutionPlan(input.projectStyle.profile, { mode: "image", model: requestConfig.model, interfaceType: requestConfig.interfaceType || requestConfig.apiFormat }) : undefined;
    if (styleExecutionPlan?.status === "blocked" && !logicalModelIDForConfig(generationConfig)) throw new Error(`當前圖片模型無法完整執行專案畫風：${styleExecutionPlan.warnings.join("；")}。請切換圖片模型，或在專案設定中停用對應畫風資產`);
    await runBackendCanvasGenerationTask({
        projectId: input.projectId,
        nodeId: `character-turnaround:${input.assetId}`,
        mode: "image",
        prompt: promptTemplateTaskPlaceholder("角色三檢視"),
        config: generationConfig,
        metadata: { operation: PromptTemplateOperation.CharacterTurnaround, promptTemplateOperation: PromptTemplateOperation.CharacterTurnaround, promptTemplateVariables, characterAssetId: input.assetId, stylePresetId: input.projectStyle?.id, styleProfileJson: input.projectStyle?.profile ? serializeStyleProfile(input.projectStyle.profile) : undefined, styleExecutionPlan, resolvedCharacterVersions: [{ assetId: input.assetId, versionId: input.versionId }] },
    });
}

function characterTurnaroundVariables(name: string, definition: Record<string, unknown>, projectStyle?: ProjectStylePrompt) {
    const visual = [definition.role, definition.appearance, definition.physique, definition.clothing, definition.personality, definition.props, definition.consistencyPrompt, definition.multiViewPrompt]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join("；");
    if (!visual) throw new Error("請先填寫劇情定位、角色外貌、體型或服裝，再初始化三檢視");
    return { 角色名稱: name, 專案畫風: characterStyleConstraint(projectStyle) || "專案尚未指定畫風，保持角色媒介中性。", 角色設定: visual };
}

function characterStyleConstraint(projectStyle?: ProjectStylePrompt) {
    if (!projectStyle) return "";
    // 三檢視只繼承角色資產相關規範，避免把建築、運鏡等專案規則錯誤塞進靜態設定表。
    const characterSections = new Set(["風格組合", "專案定位", "題材世界觀", "視覺媒介", "角色設計系統", "專案色彩與光影", "服飾、材質與場景", "資產一致性", "全域性停用"]);
    const rules = projectStyle.prompt.split("\n").filter((line) => {
        const title = line.match(/^【([^】]+)】/)?.[1];
        return title ? characterSections.has(title) : false;
    });
    return [
        `專案畫風：${projectStyle.title}。角色造型、配色、服裝材質與最終渲染媒介必須遵循以下規範：`,
        ...rules,
    ].join("\n");
}
