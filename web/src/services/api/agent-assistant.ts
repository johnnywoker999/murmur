// 內建創作助手：瀏覽器只與同源 Go 代理通訊，宿主/owner/模型憑據都不進入頁面。
// 三個端點的真實路徑都在 /api/assistant/* 下；寫錯路徑會讓面板永遠拿不到回覆。
import { ApiError, apiBaseURL, http } from "./request";
import { assertUserScope, captureUserScope, userScopeMatches, type CapturedUserScope } from "@/lib/user-scope-guard";

/** 後端給出的不可用原因（窮舉，見契約 A1）；未知值一律走兜底文案。 */
export type AssistantUnavailableReason =
    | "model_not_configured"
    | "credential_missing"
    | "model_protocol_unsupported"
    | "host_starting"
    | "host_start_failed"
    | "host_unreachable";

export type AssistantModelInfo = {
    id: string;
    channelId: string;
    channelName: string;
};

export type AssistantPermissionMode = "read-only" | "canvas" | "full-access";

export function assistantPermissionMode(value: unknown): AssistantPermissionMode {
    return value === "read-only" || value === "full-access" ? value : "canvas";
}

export type AgentHostStatus = {
    available: boolean;
    reason?: string;
    model?: AssistantModelInfo;
    url?: string;
    health?: { raw?: string };
};

export type AgentToolCall = {
    toolCallId?: string;
    tool: string;
    args?: Record<string, unknown>;
    isError?: boolean;
    error?: string;
    replayed?: boolean;
};

/** 一個回合真正落到畫布上的改動；沒寫任何東西時後端給 null。 */
export type AssistantTurnChange = {
    revisionBefore: number;
    revisionAfter: number;
    createdNodeIds: string[];
    updatedNodeIds: string[];
    createdEdgeIds: string[];
    timelineUpdated?: boolean;
    deletedNodeIds?: string[];
    deletedEdgeIds?: string[];
    documentUpdated?: boolean;
    canvasChanges?: AssistantCanvasChange[];
};

export type AssistantCanvasChange = Omit<AssistantTurnChange, "canvasChanges"> & { canvasId: string; operationIds: string[] };

/** 付費生成提議：後端只登記，不生成、不扣費，執行發生在畫布既有生成鏈路。 */
export type AssistantGenerationProposal = {
    proposalId: string;
    kind: "image" | "video";
    nodeIds: string[];
    model: string;
    modelKey: string;
    note?: string;
    source?: { canvasId: string; canvasRevision: number; modelConfigRevision: number };
};

export type AgentTurnEnd = {
    type: "turn_end";
    turnId?: string;
    /** 宿主本回合實際使用的會話；舊 JSONL 會話首次發訊息會交接給新的 Durable 會話，介面據此更新。 */
    sessionId?: string;
    permissionMode?: AssistantPermissionMode;
    reply: string;
    toolCalls: AgentToolCall[];
    change?: AssistantTurnChange | null;
    proposals?: AssistantGenerationProposal[];
    outputs?: AssistantTurnOutput[];
    error: string | null;
    errorReason?: string | null;
    cancelled: boolean;
    supplements?: string[];
    attachments?: AssistantAttachment[];
    skills?: AssistantSkillSelection[];
    supplementInputs?: AssistantSupplementInput[];
    persistence?: string;
    metrics?: { firstTokenMs: number | null; totalMs: number };
};

export type AssistantTurn = {
    turnId: string;
    permissionMode?: AssistantPermissionMode;
    userText: string;
    selectedNodeIds: string[];
    reply: string;
    toolCalls: AgentToolCall[];
    change: AssistantTurnChange | null;
    proposals: AssistantGenerationProposal[];
    outputs?: AssistantTurnOutput[];
    error: string | null;
    errorReason?: string | null;
    cancelled: boolean;
    supplements?: string[];
    attachments?: AssistantAttachment[];
    skills?: AssistantSkillSelection[];
    supplementInputs?: AssistantSupplementInput[];
    createdAt: string;
};

