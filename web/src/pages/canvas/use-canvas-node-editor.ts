import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { FOLDER_COLLAPSED_HEIGHT, FOLDER_COLLAPSED_WIDTH, FRAME_COLLAPSED_HEIGHT, FRAME_COLLAPSED_WIDTH, getFrameChildIds, isCanvasFolderNode, isFrameNode } from "@/lib/canvas/canvas-frame";
import { buildCanvasMediaDownloadFileName } from "@/lib/canvas/canvas-media-download";
import { ownedResourceIdFromMediaRef } from "@/services/api/resources";
import { downloadOwnedOrBrowserMedia, reportOwnedMediaSave } from "@/services/desktop-media-save";
import { writeCanvasNodePrompt } from "@/lib/canvas/canvas-node-prompt";
import { applyBatchPrimaryImage, applyNodeConfigPatch } from "@/lib/canvas/canvas-project-domain";
import { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-project-generation";
import { CONTENT_MODERATION_ERROR_CODE, isContentModerationError } from "@/lib/generation-error";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import type { AssetCategory } from "@/stores/use-asset-store";
import { CanvasNodeType, type CanvasFolderStyle, type CanvasFolderTheme, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "@/types/canvas";
import { useCanvasOwnerLifetime } from "./canvas-owner-epoch";
import { createOwnedCanvasUploadGuard, persistOwnedCanvasUploadNode } from "./canvas-upload-ownership";

type UseCanvasNodeEditorOptions = {
    canvasId: string;
    canvasTitle: string;
    domainProjectId?: string;
    nodesRef: { current: CanvasNodeData[] };
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasNodeEditor({
    canvasId,
    canvasTitle,
    domainProjectId,
    nodesRef,
    setNodes,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDialogNodeId,
    setToolbarNodeId,
    setHoveredNodeId,
}: UseCanvasNodeEditorOptions) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const canvasIdRef = useRef(canvasId);
    canvasIdRef.current = canvasId;
    const { lifetime, mountedRef } = useCanvasOwnerLifetime(canvasId);
    const [collapsingBatchIds, setCollapsingBatchIds] = useState<Set<string>>(new Set());
    const [openingBatchIds, setOpeningBatchIds] = useState<Set<string>>(new Set());
    const batchMotionTimers = useRef(new Map<string, number>());
    useEffect(() => () => {
        batchMotionTimers.current.forEach((timer) => window.clearTimeout(timer));
    }, []);

    const handleNodeResize = useCallback((nodeId: string, width: number, height: number, position?: Position) => {
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                if (node.id !== nodeId || node.metadata?.locked) return node;
                const nextPosition = position || node.position;
                if (node.width === width && node.height === height && node.position.x === nextPosition.x && node.position.y === nextPosition.y) return node;
                changed = true;
                // 打上「使用者手動定過尺寸」標記：圖片按真實比例自動適配時要避讓它，
                // 否則每次圖片重新載入都會把使用者拉過的尺寸改回去。
                const resized = { ...node, width, height, position: nextPosition, metadata: { ...node.metadata, manualSize: true } };
                if (!isFrameNode(node) || node.metadata?.frame?.collapsed) return resized;
                return { ...resized, metadata: { ...resized.metadata, frame: { collapsed: false, expandedWidth: width, expandedHeight: height } } };
            });
            return changed ? next : current;
        });
    }, [setNodes]);

    const toggleFrameCollapsed = useCallback((nodeId: string) => {
        const frame = nodesRef.current.find((node) => node.id === nodeId && isFrameNode(node));
        if (!frame) return;
        const collapsed = Boolean(frame.metadata?.frame?.collapsed);
        const childIds = getFrameChildIds(nodeId, nodesRef.current);
        setNodes((current) =>
            current.map((node) => {
                if (node.id !== nodeId) return node;
                const frameState = node.metadata?.frame;
                const folder = isCanvasFolderNode(node);
                return collapsed
                    ? { ...node, width: frameState?.expandedWidth || NODE_DEFAULT_SIZE[CanvasNodeType.Frame].width, height: frameState?.expandedHeight || NODE_DEFAULT_SIZE[CanvasNodeType.Frame].height, metadata: { ...node.metadata, frame: { collapsed: false, expandedWidth: frameState?.expandedWidth || NODE_DEFAULT_SIZE[CanvasNodeType.Frame].width, expandedHeight: frameState?.expandedHeight || NODE_DEFAULT_SIZE[CanvasNodeType.Frame].height } } }
                    : { ...node, width: folder ? FOLDER_COLLAPSED_WIDTH : FRAME_COLLAPSED_WIDTH, height: folder ? FOLDER_COLLAPSED_HEIGHT : FRAME_COLLAPSED_HEIGHT, metadata: { ...node.metadata, frame: { collapsed: true, expandedWidth: node.width, expandedHeight: node.height } } };
            }),
        );
        setSelectedNodeIds(new Set([nodeId]));
        setSelectedConnectionId(null);
        setDialogNodeId((current) => (current && childIds.has(current) ? null : current));
        setToolbarNodeId(null);
        setHoveredNodeId(null);
    }, [nodesRef, setDialogNodeId, setHoveredNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId]);

    const handleNodeTitleChange = useCallback((nodeId: string, title: string) => {
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, title } : node)));
    }, [setNodes]);

    const handleFolderStyleChange = useCallback((nodeId: string, style: CanvasFolderStyle) => {
        setNodes((current) => current.map((node) => {
            if (node.id !== nodeId || !isCanvasFolderNode(node)) return node;
            const folder = node.metadata!.folder!;
            return { ...node, metadata: { ...node.metadata, folder: { ...folder, style, createdAt: folder.createdAt || new Date().toISOString() } } };
        }));
    }, [setNodes]);

    const handleFolderThemeChange = useCallback((nodeId: string, theme: CanvasFolderTheme) => {
        setNodes((current) => current.map((node) => {
            if (node.id !== nodeId || !isCanvasFolderNode(node)) return node;
            const folder = node.metadata!.folder!;
            return { ...node, metadata: { ...node.metadata, folder: { ...folder, theme, themeCover: undefined, createdAt: folder.createdAt || new Date().toISOString() } } };
        }));
    }, [setNodes]);

    const toggleNodeFreeResize = useCallback((nodeId: string) => {
        setNodes((current) =>
            current.map((node) => {
                if (node.id !== nodeId) return node;
                const freeResize = !node.metadata?.freeResize;
                if (freeResize || node.type !== CanvasNodeType.Image) return { ...node, metadata: { ...node.metadata, freeResize } };
                const ratio = (node.metadata?.naturalWidth || node.width) / (node.metadata?.naturalHeight || node.height || 1);
                const height = node.width / ratio;
                return { ...node, height, position: { x: node.position.x, y: node.position.y + node.height / 2 - height / 2 }, metadata: { ...node.metadata, freeResize } };
            }),
        );
    }, [setNodes]);

    const handleNodeContentChange = useCallback((nodeId: string, content: string) => {
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, content, richText: undefined } } : node)));
    }, [setNodes]);

    const toggleBatchExpanded = useCallback((nodeId: string) => {
        const root = nodesRef.current.find((node) => node.id === nodeId);
        if (!root?.metadata?.isBatchRoot) return;
        const isExpanded = Boolean(root.metadata.imageBatchExpanded);
        window.clearTimeout(batchMotionTimers.current.get(nodeId));
        const updateMotionState = isExpanded ? setCollapsingBatchIds : setOpeningBatchIds;
        const clearMotionState = isExpanded ? setOpeningBatchIds : setCollapsingBatchIds;
        clearMotionState((current) => {
            const next = new Set(current);
            next.delete(nodeId);
            return next;
        });
        updateMotionState((current) => new Set(current).add(nodeId));
        batchMotionTimers.current.set(nodeId, window.setTimeout(() => {
            batchMotionTimers.current.delete(nodeId);
            updateMotionState((current) => {
                const next = new Set(current);
                next.delete(nodeId);
                return next;
            });
        }, isExpanded ? 320 : 445 + (root.metadata.batchChildIds?.length || 1) * 24));
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, imageBatchExpanded: !node.metadata?.imageBatchExpanded } } : node)));
    }, [nodesRef, setNodes]);

    const setBatchPrimary = useCallback((child: CanvasNodeData) => {
        const rootId = child.metadata?.batchRootId;
        if (!rootId || !child.metadata?.content) return;
        setNodes((current) =>
            current.map((node) =>
                node.id === rootId
                    ? applyBatchPrimaryImage(node, child)
                    : node,
            ),
        );
    }, [setNodes]);

    const handleNodePromptChange = useCallback((nodeId: string, prompt: string) => {
        setNodes((current) => current.map((node) => {
            if (node.id !== nodeId) return node;
            const previousPrompt = node.metadata?.composerContent ?? node.metadata?.prompt ?? "";
            const promptChanged = prompt !== previousPrompt;
            const moderationFailure = node.metadata?.generationErrorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(node.metadata?.errorDetails);
            const metadata = moderationFailure && promptChanged
                ? resetGenerationTaskMetadata(node.metadata, node.metadata?.content ? "success" : "idle")
                : node.metadata;
            return writeCanvasNodePrompt(node, prompt, {
                metadata,
                clearPromptTemplate: promptChanged && Boolean(metadata?.promptTemplateOperation),
            });
        }));
    }, [setNodes]);

    const persistOwnedEditorNode = useCallback(async (node: CanvasNodeData, category?: AssetCategory) => {
        const guard = createOwnedCanvasUploadGuard({
            lifetime,
            canvasId,
            getLiveCanvasId: () => canvasIdRef.current,
            mounted: () => mountedRef.current,
        });
        const result = await persistOwnedCanvasUploadNode({
            owner: guard.owner,
            expectedScope: guard.expectedScope,
            getLiveCanvasId: () => canvasIdRef.current,
            getLiveLifetime: () => lifetime.current(),
            mounted: () => mountedRef.current,
            canvasId,
            domainProjectId,
            node,
            signal: guard.signal,
            source: "canvas-manual",
            category,
        }, {
            ensureCanvasNodeAsset,
            setNodes,
            invalidateProject: domainProjectId
                ? async (projectId) => { await queryClient.invalidateQueries({ queryKey: ["project", projectId] }); }
                : undefined,
        });
        return { guard, result };
    }, [canvasId, domainProjectId, lifetime, mountedRef, queryClient, setNodes]);

    const handleConfigNodeChange = useCallback((nodeId: string, patch: Partial<CanvasNodeMetadata>) => {
        setNodes((current) => {
            const next = current.map((node) => (node.id === nodeId ? applyNodeConfigPatch(node, patch) : node));
            // 生成入口讀取 nodesRef；同步寫入，避免剛修改工作流比例就立即生成時仍提交舊值。
            nodesRef.current = next;
            return next;
        });
        if (!patch.assetCategory) return;
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node?.metadata?.content?.trim()) return;
        const updatedNode = applyNodeConfigPatch(node, patch);
        void persistOwnedEditorNode(updatedNode, patch.assetCategory).then(({ guard, result }) => {
            if (!guard.alive()) return;
            if (result.applied) {
                if (result.confirmed) message.success("資產分類已更新");
                else message.warning("檔案目前只在這臺裝置上");
                return;
            }
            if (result.error === undefined) return;
            message.error(result.error instanceof Error ? result.error.message : "資產分類更新失敗");
        });
    }, [message, nodesRef, persistOwnedEditorNode, setNodes]);

    const downloadNodeImage = useCallback((node: CanvasNodeData) => {
        if ((node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) || !node.metadata?.content) return;
        void reportOwnedMediaSave(message, downloadOwnedOrBrowserMedia({
            fileName: buildCanvasMediaDownloadFileName(canvasTitle, node),
            resourceId: ownedResourceIdFromMediaRef(node.metadata?.storageKey, node.metadata?.content),
            browserUrl: node.metadata.content,
        }));
    }, [canvasTitle, message]);

    const saveNodeAsset = useCallback(async (node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text && node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return message.error("當前節點型別不能儲存為素材");
        if (!node.metadata?.content?.trim()) return message.error("當前節點沒有可儲存的內容");
        const { guard, result } = await persistOwnedEditorNode(node);
        if (!guard.alive()) return;
        if (result.applied) {
            if (!result.confirmed) message.warning("檔案目前只在這臺裝置上");
            else message.success(result.linkedToProject ? "已加入專案資產" : "已加入我的素材");
            return;
        }
        if (result.error === undefined) return;
        message.error(result.error instanceof Error ? result.error.message : "素材儲存失敗");
    }, [message, persistOwnedEditorNode]);

    const handleFontSizeChange = useCallback((nodeId: string, fontSize: number) => {
        setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, fontSize } } : node)));
    }, [setNodes]);

    return {
        collapsingBatchIds,
        downloadNodeImage,
        handleConfigNodeChange,
        handleFolderStyleChange,
        handleFolderThemeChange,
        handleFontSizeChange,
        handleNodeContentChange,
        handleNodePromptChange,
        handleNodeResize,
        handleNodeTitleChange,
        openingBatchIds,
        saveNodeAsset,
        setBatchPrimary,
        toggleBatchExpanded,
        toggleFrameCollapsed,
        toggleNodeFreeResize,
    };
}
