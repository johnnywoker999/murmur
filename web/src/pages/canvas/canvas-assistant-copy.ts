// 助手面板裡所有使用者可見文案的唯一來源：機器可讀原因、操作名和改動摘要都在這裡
// 翻譯成使用者語。元件只負責排版，不自己拼文案，避免同一種狀態在兩處寫出兩句話。
import type { AgentLifecycleEvent, AgentToolCall, AssistantGenerationProposal, AssistantSkillSelection, AssistantTurnChange, AssistantUndoFailure } from "@/services/api/agent-assistant";
import { seedancePortraitLabel } from "@/lib/seedance-portrait";

export type AssistantStatusAction = "model-settings" | "retry";

export type AssistantStatusNotice = {
    text: string;
    actionLabel?: string;
    action?: AssistantStatusAction;
    /** 正在啟動時要更頻繁地複查狀態，其餘情況按常規節奏。 */
    starting?: boolean;
};

/** 兜底文案：原因缺失或後端給了我們還不認識的值時用這一句。 */
export const ASSISTANT_UNAVAILABLE_FALLBACK = "助手暫時用不了，請稍後再試";

export function assistantStatusNotice(reason: string | undefined): AssistantStatusNotice {
    switch (reason) {
        case "model_not_configured":
        case "model_protocol_unsupported":
            return { text: "還沒有可用的助手模型", actionLabel: "去模型配置", action: "model-settings" };
        case "credential_missing":
            return { text: "MURMUR AI 還沒連線好", actionLabel: "去連線", action: "model-settings" };
        case "host_starting":
            return { text: "助手正在啟動…", starting: true };
        case "host_start_failed":
        case "host_unreachable":
            return { text: "助手沒有啟動成功", actionLabel: "重試", action: "retry" };
        default:
            return { text: ASSISTANT_UNAVAILABLE_FALLBACK, actionLabel: "重試", action: "retry" };
    }
}

/** 工具名是內部標識，使用者只該看到「做了什麼」。 */
export function assistantActionLabel(tool: string | undefined): string {
    const name = (tool || "").trim();
    if (name.startsWith("asset.")) return "讀取素材";
    switch (name) {
        case "media.overview":
        case "media_overview":
            return "瀏覽素材";
        case "media.inspect":
        case "media_inspect":
            return "檢視和聽取素材";
        case "media.check":
        case "media_check":
            return "檢查媒體檔案";
        case "canvas.nodes.create":
            return "新建節點";
        case "canvas.node.update":
            return "修改節點";
        case "canvas.timeline.update":
            return "修改時間線";
        case "canvas.edge.create":
            return "連線";
        case "canvas.get":
        case "canvas.search":
            return "讀取畫布";
        case "canvas.generation.propose":
            return "準備生成";
        default:
            return "改動畫布";
    }
}

/** 失敗的那一步用一句話說清楚是哪件事沒成。 */
export function assistantFailedActionText(call: AgentToolCall): string {
    return `${assistantActionLabel(call.tool)}沒有成功`;
}

/**
 * 這一輪改了什麼：只數真實落地的物件，不復述使用者的選擇數量。
 * 沒有任何改動時返回 null，卡片整塊不出現。
 */
export function assistantChangeSummary(change: AssistantTurnChange | null | undefined): string | null {
    if (!change) return null;
    const parts: string[] = [];
    const changes = change.canvasChanges?.length ? change.canvasChanges : [change];
    if (change.canvasChanges?.length) parts.push(`修改了 ${new Set(change.canvasChanges.map(item => item.canvasId)).size} 個畫布`);
    const created = changes.reduce((total, item) => total + (item.createdNodeIds?.length ?? 0), 0);
    const updated = changes.reduce((total, item) => total + (item.updatedNodeIds?.length ?? 0), 0);
    const deleted = changes.reduce((total, item) => total + (item.deletedNodeIds?.length ?? 0), 0);
    const edges = changes.reduce((total, item) => total + (item.createdEdgeIds?.length ?? 0), 0);
    const deletedEdges = changes.reduce((total, item) => total + (item.deletedEdgeIds?.length ?? 0), 0);
    if (created > 0) parts.push(`新建 ${created} 個節點`);
    if (updated > 0) parts.push(`修改 ${updated} 個節點`);
    if (deleted > 0) parts.push(`刪除 ${deleted} 個節點`);
    if (edges > 0) parts.push(`連了 ${edges} 條線`);
    if (deletedEdges > 0) parts.push(`刪除 ${deletedEdges} 條線`);
    if (changes.some(item => item.timelineUpdated)) parts.push("修改時間線");
    if (changes.some(item => item.documentUpdated)) parts.push("修改畫布內容");
    if (!parts.length) return null;
    return parts.join("，");
}