/** Trusted render receipts in creation order; task/resource access still uses owned APIs. */
export type AssistantTurnOutput = { taskId: string; kind: "video"; sourceRevision?: number };

export type AssistantSessionSummary = {
    sessionId: string;
    title: string;
    updatedAt: string;
    turnCount: number;
};

export type AssistantSessionList = {
    currentSessionId: string | null;
    sessions: AssistantSessionSummary[];
};

export type AssistantHistory = {
    sessionId: string;
    turns: (AssistantTurn & { undone?: boolean })[];
    active?: { turnId: string; userText: string; selectedNodeIds: string[]; attachments?: AssistantAttachment[]; skills?: AssistantSkillSelection[];
        references?: AgentChatReference[]; supplements?: string[]; supplementInputs?: AssistantSupplementInput[]; permissionMode?: AssistantPermissionMode; createdAt: string; status: "running" } | null;
};

// UI 會話憑據只儲存在記憶體裡：重新整理頁面即重新簽發，不寫入 localStorage。
let uiSession: { token: string; expiresAt: number; scope: CapturedUserScope } | null = null;
let uiSessionPending: { promise: Promise<string>; scope: CapturedUserScope } | null = null;
let uiSessionGeneration = 0;

/**
 * 服務端失敗原因只用於分支，展示給使用者的永遠是使用者語。
 * 這些 reason 由後端給出（見 handler/agent_proxy.go 與 agent_host_lifecycle.go）。
 */
export function agentAssistantFailureText(reason: string | undefined, fallback = "創作助手暫時不可用，請稍後再試") {
    switch (reason) {
        case "skill_instruction_too_large":
            return "所選技能正文過大，請減少所選技能或將部分內容移到參考檔案後重試。";
        case "body_too_large":
        case "http_413":
            return "本次訊息內容過大，請縮短訊息或減少附件後重試。";
        case "turn_timeout":
            return "模型響應時間過長，這一輪尚未完成。已完成的改動會保留，可以繼續處理。";
        case "turn_interrupted":
            return "上一輪執行中斷，已經落地的改動已保留。請檢視畫布和改動記錄後再繼續。";
        case "turn_request_budget_exhausted":
        case "turn_tool_step_budget_exhausted":
            return "這一輪已達到呼叫上限，已停止繼續執行。可以傳送新訊息繼續，已落地的改動會保留。";
        case "request_budget_exhausted":
            return "當前配置的總呼叫預算已用完，請檢查助手執行配置。已落地的改動會保留。";
        case "request_budget_storage_unavailable":
            return "預算記錄無法讀取或儲存，已停止繼續呼叫。請檢查磁碟空間和資料目錄許可權；仍失敗時，請從有效備份恢復預算記錄後重啟助手。";
        case "model_error":
        case "provider_error":
            return "模型沒有完成回覆。已經完成的操作會保留，請檢查結果後再繼續。";
        case "model_request_failed":
            return "模型暫時沒有完成響應。已完成的改動會保留，可以繼續處理。";
        case "host_unreachable":
        case "host_unhealthy":
        case "host_token_missing":
        case "host_command_missing":
        case "host_start_failed":
            return "創作助手還沒準備好，請稍後再試";
        case "unauthenticated":
        case "read_only_client":
        case "forbidden":
            return "當前頁面無法使用創作助手，請重新開啟畫布";
        case "session_busy":
            return "上一條訊息還在處理中，請等它結束";
        case "session_not_current":
            return "你已經換到別的對話了，請重新傳送這條訊息";
        case "session_not_running":
            return "這一輪已經結束，請檢視最新結果後傳送新訊息";
        default:
            return fallback;
    }
}

export async function getAgentHostStatus(): Promise<AgentHostStatus> {
    const data = await http.get<AgentHostStatus>("/assistant/status");
    return data;
}

/** UI 會話頭由頁面記憶體裡的憑據提供；助手的每條路由都走同一套認證。 */
async function uiSessionConfig() {
    const token = await ensureAgentUiSession();
    return { headers: { "X-Beeftv-Ui-Session": token } };
}

