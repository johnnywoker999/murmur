import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { isSeedanceVideoConfig } from "@/lib/seedance-video";
import type { CanvasVideoEditOperation } from "@/types/canvas";
import { channelHasGenerationCredential, resolveModelChannel, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";

export function listVideoReferenceModels(config: AiConfig): string[] {
    return selectableModelsByCapability(config, "video").filter((model) => {
        const profile = modelCapabilityConfigFor(config, model).video;
        if (!profile || profile.references.maxVideos < 1 || !profile.operations.length) return false;
        const channel = resolveModelChannel(config, model);
        return Boolean(channel.baseUrl.trim() && channelHasGenerationCredential(channel));
    });
}

export function videoReferenceRegenerationError(config: AiConfig): string {
    const videoProfile = modelCapabilityConfigFor(config, config.model).video;
    if (!videoProfile || videoProfile.references.maxVideos < 1) {
        return "當前所選影片模型不支援參考影片，無法為片段建立待生成節點。請選擇支援參考影片的模型，或在設定中配置 Seedance / Agent Plan / NewAPI 渠道。";
    }
    if (!videoProfile.operations.length) return "當前影片模型沒有可用的影片生成模式";
    return "";
}

export function videoReferenceOperationError(config: AiConfig, operation: CanvasVideoEditOperation): string {
    const videoProfile = modelCapabilityConfigFor(config, config.model).video;
    if (!videoProfile?.operations.includes(operation)) return "當前影片模型不支援所選生成模式";
    return "";
}

export function validateVideoSegmentBatch(config: AiConfig, segments: Array<{ startMs: number; endMs: number }>, operation?: CanvasVideoEditOperation): string {
    const referenceError = videoReferenceRegenerationError(config);
    if (referenceError) return referenceError;
    if (operation) {
        const operationError = videoReferenceOperationError(config, operation);
        if (operationError) return operationError;
    }
    for (const segment of segments) {
        const segmentError = videoReferenceSegmentError(config, segment.endMs - segment.startMs);
        if (segmentError) return segmentError;
    }
    return "";
}

export function videoReferenceSegmentError(config: AiConfig, durationMs: number): string {
    const videoProfile = modelCapabilityConfigFor(config, config.model).video;
    const maxSeconds = videoProfile?.references.maxVideoDurationSeconds || 0;
    if (maxSeconds > 0 && durationMs > maxSeconds * 1000) {
        return `擷取片段不能超過當前模型參考影片上限（${maxSeconds} 秒）`;
    }
    if (isSeedanceVideoConfig(config) && durationMs < 2000) {
        return "Seedance 參考影片單段至少 2 秒，請擴大擷取範圍";
    }
    return "";
}