/** 改動卡片要定位的物件：新建的和被改過的都算。 */
export function assistantChangedNodeIds(change: AssistantTurnChange | null | undefined): string[] {
    if (!change) return [];
    const ids = new Set<string>();
    const deleted = new Set(change.deletedNodeIds || []);
    for (const id of change.createdNodeIds || []) if (!deleted.has(id)) ids.add(id);
    for (const id of change.updatedNodeIds || []) if (!deleted.has(id)) ids.add(id);
    return [...ids];
}

export function assistantUndoFailureText(failure: AssistantUndoFailure): string {
    switch (failure) {
        case "canvas_changed":
            return "這之後畫布又改過，不能直接撤銷";
        case "already_undone":
            return "這一輪已經撤銷過了";
        case "no_change":
            return "這一輪沒有改動畫布";
        default:
            return "撤銷沒有成功，請再試一次";
    }
}

/** 提議可能來自自建渠道，不能把所有費用都歸到 BeefAPI。 */
export function assistantProposalText(proposal: AssistantGenerationProposal, priceLines: string[] = []): string {
    const count = proposal.nodeIds?.length ?? 0;
    const target = proposal.kind === "video" ? "影片" : "圖片";
    return `生成 ${count} ${target === "影片" ? "段影片" : "張參考圖片"} · ${seedancePortraitLabel(proposal.model) || proposal.model}\n${priceLines.length ? priceLines.join("\n") + "\n" : ""}確認後開始，按所選渠道計費。`;
}

export const ASSISTANT_STARTER_PROMPTS = [
    "把劇本拆成分鏡草案",
    "給選中的鏡頭補充景別和情緒",
    "整理畫布並按順序連線",
    "檢查哪些鏡頭還缺參考圖",
];

/** 官方壓縮/重試進度：只說現在在做什麼，不提內部事件名。 */
export function assistantLifecycleText(event: { phase: AgentLifecycleEvent["phase"] | "tool" | "tool_end"; toolName?: string } | string | null | undefined): string | null {
    const phase = typeof event === "string" ? event : event?.phase;
    switch (phase) {
        case "tool": {
            const tool = typeof event === "string" ? undefined : event?.toolName;
            if (tool === "media_overview" || tool === "media.overview") return "正在瀏覽素材，確認畫面和聲音。";
            if (tool === "media_inspect" || tool === "media.inspect") return "正在檢視和聽取選定片段。";
            if (tool === "media_check" || tool === "media.check") return "正在檢查黑屏、音軌和檔案資訊。";
            return null;
        }
        case "compaction":
            return "正在整理對話內容，方便繼續。";
        case "retry":
            return "模型暫時沒響應，正在再試一次。";
        default:
            return null;
    }
}

/** 這裡只提供繼續對話入口，不重發原請求，也不保證後臺任務已恢復。 */
export function assistantTurnCanContinue(reason: string | null | undefined): boolean {
    return ["turn_timeout", "turn_interrupted", "turn_request_budget_exhausted", "turn_tool_step_budget_exhausted", "model_request_failed", "model_error", "provider_error"].includes(reason || "");
}

export const ASSISTANT_CONTINUE_PROMPT = "繼續完成上一條要求。先檢查當前畫布和已經完成的操作，保留已有結果；不要重複建立節點或重新提交已開始的生成任務。";
export const ASSISTANT_UNDONE_INCOMPLETE_TEXT = "這一輪未完成，已經產生的畫布改動已撤銷。";

const REASONING_TAG_PREFIXES = ["</thinking>", "<thinking>", "</think>", "<think>"];

function stripDanglingReasoningTag(text: string) {
    const start = text.lastIndexOf("<");
    return start >= 0 && REASONING_TAG_PREFIXES.some((tag) => tag.startsWith(text.slice(start).toLowerCase()))
        ? text.slice(0, start) : text;
}

/**
 * 官方會話把推理放在獨立的 thinking 塊裡，不進入回覆。
 * 有的模型仍把 <thinking> 或 <think> 直接寫進正文；那是草稿，不是給使用者的話。
 * 程式碼示例裡的同名標記保留。未閉合的思考區塊隱藏到正文末尾，不猜測答案起點。
 */
