import type { AssistantGenerationProposal } from "@/services/api/agent-assistant";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { ASSISTANT_PROPOSAL_BLOCKED_TEXT, AssistantProposalBlockedError, type ConfirmedGenerationInputs } from "./canvas-assistant-proposal-snapshot";

export const CANVAS_OWNER_CHANGED_PROPOSAL_MESSAGE = "畫布或賬號已切換，未提交生成。請重新確認提案。";

type ProposalExecution = {
    proposal: AssistantGenerationProposal;
    nodes: CanvasNodeData[];
    claims: Set<string>;
    isHandled: boolean;
    /** 後端確認這一輪仍有效；返回的文案表示拒絕，不會提交任何生成。 */
    confirmRunnable?: () => Promise<string | null>;
    prepare: () => Promise<ConfirmedGenerationInputs>;
    generate: (nodeId: string, mode: "image" | "video", prompt: string, options?: CanvasNodeGenerationOptions) => Promise<unknown>;
    markHandled: (proposalId: string) => void;
    notify: (content: string) => void;
    stillOwns?: () => boolean;
};

function proposalModelKey(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

/** 相容性解析可能改選模型，所以每次解析之後都再核對使用者確認過的模型。 */
export function buildConfirmedGenerationConfig(
    config: Parameters<typeof buildGenerationConfig>[0],
    node: Parameters<typeof buildGenerationConfig>[1],
    mode: Parameters<typeof buildGenerationConfig>[2],
    requirements: Parameters<typeof buildGenerationConfig>[3],
    confirmedModelKey?: string,
) {
    const result = buildGenerationConfig(config, node, mode, requirements);
    if (confirmedModelKey !== undefined && (!confirmedModelKey.trim() || result.model !== confirmedModelKey || result.taskWorkflowProvider !== "model")) {
        throw new Error("當前模型與生成提案不一致。請讓助手重新提出生成方案，核對模型後再確認。");
    }
    return result;
}

export async function executeAssistantProposal({ proposal, nodes, claims, isHandled, confirmRunnable, prepare, generate, markHandled, notify, stillOwns }: ProposalExecution) {
    if (isHandled || claims.has(proposal.proposalId)) {
        notify("這項提案已提交或正在提交，請在任務列表檢視進度。");
        return;
    }
    const targets = [...new Set(proposal.nodeIds)].map((id) => nodes.find((node) => node.id === id));
    if (!targets.length || targets.some((node) => !node)) {
        notify("提案中的節點已發生變化，請讓助手重新提出生成方案後再確認。");
        return;
    }
    const modelKey = proposalModelKey(proposal.modelKey);
    if (!modelKey) {
        notify("這項提案缺少模型資訊，請讓助手重新提出生成方案後再確認。");
        return;
    }
    // 先佔住這次確認，避免連點發出第二單；沒有任務回執時在 finally 裡放開。
    claims.add(proposal.proposalId);
    let receivedTask = false;
    const started = new Set<string>();
    try {
        const rejection = confirmRunnable ? await confirmRunnable() : null;
        if (rejection) {
            notify(rejection);
            return;
        }
        let confirmedInputs: ConfirmedGenerationInputs;
        try {
            confirmedInputs = await prepare();
        } catch (error) {
            if (stillOwns && !stillOwns()) {
                notify(CANVAS_OWNER_CHANGED_PROPOSAL_MESSAGE);
                return;
            }
            notify(error instanceof AssistantProposalBlockedError ? ASSISTANT_PROPOSAL_BLOCKED_TEXT[error.reason] : "無法核對提案的最新內容，請檢查連線後重試。");
            return;
        }
        if (stillOwns && !stillOwns()) {
            notify(CANVAS_OWNER_CHANGED_PROPOSAL_MESSAGE);
            return;
        }
        const confirmedTargets = [...new Set(proposal.nodeIds)].map((id) => confirmedInputs.nodes.find((node) => node.id === id));
        if (confirmedTargets.some((node) => !node)) {
            notify(ASSISTANT_PROPOSAL_BLOCKED_TEXT.canvas_changed);
            return;
        }
        await Promise.allSettled(confirmedTargets.map(async (node) => {
            if (!node) return;
            await generate(node.id, proposal.kind, node.metadata?.composerContent ?? node.metadata?.prompt ?? "", {
                confirmedModelKey: modelKey,
                confirmedInputs,
                clientOperationId: `proposal:${proposal.proposalId}:${node.id}`,
                onTaskUpdate: (task) => {
                    if (!task.id) return;
                    receivedTask = true;
                    if (task.status !== "queued" && task.status !== "running" && task.status !== "succeeded") return;
                    const first = started.size === 0;
                    started.add(node.id);
                    if (first) markHandled(proposal.proposalId);
                },
            });
        }));
        if (!started.size) {
            notify("未確認有生成任務開始。請檢查節點提示和任務列表，再讓助手重新提出生成方案。");
        } else if (started.size < targets.length) {
            notify(`僅 ${started.size}/${targets.length} 個節點確認開始生成。請檢查其餘節點的提示和任務列表，不要重複提交整項提案。`);
        }
    } finally {
        if (!receivedTask) claims.delete(proposal.proposalId);
    }
}