/** 重新拉起助手執行環境。失敗必須丟擲，介面才不會把「沒啟動」顯示成「已就緒」。 */
export async function restartAgentHost(): Promise<void> {
    await http.post<{ restarted: boolean }>("/assistant/host/restart", {}, await uiSessionConfig());
}

/** 讀取失敗必須與空歷史區分，由介面保留原內容並提供重新讀取。 */
export async function listAssistantSessions(canvasId: string): Promise<AssistantSessionList> {
    return http.get<AssistantSessionList>(`/assistant/sessions?canvasId=${encodeURIComponent(canvasId)}`, await uiSessionConfig());
}

export async function createAssistantSession(canvasId: string): Promise<string | null> {
    const data = await http.post<{ sessionId: string }>("/assistant/sessions", { canvasId }, await uiSessionConfig());
    if (!data?.sessionId) throw new Error("沒能新建對話，請重試");
    return data.sessionId;
}

export async function activateAssistantSession(canvasId: string, sessionId: string): Promise<string | null> {
    const data = await http.post<{ sessionId: string }>("/assistant/sessions/activate", { canvasId, sessionId }, await uiSessionConfig());
    if (!data?.sessionId) throw new Error("沒能切換對話，請重試");
    return data.sessionId;
}

export async function getAssistantHistory(canvasId: string, sessionId?: string): Promise<AssistantHistory> {
    const query = new URLSearchParams({ canvasId });
    if (sessionId) query.set("sessionId", sessionId);
    const data = await http.get<AssistantHistory>(`/assistant/history?${query.toString()}`, await uiSessionConfig());
    if (!data || !Array.isArray(data.turns)) throw new Error("沒能讀取對話，請重試");
    return { sessionId: data.sessionId || sessionId || "", active: data.active, turns: data.turns.map((turn) => ({
        ...turn,
        error: turn.error ? agentAssistantFailureText(turn.errorReason ?? undefined, "這一輪沒有全部完成，請核對已經落地的改動。") : null,
    })) };
}

/** 撤銷失敗的機器可讀原因，對映到卡片裡的一句話。 */
export type AssistantUndoFailure = "canvas_changed" | "already_undone" | "no_change" | "unknown";

export type AssistantUndoResult = { ok: true; revision: number } | { ok: false; failure: AssistantUndoFailure };

/**
 * 撤銷一整回合的改動。後端以新修訂號回滾，不倒退歷史；
 * 409 的三種原因必須區分，否則使用者看不出「能不能再試」。
 */
export async function undoAssistantTurn(turnId: string, canvasId: string): Promise<AssistantUndoResult> {
    try {
        const data = await http.post<{ revision: number }>(`/assistant/turns/${encodeURIComponent(turnId)}/undo`, { canvasId }, await uiSessionConfig());
        return { ok: true, revision: data?.revision ?? 0 };
    } catch (error) {
        return { ok: false, failure: assistantUndoFailure(error) };
    }
}

/** 已撤銷的一輪不再開始生成；這是後端給出的唯一判定，介面隱藏按鈕只是提示。 */
export const ASSISTANT_PROPOSAL_UNDONE_TEXT = "這一輪已撤銷，不會生成。";

/**
 * 開始生成前由後端確認生成建議所屬的一輪仍然有效。
 * 返回 null 表示可以繼續；否則返回給使用者看的一句話，不會提交任何生成。
 */
export async function confirmAssistantProposalRunnable(turnId: string, proposalId: string, canvasId: string): Promise<string | null> {
    try {
        await http.post<{ runnable: boolean }>(`/assistant/turns/${encodeURIComponent(turnId)}/proposals/${encodeURIComponent(proposalId)}/run`, { canvasId }, await uiSessionConfig());
        return null;
    } catch (error) {
        const reason = error instanceof ApiError ? error.reason : undefined;
        if (reason === "turn_undone") return ASSISTANT_PROPOSAL_UNDONE_TEXT;
        if (reason === "turn_not_found") return "找不到這一輪對話，未提交生成。請讓助手重新提出方案。";
        return "無法確認這項生成是否還能進行，未提交生成。請檢查連線後重試。";
    }
}

