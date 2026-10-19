import type { AiTextMessage } from "@/services/api/image";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { resolveReferenceMediaDuration } from "@/lib/reference-media-metadata";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import { getGenerationResourceNodes, getContextResourceNodes, getMentionResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { canvasNodeVideoPreviewUrl, canvasVideoAssetPreviewUrl } from "@/lib/canvas/canvas-media-preview";
import { isNeutralColorGrade, resolveCanvasColorGradeReference } from "@/lib/canvas/canvas-color-grade";
import { getNodeResourceKind } from "@/lib/canvas/node-registry";
import { mediaConversionSourceFingerprint } from "@/lib/media-conversion/contracts";
import { resolveCanvasDrawingReference } from "@/lib/canvas/canvas-drawing-reference";
import { compileCharacterReferencePrompt } from "@/lib/canvas/canvas-character-reference";
import { nodeReferenceImage } from "@/lib/canvas/canvas-project-generation";
import { isCanvasWorkflowProvider } from "@/lib/canvas/canvas-workflow";
import { audioFileExtension } from "@/lib/character-voice-formats";
import type { ModelReferenceLimits } from "@/lib/model-selection";
import type { Asset } from "@/stores/use-asset-store";
import { resourceIdFromStorageKey } from "@/services/api/resources";

export type CharacterGenerationReference = {
    nodeId: string;
    assetId: string;
    requestedVersionId?: string;
};

export type ResolvedCharacterVoice = {
    assetId: string;
    versionId: string;
    characterName: string;
    voiceKey: string;
    sampleResourceId?: string;
    language?: string;
    voiceAge?: string;
    timbre?: string;
    deliveryInstructions?: string;
    instructions: string;
};

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    characterReferences: CharacterGenerationReference[];
    resolvedCharacterVersions: Array<{ assetId: string; versionId: string }>;
    resolvedCharacterVoices: ResolvedCharacterVoice[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio" | "character";
    sourceKind?: "drawing";
    title: string;
    previewUrl?: string;
    alwaysIncludeText?: boolean;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
    character?: CharacterGenerationReference;
};

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string, assets: Asset[], promptOnly = false): NodeGenerationContext {
    const pendingConversion = findPendingMediaConversionInput(nodeId, nodes, connections);
    if (pendingConversion) {
        const status = pendingConversion.metadata?.mediaConversion?.status;
        const reason = status === "stale" ? "輸入或方式已變化" : status === "processing" ? "仍在處理中" : "尚未完成本地轉換";
        throw new Error(`轉換節點「${pendingConversion.title || pendingConversion.id}」${reason}，完成後才能執行下游生成`);
    }
    const connectedInputs = withArkAssetReferenceInputs(buildNodeGenerationInputs(nodeId, nodes, connections), nodes, assets);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    const portraitTextureInput = sourceNode?.type === CanvasNodeType.Image && sourceNode.metadata?.content && sourceNode.metadata?.portraitTexture
        ? (() => {
              const image = readReferenceImage(sourceNode, nodes, connections);
              return image ? [{ nodeId: sourceNode.id, type: "image" as const, title: sourceNode.title, image }] : [];
          })()
        : [];
    // 顯式 @ 引用必須與提示詞面板展示的資源集合一致；預設自動輸入仍只取入邊，
    // 避免已有圖片在沒有 @圖片N 時被悄悄當作自身參考圖。
    const mentionInputs = withArkAssetReferenceInputs(mergeGenerationInputs(buildNodeMentionGenerationInputs(nodeId, nodes, connections), portraitTextureInput, buildAssetGenerationInputs(assets)), nodes, assets);
    const storyboardInputs = getConnectedStoryboardRows(nodeId, nodes, connections);
    assertResolvableGenerationMentions(prompt, mentionInputs);
    const hasExplicitResourceMention = hasResolvableGenerationMention(prompt, mentionInputs);
    const isWorkflowSource = sourceNode?.type === CanvasNodeType.Config && isCanvasWorkflowProvider(sourceNode.metadata);
    const hasConnectedMedia = connectedInputs.some((input) => input.type === "image" || input.type === "video" || input.type === "audio" || input.type === "character");
    if ((promptOnly && hasConnectedMedia) || (Boolean(sourceNode?.metadata?.composerContent?.trim()) && (sourceNode?.type === CanvasNodeType.Config || isWorkflowSource)) || hasExplicitResourceMention) {
        const autoIncludeWorkflowMedia = isWorkflowSource;
        return buildComposerGenerationContext(
            mentionInputs,
            prompt,
            // 工作流節點由欄位對映接收全部連線媒體；影片節點的歷史首尾幀欄位不能再額外追加參考圖。
            autoIncludeWorkflowMedia || (promptOnly && hasConnectedMedia) ? [] : [sourceNode?.metadata?.videoStartFrameNodeId, sourceNode?.metadata?.videoEndFrameNodeId].filter((id): id is string => Boolean(id)),
            promptOnly,
            autoIncludeWorkflowMedia || (promptOnly && hasConnectedMedia),
            connectedInputs,
        );
    }

    const isStoryboardMedia = sourceNode?.type === CanvasNodeType.Image || sourceNode?.type === CanvasNodeType.Video;
    const basePrompt = isStoryboardMedia && storyboardInputs.length ? removeTrailingInputBlocks(prompt, storyboardInputs) : prompt;
    const textInputs = connectedInputs.filter((input) => input.type === "text");
    const characterReferences = connectedInputs.map((input) => input.character).filter((item): item is CharacterGenerationReference => Boolean(item));
    const upstreamText = textInputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = connectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = connectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = connectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: promptOnly ? prompt : upstreamText ? `${basePrompt}\n\n${upstreamText}` : basePrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        characterReferences,
        resolvedCharacterVersions: [],
        resolvedCharacterVoices: [],
        textCount: textInputs.length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

/**
 * 轉換節點允許提前連到下游，但只有與當前唯一媒體輸入匹配的已物化結果才能進入生成請求。
 * 沿上游鏈路檢查也覆蓋“生成節點 -> 配置節點 -> 轉換節點”的接法。
 */
export function findPendingMediaConversionInput(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const sourceId = queue.shift()!;
        if (visited.has(sourceId)) continue;
        visited.add(sourceId);
        const source = nodesById.get(sourceId);
        if (!source) continue;
        if (source.type === CanvasNodeType.MediaConversion) {
            const state = source.metadata?.mediaConversion;
            const sourceInputs = connections
                .filter((connection) => connection.toNodeId === source.id)
                .map((connection) => nodesById.get(connection.fromNodeId))
                .filter((input): input is CanvasNodeData => Boolean(input && (input.type === CanvasNodeType.Image || input.type === CanvasNodeType.Video)));
            const sourceInput = sourceInputs[0];
            const ready = state?.status === "completed"
                && Boolean(state.resultStorageKey)
                && sourceInputs.length === 1
                && Boolean(sourceInput)
                && state.sourceNodeId === sourceInput?.id
                && state.sourceFingerprint === mediaConversionSourceFingerprint(sourceInput!);
            if (!ready) return source;
        }
        connections.filter((connection) => connection.toNodeId === sourceId).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

function removeTrailingInputBlocks(prompt: string, inputs: NodeGenerationInput[]) {
    let next = prompt.trim();
    let removed = true;
    while (removed) {
        removed = false;
        for (const input of inputs) {
            const block = input.text?.trim();
            if (!block || !next.endsWith(block)) continue;
            const prefix = next.slice(0, next.length - block.length);
            if (!prefix.trim() || !/\n\s*\n$/.test(prefix)) continue;
            next = prefix.trimEnd();
            removed = true;
            break;
        }
    }
    return next;
}

function buildComposerGenerationContext(
    inputs: NodeGenerationInput[],
    prompt: string,
    videoFrameNodeIds: string[] = [],
    promptOnly = false,
    autoIncludeWorkflowMedia = false,
    workflowMediaInputs: NodeGenerationInput[] = [],
): NodeGenerationContext {
    const normalizedPrompt = normalizeGenerationNodeMentionTokens(prompt, inputs);
    const slotInputByToken = new Map(generationSlotEntries(inputs).map(({ token, input }) => [token, input]));
    const assetInputById = new Map(inputs.filter((input) => input.nodeId.startsWith("asset:")).map((input) => [input.nodeId.slice("asset:".length), input]));
    const nodeInputById = new Map(inputs.filter((input) => !input.nodeId.startsWith("asset:")).map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, drawing: 0, video: 0, audio: 0, text: 0, character: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    if (autoIncludeWorkflowMedia) {
        // 先固定“圖片1/影片1”等提示詞標籤的順序，和工作流槽位保持一致；
        // 使用者先 @ 第二張圖時，提示詞也不會把它誤標成第一張。
        workflowMediaInputs.forEach((input) => {
            if (input.type === "text" || labelByNodeId.has(input.nodeId)) return;
            const labelKind = input.sourceKind === "drawing" ? "drawing" : input.type;
            labelByNodeId.set(input.nodeId, generationLabel(labelKind, counts[labelKind]++));
        });
    }

    for (const match of normalizedPrompt.matchAll(GENERATION_MENTION_PATTERN)) {
        if (match.index === undefined) continue;
        nextPrompt += normalizedPrompt.slice(lastIndex, match.index);
        const input = resolveGenerationMention(normalizedPrompt, match, slotInputByToken, nodeInputById, assetInputById);
        if (input) {
            hasToken = true;
            let label = labelByNodeId.get(input.nodeId);
            if (!label) {
                const labelKind = input.sourceKind === "drawing" ? "drawing" : input.type;
                label = generationLabel(labelKind, counts[labelKind]++);
                labelByNodeId.set(input.nodeId, label);
                if (input.type === "text") textBlocks.push(`【${label}】\n${input.text || ""}`);
                else selectedInputs.push(input);
            }
            nextPrompt += input.type === "text" ? `【${label}】` : `@${label}`;
        } else nextPrompt += match[0];
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += normalizedPrompt.slice(lastIndex);
    // 顯式 @文本 引用是使用者寫進輸入框的內容，必須內聯真實文本；promptOnly 只攔自動上游文本。
    if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join("\n\n")}`;
    if (autoIncludeWorkflowMedia) {
        // RunningHub/ComfyUI 工作流按儲存的欄位槽位接收圖片、影片和音訊；
        // 配置節點不能因為提示詞裡沒有逐個 @ 就丟失已連線媒體。
        // 先按連線順序放入媒體，避免使用者在提示詞裡 @圖片2 後改變工作流槽位的索引；
        // 素材庫中的顯式 @ 引用仍保留在後面，不會被自動模式吞掉。
        const explicitInputs = selectedInputs.splice(0);
        const selectedNodeIds = new Set<string>();
        workflowMediaInputs.forEach((input) => {
            if (input.type === "text" || selectedNodeIds.has(input.nodeId)) return;
            selectedInputs.push(input);
            selectedNodeIds.add(input.nodeId);
        });
        explicitInputs.forEach((input) => {
            if (selectedNodeIds.has(input.nodeId)) return;
            selectedInputs.push(input);
            selectedNodeIds.add(input.nodeId);
        });
    }
    // 首尾幀是結構化生成引數，不受提示詞中的 @ 引用篩選影響。
    const selectedNodeIds = new Set(selectedInputs.map((input) => input.nodeId));
    videoFrameNodeIds.forEach((nodeId) => {
        const input = nodeInputById.get(nodeId);
        if (!input?.image || selectedNodeIds.has(nodeId)) return;
        selectedInputs.push(input);
        selectedNodeIds.add(nodeId);
    });
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
    const characterReferences = selectedInputs.map((input) => input.character).filter((item): item is CharacterGenerationReference => Boolean(item));

    if (!hasToken && !textBlocks.length && !selectedInputs.length) {
        return {
            prompt,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            characterReferences: [],
            resolvedCharacterVersions: [],
            resolvedCharacterVoices: [],
            textCount: 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        characterReferences,
        resolvedCharacterVersions: [],
        resolvedCharacterVoices: [],
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

const GENERATION_MENTION_PATTERN = /@\[(node|asset):([^\]]+)\]|@(圖片|影片|音訊|文本|角色|繪圖)(\d+)/g;

export function generationInputMentionLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[]) {
    const entry = generationSlotEntries(inputs).find((item) => item.input.nodeId === input.nodeId);
    return entry?.label || generationLabel(input.sourceKind === "drawing" ? "drawing" : input.type, 0);
}

export function normalizeGenerationNodeMentionTokens(prompt: string, inputs: NodeGenerationInput[]) {
    const labelByNodeId = new Map(generationSlotEntries(inputs).map(({ input, label }) => [input.nodeId, label]));
    return prompt.replace(/@\[node:([^\]]+)\]/g, (token, nodeId: string) => {
        const label = labelByNodeId.get(nodeId);
        return label ? `@${label}` : token;
    });
}

function hasResolvableGenerationMention(prompt: string, inputs: NodeGenerationInput[]) {
    return inspectGenerationMentions(prompt, inputs).hasResolved;
}

function assertResolvableGenerationMentions(prompt: string, inputs: NodeGenerationInput[]) {
    const { unresolved } = inspectGenerationMentions(prompt, inputs);
    if (!unresolved.length) return;
    throw new Error(`提示詞中的 ${unresolved.join("、")} 沒有對應的畫布資源，請重新選擇引用後再生成`);
}

function inspectGenerationMentions(prompt: string, inputs: NodeGenerationInput[]) {
    const normalizedPrompt = normalizeGenerationNodeMentionTokens(prompt, inputs);
    const slotInputByToken = new Map(generationSlotEntries(inputs).map(({ token, input }) => [token, input]));
    const nodeInputById = new Map(inputs.filter((input) => !input.nodeId.startsWith("asset:")).map((input) => [input.nodeId, input]));
    const assetInputById = new Map(inputs.filter((input) => input.nodeId.startsWith("asset:")).map((input) => [input.nodeId.slice("asset:".length), input]));
    const unresolved = new Set<string>();
    let hasResolved = false;
    for (const match of normalizedPrompt.matchAll(GENERATION_MENTION_PATTERN)) {
        if (match[3]) {
            const end = (match.index || 0) + match[0].length;
            if (!hasMentionBoundary(normalizedPrompt, end)) continue;
        }
        if (resolveGenerationMention(normalizedPrompt, match, slotInputByToken, nodeInputById, assetInputById)) hasResolved = true;
        else unresolved.add(match[0]);
    }
    return { hasResolved, unresolved: [...unresolved] };
}

function generationSlotEntries(inputs: NodeGenerationInput[]) {
    const counts = { image: 0, drawing: 0, video: 0, audio: 0, text: 0, character: 0 };
    return inputs.flatMap((input) => {
        if (input.nodeId.startsWith("asset:")) return [];
        const kind = input.sourceKind === "drawing" ? "drawing" : input.type;
        const label = generationLabel(kind, counts[kind]++);
        return [{ input, label, token: `@${label}` }];
    });
}

function resolveGenerationMention(
    prompt: string,
    match: RegExpMatchArray,
    slotInputByToken: Map<string, NodeGenerationInput>,
    nodeInputById: Map<string, NodeGenerationInput>,
    assetInputById: Map<string, NodeGenerationInput>,
) {
    if (match[3]) {
        const end = (match.index || 0) + match[0].length;
        return hasMentionBoundary(prompt, end) ? slotInputByToken.get(match[0]) : undefined;
    }
    if (match[1] === "node") return nodeInputById.get(match[2]);
    if (match[1] === "asset") return assetInputById.get(match[2]);
    return undefined;
}

function hasMentionBoundary(value: string, index: number) {
    const char = value[index];
    return !char || /\s|[,.!?;:，。！？；：、)\]}】）]/.test(char);
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return buildGenerationInputs(getGenerationResourceNodes(nodeId, nodes, connections), nodes, connections);
}

function buildNodeMentionGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return buildGenerationInputs(getMentionResourceNodes(nodeId, nodes, connections), nodes, connections);
}

function buildGenerationInputs(resourceNodes: CanvasNodeData[], nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    return resourceNodes.flatMap((node): NodeGenerationInput[] => {
        const character = readCharacterReference(node);
        if (character) return [{ nodeId: node.id, type: "character" as const, title: node.title, character }];
        const image = readReferenceImage(node, nodes, connections);
        // sourceKind 只是「標籤用繪圖N而不是參考圖N」的覆蓋開關，不是來源全集。
        // 調色節點在下游就是一張普通參考圖，按 image 標籤即正確。
        if (image) return [{ nodeId: node.id, type: "image" as const, sourceKind: image.source?.kind === "drawing" ? "drawing" : undefined, title: node.title, image }];
        const video = readReferenceVideo(node);
        if (video) return [{ nodeId: node.id, type: "video" as const, title: node.title, previewUrl: canvasNodeVideoPreviewUrl(node), video }];
        const audio = readReferenceAudio(node);
        if (audio) return [{ nodeId: node.id, type: "audio" as const, title: node.title, audio }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text" as const, title: node.title, text }];
        return [];
    });
}

function mergeGenerationInputs(...groups: NodeGenerationInput[][]) {
    const seen = new Set<string>();
    return groups.flatMap((group) =>
        group.filter((input) => {
            if (seen.has(input.nodeId)) return false;
            seen.add(input.nodeId);
            return true;
        }),
    );
}

function buildAssetGenerationInputs(assets: Asset[]): NodeGenerationInput[] {
    return assets.flatMap((asset): NodeGenerationInput[] => {
        const nodeId = `asset:${asset.id}`;
        if (asset.kind === "text") return [{ nodeId, type: "text", title: asset.title, text: asset.data.content }];
        if (asset.kind === "image") return [{ nodeId, type: "image", title: asset.title, image: { id: asset.id, name: asset.title, type: asset.data.mimeType, dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, bytes: asset.data.bytes, width: asset.data.width, height: asset.data.height, ...(asset.arkAssetId ? { arkAssetId: asset.arkAssetId } : {}) } }];
        if (asset.kind === "video") return [{ nodeId, type: "video", title: asset.title, previewUrl: canvasVideoAssetPreviewUrl(asset.data.url, asset.coverUrl), video: { id: asset.id, name: asset.title, type: asset.data.mimeType, url: asset.data.url, storageKey: asset.data.storageKey, bytes: asset.data.bytes, width: asset.data.width, height: asset.data.height, durationMs: asset.data.durationMs } }];
        if (asset.kind === "audio") return [{ nodeId, type: "audio", title: asset.title, audio: { id: asset.id, name: asset.title, type: asset.data.mimeType, url: asset.data.url, storageKey: asset.data.storageKey, bytes: asset.data.bytes, durationMs: asset.data.durationMs } }];
        if (asset.kind === "entity" && asset.category === "character") return [{ nodeId, type: "character", title: asset.title, character: { nodeId, assetId: asset.id, requestedVersionId: asset.primaryVersionId } }];
        return [];
    });
}

// 圖片節點繫結的素材若已錄入方舟素材 ID，把 ID 附加到參考圖上；是否改用 asset:// 引用
// 由 generation-task 按影片渠道決定，非方舟渠道與本地回退路徑不受影響。
function withArkAssetReferenceInputs(inputs: NodeGenerationInput[], nodes: CanvasNodeData[], assets: Asset[]): NodeGenerationInput[] {
    if (!assets.length) return inputs;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    return inputs.map((input) => {
        if (input.type !== "image" || !input.image || input.image.arkAssetId) return input;
        const boundAssetId = nodeById.get(input.nodeId)?.metadata?.assetId;
        const arkAssetId = boundAssetId ? assetById.get(boundAssetId)?.arkAssetId : undefined;
        return arkAssetId ? { ...input, image: { ...input.image, arkAssetId } } : input;
    });
}

function getConnectedStoryboardRows(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    const targetNodeIds = new Set([nodeId]);
    connections.forEach((connection) => {
        if (connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config) {
            targetNodeIds.add(connection.toNodeId);
        }
    });
    const seen = new Set<string>();
    return connections.flatMap((connection): NodeGenerationInput[] => {
        if (!targetNodeIds.has(connection.toNodeId) || !connection.fromHandleId?.startsWith("row:")) return [];
        const scriptNode = nodes.find((node) => node.id === connection.fromNodeId && node.type === CanvasNodeType.Script);
        const row = scriptNode?.metadata?.storyboard?.rows.find((item) => `row:${item.id}` === connection.fromHandleId);
        if (!scriptNode || !row) return [];
        const inputId = `${scriptNode.id}:${connection.fromHandleId}`;
        if (seen.has(inputId)) return [];
        seen.add(inputId);
        const characters = (row.characters || []).map((character) => [character.characterName, character.characterDescription].filter(Boolean).join("：")).filter(Boolean).join("、");
        const text = [
            `【分鏡 ${row.shotNumber}】`,
            `時長：${row.durationSeconds} 秒`,
            row.plotDescription && `畫面描述：${row.plotDescription}`,
            row.dialogue && `臺詞/旁白：${row.dialogue}`,
            characters && `角色：${characters}`,
            row.shotSize && `景別：${row.shotSize}`,
            row.emotion && `情緒：${row.emotion}`,
            row.lightingAndAtmosphere && `光影氛圍：${row.lightingAndAtmosphere}`,
            row.audioEffects && `音效：${row.audioEffects}`,
            row.camera && `鏡頭設計：${row.camera}`,
            row.motion && `運鏡：${row.motion}`,
            row.timeBeats && `時間節拍：${row.timeBeats}`,
            row.imageGenerationPrompt && `圖片提示詞：${row.imageGenerationPrompt}`,
            row.videoMotionPrompt && `影片提示詞：${row.videoMotionPrompt}`,
            row.negativePrompt && `負面要求：${row.negativePrompt}`,
        ].filter(Boolean).join("\n");
        return [{ nodeId: inputId, type: "text", title: `${scriptNode.title} · 鏡頭 ${row.shotNumber}`, text, alwaysIncludeText: true }];
    });
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext, projectId: string, domainProjectId?: string, mode?: CanvasGenerationMode, includeCharacterVoiceSamples = false, includeCharacterPrompt = true, referenceLimits?: ModelReferenceLimits) {
    if (mode === "video") {
        const [referenceVideos, referenceAudios] = await Promise.all([
            Promise.all(context.referenceVideos.map(resolveReferenceMediaDuration)),
            Promise.all(context.referenceAudios.map(resolveReferenceMediaDuration)),
        ]);
        context = { ...context, referenceVideos, referenceAudios };
    }
    let referenceImages = await Promise.all(
        context.referenceImages.map(async (image) => {
            if (image.source?.kind === "drawing") return resolveCanvasDrawingReference(projectId, image);
            if (image.source?.kind === "colorgrade") return resolveCanvasColorGradeReference(image);
            // Backend task preparation consumes these references directly. Reading
            // their preview blob here would make submission wait for the UI cache.
            if (resourceIdFromStorageKey(image.storageKey) || /^https?:\/\//i.test(image.url || image.dataUrl)) return image;
            const { imageToDataUrl } = await import("@/services/image-storage");
            return { ...image, dataUrl: await imageToDataUrl(image) };
        }),
    );
    if (!context.characterReferences.length) return { ...context, referenceImages };
    if (!domainProjectId) throw new Error("角色引用未關聯短劇專案，無法解析角色版本");
    const { getProjectCharacter } = await import("@/services/api/projects");
    const { getResource, resourceFileUrl, resourceStorageKey } = await import("@/services/api/resources");
    const details = await Promise.all(context.characterReferences.map((reference) => getProjectCharacter(domainProjectId, reference.assetId)));
    const remainingBudget = Math.max(0, (referenceLimits?.maxImages ?? 9) - referenceImages.length);
    const selected = details.flatMap((detail, index) => {
        const representation = preferredCharacterRepresentation(detail.character.representations);
        return representation ? [{ ...representation, sourceNodeId: context.characterReferences[index]!.nodeId }] : [];
    });
    if (selected.length > remainingBudget) throw new Error(`當前模型參考圖容量不足：角色至少需要 ${selected.length} 張主參考圖`);
    const usedResourceIds = new Set(selected.map((item) => item.resourceId));
    const supplements = details.flatMap((detail, index) => detail.character.representations.filter((item) => {
        if (!["front", "side", "back", "turnaround_sheet"].includes(item.role) || usedResourceIds.has(item.resourceId)) return false;
        usedResourceIds.add(item.resourceId);
        return true;
    }).map((item) => ({ ...item, sourceNodeId: context.characterReferences[index]!.nodeId })));
    const characterImages = [...selected, ...supplements].slice(0, Math.max(0, remainingBudget)).map((representation, index) => ({
        id: `character-reference-${index + 1}`,
        sourceNodeId: representation.sourceNodeId,
        name: `character-reference-${index + 1}.png`,
        type: "image/png",
        dataUrl: "",
        storageKey: resourceStorageKey(representation.resourceId),
    } satisfies ReferenceImage));
    referenceImages = [...referenceImages, ...characterImages];
    const characterBlocks = details.map((detail) => compileCharacterReferencePrompt(detail.asset.title, detail.character.definition));
    const resolvedCharacterVersions = details.map((detail) => ({ assetId: detail.asset.id, versionId: detail.character.versionId }));
    const resolvedCharacterVoices = details.flatMap((detail): ResolvedCharacterVoice[] => {
        const voice = detail.character.voice;
        if (!voice) return [];
        const language = stringField(detail.character.definition.voiceLanguage) || stringField(voice.profile.language);
        const voiceAge = stringField(detail.character.definition.voiceAge);
        const timbre = stringField(detail.character.definition.voiceTimbre) || stringField(voice.profile.timbre);
        const deliveryInstructions = stringField(voice.instructions);
        const sampleResourceId = stringField(voice.profile.sampleResourceId);
        return [{
            assetId: detail.asset.id,
            versionId: detail.character.versionId,
            characterName: detail.asset.title,
            voiceKey: stringField(voice.profile.voiceKey),
            sampleResourceId: sampleResourceId || undefined,
            language: language || undefined,
            voiceAge: voiceAge || undefined,
            timbre: timbre || undefined,
            deliveryInstructions: deliveryInstructions || undefined,
            instructions: [language && `語言與口音：${language}`, voiceAge && `聲音年齡感：${voiceAge}`, timbre && `音色氣質：${timbre}`, deliveryInstructions].filter(Boolean).join("；"),
        }];
    });
    const usedAudioResourceIds = new Set(context.referenceAudios.map((audio) => resourceIdFromStorageKey(audio.storageKey)).filter(Boolean));
    const voiceSamples: ResolvedCharacterVoice[] = [];
    // 影片模型接收聲音樣本；獨立配音任務仍通過 voiceKey 選音色，不能把兩種協議混用。
    if (mode === "video" && includeCharacterVoiceSamples) {
        resolvedCharacterVoices.forEach((voice) => {
            if (!voice.sampleResourceId || usedAudioResourceIds.has(voice.sampleResourceId)) return;
            usedAudioResourceIds.add(voice.sampleResourceId);
            voiceSamples.push(voice);
        });
    }
    const maxAudios = referenceLimits?.maxAudios ?? 3;
    if (context.referenceAudios.length + voiceSamples.length > maxAudios) throw new Error(`當前模型參考音訊容量不足：已連線 ${context.referenceAudios.length} 個音訊，角色聲音樣本還需要 ${voiceSamples.length} 個名額`);
    const characterVoiceAudios = await Promise.all(voiceSamples.map(async (voice) => {
        const resource = await getResource(voice.sampleResourceId!);
        const extension = audioFileExtension(resource.mimeType, resource.objectKey);
        return resolveReferenceMediaDuration({
            id: `character-voice-${voice.assetId}`,
            sourceNodeId: context.characterReferences.find((reference) => reference.assetId === voice.assetId)?.nodeId,
            name: `${voice.characterName}-聲音樣本.${extension}`,
            type: resource.mimeType || "audio/mpeg",
            url: resourceFileUrl(voice.sampleResourceId!),
            storageKey: resourceStorageKey(voice.sampleResourceId!),
            durationMs: resource.durationMs,
            bytes: resource.size,
        } satisfies ReferenceAudio);
    }));
    const referenceAudios = [...context.referenceAudios, ...characterVoiceAudios];
    const voiceBlocks = mode === "video" ? resolvedCharacterVoices.map(compileResolvedVoicePrompt) : [];
    return {
        ...context,
        prompt: includeCharacterPrompt ? [context.prompt.trim(), ...characterBlocks, ...voiceBlocks].filter(Boolean).join("\n\n") : context.prompt,
        referenceImages,
        referenceAudios,
        resolvedCharacterVersions,
        resolvedCharacterVoices,
        imageCount: referenceImages.length,
        audioCount: referenceAudios.length,
    };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    if (node.type === CanvasNodeType.Skill) return readSkillInput(node);
    return node.metadata?.prompt || "";
}

function readCharacterReference(node: CanvasNodeData): CharacterGenerationReference | null {
    const assetId = node.metadata?.workflowKind === "character" ? node.metadata.characterAssetId?.trim() : "";
    return assetId ? { nodeId: node.id, assetId, requestedVersionId: node.metadata?.characterVersionPolicy === "pinned" ? node.metadata.characterVersionId : undefined } : null;
}

function preferredCharacterRepresentation(representations: Array<{ id: string; resourceId: string; role: string }>) {
    return ["turnaround_sheet", "primary", "front", "side", "back"].map((role) => representations.find((item) => item.role === role)).find(Boolean);
}

function compileResolvedVoicePrompt(voice: ResolvedCharacterVoice) {
    return [
        `【角色聲音：${voice.characterName}】`,
        voice.language && `語言與口音：${voice.language}`,
        voice.voiceAge && `聲音年齡感：${voice.voiceAge}`,
        voice.timbre && `音色氣質：${voice.timbre}`,
        voice.deliveryInstructions && `表演與朗讀要求：${voice.deliveryInstructions}`,
    ].filter(Boolean).join("\n");
}

function stringField(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readSkillInput(node: CanvasNodeData) {
    const skill = node.metadata?.skillSnapshot;
    if (!skill) return node.metadata?.content || "";
    return [
        `【技能：${skill.name}】`,
        skill.description ? `用途：${skill.description}` : "",
        `執行模板：\n${skill.template}`,
        skill.outputContract ? `輸出約束：\n${skill.outputContract}` : "",
        "請嚴格執行該技能，只輸出結果，不要輸出解釋性套話。",
    ]
        .filter(Boolean)
        .join("\n\n");
}

function generationLabel(type: NodeGenerationInput["type"] | "drawing", index: number) {
    if (type === "character") return `角色${index + 1}`;
    if (type === "drawing") return `繪圖${index + 1}`;
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    if (type === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function readReferenceImage(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): ReferenceImage | null {
    if (node.type === CanvasNodeType.Drawing && node.metadata?.drawingId) {
        return {
            id: node.id,
            name: node.title || `繪圖-${node.id}`,
            type: "image/png",
            dataUrl: "",
            source: {
                kind: "drawing",
                drawingId: node.metadata.drawingId,
                revision: node.metadata.drawingRevision || 0,
                shapeCount: node.metadata.drawingShapeCount || 0,
            },
        };
    }
    if (node.type === CanvasNodeType.ColorGrade) {
        // 調色節點自己不存圖：源圖在上游，引數在 metadata。沒連線就跳過這條輸入，
        // 而不是拋錯——畫布上放一個還沒連線的調色節點是很正常的中間狀態。
        // 判據與節點渲染保持一致（都要求上游是帶 content 的圖片），
        // 否則會出現「預覽裡看到了、生成時卻沒用上」這類不報錯的偏差。
        const source = getContextResourceNodes(node.id, nodes, connections).find((item) => getNodeResourceKind(item) === "image" && item.metadata?.content);
        const url = source?.metadata?.content;
        if (!source || !url) return null;

        const grade = node.metadata?.colorGrade;
        // 未調色時直接透傳源圖，省掉一次渲染與上傳（也就不佔檔案容量）。
        if (!grade || isNeutralColorGrade(grade)) {
            const passthrough = nodeReferenceImage(source);
            return passthrough ? { ...passthrough, id: node.id, name: node.title || `調色-${node.id}` } : null;
        }
        return {
            id: node.id,
            name: node.title || `調色-${node.id}`,
            type: "image/png",
            dataUrl: "",
            source: { kind: "colorgrade", url, grade },
        };
    }
    return nodeReferenceImage(node);
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        durationMs: node.metadata.durationMs,
    };
}
