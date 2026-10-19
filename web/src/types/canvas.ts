import type { CanvasColorGrade } from "@/lib/canvas/canvas-color-grade";
import type { MediaConversionNodeState } from "@/lib/media-conversion/contracts";
import type { AssetCategory } from "@/lib/asset-category";
import type { PortraitTextureSettings } from "@/lib/canvas/canvas-portrait-texture";
import type { StyleExecutionPlan } from "@/lib/canvas/style-profile";
import type { ArtCritiqueNodeState } from "@/lib/art-critique/contracts";
import type { CameraControlOptions } from "@/lib/canvas/camera-prompt-library";
import type { SrtEntry, SubtitleHighlight, SubtitleStyle } from "@/types/timeline";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Drawing = "drawing",
    Script = "script",
    Skill = "skill",
    Config = "config",
    Video = "video",
    Audio = "audio",
    Frame = "frame",
    Markdown = "markdown",
    Svg = "svg",
    Html = "html",
    Panorama = "panorama",
    Compare = "compare",
    Chart = "chart",
    ColorGrade = "colorgrade",
    MediaConversion = "media-conversion",
    BatchTable = "batch-table",
    Director = "director",
}

/** Runtime IDs contributed by plugins share the persisted node type field. */
export type PluginCanvasNodeType = string & { readonly __pluginCanvasNodeType?: unique symbol };
export type CanvasNodeTypeId = CanvasNodeType | PluginCanvasNodeType;