export function assistantUndoFailure(error: unknown): AssistantUndoFailure {
    const reason = error instanceof ApiError ? error.reason : undefined;
    switch (reason) {
        case "canvas_changed_since_turn":
            return "canvas_changed";
        case "turn_already_undone":
            return "already_undone";
        case "turn_has_no_change":
            return "no_change";
        default:
            return "unknown";
    }
}

export async function ensureAgentUiSession(): Promise<string> {
    const scope = captureUserScope();
    if (uiSession && userScopeMatches(uiSession.scope, scope) && Date.now() + 30_000 < uiSession.expiresAt) return uiSession.token;
    if (uiSessionPending && userScopeMatches(uiSessionPending.scope, scope)) return uiSessionPending.promise;
    const generation = ++uiSessionGeneration;
    const promise = issueAgentUiSession(scope, generation);
    uiSessionPending = { promise, scope };
    try {
        return await promise;
    } finally {
        if (uiSessionPending?.promise === promise) uiSessionPending = null;
    }
}

async function issueAgentUiSession(scope: CapturedUserScope, generation: number): Promise<string> {
    let data: { token?: string; expiresAt?: string };
    try {
        data = await http.post<{ token: string; expiresAt: string }>("/assistant/ui-session", {});
    } catch (error) {
        const status = error instanceof ApiError ? error.status : undefined;
        if (status === 403) {
            throw new Error(agentAssistantFailureText("forbidden"));
        }
        throw new Error(agentAssistantFailureText(undefined, "創作助手暫時不可用，請稍後再試"));
    }
    if (!data?.token) throw new Error("創作助手暫時不可用，請稍後再試");
    assertUserScope(scope);
    if (generation !== uiSessionGeneration) throw new Error("當前頁面會話已更新，請重新傳送");
    // Invalid/missing expiry is never cached; the server remains the authority on validity.
    const expiresAt = Date.parse(data.expiresAt ?? "");
    uiSession = Number.isFinite(expiresAt) ? { token: data.token, expiresAt, scope } : null;
    return data.token;
}

export function resetAgentUiSession() {
    uiSession = null;
    uiSessionPending = null;
    uiSessionGeneration += 1;
}

export type AgentLifecycleEvent = {
    type: "lifecycle";
    phase: "compaction" | "compaction_end" | "retry" | "retry_end" | "tool" | "tool_end";
    toolName?: string;
    reason?: string;
    aborted?: boolean;
    willRetry?: boolean;
    attempt?: number;
    maxAttempts?: number;
    success?: boolean;
};

export type StreamHandlers = {
    onSession?: (sessionId: string) => void;
    onDelta?: (delta: string) => void;
    onTurnEnd?: (end: AgentTurnEnd) => void;
    onLifecycle?: (event: AgentLifecycleEvent) => void;
};

/**
 * 流式結束但本次回合沒有結算事件時的使用者可見錯誤。
 *
 * 宿主對每一次對話都恰好發一條 `turn_end`；收到它才算這一回合真的結束。
 * 把「流斷了」當成正常結束會讓面板停在一段半截回覆上，必須顯式失敗。
 */
export const AGENT_STREAM_INCOMPLETE_MESSAGE = "創作助手的回覆沒有完整結束，請再試一次";

/**
 * 介面明確引用、且後端會再校驗歸屬的額外資源。
 * 內建助手預設能讀當前畫布與畫布關聯的素材/任務；額外畫布只讀，素材只讀。
 */
export type AgentChatReference = {
    kind: "asset" | "canvas";
    id: string;
};

