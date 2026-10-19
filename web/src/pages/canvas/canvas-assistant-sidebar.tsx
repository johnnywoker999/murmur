import { createClientId } from "@/lib/client-id";
import { Button, Dropdown, Tooltip } from "antd";
import { History, MessageSquarePlus, X, ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { AppDrawer } from "@/components/ui/product/app-drawer";
import { assetLibraryQueryKey, assetPickerQueryKey } from "@/components/assets/asset-view-session";
import { appQueryClient } from "@/lib/query-client";
import { referencedAssetIdsInPrompt, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { AssistantAttachment, AssistantGenerationProposal, AssistantSkillSelection } from "@/services/api/agent-assistant";
import { listAddedSkills, type Skill } from "@/services/api/skills";
import { SkillInstallModal } from "@/pages/skills/skill-install-modal";
import { captureUserScope, userScopeMatches } from "@/lib/user-scope-guard";
import { getActiveUserScope, getActiveUserScopeEpoch, subscribeUserScope } from "@/lib/user-scope";
import { attachmentFromCanvasReference, attachmentRangeError, readAssistantInputDraft, saveAssistantInputDraft, uploadAssistantAttachment } from "@/services/assistant-attachments";
import { CanvasAssistantAttachments } from "./canvas-assistant-attachments";
import { ASSISTANT_CONTINUE_PROMPT, ASSISTANT_STARTER_PROMPTS, assistantSkillLabel, assistantStatusNotice, assistantVisibleReply } from "./canvas-assistant-copy";
import { CanvasAssistantComposer } from "./canvas-assistant-composer";
import { CanvasAssistantReply, CanvasAssistantTurnView, CanvasAssistantUserMessage } from "./canvas-assistant-turn";
import { ASSISTANT_MAX_WIDTH, ASSISTANT_MIN_WIDTH, type CanvasAssistantController } from "./use-canvas-assistant";
import "./canvas-assistant-sidebar.css";

type Props = {
    assistant: CanvasAssistantController;
    canvasTitle: string;
    dockable: boolean;
    readOnly: boolean;
    selectedNodeIds: string[];
    references: CanvasResourceReference[];
    onLocateNodes: (nodeIds: string[]) => void;
    onRunProposal: (proposal: AssistantGenerationProposal, turnId: string) => void;
    onOpenModelSettings: () => void;
    proposalFeedback?: Record<string, string>;
    runningProposalIds?: ReadonlySet<string>;
};

export function CanvasAssistantSidebar(props: Props) {
    const { assistant, dockable, readOnly, selectedNodeIds, references, onLocateNodes, onRunProposal, onOpenModelSettings } = props;
    const [draft, setDraft] = useState("");
    const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<AssistantSkillSelection[]>([]);
    const [uploads, setUploads] = useState<{ id: string; file: File; busy: boolean; error?: string }[]>([]);
    const attachmentCount = useRef(0);
    attachmentCount.current = attachments.length + uploads.length;
    const [inputError, setInputError] = useState("");
    const [draftLoaded, setDraftLoaded] = useState(false);
    const [draftReadAttempt, setDraftReadAttempt] = useState(0);
    const [loadedDraftIdentity, setLoadedDraftIdentity] = useState<string | null>(null);
    const draftWriteVersion = useRef(0);
    const [skillsOpen, setSkillsOpen] = useState(false);
    const [skillInstallOpen, setSkillInstallOpen] = useState(false);
    const [skillInstallGeneration, setSkillInstallGeneration] = useState(0);
    const [referencePickerOpen, setReferencePickerOpen] = useState(false);
    const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [skillsError, setSkillsError] = useState("");
    const inputGeneration = useRef(0);
    const inputScope = useRef(captureUserScope());
    const accountEpoch = useSyncExternalStore(subscribeUserScope, () => `${getActiveUserScope()}:${getActiveUserScopeEpoch()}`, () => "");
    const draftIdentity = JSON.stringify([assistant.canvasId, accountEpoch]);
    const [selectionAttached, setSelectionAttached] = useState(true);
    const logRef = useRef<HTMLDivElement | null>(null);
    const sidebarRef = useRef<HTMLDivElement | null>(null);
    const followLatestRef = useRef(true);
    const mediaReferences = references.filter(item => ["image", "video", "audio"].includes(item.kind));

    useEffect(() => {
        const generation = ++inputGeneration.current, expected = captureUserScope(); inputScope.current = expected;
        setDraftLoaded(false); setLoadedDraftIdentity(null); setDraft(""); setAttachments([]); setSelectedSkills([]); setUploads([]); setInputError(""); setAvailableSkills([]); setSkillsOpen(false); setSkillInstallOpen(false); setReferencePickerOpen(false);
        void readAssistantInputDraft(assistant.canvasId, expected).then(saved => {
            if (generation !== inputGeneration.current || !userScopeMatches(expected)) return;
            if (saved) { setDraft(saved.text || ""); setAttachments(saved.attachments || []); setSelectedSkills(saved.skills || []); }
            setDraftLoaded(true);
            setLoadedDraftIdentity(draftIdentity);
        }).catch(() => { if (generation === inputGeneration.current) { setInputError("暫時無法讀取未傳送的素材，請重新新增。"); setDraftLoaded(true); } });
    }, [assistant.canvasId, accountEpoch, draftIdentity, draftReadAttempt]);

    useEffect(() => {
        if (!draftLoaded || loadedDraftIdentity !== draftIdentity) return;
        const generation = inputGeneration.current;
        const version = ++draftWriteVersion.current;
        void saveAssistantInputDraft(assistant.canvasId, { text: draft, attachments, skills: selectedSkills }, inputScope.current)
            .catch(() => { if (generation === inputGeneration.current && version === draftWriteVersion.current) setInputError("未傳送內容暫時無法儲存，請保持視窗開啟。"); });
    }, [assistant.canvasId, attachments, draft, draftIdentity, draftLoaded, loadedDraftIdentity, selectedSkills]);

    const upload = useCallback(async (id: string, file: File) => {
        const generation = inputGeneration.current, expected = inputScope.current;
        setUploads(items => items.map(item => item.id === id ? { ...item, busy: true, error: undefined } : item));
        try {
            const attachment = await uploadAssistantAttachment(file, expected, id);
            if (generation !== inputGeneration.current || !userScopeMatches(expected)) return;
            void appQueryClient.invalidateQueries({ queryKey: assetLibraryQueryKey(expected) });
            void appQueryClient.invalidateQueries({ queryKey: assetPickerQueryKey(expected) });
            setAttachments(items => [...items, attachment]); setUploads(items => items.filter(item => item.id !== id));
        } catch (error) {
            if (generation !== inputGeneration.current || !userScopeMatches(expected)) return;
            setUploads(items => items.map(item => item.id === id ? { ...item, busy: false, error: error instanceof Error ? error.message : "上傳沒有完成" } : item));
        }
    }, []);

    const addFiles = useCallback((files: File[]) => {
        if (readOnly || !draftLoaded || loadedDraftIdentity !== draftIdentity || !userScopeMatches(inputScope.current)) return;
        if (attachmentCount.current + files.length > 8) { setInputError("一次最多新增 8 份參考素材"); return; }
        setInputError("");
        attachmentCount.current += files.length;
        const entries = files.map(file => ({ id: createClientId(), file, busy: true }));
        setUploads(items => [...items, ...entries]);
        entries.forEach(item => void upload(item.id, item.file));
    }, [attachments.length, draftIdentity, draftLoaded, loadedDraftIdentity, readOnly, upload, uploads.length]);

    const loadSkills = useCallback(async () => {
        const expected = inputScope.current;
        setSkillsLoading(true); setSkillsError("");
        try { const data = await listAddedSkills(); if (userScopeMatches(expected)) setAvailableSkills(data.skills.filter(skill => skill.status === 1 && skill.isAdded)); }
        catch { setSkillsError("沒有讀到已安裝技能，請重試。"); }
        finally { setSkillsLoading(false); }
    }, []);

    // 新的一條選擇又可以被帶上：使用者移除只對當前這條訊息生效。
    useEffect(() => {
        setSelectionAttached(true);
    }, [selectedNodeIds.join(",")]);

    const turnCount = assistant.turns.length;
    useLayoutEffect(() => {
        const node = logRef.current;
        if (node && followLatestRef.current) node.scrollTop = node.scrollHeight;
    }, [turnCount, assistant.streamed, assistant.pendingUserText, assistant.lifecycleNotice, props.proposalFeedback]);

    const notice = assistant.status && !assistant.status.available && assistant.status.reason !== "host_starting" ? assistantStatusNotice(assistant.status.reason) : null;
    const inputReady = draftLoaded && loadedDraftIdentity === draftIdentity;
    const composerDisabled = readOnly || !inputReady;
    const composerReason = readOnly ? "這個畫布是隻讀的，不能讓助手改動。" : !draftLoaded ? "正在讀取未傳送內容…" : loadedDraftIdentity !== draftIdentity ? "未能讀取草稿，請重新讀取後繼續。" : undefined;
    const attachedIds = selectionAttached ? selectedNodeIds : [];

    const send = useCallback(() => {
        const text = draft;
        if ((!text.trim() && !attachments.length) || readOnly || !draftLoaded || loadedDraftIdentity !== draftIdentity || !userScopeMatches(inputScope.current) || uploads.length || attachments.some(item => attachmentRangeError(item)) || assistant.awaitingReceipt || assistant.sessionBusy || assistant.supplementBusy || (assistant.streaming && !assistant.canSupplement)) return;
        followLatestRef.current = true;
        setDraft("");
        setAttachments([]); setSelectedSkills([]);
        // @ 引用到的素材庫素材由介面按使用者原文推導後交給後端校驗歸屬：
        // 模型不能自己宣告要讀哪些素材。
        const assetReferences = [...new Set([...referencedAssetIdsInPrompt(text), ...attachments.flatMap(item => item.assetId ? [item.assetId] : [])])]
            .map((id) => ({ kind: "asset" as const, id }));
        void assistant.send(text, assistant.streaming ? [] : attachedIds, assetReferences, { attachments, skills: selectedSkills });
    }, [assistant, attachedIds, attachments, draft, draftIdentity, draftLoaded, loadedDraftIdentity, readOnly, selectedSkills, uploads.length]);

    const startResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = sidebarRef.current?.getBoundingClientRect().width ?? assistant.width;
        const move = (moveEvent: PointerEvent) => assistant.setWidth(startWidth + (startX - moveEvent.clientX));
        const done = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", done);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", done);
    }, [assistant]);

    const sessionItems = assistant.sessions.length
        ? assistant.sessions.map((session) => ({
              key: session.sessionId,
              label: session.title || "還沒有內容的對話",
              onClick: () => void assistant.activateSession(session.sessionId),
          }))
        : [{ key: "empty", label: "還沒有別的對話", disabled: true }];

    const content = (
        <div className="canvas-assistant-panel" data-canvas-no-zoom>
            <header className="canvas-assistant-header">
                <div className="canvas-assistant-heading"><h2>MURMUR AI Agent</h2></div>
                <Tooltip title="新對話">
                    <Button type="text" size="small" aria-label="新對話" disabled={assistant.streaming || assistant.sessionBusy} icon={<MessageSquarePlus className="size-4" />} onClick={() => void assistant.startNewSession()} />
                </Tooltip>
                <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: sessionItems, selectedKeys: assistant.sessionId ? [assistant.sessionId] : [] }}>
                    <Button type="text" size="small" aria-label="歷史對話" disabled={assistant.streaming || assistant.sessionBusy} icon={<History className="size-4" />} />
                </Dropdown>
                <Tooltip title="關閉 Agent">
                    <Button type="text" size="small" aria-label="關閉 Agent" icon={<X className="size-4" />} onClick={() => assistant.setOpen(false)} />
                </Tooltip>
            </header>

            {notice ? (
                <div className="canvas-assistant-notice" role="status">
                    <span>{notice.text}</span>
                    {notice.action === "model-settings" ? (
                        <Button size="small" onClick={onOpenModelSettings}>{notice.actionLabel}</Button>
                    ) : notice.action === "retry" ? (
                        <Button size="small" loading={assistant.statusBusy} onClick={() => void assistant.restartHost()}>{notice.actionLabel}</Button>
                    ) : null}
                </div>
            ) : null}

            <div ref={logRef} className="canvas-assistant-log" onScroll={() => { const node = logRef.current; if (node) followLatestRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; }}>
                {assistant.historyError ? <div className="canvas-assistant-notice" role="status"><span>{assistant.historyError}</span><Button size="small" onClick={() => void assistant.reloadHistory()}>重新讀取</Button></div> : !assistant.historyLoaded && assistant.status?.reason !== "model_not_configured" ? <p className="canvas-assistant-meta" role="status">正在讀取對話…</p> : null}
                {assistant.historyLoaded && turnCount === 0 && !assistant.pendingUserText && !assistant.pendingAttachments.length ? (
                    <div className="canvas-assistant-empty">
                        <h3>想在這張畫布上做什麼？</h3>
                        {ASSISTANT_STARTER_PROMPTS.slice(0, 3).map((prompt, index) => (
                            <button key={prompt} type="button" className="canvas-assistant-starter" onClick={() => setDraft(prompt)}>
                                <span>{["拆分分鏡", "完善選中鏡頭", "整理畫布"][index]}</span><ArrowUpRight size={14} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                ) : null}

                {assistant.turns.map((turn) => (
                    <CanvasAssistantTurnView
                        key={turn.turnId}
                        turn={turn}
                        status={assistant.turnStatus[turn.turnId]}
                        handledProposals={assistant.handledProposals}
                        proposalFeedback={props.proposalFeedback}
                        runningProposalIds={props.runningProposalIds}
                        onLocate={onLocateNodes}
                        onUndo={(turnId) => void assistant.undoTurn(turnId)}
                        onRunProposal={onRunProposal}
                        onDismissProposal={assistant.markProposalDismissed}
                        onContinue={!readOnly && !assistant.streaming && !assistant.sessionBusy && turn.turnId === assistant.turns.at(-1)?.turnId ? () => setDraft(ASSISTANT_CONTINUE_PROMPT) : undefined}
                    />
                ))}

                {assistant.pendingUserText || assistant.pendingAttachments.length ? (
                    <div className="canvas-assistant-turn">
                        <CanvasAssistantUserMessage text={assistant.pendingUserText || ""} selectedCount={assistant.pendingSelectedNodeIds.length} />
                        <CanvasAssistantAttachments attachments={assistant.pendingAttachments} />
                        {assistant.awaitingReceipt ? <p className="canvas-assistant-meta" role="status">正在讀取這次處理的最終結果，已有內容仍然保留。</p> : null}
                        {assistant.pendingSkills.map(skill => <span className="canvas-assistant-chip" key={skill.skillId}>{assistantSkillLabel(skill)}</span>)}
                        {assistant.supplements.map((item, index) => <div key={index}>
                            <CanvasAssistantUserMessage text={item.text} selectedCount={0} />
                            <CanvasAssistantAttachments attachments={item.attachments || []} />
                            <p className="canvas-assistant-meta" role="status">{item.status === "accepted" ? "助手已收到補充要求。" : item.status === "sending" ? "正在傳送補充要求…" : "未能確認收到補充要求。請檢視最新回覆後再決定是否傳送。"}</p>
                        </div>)}
                        {assistantVisibleReply(assistant.streamed || "") ? <CanvasAssistantReply text={assistant.streamed} /> : null}
                        {assistant.streaming && (assistant.lifecycleNotice || !assistantVisibleReply(assistant.streamed || "")) ? (
                            <p className="canvas-assistant-meta">{assistant.lifecycleNotice || "助手正在處理…"}</p>
                        ) : null}
                    </div>
                ) : null}

                {!assistant.pendingUserText && !assistant.pendingAttachments.length ? assistant.supplements.filter(item => item.status !== "accepted").map((item, index) => <div key={`unconfirmed:${index}`}>
                    <CanvasAssistantUserMessage text={item.text} selectedCount={0} />
                    <p className="canvas-assistant-meta" role="status">{item.status === "sending" ? "正在確認補充要求是否收到…" : "未能確認收到補充要求。請檢視最新回覆後再決定是否傳送。"}</p>
                </div>) : null}

                {assistant.error ? (
                    <div className="canvas-assistant-card">
                        <span>{assistant.error}</span>
                        <div className="canvas-assistant-card-actions">
                            {assistant.canRetry ? <Button size="small" onClick={assistant.retryLast}>重試</Button> : null}
                            {!assistant.canRetry && !assistant.historyError ? <Button size="small" onClick={() => void assistant.reloadHistory()}>重新讀取</Button> : null}
                            <Button size="small" type="text" onClick={assistant.dismissError}>知道了</Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <CanvasAssistantComposer
                value={inputReady ? draft : ""}
                onChange={setDraft}
                onSend={send}
                onStop={() => void assistant.stop()}
                streaming={assistant.streaming}
                permissionMode={assistant.permissionMode}
                permissionLocked={assistant.permissionLocked}
                onPermissionChange={assistant.setPermissionMode}
                disabled={composerDisabled}
                disabledReason={composerReason}
                references={references}
                selectedCount={selectedNodeIds.length}
                selectionAttached={selectionAttached}
                onDetachSelection={() => setSelectionAttached(false)}
                modelBusy={assistant.modelBusy}
                canSupplement={assistant.canSupplement}
                supplementBusy={assistant.supplementBusy}
                hasAttachments={inputReady && attachments.length > 0}
                inputBusy={!draftLoaded || loadedDraftIdentity !== draftIdentity || assistant.awaitingReceipt || uploads.length > 0 || attachments.some(item => Boolean(attachmentRangeError(item)))}
                onFiles={addFiles}
                onOpenReferences={() => { setReferencePickerOpen(value => !value); setSkillsOpen(false); }}
                onOpenSkills={() => { setSkillsOpen(value => !value); setReferencePickerOpen(false); void loadSkills(); }}
                inputContent={<>
                    <CanvasAssistantAttachments attachments={inputReady ? attachments : []} onChange={(index, value) => setAttachments(items => items.map((item, i) => i === index ? value : item))} onRemove={index => setAttachments(items => items.filter((_, i) => i !== index))} />
                    {(inputReady ? uploads : []).map(item => <div key={item.id} className="canvas-assistant-notice" role="status"><span>{item.file.name} · {item.busy ? "正在儲存素材…" : item.error}</span>
                        {!item.busy ? <><Button size="small" onClick={() => void upload(item.id, item.file)}>重試上傳</Button><Button size="small" onClick={() => setUploads(items => items.filter(value => value.id !== item.id))}>移除</Button></> : null}</div>)}
                    {inputError ? <p className="canvas-assistant-meta" role="status">{inputError}</p> : null}
                    {draftLoaded && loadedDraftIdentity !== draftIdentity ? <Button size="small" onClick={() => setDraftReadAttempt(value => value + 1)}>重新讀取草稿</Button> : null}
                    {(inputReady ? selectedSkills : []).map(skill => <span className="canvas-assistant-chip" key={skill.skillId}>技能：{skill.skillName || skill.skillId} · {skill.version || skill.versionId}<button aria-label={`移除技能 ${skill.skillName || skill.skillId}`} onClick={() => setSelectedSkills(items => items.filter(item => item.skillId !== skill.skillId))}><X size={12} /></button></span>)}
                    {skillsOpen && inputReady ? <div className="canvas-assistant-picker" aria-label="已安裝技能">{skillsLoading ? <span>正在讀取技能…</span> : skillsError ? <><span role="status">{skillsError}</span><Button size="small" onClick={() => void loadSkills()}>重新讀取</Button></> : availableSkills.length ? availableSkills.map(skill => <button key={skill.skillId} type="button" aria-pressed={selectedSkills.some(item => item.skillId === skill.skillId)} onClick={() => setSelectedSkills(items => items.some(item => item.skillId === skill.skillId) ? items.filter(item => item.skillId !== skill.skillId) : [...items, { skillId: skill.skillId, versionId: skill.versionId, contentHash: skill.contentHash, skillName: skill.skillName, version: skill.version }])}>{skill.skillName} · {skill.version}</button>) : <span>還沒有已安裝的技能。</span>}<Button size="small" disabled={readOnly} onClick={() => { setSkillInstallGeneration(inputGeneration.current); setSkillInstallOpen(true); }}>安裝技能</Button></div> : null}
                    {referencePickerOpen && inputReady ? <div className="canvas-assistant-picker" aria-label="畫布參考素材">{mediaReferences.length ? mediaReferences.map(reference => <button type="button" key={reference.id} onClick={() => { try { if (attachmentCount.current >= 8) throw new Error("一次最多新增 8 份參考素材"); const item = attachmentFromCanvasReference(reference); attachmentCount.current++; setAttachments(items => [...items, item]); setReferencePickerOpen(false); } catch (error) { setInputError(error instanceof Error ? error.message : "無法新增素材"); } }}>{reference.title || reference.label}</button>) : <span className="canvas-assistant-meta">當前畫布暫無可用素材</span>}</div> : null}
                </>}
            />
            <SkillInstallModal open={skillInstallOpen} onClose={() => setSkillInstallOpen(false)} onInstalled={skill => {
                if (skillInstallGeneration !== inputGeneration.current || !userScopeMatches(inputScope.current)) return;
                setSkillInstallOpen(false);
                if (!skill.versionId || !/^[a-f0-9]{64}$/i.test(skill.contentHash)) {
                    setInputError("技能已安裝，但沒有讀到可用版本，請重新讀取技能。");
                    void loadSkills();
                    return;
                }
                setSelectedSkills(items => [...items.filter(item => item.skillId !== skill.skillId), { skillId: skill.skillId, versionId: skill.versionId, contentHash: skill.contentHash, skillName: skill.skillName, version: skill.version }]);
                setSkillsOpen(true);
                void loadSkills();
            }} />
        </div>
    );

    if (!dockable) {
        return (
            <AppDrawer
                flush
                open={assistant.open}
                placement="right"
                title={null}
                closable={false}
                onClose={() => assistant.setOpen(false)}
                size="min(380px, 92vw)"
                aria-label="MURMUR AI Agent"
            >
                {content}
            </AppDrawer>
        );
    }

    return (
        <aside ref={sidebarRef} className="canvas-assistant-sidebar" aria-label="MURMUR AI Agent" style={{ width: assistant.width, flexBasis: assistant.width }}>
            <button
                type="button"
                className="canvas-assistant-resize"
                aria-label="調整 Agent 寬度"
                onPointerDown={startResize}
                onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") assistant.setWidth(Math.min(ASSISTANT_MAX_WIDTH, assistant.width + 16));
                    if (event.key === "ArrowRight") assistant.setWidth(Math.max(ASSISTANT_MIN_WIDTH, assistant.width - 16));
                }}
            />
            {content}
        </aside>
    );
}
