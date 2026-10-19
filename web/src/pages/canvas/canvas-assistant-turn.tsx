import { Button } from "antd";
import { Crosshair, Undo2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ASSISTANT_PROPOSAL_UNDONE_TEXT, agentAssistantFailureText, type AgentToolCall, type AssistantGenerationProposal, type AssistantTurn } from "@/services/api/agent-assistant";
import { ASSISTANT_UNDONE_INCOMPLETE_TEXT, assistantChangeSummary, assistantSkillLabel, assistantChangedNodeIds, assistantProposalText, assistantTurnCanContinue, assistantUnresolvedFailures, assistantUndoFailureText, assistantVisibleReply } from "./canvas-assistant-copy";
import { dismissedProposalKey, type AssistantTurnStatus } from "./use-canvas-assistant";
import { modelOptionName, resolveModelChannel, useEffectiveConfig } from "@/stores/use-config-store";
import { portraitPriceLines, seedancePortraitModel, seedancePortraitLabel } from "@/lib/seedance-portrait";
import { portraitGenerationError } from "@/lib/model-selection";
import { CanvasAssistantAttachments } from "./canvas-assistant-attachments";
import { CanvasAssistantOutputs } from "./canvas-assistant-outputs";

type Props = {
    turn: AssistantTurn;
    status?: AssistantTurnStatus;
    handledProposals: Set<string>;
    proposalFeedback?: Record<string, string>;
    /** Proposals whose 生成 click is still being checked or submitted. */
    runningProposalIds?: ReadonlySet<string>;
    onLocate: (nodeIds: string[]) => void;
    onUndo: (turnId: string) => void;
    onRunProposal: (proposal: AssistantGenerationProposal, turnId: string) => void;
    onDismissProposal: (proposalId: string) => void;
    onContinue?: () => void;
};

/** 助手回覆用 Markdown 渲染，只走 react-markdown 的安全預設值，不放開原始 HTML。 */
export function CanvasAssistantReply({ text }: { text: string }) {
    const visible = assistantVisibleReply(text);
    if (!visible) return null;
    return (
        <div className="canvas-assistant-reply">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{visible}</ReactMarkdown>
        </div>
    );
}

export function CanvasAssistantUserMessage({ text, selectedCount }: { text: string; selectedCount: number }) {
    if (!text && !selectedCount) return null;
    return (
        <div className="canvas-assistant-user">
            <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>
            {selectedCount > 0 ? <span className="canvas-assistant-meta">帶上了已選的 {selectedCount} 個節點</span> : null}
        </div>
    );
}