export type AssistantAttachmentPurpose = "analysis" | "character" | "scene" | "style" | "motion" | "first-frame" | "last-frame" | "rhythm" | "sound";
export type AssistantAttachment = {
    resourceId: string;
    kind: "image" | "video" | "audio";
    name: string;
    mimeType: string;
    bytes: number;
    purpose: AssistantAttachmentPurpose;
    start?: number;
    end?: number;
    durationMs?: number;
    nodeId?: string;
    assetId?: string;
};
/** Only persisted resource descriptors cross HTTP; never copy local preview/File data. */
function attachmentRequestValue({ resourceId, kind, name, mimeType, bytes, purpose, start, end, durationMs, nodeId, assetId }: AssistantAttachment): AssistantAttachment {
    return { resourceId, kind, name, mimeType, bytes, purpose, start, end, durationMs, nodeId, assetId };
}
/** skillName/version 是後端在選定時記下的顯示名；缺失表示技能已不可識別，介面不得退回顯示標識。 */
export type AssistantSkillSelection = { skillId: string; versionId: string; contentHash: string; skillName?: string; version?: string };
export type AssistantSupplementInput = { message: string; attachments?: AssistantAttachment[]; skills?: AssistantSkillSelection[] };

export type AgentChatRequest = {
    permissionMode?: AssistantPermissionMode;
    signal?: AbortSignal;
    selectedNodeIds?: string[];
    /** 當前訊息裡 @ 引用到的資源；後端逐項校驗歸屬，任何一項非法都整輪拒絕。 */
    references?: AgentChatReference[];
    /** 只發當前會話；後端發現它已不是該畫布的當前會話會整回合拒絕。 */
    sessionId?: string;
    attachments?: AssistantAttachment[];
    skills?: AssistantSkillSelection[];
};

/** 已收到回合終態的業務失敗，不等同於斷流後的「執行結果未知」。 */
export class AgentTurnFailedError extends Error {
    constructor(readonly reason?: string | null) {
        super(agentAssistantFailureText(reason ?? undefined, "這一回合沒有完成，請再試一次"));
        this.name = "AgentTurnFailedError";
    }
}

/** The chat was not sent, or Go explicitly rejected it before beginning a turn. */
export class AgentChatNotAdmittedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AgentChatNotAdmittedError";
    }
}

