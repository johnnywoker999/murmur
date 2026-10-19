import type { CanvasNodeData } from "@/types/canvas";

export const ART_CRITIQUE_SCHEMA_VERSION = 1 as const;
export const ART_CRITIQUE_RUBRIC_VERSION = "2026-08-v1" as const;
export const ART_CRITIQUE_PLUGIN_ID = "ai-art-critique" as const;
export const ART_CRITIQUE_NODE_TYPE = "ai-art-critique" as const;

export type ArtCritiqueCategory = "composition" | "color" | "lighting" | "proportion" | "other";
export type ArtCritiqueSeverity = "low" | "medium" | "high";
export type ArtCritiqueTargetType = "box" | "point" | "points" | "polygon" | "global";
export type ArtCritiqueTargetSource = "model" | "reference" | "global";
export type ArtCritiqueImageType = "portrait" | "landscape" | "product" | "illustration" | "concept-art" | "architecture" | "still-life" | "other";
export type ArtCritiqueSceneDepth = "flat" | "shallow" | "medium" | "deep";
export type ArtCritiquePipelineStage = "preparing" | "scene" | "reviewing" | "aggregating" | "grounding" | "verifying" | "annotating" | "completed" | "failed";
export type ArtCritiqueVerificationVerdict = "confirmed" | "uncertain" | "rejected";
export type ArtCritiqueReviewer = "composition" | "color" | "lighting" | "structure";
export type ArtCritiqueFindingKind = "issue" | "option";

export type ArtCritiquePoint = {
    x: number;
    y: number;
};

export type ArtCritiqueTarget = {
    type: ArtCritiqueTargetType;
    points: ArtCritiquePoint[];
};

export type ArtCritiqueSuggestion = {
    goal: string;
    actions: string[];
    preserve: string[];
    expectedEffect: string;
};

export type ArtCritiqueSceneSubject = {
    id: string;
    description: string;
    importance: "primary" | "secondary" | "background";
};

export type ArtCritiqueScene = {
    imageType: ArtCritiqueImageType;
    style: string[];
    subjects: ArtCritiqueSceneSubject[];
    intendedFocus: string;
    compositionType: string[];
    lightingType: string[];
    mood: string;
    estimatedIntent: string;
    sceneDepth: ArtCritiqueSceneDepth;
};

export type ArtCritiqueCandidate = {
    id: string;
    checkId: string;
    kind: ArtCritiqueFindingKind;
    category: ArtCritiqueCategory;
    title: string;
    observation: string;
    reason: string;
    evidence: string[];
    severity: number;
    confidence: number;
    targetDescription: string;
    reviewer: ArtCritiqueReviewer;
};

export type ArtCritiqueVerification = {
    verdict: ArtCritiqueVerificationVerdict;
    confidence: number;
    reason: string;
};

export type ArtCritiqueIssue = {
    id: string;
    category: ArtCritiqueCategory;
    title: string;
    explanation: string;
    severity: ArtCritiqueSeverity;
    confidence: number;
    target: ArtCritiqueTarget;
    /** Reviewer 給出的自然語言位置描述，供定位降級時生成參考區域。 */
    targetDescription?: string;
    /** 標記座標來自模型、參考區域對映，還是全域性降級。 */
    targetSource?: ArtCritiqueTargetSource;
    suggestion: ArtCritiqueSuggestion;
    /** AI Prompt Writer 生成的區域性修圖提示詞。缺失時不提供本地拼接替代。 */
    editPrompt?: string;
    sourceCandidateIds?: string[];
    groundingConfidence?: number;
    verification?: ArtCritiqueVerification;
};

export type ArtCritiqueOption = {
    id: string;
    category: ArtCritiqueCategory;
    title: string;
    explanation: string;
    confidence: number;
    suggestion: ArtCritiqueSuggestion;
    sourceCandidateIds?: string[];
};

export type ArtCritiqueReport = {
    schemaVersion: typeof ART_CRITIQUE_SCHEMA_VERSION;
    rubricVersion?: typeof ART_CRITIQUE_RUBRIC_VERSION;
    summary: string;
    strengths: string[];
    issues: ArtCritiqueIssue[];
    options?: ArtCritiqueOption[];
    sourceFingerprint: string;
    createdAt: string;
    modelLabel?: string;
    scene?: ArtCritiqueScene;
    pipelineWarnings?: string[];
    verificationSummary?: {
        checked: number;
        confirmed: number;
        uncertain: number;
        rejected: number;
    };
};

export type ArtCritiqueNodeStatus = "idle" | "running" | "completed" | "failed" | "stale";

export type ArtCritiqueNodeState = {
    stageTaskIds?: Record<string, string>;
    executionRunId?: string;
    lastRunModel?: string;
    schemaVersion: typeof ART_CRITIQUE_SCHEMA_VERSION;
    status: ArtCritiqueNodeStatus;
    sourceNodeId?: string;
    sourceFingerprint?: string;
    lastRunId?: string;
    analysisStage?: ArtCritiquePipelineStage;
    report?: ArtCritiqueReport;
    errorCode?: string;
    errorMessage?: string;
    updatedAt?: string;
};

export function createDefaultArtCritiqueState(): ArtCritiqueNodeState {
    return {
        schemaVersion: ART_CRITIQUE_SCHEMA_VERSION,
        status: "idle",
    };
}

export function isArtCritiqueImageInput(node: CanvasNodeData | undefined): node is CanvasNodeData {
    return Boolean(node && node.type === "image" && (node.metadata?.content || node.metadata?.previewContent || node.metadata?.storageKey));
}

/**
 * 只把輸入的身份資訊做成指紋，不把圖片 URL 或圖片內容儲存進節點狀態。
 * 對 data URL 使用輕量 hash，避免把大字串原樣落盤。
 */
export function artCritiqueSourceFingerprint(node: CanvasNodeData) {
    const metadata = node.metadata;
    const source = [node.id, metadata?.storageKey || "", compactSource(metadata?.content || metadata?.previewContent || ""), metadata?.mimeType || "", metadata?.bytes || "", metadata?.naturalWidth || "", metadata?.naturalHeight || ""].join("|");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function compactSource(value: string) {
    if (value.length <= 2048) return value;
    return `${value.slice(0, 1024)}|${value.slice(-1024)}|${value.length}`;
}

export function artCritiqueCategoryLabel(category: ArtCritiqueCategory) {
    if (category === "composition") return "構圖";
    if (category === "color") return "色彩";
    if (category === "lighting") return "光線";
    if (category === "proportion") return "比例";
    return "其他";
}

export function artCritiqueSeverityLabel(severity: ArtCritiqueSeverity) {
    if (severity === "high") return "優先處理";
    if (severity === "medium") return "建議處理";
    return "可選最佳化";
}

export function artCritiqueStageLabel(stage?: ArtCritiquePipelineStage) {
    if (stage === "preparing") return "準備圖片";
    if (stage === "scene") return "理解場景";
    if (stage === "reviewing") return "檢查視覺維度";
    if (stage === "aggregating") return "整理重點問題";
    if (stage === "grounding") return "定位問題區域";
    if (stage === "verifying") return "複核批改結果";
    if (stage === "annotating") return "生成標註";
    if (stage === "completed") return "分析完成";
    if (stage === "failed") return "分析失敗";
    return "尚未分析";
}
