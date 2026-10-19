import { hydrateBackendGeneratedOutputs } from "@/services/project-asset-sync";
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { nanoid } from "nanoid";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { captureUserScope, userScopeMatches } from "@/lib/user-scope-guard";

import { promoteLegacyBatchTableSize } from "@/lib/canvas/canvas-batch-table";
import { persistCanvasDocument } from "@/services/local-workspace-repository";
import { cancelGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { canvasTaskConfirmation } from "./canvas-task-confirmation";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import type { Skill } from "@/services/api/skills";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "@/types/canvas";

import {
    createImageNodeFromTextSource,
    createInsertingHistoryGate,
    rebaseInsertedCanvasNode,
    reconcileImageBatchRootNodes,
    runImageBatchChildRetry,
    runOwnedCanvasHistoryInsert,
    selectRetryableImageBatchChildren,
} from "./canvas-generation-orchestration";
import { readOwnedCanvasNodes, useCanvasOwnerLifetime } from "./canvas-owner-epoch";
import { useCanvasBatchTable } from "./use-canvas-batch-table";
import { useCanvasGeneration } from "./use-canvas-generation";
import { useCanvasGenerationBatches } from "./use-canvas-generation-batches";
import { useCanvasGenerationExecutor } from "./use-canvas-generation-executor";
import { useCanvasGenerationRetry } from "./use-canvas-generation-retry";
import { useCanvasStoryboard } from "./use-canvas-storyboard";

type UseCanvasGenerationOrchestrationOptions = {
    projectId: string;
    /** 生成任務查詢與 live 繫結：短劇關閉時為空。 */
    linkedProjectId?: string;
    /** 執行器 / 重試 / 歷史插入的素材歸屬，沿用當前畫布專案 id。 */
    domainProjectId?: string;
    projectLoaded: boolean;
    localOnly: boolean;
    addedSkills: Skill[];
    assets: Asset[];
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setGenerationHistoryOpen: Dispatch<SetStateAction<boolean>>;
    getCanvasCenter: () => Position;
};

export function useCanvasGenerationOrchestration({
    projectId,
    linkedProjectId,
    domainProjectId,
    projectLoaded,
    localOnly,
    addedSkills,
    assets,
    nodes,
    connections,
    nodesRef,
    connectionsRef,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setGenerationHistoryOpen,
    getCanvasCenter,
}: UseCanvasGenerationOrchestrationOptions) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const effectiveConfig = useEffectiveConfig();
    const insertingHistory = useRef(createInsertingHistoryGate());
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;
    const { lifetime } = useCanvasOwnerLifetime(projectId);

    const {
        applyGenerationTaskResult,
        bindGenerationTask,
        finishGenerationRequest,
        openNodeTaskDetails,
        retrieveTaskResult,
        retrievingTaskId,
        runningNodeId,
        setRunningNodeId,
        setTaskDetail,
        startGenerationRequest,
        taskDetail,
        taskDetailLoading,
        taskDetailError,
        taskDetailLogs,
    } = useCanvasGeneration({
        projectId,
        domainProjectId: linkedProjectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
    });

    const handleGenerateNode = useCanvasGenerationExecutor({
        projectId,
        domainProjectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });

    const { enqueueGenerationBatch, retryFailedBatchItems, stopRemainingBatchItems } = useCanvasGenerationBatches({
        projectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
        handleGenerateNode,
    });

    const {
        addReferenceColumn: addBatchReferenceColumn,
        addRow: addBatchRow,
        fillRowsFromConnections,
        generateRows: generateBatchRows,
        moveReferenceCell: moveBatchReferenceCell,
        patchTable: patchBatchTable,
        removeReferenceColumn: removeBatchReferenceColumn,
        removeRow: removeBatchRow,
        reorderReferenceColumns: reorderBatchReferenceColumns,
        syncRowsFromConnections,
        updateRow: updateBatchRow,
    } = useCanvasBatchTable({
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        enqueueGenerationBatch,
    });

    useEffect(() => {
        if (!projectLoaded) return;
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const promoted = promoteLegacyBatchTableSize(node);
                if (promoted !== node) changed = true;
                return promoted;
            });
            return changed ? next : current;
        });
        nodesRef.current.filter((node) => node.type === CanvasNodeType.BatchTable).forEach((node) => {
            syncRowsFromConnections(node.id, true);
        });
    }, [connections, nodesRef, projectLoaded, setNodes, syncRowsFromConnections]);

    const {
        addScriptRow,
        createAndGenerateScriptVideos,
        createScriptActionBoards,
        createScriptImageNodes,
        createScriptVideoNodes,
        generateScriptImages,
        generateScriptRows,
        generateScriptVideos,
        removeScriptRow,
        replaceScriptRows,
        updateScriptRow,
        updateScriptRows,
    } = useCanvasStoryboard({
        projectId,
        addedSkills,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        enqueueGenerationBatch,
    });

    const handleRetryNode = useCanvasGenerationRetry({
        projectId,
        domainProjectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
        regenerateImageBatch: async (nodeId, prompt) => { await handleGenerateNode(nodeId, "image", prompt); },
    });

    const cancelCanvasTask = useCallback(
        (task: GenerationTask) => {
            const deliveryOnly = task.status === "succeeded";
            const owner = lifetime.capture(projectId);
            const userScope = captureUserScope();
            const isCurrent = () => lifetime.matches(owner, projectIdRef.current) && userScopeMatches(userScope);
            modal.confirm({
                ...canvasTaskConfirmation,
                title: deliveryOnly ? "停止取回結果？" : "取消生成任務？",
                content: deliveryOnly ? "已生成的結果會保留，之後可以繼續取回。" : localOnly ? "任務會立即停止本地執行。" : "任務會立即停止本地執行；如果已經提交到上游，系統會繼續核對取消結果和積分狀態。",
                okText: deliveryOnly ? "停止取回" : "取消任務",
                cancelText: "繼續等待",
                onOk: async () => {
                    if (!isCurrent()) return;
                    try {
                        const next = await cancelGenerationTask(task.id, userScope);
                        if (!isCurrent()) return;
                        const node = nodesRef.current.find((item) => item.metadata?.taskId === task.id);
                        if (node) bindGenerationTask(node.id, next);
                        setTaskDetail((current) => (current?.id === task.id ? next : current));
                        await queryClient.invalidateQueries({ queryKey: ["canvas-active-tasks", projectId] });
                        if (!isCurrent()) return;
                        message.success(deliveryOnly ? "已停止取回" : "任務已取消");
                    } catch (error) {
                        if (!isCurrent()) return;
                        message.error(error instanceof Error ? error.message : "取消任務失敗");
                    }
                },
            });
        },
        [bindGenerationTask, lifetime, localOnly, message, modal, nodesRef, projectId, queryClient, setTaskDetail],
    );

    const insertGenerationHistoryTask = useCallback(
        async (task: GenerationTask) => {
            if (!insertingHistory.current.tryEnter()) return;
            const owner = lifetime.capture(projectId);
            try {
                await hydrateBackendGeneratedOutputs(task, undefined, { expectedScope: captureUserScope() });
                await runOwnedCanvasHistoryInsert({
                    owner,
                    getLiveCanvasId: () => projectIdRef.current,
                    getLiveLifetime: () => lifetime.current(),
                    task,
                    projectId: owner.canvasId,
                    domainProjectId,
                    center: getCanvasCenter(),
                    nodes: nodesRef.current,
                    assets: useAssetStore.getState().assets,
                    readLiveNodes: () => readOwnedCanvasNodes({
                        owner,
                        liveCanvasId: projectIdRef.current,
                        liveLifetime: lifetime.current(),
                        pageNodes: nodesRef.current,
                        storedNodes: useCanvasStore.getState().openProject(owner.canvasId)?.nodes,
                    }),
                    persist: (persisted) => persistCanvasDocument(owner.canvasId, { nodes: persisted }),
                    ensureAsset: (item) => ensureCanvasNodeAsset({ canvasId: owner.canvasId, domainProjectId, node: item, source: "canvas-generation", taskId: task.id }),
                    onCommit: (node, insertedNodes) => {
                        setNodes((current) => insertedNodes.reduce((nodes, inserted) => rebaseInsertedCanvasNode(nodes, inserted), current));
                        setSelectedNodeIds(new Set([node.id]));
                        setGenerationHistoryOpen(false);
                        message.success("已從生成歷史插入到畫布");
                    },
                });
            } catch (error) {
                message.error(error instanceof Error ? error.message : "生成結果無法插入畫布");
            } finally {
                insertingHistory.current.exit();
            }
        },
        [domainProjectId, getCanvasCenter, lifetime, message, nodesRef, projectId, setGenerationHistoryOpen, setNodes, setSelectedNodeIds],
    );

    const reconcileImageBatchRootNode = useCallback(
        (rootId: string) => {
            setNodes((current) => reconcileImageBatchRootNodes(rootId, current));
        },
        [setNodes],
    );

    const retryImageBatchChildren = useCallback(
        (rootId: string, children: CanvasNodeData[]) => {
            const { retryable, blocked } = selectRetryableImageBatchChildren(children);
            if (blocked) message.warning("部分圖片需要先處理失敗原因，請開啟對應節點檢視");
            if (!retryable.length) return;
            const root = nodesRef.current.find((node) => node.id === rootId);
            if (root) {
                const config = buildGenerationConfig(effectiveConfig, root, "image");
                if (modelCapabilityConfigFor(config, config.model).image?.fixedOutputs) {
                    void handleRetryNode(root);
                    return;
                }
            }
            void runImageBatchChildRetry({
                rootId,
                children: retryable,
                retry: handleRetryNode,
                setNodes,
                reconcile: reconcileImageBatchRootNode,
            });
        },
        [effectiveConfig, handleRetryNode, message, nodesRef, reconcileImageBatchRootNode, setNodes],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const created = createImageNodeFromTextSource({
                sourceId: node.id,
                prompt: node.metadata?.content || node.metadata?.prompt || "",
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                config: effectiveConfig,
                connectionId: nanoid(),
            });
            if (!created.ok) {
                if (created.reason === "empty-prompt") message.warning("文本節點為空，無法生圖");
                return;
            }
            nodesRef.current = created.nextNodes;
            connectionsRef.current = created.nextConnections;
            setNodes(created.nextNodes);
            setConnections(created.nextConnections);
            setSelectedNodeIds(new Set([created.imageNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(created.imageNode.id);
        },
        [connectionsRef, effectiveConfig, message, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );

    return {
        applyGenerationTaskResult,
        bindGenerationTask,
        finishGenerationRequest,
        openNodeTaskDetails,
        retrieveTaskResult,
        retrievingTaskId,
        runningNodeId,
        setRunningNodeId,
        setTaskDetail,
        startGenerationRequest,
        taskDetail,
        taskDetailLoading,
        taskDetailError,
        taskDetailLogs,
        handleGenerateNode,
        handleRetryNode,
        cancelCanvasTask,
        insertGenerationHistoryTask,
        enqueueGenerationBatch,
        retryFailedBatchItems,
        stopRemainingBatchItems,
        addBatchReferenceColumn,
        addBatchRow,
        fillRowsFromConnections,
        generateBatchRows,
        moveBatchReferenceCell,
        patchBatchTable,
        removeBatchReferenceColumn,
        removeBatchRow,
        reorderBatchReferenceColumns,
        syncRowsFromConnections,
        updateBatchRow,
        addScriptRow,
        createAndGenerateScriptVideos,
        createScriptActionBoards,
        createScriptImageNodes,
        createScriptVideoNodes,
        generateScriptImages,
        generateScriptRows,
        generateScriptVideos,
        removeScriptRow,
        replaceScriptRows,
        updateScriptRow,
        updateScriptRows,
        reconcileImageBatchRootNode,
        retryImageBatchChildren,
        generateImageFromTextNode,
    };
}