export function assistantVisibleReply(text: string): string {
    const tokens = /`+|~{3,}|<\/?(?:think|thinking)>/gi;
    const reasoning: string[] = [];
    let output = "";
    let index = 0;
    for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
        if (!reasoning.length) output += text.slice(index, token.index);
        const marker = token[0];
        index = tokens.lastIndex;
        if (marker[0] === "`" || marker[0] === "~") {
            const delimiters = new RegExp(`${marker[0]}+`, "g");
            delimiters.lastIndex = index;
            let end = delimiters.exec(text);
            while (end && (marker.length >= 3 ? end[0].length < marker.length : end[0].length !== marker.length)) {
                end = delimiters.exec(text);
            }
            index = end ? delimiters.lastIndex : text.length;
            if (!reasoning.length) output += text.slice(token.index, index);
            tokens.lastIndex = index;
        } else if (marker[1] !== "/") {
            reasoning.push(marker.slice(1, -1).toLowerCase());
        } else if (reasoning.at(-1) === marker.slice(2, -1).toLowerCase()) {
            reasoning.pop();
        }
    }
    if (!reasoning.length) output += stripDanglingReasoningTag(text.slice(index));
    return output.trim();
}

/** 修改看節點，連線看兩端；媒體讀取失敗會影響審片結論，按同一片段判斷是否後來成功。 */
function assistantActionTarget(call: AgentToolCall): string | null {
    const args = call.args || {};
    switch (call.tool) {
        case "media.overview":
        case "media.inspect":
        case "media.check":
        case "media_overview":
        case "media_inspect":
        case "media_check":
            return `media:${JSON.stringify(args)}`;
        case "canvas.node.update":
            return `update:${String(args.nodeId ?? "")}`;
        case "canvas.timeline.update":
            return "timeline";
        case "canvas.edge.create":
            return `edge:${String(args.fromNodeId ?? "")}>${String(args.toNodeId ?? "")}`;
        case "canvas.nodes.create":
            // 模型重試新建時常會調整標題或數量：之後任何一次新建成功都算這一步已完成。
            return "create";
        case "canvas.generation.propose":
            return `propose:${Array.isArray(args.nodeIds) ? args.nodeIds.join("|") : ""}`;
        default:
            return null;
    }
}

/**
 * 這一輪裡最後仍沒做成的事：失敗後又重試成功的步驟不再提示，
 * 同類失敗合併成一句，避免把助手的中間重試當成錯誤擺給使用者。
 */
export function assistantUnresolvedFailures(calls: AgentToolCall[] | undefined): string[] {
    const list = calls || [];
    const counts = new Map<string, number>();
    list.forEach((call, index) => {
        if (!call.isError) return;
        const target = assistantActionTarget(call);
        if (!target) return;
        const resolved = list.slice(index + 1).some((later) => {
            if (later.isError || later.tool !== call.tool) return false;
            if (assistantActionTarget(later) === target) return true;
            // 同一節點的 overview 補齊缺失 resourceId 後成功，屬於原步驟的重試。
            // 不合並不同素材、片段、版本，也不讓 overview 代替 inspect。
            if (!['media.overview', 'media_overview'].includes(call.tool)) return false;
            const before = call.args || {};
            const after = later.args || {};
            if (before.resourceId || !after.resourceId || (!before.nodeId && !before.assetId)) return false;
            const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
            keys.delete('resourceId');
            return [...keys].every(key => JSON.stringify(before[key]) === JSON.stringify(after[key]));
        });
        if (resolved) return;
        const label = call.tool.replace("_", ".") === "media.inspect"
            ? call.args?.mode === "audio" ? "有音訊片段聽取未完成"
                : call.args?.mode === "video" ? "有影片片段檢視未完成"
                    : !call.args?.mode || call.args.mode === "frames" ? "有素材的畫面檢視未完成" : `${assistantActionLabel(call.tool)}沒有成功`
            : `${assistantActionLabel(call.tool)}沒有成功`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].map(([label, count]) => (count > 1 ? `${label}（${count} 處）` : label));
}

/** 技能標籤只顯示名稱和版本；名稱不可識別時說明已移除，不顯示內部標識。 */
export function assistantSkillLabel(skill: Pick<AssistantSkillSelection, "skillName" | "version">): string {
    const name = skill.skillName?.trim();
    if (!name) return "技能：已移除的技能";
    const version = skill.version?.trim();
    return version ? `技能：${name} · ${version}` : `技能：${name}`;
}