export function isBuiltinCanvasNodeType(type: CanvasNodeTypeId): type is CanvasNodeType {
    return Object.values(CanvasNodeType).includes(type as CanvasNodeType);
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasMediaNodeRole = "generator" | "result";
export type CanvasMediaResultOrigin = "upload" | "library" | "generated" | "derived" | "imported" | "unknown";
export type CanvasMediaPerformanceMode = "auto" | "quality" | "performance";
export type CanvasWorkspaceMode = "simple" | "professional";
export type CanvasToolMode = "move" | "box-select";
export type CanvasFolderStyle = "glass" | "stacked" | "midnight" | "paper" | "cinema" | "compact";
export type CanvasFolderTheme = "aurora" | "obsidian" | "ember" | "pearl";
export type StoryboardShotDuration = "auto" | "5" | "10" | "15" | "30";
export type StoryboardShotCount = "auto" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
export type StoryboardVideoInputMode = "direct" | "keyframe";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio";
export type CanvasGenerationBatchMode = "storyboard_image" | "storyboard_video" | "action_board" | "batch_image";
export type CanvasGenerationBatchStatus = "queued" | "running" | "partial_failed" | "completed" | "cancelled";
export type CanvasGenerationBatchItemStatus = "waiting" | "submitting" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasWorkflowKind = "free" | "script" | "story_input" | "character" | "scene" | "storyboard" | "shot" | "final" | "styleboard" | "reference_set" | "reference_video" | "action_board" | "video_retake";
export type CanvasVideoEditOperation = "text_to_video" | "image_to_video" | "reference_to_video" | "extend" | "inpaint" | "replace_element" | "camera_motion" | "style_transfer" | "audio_to_video" | "compare_versions" | "concat";
export type CanvasSkillCategory = "writing" | "storyboard" | "image" | "video" | "utility";
export type CanvasSkillOutputMode = "text" | "json" | "image_prompt" | "workflow";
export type StoryboardColumn =
    | "shotNumber"
    | "durationSeconds"
    | "plotDescription"
    | "dialogue"
    | "narrativeIntent"
    | "viewerPOV"
    | "performanceBlocking"
    | "shotSize"
    | "emotion"
    | "lightingAndAtmosphere"
    | "audioEffects"
    | "camera"
    | "motion"
    | "timeBeats"
    | "imageGenerationPrompt"
    | "videoMotionPrompt"
    | "assets"
    | "continuityOut"
    | "negativePrompt";

export type StoryboardAssetRole = "character" | "environment" | "wardrobe" | "prop" | "weapon" | "style" | "motion" | "audio";

export type StoryboardAssetBinding = {
    nodeId: string;
    role: StoryboardAssetRole;
    priority: number;
};

export type StoryboardCharacterReference = {
    characterName: string;
    characterAssetId?: string;
    characterVersionId?: string;
    characterDescription?: string;
    characterImageNodeId?: string;
};

export type StoryboardRow = {
    id: string;
    shotNumber: number;
    durationSeconds: number;
    plotDescription: string;
    dialogue: string;
    characters: StoryboardCharacterReference[];
    narrativeIntent: string;
    viewerPOV: string;
    performanceBlocking: string;
    shotSize: string;
    emotion: string;
    lightingAndAtmosphere: string;
    audioEffects: string;
    camera: string;
    motion: string;
    timeBeats: string;
    imageGenerationPrompt: string;
    videoMotionPrompt: string;
    imagePromptTemplateVariables?: Record<string, string>;
    videoPromptTemplateVariables?: Record<string, string>;
    mustHave: string[];
    optionalDetails: string[];
    continuityOut: string;
    negativePrompt: string;
    assetBindings: StoryboardAssetBinding[];
    imageNodeId?: string;
    videoNodeId?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
};

export type StoryboardData = {
    rows: StoryboardRow[];
    visibleColumns: StoryboardColumn[];
    referenceNodeIds: string[];
};

export type CanvasGenerationBatchItem = {
    id: string;
    rowId: string;
    nodeId: string;
    taskId?: string;
    status: CanvasGenerationBatchItemStatus;
    retryCount: number;
    errorDetails?: string;
    submissionUncertain?: boolean;
};

export type CanvasGenerationBatch = {
    id: string;
    projectId: string;
    sourceNodeId: string;
    mode: CanvasGenerationBatchMode;
    status: CanvasGenerationBatchStatus;
    items: CanvasGenerationBatchItem[];
    concurrency?: number;
    createdAt: string;
    updatedAt: string;
};

export type CanvasBatchOperation = "try_on" | "creative";
export type CanvasBatchRow = { id: string; enabled: boolean; inputNodeIds: string[]; prompt: string; outputNodeId?: string };
export type CanvasBatchReferenceColumn = { id: string; label: string };
export type CanvasBatchTableData = { operation: CanvasBatchOperation; concurrency: number; globalPrompt?: string; referenceColumns?: CanvasBatchReferenceColumn[]; rows: CanvasBatchRow[] };

export type CanvasSkillSnapshot = {
    id: string;
    name: string;
    description: string;
    category: CanvasSkillCategory;
    template: string;
    outputMode: CanvasSkillOutputMode;
    outputContract: string;
    version: number;
    tags: string[];
};

export type CanvasNodeMetadata = {
    /** Media interaction role. `generator` owns generation controls; `result` is an inspect/process object. */
    nodeRole?: CanvasMediaNodeRole;
    /** How a media result entered the canvas. Only meaningful when nodeRole is `result`. */
    resultOrigin?: CanvasMediaResultOrigin;
    /** Generator or processing node that produced this result. */
    generatedFromNodeId?: string;
    /** Namespaced extension ownership for nodes contributed by a unified plugin. */
    pluginId?: string;
    pluginNodeId?: string;
    pluginData?: Record<string, unknown>;
    importSource?:
        | {
              provider: "libtv";
              projectUuid: string;
              nodeKey: string;
              batchId: string;
              sourceType?: string;
              styleAssetUuid?: string;
              styleVersionUuid?: string;
              styleName?: string;
          }
        | {
              provider: "tapnow";
              shareId: string;
              nodeId: string;
              batchId: string;
              sourceType?: string;
          };
    content?: string;
    previewContent?: string;
    videoPreview?: {
        content: string;
        storageKey?: string;
        width?: number;
        height?: number;
        bytes?: number;
        mimeType?: string;
        /** Poster capture contract version. Missing versions are regenerated lazily. */
        captureVersion?: number;
        /** Media identity used to prevent a poster surviving a source replacement. */
        sourceKey?: string;
        capturedAtMs?: number;
    };
    richText?: Record<string, unknown>;
    composerContent?: string;
    prompt?: string;
    promptTemplateOperation?: string;
    promptTemplateVariables?: Record<string, string>;
    status?: CanvasNodeStatus;
    /** Local media operations use this while a derived node is being prepared. */
    processingLabel?: string;
    /** 瀏覽器檔案上傳，與模型生成任務狀態獨立。 */
    fileUpload?: "uploading" | "error";
    fileUploadProgress?: number;
    locked?: boolean;
    errorDetails?: string;
    generationErrorCode?: string;
    outputParameterWarning?: string;
    resourceReloadAvailable?: boolean;
    failedPromptFingerprint?: string;
    failedInputFingerprint?: string;
    lastGenerationRequestFingerprint?: string;
    fontSize?: number;
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    workflowProvider?: "model" | "runninghub";
    runningHubWorkflowId?: string;
    runningHubWorkflowKind?: "workflow" | "app";
    /** 當前畫布節點覆蓋的工作流動態欄位，鍵為 source:* 或 field:nodeId:fieldName。 */
    workflowParameters?: Record<string, unknown>;
    size?: string;
    quality?: string;
    transparentBackground?: string;
    count?: number;
    textCount?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    /** 原版 LibTV 音訊節點的音高/音量控制；以字串儲存以相容工作流欄位。 */
    audioPitch?: string;
    audioVolume?: string;
    audioInstructions?: string;
    references?: string[];
    naturalWidth?: number;
    naturalHeight?: number;
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchFailedCount?: number;
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
    /** Whether the video file contains an audio track when this is known. */
    hasAudio?: boolean;
    assetId?: string;
    assetTags?: string[];
    assetCategory?: AssetCategory;
    workflowKind?: CanvasWorkflowKind;
    workflowTitle?: string;
    workflowDescription?: string;
    /** 本地視覺迴歸夾具標記，不參與生成或遠端同步語義。 */
    fixture?: string;
    stylePresetId?: string;
    styleProfileJson?: string;
    styleExecutionPlan?: StyleExecutionPlan;
    skillIds?: string[];
    skillVersions?: Array<{ skillId: string; versionId: string; version: string }>;
    skillFiles?: Array<{ skillId: string; path: string; sha256?: string }>;
    chapterId?: string;
    chapterTitle?: string;
    shotIndex?: number;
    sceneId?: string;
    characterIds?: string[];
    referenceSetId?: string;
    referenceAssetNodeIds?: string[];
    assetBindings?: StoryboardAssetBinding[];
    characterName?: string;
    characterPrompt?: string;
    characterAliases?: string[];
    characterDefinition?: Record<string, unknown>;
    characterAssetId?: string;
    characterVersionId?: string;
    characterVersionPolicy?: "current" | "pinned";
    characterVisualStatus?: string;
    characterVoiceStatus?: string;
    characterVoiceName?: string;
    characterVoiceProfile?: {
        name: string;
        provider: string;
        language: string;
        timbre: string;
    };
    characterVoiceInstructions?: string;
    characterCoverUrl?: string;
    characterView?: "front" | "side" | "back" | "multi";
    characterViewNodeIds?: {
        front?: string;
        side?: string;
        back?: string;
    };
    actionBoardRows?: number;
    actionBoardColumns?: number;
    taskId?: string;
    taskType?: string;
    taskClientOperationId?: string;
    taskOutputIndex?: number;
    generationSubmissionState?: "submitting" | "unknown" | "accepted" | "rejected";
    taskClientOperationInput?: string;
    taskClientOperationTerminal?: boolean;
    retryOf?: string;
    attemptGroupId?: string;
    taskStatus?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;
    taskProgress?: number;
    taskStage?: string;
    taskProvider?: string;
    taskStartedAt?: string;
    taskCompletedAt?: string;
    taskDurationMs?: number;
    taskErrorCode?: string;
    generationErrorSummary?: string;
    taskFailureDiagnostics?: import("@/lib/generation-error").GenerationFailureDiagnostics;
    taskProviderRequestId?: string;
    taskOfficialStatus?: "pending" | "processing" | "completed" | "failed" | "cancelled";
    taskReceiptRecorded?: boolean;
    taskCreatedAt?: string;
    taskUpdatedAt?: string;
    generationEffectKeys?: string[];
    agentGenerationContinuation?: {
        id: string;
        taskId: string;
        conversationId?: string;
        messageId?: string;
        source?: "online" | "local";
        status: "pending" | "completed" | "failed";
        effectKey?: string;
    };
    sessionId?: string;
    videoEditOperation?: CanvasVideoEditOperation;
    videoMergeSourceNodeIds?: string[];
    depthSourceNodeId?: string;
    arkPrivateAssetUpload?: string;
    videoCameraMoveId?: string;
    videoCameraMovePrompt?: string;
    videoStartFrameNodeId?: string;
    videoEndFrameNodeId?: string;
    videoMiddleFrameNodeId?: string;
    videoMiddleFrameTime?: number;
    videoH3Options?: import("@/lib/h3-video").H3VideoOptions;
    videoReferenceOrder?: string[];
    videoFrameSourceNodeId?: string;
    videoFrameTimeMs?: number;
    /** Traceability for media operations created from an existing video node. */
    videoSegmentSourceNodeId?: string;
    videoSegmentStartMs?: number;
    videoSegmentEndMs?: number;
    videoSegmentIndex?: number;
    videoSegmentAction?: "extract" | "create-generation-nodes";
    videoTrimStartMs?: number;
    videoTrimEndMs?: number;
    videoTrimSourceNodeId?: string;
    videoTrimSource?: {
        content?: string;
        storageKey?: string;
        durationMs?: number;
        naturalWidth?: number;
        naturalHeight?: number;
        bytes?: number;
        mimeType?: string;
        hasAudio?: boolean;
    };
    videoCrop?: { x: number; y: number; width: number; height: number };
    videoCropSourceNodeId?: string;
    videoRetakeSourceNodeId?: string;
    videoRetakeCount?: number;
    videoRetakeMax?: number;
    videoRetakeSegments?: Array<{ startMs: number; endMs: number }>;
    videoRetakeReferenceMode?: "reference" | "mark" | "character";
    videoRetakeWebSearch?: boolean;
    videoRetakeAutoValidate?: boolean;
    videoRetakeAutoLink?: boolean;
    audioExtractSourceNodeId?: string;
    audioExtractStartMs?: number;
    audioExtractEndMs?: number;
    videoAudioSourceNodeId?: string;
    videoHasAudio?: boolean;
    mediaOperationError?: string;
    versionOfNodeId?: string;
    versionLabel?: string;
    versionPrimary?: boolean;
    copiedFromNodeId?: string;
    generationResultPlacement?: "replace-node" | "new-version";
    directorSceneId?: string;
    directorShotId?: string;
    directorPreviewNodeId?: string;
    directorCoverStorageKey?: string;
    directorCoverUrl?: string;
    directorCoverSceneUpdatedAt?: string;
    directorDepthNodeId?: string;
    directorNormalNodeId?: string;
    directorClayVideoNodeId?: string;
    subtitleEntries?: SrtEntry[];
    subtitleHighlights?: SubtitleHighlight[];
    subtitleStyle?: SubtitleStyle;
    subtitleUpdatedAt?: string;
    skillId?: string;
    skillVersion?: number;
    skillSnapshot?: CanvasSkillSnapshot;
    /** 圖表節點的圖形型別，預設柱狀圖。落盤欄位——新增擴充套件節點的自有欄位都要在這裡宣告。 */
    chartKind?: "bar" | "line";
    /** 調色節點的引數；預設視為未調色。 */
    colorGrade?: CanvasColorGrade;
    mediaConversion?: MediaConversionNodeState;
    /** 使用者手動拉伸過尺寸；圖片按真實比例自動適配時避讓它。 */
    manualSize?: boolean;
    storyboard?: StoryboardData;
    storyboardShotDuration?: StoryboardShotDuration;
    storyboardShotCount?: StoryboardShotCount;
    storyboardVideoInputMode?: StoryboardVideoInputMode;
    storyboardComposerHeight?: number;
    generationBatches?: CanvasGenerationBatch[];
    batchTable?: CanvasBatchTableData;
    batchSourceNodeId?: string;
    batchRowId?: string;
    batchOperation?: CanvasBatchOperation;
    batchInputNodeIds?: string[];
    frame?: {
        collapsed: boolean;
        expandedWidth: number;
        expandedHeight: number;
    };
    folder?: {
        style: CanvasFolderStyle;
        theme?: CanvasFolderTheme;
        createdAt: string;
        // 自定義主題資源覆蓋預置主題；目錄內容永遠從 childNodes 讀取。
        themeCover?: string;
        assetFolderId?: string;
        projectId?: string;
    };
    drawingId?: string;
    drawingEngine?: "excalidraw";
    drawingRevision?: number;
    drawingUpdatedAt?: string;
    drawingPreviewStorageKey?: string;
    drawingPreviewUrl?: string;
    drawingShapeCount?: number;
    drawingPageCount?: number;
    emotionEdit?: {
        sourceNodeId: string;
        characterName: string;
        presetId: string;
        intimacy: number;
        arousal: number;
        label: string;
        faceBox: {
            id: string;
            x: number;
            y: number;
            width: number;
            height: number;
            confidence?: number;
            source: "detected" | "manual";
        };
        editRegion?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        sourceWidth?: number;
        sourceHeight?: number;
        providerSize?: string;
        maskStorageKey?: string;
        editMode?: "provider-mask" | "local-composite";
    };
    portraitTexture?: PortraitTextureSettings;
    /** AI 審美批改節點只儲存當前報告和輸入指紋，不儲存圖片二進位制。 */
    artCritique?: ArtCritiqueNodeState;
    /** 攝像機控制選項，啟用後生成時自動追加攝影機/鏡頭/焦距/光圈提示詞。 */
    cameraControl?: CameraControlOptions;
    /** 全景節點配置：投影方式、生成方式和比例兜底開關。 */
    panoramaConfig?: {
        projection: "spherical" | "cylindrical";
        sourceMode: "ai" | "image";
        smartBase: boolean;
        directImageUrl?: string | null;
    };
};

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    createdAt?: string;
    updatedAt?: string;
    position: Position;
    width: number;
    height: number;
    parentId?: string;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    /** Optional world-space path used by captured read-only fixtures. */
    pathD?: string;
    fromHandleId?: string;
    toHandleId?: string;
    fromAnchorRatio?: number;
    toAnchorRatio?: number;
    relation?: "storyboard-output" | "storyboard-asset-reference" | "batch-output";
    storyboardRowId?: string;
};

export type CanvasDisplayConnection = {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeTypeId;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantPendingBackendSession = {
    id: string;
    kind: "cinematic";
    messageId: string;
    status: "pending";
    startedAt: string;
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    pendingBackendSession?: CanvasAssistantPendingBackendSession;
    generationEffectKeys?: string[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
    handleId?: string;
    anchorRatio?: number;
};

export type CanvasSelectionStrategy = "replace" | "add" | "toggle" | "subtract";
export type CanvasSelectionHitMode = "contain" | "intersect";

export type SelectionBox = {
    startWorldX: number;
    startWorldY: number;
    currentWorldX: number;
    currentWorldY: number;
    strategy: CanvasSelectionStrategy;
    hitMode: CanvasSelectionHitMode;
    initialSelectedNodeIds: string[];
};

export type ContextMenuState =
    | {
          type: "canvas";
          x: number;
          y: number;
          position: Position;
          createOpen?: boolean;
      }
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      };