export function CanvasAssistantTurnView({ turn, status, handledProposals, proposalFeedback, runningProposalIds, onLocate, onUndo, onRunProposal, onDismissProposal, onContinue }: Props) {
    const config = useEffectiveConfig();
    const summary = assistantChangeSummary(turn.change);
    const changedNodeIds = assistantChangedNodeIds(turn.change);
    const changedCanvasCount = new Set(turn.change?.canvasChanges?.map(item => item.canvasId) || []).size;
    const failedActions = assistantUnresolvedFailures(turn.toolCalls);
    const undone = Boolean(status?.undone);
    const canContinue = Boolean(turn.error && assistantTurnCanContinue(turn.errorReason));

    return (
        <div className="canvas-assistant-turn">
            <CanvasAssistantUserMessage text={turn.userText} selectedCount={turn.selectedNodeIds?.length ?? 0} />
            <CanvasAssistantAttachments attachments={turn.attachments || []} />
            {(turn.skills || []).map(skill => <span className="canvas-assistant-chip" key={skill.skillId}>{assistantSkillLabel(skill)}</span>)}
            {turn.supplementInputs?.length ? turn.supplementInputs.map((input, index) => <div key={`supplement:${index}`}>
                <CanvasAssistantUserMessage text={input.message} selectedCount={0} /><CanvasAssistantAttachments attachments={input.attachments || []} />
                {(input.skills || []).map(skill => <span className="canvas-assistant-chip" key={skill.skillId}>{assistantSkillLabel(skill)}</span>)}
            </div>) : (turn.supplements || []).map((text, index) => <CanvasAssistantUserMessage key={`supplement:${index}`} text={text} selectedCount={0} />)}
            {turn.reply ? <CanvasAssistantReply text={turn.reply} /> : null}
            {turn.outputs?.length ? <CanvasAssistantOutputs outputs={turn.outputs} /> : null}
            {turn.cancelled ? <p className="canvas-assistant-meta">這一條已經停下了。</p> : null}
            {turn.error ? (
                <div className={canContinue ? "canvas-assistant-incomplete" : "canvas-assistant-feedback"} role="status">
                    <strong>{canContinue ? "尚未完成" : "這一步沒有完成"}</strong>
                    <span className={canContinue ? undefined : "canvas-assistant-failed"}>{undone ? ASSISTANT_UNDONE_INCOMPLETE_TEXT : agentAssistantFailureText(turn.errorReason ?? undefined, "這一輪沒有全部完成，請核對已經落地的改動。")}</span>
                    {canContinue && onContinue && !undone ? <>
                        <Button size="small" onClick={onContinue}>繼續處理</Button>
                        <span className="canvas-assistant-meta">在輸入框裡確認或補充要求後傳送。</span>
                    </> : null}
                </div>
            ) : null}

            {failedActions.length > 0 ? (
                <div className="canvas-assistant-feedback" role="status">
                    {failedActions.map((text) => (
                        <span key={text} className="canvas-assistant-failed">
                            {text}
                        </span>
                    ))}
                </div>
            ) : null}

            {summary ? (
                <div className="canvas-assistant-change">
                    <strong>{summary}</strong>
                    {undone ? (
                        <span className="canvas-assistant-meta">{changedCanvasCount > 1 ? "已撤銷這一輪全部畫布改動" : "已撤銷"}</span>
                    ) : (
                        <>
                            {changedCanvasCount > 1 ? <span className="canvas-assistant-meta">撤銷會恢復這 {changedCanvasCount} 個畫布本輪的全部改動。</span> : null}
                            <div className="canvas-assistant-card-actions">
                                {changedNodeIds.length > 0 ? (
                                    <Button type="text" size="small" icon={<Crosshair className="size-3.5" />} onClick={() => onLocate(changedNodeIds)}>
                                        在畫布上檢視
                                    </Button>
                                ) : null}
                                <Button type="text" size="small" icon={<Undo2 className="size-3.5" />} loading={status?.undoing} onClick={() => onUndo(turn.turnId)}>
                                    撤銷這一輪
                                </Button>
                            </div>
                            {status?.undoFailure ? <span className="canvas-assistant-meta">{changedCanvasCount > 1 && status.undoFailure === "canvas_changed" ? "其中一個畫布後來又改過，這一輪未撤銷。" : assistantUndoFailureText(status.undoFailure)}</span> : null}
                        </>
                    )}
                </div>
            ) : null}

            {(turn.proposals || []).map((proposal) => {
                const started = handledProposals.has(proposal.proposalId);
                const skipped = handledProposals.has(dismissedProposalKey(proposal.proposalId));
                const selectedModel = proposal.modelKey || proposal.model;
                const portrait = seedancePortraitModel(selectedModel);
                const profile = seedancePortraitLabel(selectedModel) ? resolveModelChannel(config, selectedModel).modelProfiles?.find((item) => item.model === modelOptionName(selectedModel)) : undefined;
                const priceError = portrait ? portraitGenerationError(config, selectedModel) : "";
                const running = Boolean(runningProposalIds?.has(proposal.proposalId));
                return (
                    <div key={proposal.proposalId} className="canvas-assistant-card">
                        <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{assistantProposalText(proposal, portraitPriceLines(profile?.videoPricing))}</span>
                        {priceError && !started && !skipped && !undone ? <span className="canvas-assistant-meta" role="status">{priceError}</span> : null}
                        {!skipped && !running && (!undone || started) && proposalFeedback?.[proposal.proposalId] ? <span className="canvas-assistant-meta" role="status" style={{ overflowWrap: "anywhere" }}>{proposalFeedback[proposal.proposalId]}</span> : null}
                        {started ? (
                            <span className="canvas-assistant-meta">已開始生成</span>
                        ) : undone ? (
                            <span className="canvas-assistant-meta">{ASSISTANT_PROPOSAL_UNDONE_TEXT}</span>
                        ) : skipped ? (
                            <span className="canvas-assistant-meta">這次沒有生成</span>
                        ) : (
                            <div className="canvas-assistant-card-actions">
                                <Button size="small" type="primary" autoInsertSpace={false} loading={running} disabled={Boolean(priceError)} onClick={() => onRunProposal(proposal, turn.turnId)}>
                                    生成
                                </Button>
                                <Button size="small" disabled={running} onClick={() => onDismissProposal(proposal.proposalId)}>
                                    先不用
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