// NDJSON 流式對話：http 客戶端只做信封解包，流式必須用原生 fetch（同源）。
export async function streamAgentChat(
    canvasId: string,
    message: string,
    handlers: StreamHandlers,
    request: AgentChatRequest = {},
): Promise<void> {
    const { signal, selectedNodeIds = [], references = [], sessionId, attachments = [], skills = [] } = request;
    const scope = captureUserScope();
    let token: string;
    try {
        token = await ensureAgentUiSession();
        assertUserScope(scope);
    } catch (error) {
        throw new AgentChatNotAdmittedError(error instanceof Error ? error.message : "訊息未傳送，請重試");
    }
    signal?.throwIfAborted();
    const body: Record<string, unknown> = { canvasId, message, selectedNodeIds, permissionMode: assistantPermissionMode(request.permissionMode) };
    if (references.length) body.references = references;
    if (sessionId) body.sessionId = sessionId;
    if (attachments.length) body.attachments = attachments.map(attachmentRequestValue);
    if (skills.length) body.skills = skills.map(({ skillId, versionId, contentHash }) => ({ skillId, versionId, contentHash }));
    const response = await fetch(`${apiBaseURL}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Beeftv-Ui-Session": token },
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        let reason = `http_${response.status}`;
        try { reason = JSON.parse(text)?.reason || reason; } catch { /* 非 JSON */ }
        if (response.status === 403 && uiSession?.token === token) resetAgentUiSession();
        const message = agentAssistantFailureText(reason);
        if (response.headers.get("X-Beeftv-Turn-Admission") === "rejected") {
            throw new AgentChatNotAdmittedError(message);
        }
        throw new Error(message);
    }
    const result = await readAgentTurnStream(response.body, handlers, signal);
    if (!result.settled) throw new Error(AGENT_STREAM_INCOMPLETE_MESSAGE);
    if (result.turnEnd && !result.turnEnd.cancelled && result.turnEnd.error) {
        // 上游錯誤可能包含請求細節，控制台同樣不記錄原文。
        console.error("創作助手回合失敗", { canvasId });
        throw new AgentTurnFailedError(result.turnEnd.errorReason);
    }
}

/**
 * 逐行解析 NDJSON 回合流。
 *
 * 三處必須顯式處理，否則會把截斷當成成功：
 * 1. 流結束時先 flush 解碼器，再處理沒有換行符結尾的最後一行；
 * 2. 任何一行 JSON 損壞都按協議破損處理，不能 continue 吞掉；
 * 3. 必須見到 `turn_end` 才認為本次回合已結算。
 */
async function readAgentTurnStream(
    body: ReadableStream<Uint8Array>,
    handlers: StreamHandlers,
    signal?: AbortSignal,
): Promise<{ settled: boolean; turnEnd: AgentTurnEnd | null; malformedLine: string | null }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let settled = false;
    let turnEnd: AgentTurnEnd | null = null;
    let malformedLine: string | null = null;

    const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            malformedLine = trimmed.slice(0, 200);
            return;
        }
        if (payload.type === "session" && typeof payload.sessionId === "string" && payload.sessionId) {
            handlers.onSession?.(payload.sessionId);
            return;
        }
        if (payload.type === "text_delta" && typeof payload.delta === "string") {
            handlers.onDelta?.(payload.delta);
            return;
        }
        if (payload.type === "lifecycle") {
            handlers.onLifecycle?.(payload as unknown as AgentLifecycleEvent);
            return;
        }
        if (payload.type === "agent_end") {
            return;
        }
        if (payload.type === "turn_end") {
            settled = true;
            turnEnd = payload as unknown as AgentTurnEnd;
            handlers.onTurnEnd?.(turnEnd);
        }
    };

    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) {
                buffer += decoder.decode();
                if (buffer.trim()) handleLine(buffer);
                buffer = "";
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) handleLine(line);
        }
    } finally {
        reader.releaseLock();
    }
    if (malformedLine !== null) throw new Error(AGENT_STREAM_INCOMPLETE_MESSAGE);
    if (signal?.aborted && !settled) throw new DOMException("請求已取消", "AbortError");
    return { settled, turnEnd, malformedLine };
}

/**
 * 請求停止當前畫布正在進行的回合。
 *
 * 停止失敗必須如實丟擲：只 await fetch 會把 404/5xx 當成「已停止」，
 * 讓介面顯示與真實執行狀態不一致。
 */
export async function cancelAgentChat(canvasId: string): Promise<void> {
    const token = await ensureAgentUiSession();
    const response = await fetch(`${apiBaseURL}/assistant/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Beeftv-Ui-Session": token },
        body: JSON.stringify({ canvasId }),
    });
    const text = await response.text().catch(() => "");
    let payload: { code?: number; reason?: string } | null = null;
    try { payload = JSON.parse(text) as { code?: number; reason?: string }; } catch { payload = null; }
    if (response.status === 403 && uiSession?.token === token) resetAgentUiSession();
    const businessFailed = payload !== null && typeof payload.code === "number" && payload.code !== 0;
    if (!response.ok || businessFailed) {
        throw new Error(agentAssistantFailureText(payload?.reason, "停止失敗，請再試一次"));
    }
}

/** 補充已有回合，新增素材仍由後端校驗授權，不建立新生成請求。 */
export async function steerAgentChat(canvasId: string, sessionId: string, message: string, input: Pick<AgentChatRequest, "attachments" | "references" | "skills"> = {}): Promise<void> {
    const token = await ensureAgentUiSession();
    const response = await fetch(`${apiBaseURL}/assistant/steer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Beeftv-Ui-Session": token },
        body: JSON.stringify({ canvasId, sessionId, message, ...(input.references?.length ? { references: input.references } : {}), ...(input.attachments?.length ? { attachments: input.attachments.map(attachmentRequestValue) } : {}), ...(input.skills?.length ? { skills: input.skills.map(({ skillId, versionId, contentHash }) => ({ skillId, versionId, contentHash })) } : {}) }),
    });
    let payload: { code?: number; reason?: string; data?: { accepted?: boolean } } | null = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (response.status === 403 && uiSession?.token === token) resetAgentUiSession();
    if (!response.ok || payload?.code !== 0 || payload?.data?.accepted !== true) {
        throw new Error(agentAssistantFailureText(payload?.reason, "未能確認助手收到補充要求，原任務仍會保留。請檢視最新回覆後再決定是否傳送。"));
    }
}
