import { beefAPIVideoContract, isBeefAPIEndpoint } from "./beefapi-video-contracts";
import { h3ReferenceMode, h3VideoOperation, isH3Model, isH3Style } from "./h3-video";
import { seedanceSettingsConstraints, type SeedanceSettingsConstraints } from "./seedance-task-constraints";
import { modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "@/types/canvas";

export type VideoSettingsConstraints = SeedanceSettingsConstraints & { ratioHelp?: string };

export function videoSettingsConstraints(
    config: AiConfig,
    input: { imageCount?: number; videoCount?: number; audioCount?: number; characterCount?: number },
    metadata?: Pick<CanvasNodeMetadata, "videoEditOperation" | "videoStartFrameNodeId" | "videoEndFrameNodeId" | "videoMiddleFrameNodeId">,
): VideoSettingsConstraints {
    const model = modelOptionName(config.model);
    const imageCount = input.imageCount || 0;
    const videoCount = input.videoCount || 0;
    const audioCount = input.audioCount || 0;
    const first = metadata?.videoStartFrameNodeId;
    const last = metadata?.videoEndFrameNodeId;
    const resolved = resolveModelRequestConfig(config, config.model);
    const h3 = isBeefAPIEndpoint(resolved.baseUrl) && beefAPIVideoContract(model) && isH3Model(model);
    if (h3) {
        // Canvas submission resolves the operation before building the provider payload.
        const counts = { imageCount, videoCount, audioCount };
        const referenceMode = h3ReferenceMode(model, counts, { ...metadata, videoEditOperation: h3VideoOperation(model, counts, metadata?.videoEditOperation) });
        if (referenceMode) return {};
        if (input.characterCount) {
            // A card can expand into several views and change the submission mode.
            const ratioHelp = first || last
                ? model === "minimax-h3-max"
                    ? "首尾幀生成不能混用角色參考圖；H3 Max 多素材參考生成可組合關鍵幀與角色參考圖，使用所選比例。"
                    : "角色卡帶參考圖時，不能與指定的首尾幀同時使用。請移除角色卡，或取消首尾幀指定後再生成。"
                : isH3Style(model)
                    ? "角色卡帶參考圖時，影片比例由參考圖決定；所選比例只在沒有參考圖時生效。"
                    : "首尾幀生成時，比例隨實際參考圖；多素材參考生成使用所選比例。";
            return { ratioHelp };
        }
        if (!imageCount) return {};
        const frame = last && !first ? "尾幀" : "首幀";
        return {
            ratioLabel: `隨${frame}圖片`,
            ratioHelp: `影片比例由${frame}圖片決定。需要其他比例時，請先裁切或擴圖，再生成影片。`,
        };
    }
    return seedanceSettingsConstraints(model, imageCount, videoCount, audioCount, metadata?.videoEditOperation, Boolean(first || last));
}
