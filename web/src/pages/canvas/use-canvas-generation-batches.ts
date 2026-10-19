import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { generationBatchStatus, isGenerationSubmissionUncertainError } from "@/lib/canvas/canvas-generation-batch";
import { buildGenerationConfig, createGenerationRetryContext, generationTaskMetadata, resetGenerationTaskMetadata } from "@/lib/canvas/canvas-project-generation";
import { shouldBlockManualRetry } from "@/lib/generation-error";
import { listGenerationTasks } from "@/services/api/task-center";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";
import type { CanvasGenerationBatch, CanvasGenerationBatchItem, CanvasGenerationBatchMode, CanvasNodeData } from "@/types/canvas";

import type { CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";

const SCHEDULER_INTERVAL_MS = 2_000;
const MAX_BATCH_HISTORY = 20;

type BatchTarget = Pick<CanvasGenerationBatchItem, "rowId" | "nodeId">;

type UseCanvasGenerationBatchesOptions = {
    projectId: string;
    projectLoaded: boolean;
    nodes: CanvasNodeData[];
    nodesRef: { current: CanvasNodeData[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    handleGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasNodeGenerationOptions) => Promise<void>;
};

export function useCanvasGenerationBatches({ projectId, projectLoaded, nodes, nodesRef, setNodes, handleGenerateNode }: UseCanvasGenerationBatchesOptions) {
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const activeTaskLimit = useUserStore((state) => state.runtimeLimits.activeTaskLimit);
    const localMode = isLocalWorkspaceMode();
    const schedulingRef = useRef(false);
    const controllersRef = useRef(new Map<string, AbortController>());

    const updateBatch = useCallback(
        (sourceNodeId: string, batchId: string, updater: (batch: CanvasGenerationBatch) => CanvasGenerationBatch) => {
            setNodes((current) => {
                let changed = false;
                const next = current.map((node) => {
                    if (node.id !== sourceNodeId || !node.metadata?.generationBatches?.length) return node;
                    const batches = node.metadata.generationBatches.map((batch) => {
                        if (batch.id !== batchId) return batch;
                        const updated = updater(batch);
                        if (updated !== batch) changed = true;
                        return updated;
                    });
                    return changed ? { ...node, metadata: { ...node.metadata, generationBatches: batches } } : node;
                });
                return changed ? next : current;
            });
        },
        [setNodes],
    );

    const enqueueGenerationBatch = useCallback(
        (sourceNodeId: string, mode: CanvasGenerationBatchMode, targets: BatchTarget[], options?: { concurrency?: number }) => {
            const sourceNode = nodesRef.current.find((node) => node.id === sourceNodeId);
            if (!sourceNode || !targets.length) return;
            const activeNodeIds = new Set((sourceNode.metadata?.generationBatches || []).flatMap((batch) => batch.items.filter((item) => ["waiting", "submitting", "queued", "running"].includes(item.status)).map((item) => item.nodeId)));
            const availableTargets = targets.filter((target) => !activeNodeIds.has(target.nodeId));
            if (!availableTargets.length) {
                message.info("所選鏡頭已在生成批次中");
                return;
            }
            const now = new Date().toISOString();
            const batch: CanvasGenerationBatch = {
                id: nanoid(),
                projectId,
                sourceNodeId,
                mode,
                status: "queued",
                items: availableTargets.map((target) => ({ id: nanoid(), ...target, status: "waiting", retryCount: 0 })),
                concurrency: options?.concurrency ? Math.max(1, Math.min(10, Math.floor(options.concurrency))) : undefined,
                createdAt: now,
                updatedAt: now,
            };
            setNodes((current) =>
                current.map((node) =>
                    node.id === sourceNodeId
                        ? {
                              ...node,
                              metadata: {
                                  ...node.metadata,
                                  generationBatches: [...(node.metadata?.generationBatches || []), batch].slice(-MAX_BATCH_HISTORY),
                              },
                          }
                        : node,
                ),
            );
            return batch.id;
        },
        [message, nodesRef, projectId, setNodes],
    );

    const reconcileBatches = useCallback(() => {
        setNodes((current) => {
            const nodeById = new Map(current.map((node) => [node.id, node]));
            let changed = false;
            const nextNodes = current.map((sourceNode) => {
                const batches = sourceNode.metadata?.generationBatches;
                if (!batches?.length) return sourceNode;
                let sourceChanged = false;
                const nextBatches = batches.map((batch) => {
                    if (batch.projectId !== projectId) return batch;
                    let batchChanged = false;
                    const nextItems = batch.items.map((item) => {
                        if (item.status === "succeeded" || item.status === "failed" || item.status === "cancelled") return item;
                        const node = nodeById.get(item.nodeId);
                        let patch: Partial<CanvasGenerationBatchItem> | null = null;
                        if (!node) {
                            patch = { status: "failed", errorDetails: "目標節點已不存在" };
                        } else if (node.metadata?.status === "success" && node.metadata.content) {
                            patch = { status: "succeeded", taskId: node.metadata.taskId, errorDetails: undefined, submissionUncertain: false };
                        } else if (node.metadata?.status === "error") {
                            const errorDetails = node.metadata.errorDetails || "生成失敗";
                            patch = {
                                status: node.metadata.taskStatus === "cancelled" ? "cancelled" : "failed",
                                taskId: node.metadata.taskId,
                                errorDetails,
                                submissionUncertain: isGenerationSubmissionUncertainError(new Error(errorDetails)),
                            };
                        } else if (node.metadata?.taskId) {
                            const taskStatus = node.metadata.taskStatus;
                            patch = {
                                taskId: node.metadata.taskId,
                                // 後端成功後還要下載並寫入媒體，節點真正拿到內容才算批次成功。
                                status: taskStatus === "queued" ? "queued" : taskStatus === "failed" ? "failed" : taskStatus === "cancelled" ? "cancelled" : "running",
                                errorDetails: undefined,
                            };
                        } else if (item.status === "submitting" && !controllersRef.current.has(batchItemKey(batch.id, item.id))) {
                            patch = { status: "waiting", errorDetails: undefined };
                        }
                        if (!patch || !itemChanged(item, patch)) return item;
                        batchChanged = true;
                        return { ...item, ...patch };
                    });
                    const nextBatch = batchChanged ? { ...batch, items: nextItems } : batch;
                    const status = generationBatchStatus(nextBatch);
                    if (!batchChanged && status === batch.status) return batch;
                    sourceChanged = true;
                    return { ...nextBatch, status, updatedAt: new Date().toISOString() };
                });
                if (!sourceChanged) return sourceNode;
                changed = true;
                return { ...sourceNode, metadata: { ...sourceNode.metadata, generationBatches: nextBatches } };
            });
            return changed ? nextNodes : current;
        });
    }, [projectId, setNodes]);

    // 僅查詢當前畫布的活躍任務來安排批次，跨畫布併發仍由後端建立任務時原子校驗。
    const scheduleWaitingItems = useCallback(async () => {
        if (localMode || !projectLoaded || schedulingRef.current) return;
        schedulingRef.current = true;
        try {
            const currentNodes = nodesRef.current;
            // 沒有當前畫布的等待項時無需查詢任務中心，避免空畫布持續輪詢。
            const hasWaitingItems = currentNodes.some((sourceNode) =>
                (sourceNode.metadata?.generationBatches || []).some((batch) => batch.projectId === projectId && batch.status !== "completed" && batch.status !== "cancelled" && batch.items.some((item) => item.status === "waiting")),
            );
            if (!hasWaitingItems) return;

            const tasks = await listGenerationTasks(100, { projectId, activeOnly: true }).catch(() => null);
            if (!tasks) return;
            const activeTaskCount = tasks.filter((task) => task.status === "queued" || task.status === "running").length;
            const nodeById = new Map(currentNodes.map((node) => [node.id, node]));
            const pendingReservations = [...controllersRef.current.keys()].filter((key) => {
                const [, itemId] = key.split(":");
                const item = currentNodes
                    .flatMap((node) => node.metadata?.generationBatches || [])
                    .flatMap((batch) => batch.items)
                    .find((candidate) => candidate.id === itemId);
                return item ? !nodeById.get(item.nodeId)?.metadata?.taskId : false;
            }).length;
            let availableSlots = Math.max(0, activeTaskLimit - activeTaskCount - pendingReservations);
            if (!availableSlots) return;

            const candidates: Array<{ batch: CanvasGenerationBatch; item: CanvasGenerationBatchItem; node: CanvasNodeData }> = [];
            for (const sourceNode of currentNodes) {
                for (const batch of sourceNode.metadata?.generationBatches || []) {
                    if (batch.projectId !== projectId || batch.status === "completed" || batch.status === "cancelled") continue;
                    let batchAvailableSlots = batch.concurrency
                        ? Math.max(0, batch.concurrency - batch.items.filter((item) => ["submitting", "queued", "running"].includes(item.status)).length)
                        : Number.POSITIVE_INFINITY;
                    for (const item of batch.items) {
                        if (item.status !== "waiting" || availableSlots <= 0 || batchAvailableSlots <= 0) continue;
                        const node = nodeById.get(item.nodeId);
                        if (!node) continue;
                        // 已繫結任務或已有成品的節點交給恢復/對賬鏈路處理，絕不重複提交。
                        if (node.metadata?.taskId || (node.metadata?.status === "success" && node.metadata.content)) continue;
                        candidates.push({ batch, item, node });
                        availableSlots -= 1;
                        batchAvailableSlots -= 1;
                    }
                }
            }

            for (const { batch, item, node } of candidates) {
                const key = batchItemKey(batch.id, item.id);
                if (controllersRef.current.has(key)) continue;
                const generationMode: CanvasNodeGenerationMode = batch.mode === "storyboard_video" ? "video" : "image";
                const generationConfig = buildGenerationConfig(effectiveConfig, node, generationMode);
                if (!isAiConfigReady(generationConfig, generationConfig.model)) {
                    updateBatch(batch.sourceNodeId, batch.id, (current) => withUpdatedItem(current, item.id, { status: "failed", errorDetails: "生成模型未配置，請完成配置後重試" }));
                    continue;
                }
                const prompt = (node.metadata?.composerContent || node.metadata?.prompt || "").trim();
                if (!prompt) {
                    updateBatch(batch.sourceNodeId, batch.id, (current) => withUpdatedItem(current, item.id, { status: "failed", errorDetails: "生成提示詞為空" }));
                    continue;
                }
                const controller = new AbortController();
                controllersRef.current.set(key, controller);
                updateBatch(batch.sourceNodeId, batch.id, (current) => withUpdatedItem(current, item.id, { status: "submitting", errorDetails: undefined }));
                void handleGenerateNode(node.id, generationMode, prompt, {
                    controller,
                    waitForTaskCapacity: true,
                    skipDuplicateConfirmation: true,
                    retryContext:
                        node.metadata?.retryOf && node.metadata.attemptGroupId && node.metadata.taskClientOperationId
                            ? { retryOf: node.metadata.retryOf, attemptGroupId: node.metadata.attemptGroupId, clientOperationId: node.metadata.taskClientOperationId }
                            : undefined,
                }).finally(() => {
                    controllersRef.current.delete(key);
                    reconcileBatches();
                });
            }
        } finally {
            schedulingRef.current = false;
        }
    }, [activeTaskLimit, effectiveConfig, handleGenerateNode, isAiConfigReady, localMode, nodesRef, projectId, projectLoaded, reconcileBatches, updateBatch]);

    const retryFailedBatchItems = useCallback(
        (sourceNodeId: string, batchId: string, itemId?: string) => {
            const batch = findBatch(nodesRef.current, sourceNodeId, batchId);
            if (!batch) return;
            const failedItems = batch.items.filter((item) => item.status === "failed" && (!itemId || item.id === itemId));
            if (!failedItems.length) return message.info("沒有需要重試的失敗項");
            const nodeById = new Map(nodesRef.current.map((node) => [node.id, node]));
            const blockedItems = failedItems.filter((item) => {
                const node = nodeById.get(item.nodeId);
                return item.submissionUncertain || shouldBlockManualRetry({ code: node?.metadata?.generationErrorCode || node?.metadata?.taskErrorCode, message: item.errorDetails || node?.metadata?.errorDetails }, node?.metadata?.taskStage);
            });
            const retryableItems = failedItems.filter((item) => !blockedItems.includes(item));
            if (blockedItems.length) message.warning(`${blockedItems.length} 個鏡頭需要先處理失敗原因，請開啟對應節點檢視`);
            if (!retryableItems.length) return;
            const retry = async () => {
                const retryContexts = new Map<string, Awaited<ReturnType<typeof createGenerationRetryContext>>>();
                await Promise.all(
                    retryableItems.map(async (item) => {
                        const retryNode = nodeById.get(item.nodeId);
                        if (!retryNode?.metadata?.taskId) return;
                        retryContexts.set(item.nodeId, await createGenerationRetryContext(retryNode.metadata.taskId, retryNode.metadata.attemptGroupId));
                    }),
                );
                const retryItemIds = new Set(retryableItems.map((item) => item.id));
                const retryNodeIds = new Set(retryableItems.map((item) => item.nodeId));
                setNodes((current) =>
                    current.map((node) => {
                        if (node.id === sourceNodeId) {
                            const batches = (node.metadata?.generationBatches || []).map((currentBatch) => {
                                if (currentBatch.id !== batchId) return currentBatch;
                                const items = currentBatch.items.map((item) =>
                                    retryItemIds.has(item.id) ? { ...item, status: "waiting" as const, taskId: undefined, errorDetails: undefined, submissionUncertain: false, retryCount: item.retryCount + 1 } : item,
                                );
                                const nextBatch = { ...currentBatch, items, updatedAt: new Date().toISOString() };
                                return { ...nextBatch, status: generationBatchStatus(nextBatch) };
                            });
                            return { ...node, metadata: { ...node.metadata, generationBatches: batches } };
                        }
                        if (!retryNodeIds.has(node.id)) return node;
                        const retryContext = retryContexts.get(node.id);
                        return {
                            ...node,
                            metadata: {
                                ...resetGenerationTaskMetadata(node.metadata),
                                ...(retryContext
                                    ? {
                                          retryOf: retryContext.retryOf,
                                          attemptGroupId: retryContext.attemptGroupId,
                                          taskClientOperationId: retryContext.clientOperationId,
                                      }
                                    : {}),
                            },
                        };
                    }),
                );
                message.success(`已將 ${retryableItems.length} 個失敗項重新加入等待佇列`);
            };
            retry();
        },
        [message, nodesRef, setNodes],
    );

    const stopRemainingBatchItems = useCallback(
        (sourceNodeId: string, batchId: string) => {
            const batch = findBatch(nodesRef.current, sourceNodeId, batchId);
            if (!batch) return;
            const nodeById = new Map(nodesRef.current.map((node) => [node.id, node]));
            // 只允許停止還在本地等待佇列中的專案。進入 submitting 後請求可能已經被服務端接收，
            // 即使前端尚未拿到 taskId 也不能再把它標成取消，避免隱藏已提交任務。
            const stoppableItems = batch.items.filter((item) => item.status === "waiting" && !nodeById.get(item.nodeId)?.metadata?.taskId);
            if (!stoppableItems.length) return message.info("沒有尚未提交的任務");
            modal.confirm({
                title: "停止剩餘任務？",
                content: `將停止 ${stoppableItems.length} 個尚未提交的任務；已經排隊或執行的任務會繼續。`,
                okText: "停止剩餘任務",
                cancelText: "繼續生成",
                okButtonProps: { danger: true },
                onOk: () => {
                    const latestNodeById = new Map(nodesRef.current.map((node) => [node.id, node]));
                    const latestBatch = findBatch(nodesRef.current, sourceNodeId, batchId);
                    const latestStoppableItems = latestBatch
                        ? latestBatch.items.filter((item) => item.status === "waiting" && stoppableItems.some((candidate) => candidate.id === item.id) && !latestNodeById.get(item.nodeId)?.metadata?.taskId)
                        : [];
                    const stoppableIds = new Set(latestStoppableItems.map((item) => item.id));
                    updateBatch(sourceNodeId, batchId, (current) => {
                        const items = current.items.map((item) => (stoppableIds.has(item.id) ? { ...item, status: "cancelled" as const, errorDetails: undefined } : item));
                        const nextBatch = { ...current, items, updatedAt: new Date().toISOString() };
                        return { ...nextBatch, status: generationBatchStatus(nextBatch) };
                    });
                },
            });
        },
        [message, modal, nodesRef, updateBatch],
    );

    useEffect(() => {
        if (!projectLoaded) return;
        reconcileBatches();
    }, [nodes, projectLoaded, reconcileBatches]);

    useEffect(() => {
        if (!projectLoaded) return;
        void scheduleWaitingItems();
        const timer = window.setInterval(() => {
            reconcileBatches();
            void scheduleWaitingItems();
        }, SCHEDULER_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [projectLoaded, reconcileBatches, scheduleWaitingItems]);

    return {
        enqueueGenerationBatch,
        retryFailedBatchItems,
        stopRemainingBatchItems,
    };
}

function batchItemKey(batchId: string, itemId: string) {
    return `${batchId}:${itemId}`;
}

function itemChanged(item: CanvasGenerationBatchItem, patch: Partial<CanvasGenerationBatchItem>) {
    return Object.entries(patch).some(([key, value]) => item[key as keyof CanvasGenerationBatchItem] !== value);
}

function withUpdatedItem(batch: CanvasGenerationBatch, itemId: string, patch: Partial<CanvasGenerationBatchItem>) {
    const items = batch.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
    const nextBatch = { ...batch, items, updatedAt: new Date().toISOString() };
    return { ...nextBatch, status: generationBatchStatus(nextBatch) };
}

function findBatch(nodes: CanvasNodeData[], sourceNodeId: string, batchId: string) {
    return nodes.find((node) => node.id === sourceNodeId)?.metadata?.generationBatches?.find((batch) => batch.id === batchId);
}
