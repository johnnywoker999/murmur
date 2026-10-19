import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { directorClayVideoMetadata } from "@/lib/canvas/director/director-clay-output";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { createDirectorSceneFromTemplate } from "@/lib/canvas/director/director-templates";
import { directorCoverMetadata, shouldCaptureDirectorCover, shouldCommitDirectorCover } from "@/lib/canvas/director/director-cover-write";
import { isDirectorOutputTargetCurrent, mergeDirectorOutputPreview, upsertDirectorSceneById } from "@/lib/canvas/director/director-session";
import { ensureDirectorOutputConnections, resolveDirectorOutputPositions } from "@/lib/canvas/director/director-output-layout";
import { nextDirectorNodeIndex } from "@/lib/canvas/director/director-node-naming";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import { captureUserScope, userScopeMatches, UserScopeAbandonedError } from "@/lib/user-scope-guard";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "@/types/canvas";
import type { DirectorScene, DirectorSceneOutput } from "@/types/director";

type UseCanvasDirectorOptions = {
    projectId: string;
    domainProjectId?: string;
    directorNodeId: string | null;
    directorScenes: DirectorScene[];
    nodesRef: { current: CanvasNodeData[] };
    connectionsRef: { current: CanvasConnection[] };
    getCanvasCenter: () => Position;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDirectorNodeId: Dispatch<SetStateAction<string | null>>;
    updateProject: (projectId: string, patch: { directorScenes: DirectorScene[] }) => void;
};

const NODE_STATUS_IDLE = "idle" as const;

/**
 * 專案真實記憶體權威在 useCanvasStore.getState().projects；
 * 閉包裡的 directorScenes 只作為 store 尚未就緒時的兜底。
 */
function currentDirectorScenes(projectId: string, fallback: DirectorScene[]) {
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    return project?.directorScenes ?? fallback;
}
export function useCanvasDirector({
    projectId,
    domainProjectId,
    directorNodeId,
    directorScenes,
    nodesRef,
    connectionsRef,
    getCanvasCenter,
    setNodes,
    setConnections,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setDirectorNodeId,
    updateProject,
}: UseCanvasDirectorOptions) {
    const { message } = App.useApp();
    const projectIdRef = useRef<string | null>(projectId);
    const coverRequestIdRef = useRef<string | null>(null);
    projectIdRef.current = projectId;

    useEffect(() => {
        projectIdRef.current = projectId;
        return () => {
            if (projectIdRef.current === projectId) projectIdRef.current = null;
        };
    }, [projectId]);

    /** 新建空導演臺；演員、道具和機位由使用者進入工作臺後自行新增。 */
    const createDirectorShot = useCallback((position?: Position) => {
        const shotIndex = nextDirectorNodeIndex(nodesRef.current);
        const directorTitle = `導演臺 ${shotIndex}`;
        let scene = createDirectorSceneFromTemplate("empty", `鏡頭 ${shotIndex}`);
        const shot = scene.shots[0];
        scene = { ...scene, shots: [{ ...shot, name: `鏡頭 ${shotIndex}` }] };
        const node = createCanvasNode(CanvasNodeType.Director, position || getCanvasCenter(), {
            workflowKind: "shot",
            workflowTitle: directorTitle,
            shotIndex,
            status: NODE_STATUS_IDLE,
            directorSceneId: scene.id,
            directorShotId: shot.id,
        });
        node.title = directorTitle;
        const nextNodes = [...nodesRef.current, node];
        nodesRef.current = nextNodes;
        setNodes(nextNodes);
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        updateProject(projectId, { directorScenes: upsertDirectorSceneById(currentDirectorScenes(projectId, directorScenes), scene) });
        setDirectorNodeId(node.id);
    }, [directorScenes, getCanvasCenter, nodesRef, projectId, setDirectorNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, updateProject]);

    const openDirectorWorkbench = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((item) => item.id === nodeId);
        if (!node || node.metadata?.workflowKind !== "shot") return;
        let scene = currentDirectorScenes(projectId, directorScenes).find((item) => item.id === node.metadata?.directorSceneId);
        let sceneNeedsPersistence = false;
        if (!scene) {
            // 孤兒節點修復路徑：節點存在但場景丟了。這不是「新建」，不彈模板選擇，
            // 用空場景兜底 —— 絕不在使用者沒選過的情況下塞演員進去。
            scene = createDirectorSceneFromTemplate("empty", node.metadata?.workflowTitle || node.title || "鏡頭場景");
            const shot = scene.shots[0];
            scene = { ...scene, shots: [{ ...shot, name: node.metadata?.workflowTitle || node.title || shot.name, prompt: node.metadata?.workflowDescription || "" }] };
            const directorSceneId = scene.id;
            const directorShotId = shot.id;
            setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, metadata: { ...item.metadata, directorSceneId, directorShotId } } : item));
            sceneNeedsPersistence = true;
        }
        if (sceneNeedsPersistence) updateProject(projectId, { directorScenes: upsertDirectorSceneById(currentDirectorScenes(projectId, directorScenes), scene) });
        setDirectorNodeId(nodeId);
    }, [directorScenes, nodesRef, projectId, setDirectorNodeId, setNodes, updateProject]);

    /** 每次儲存都基於 store 中最新 directorScenes upsert，避免舊閉包陣列覆蓋併發儲存。 */
    const saveDirectorScene = useCallback((scene: DirectorScene) => {
        updateProject(projectId, { directorScenes: upsertDirectorSceneById(currentDirectorScenes(projectId, directorScenes), scene) });
    }, [directorScenes, projectId, updateProject]);

    const shouldCaptureCover = useCallback((scene: DirectorScene, shotId: string) => {
        const node = nodesRef.current.find((item) => item.id === directorNodeId);
        return Boolean(node && node.metadata?.directorShotId === shotId && shouldCaptureDirectorCover(node, scene));
    }, [directorNodeId, nodesRef]);

    const captureDirectorCover = useCallback(async ({ scene, shotId, beauty }: { scene: DirectorScene; shotId: string; beauty: Blob }) => {
        const sourceNodeId = directorNodeId;
        if (!sourceNodeId || !shouldCaptureCover(scene, shotId)) return;
        const expectedScope = captureUserScope();
        const requestId = nanoid();
        coverRequestIdRef.current = requestId;
        const stillCurrent = () => {
            if (!userScopeMatches(expectedScope)) return false;
            const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
            return shouldCommitDirectorCover({
                projectId,
                currentProjectId: projectIdRef.current,
                node: nodesRef.current.find((item) => item.id === sourceNodeId),
                scene: project?.directorScenes.find((item) => item.id === scene.id),
                shotId,
                expectedSceneUpdatedAt: scene.updatedAt,
                requestId,
                latestRequestId: coverRequestIdRef.current || "",
            });
        };
        if (!stillCurrent()) return;
        const image = await uploadImage(beauty, undefined, expectedScope);
        if (!stillCurrent()) return;
        const nextNodes = nodesRef.current.map((item) => item.id === sourceNodeId
            ? { ...item, metadata: { ...item.metadata, ...directorCoverMetadata(image, scene.updatedAt) } }
            : item);
        // setNodes stamps changes against the previous ref before updating it.
        setNodes(nextNodes);
    }, [directorNodeId, nodesRef, projectId, setNodes, shouldCaptureCover]);

    const applyDirectorOutput = useCallback(async (output: DirectorSceneOutput) => {
        const outputProjectId = projectId;
        if (projectIdRef.current !== outputProjectId) throw new Error("畫布專案已切換，請重試");
        const sourceNodeAtStart = nodesRef.current.find((item) => item.id === directorNodeId);
        if (!sourceNodeAtStart || sourceNodeAtStart.metadata?.directorSceneId !== output.scene.id) throw new Error("鏡頭節點不存在或場景已切換");
        const sourceNodeId = sourceNodeAtStart.id;
        const expectedScope = captureUserScope();
        const [image, videoUpload] = await Promise.all([
            uploadImage(output.beauty, undefined, expectedScope),
            output.clayVideo ? uploadMediaFile(output.clayVideo, "director-clay", undefined, expectedScope) : Promise.resolve(null),
        ]);
        if (!userScopeMatches(expectedScope)) throw new UserScopeAbandonedError();
        // 上傳期間專案、節點和鏡頭都可能變化。以當前權威狀態重新核驗併合並，
        // 不允許舊輸出寫入另一專案，也不允許舊 scene 快照覆蓋併發編輯。
        const outputProject = useCanvasStore.getState().projects.find((item) => item.id === outputProjectId);
        const sourceNode = nodesRef.current.find((item) => item.id === sourceNodeId);
        const latestScene = outputProject?.directorScenes.find((item) => item.id === output.scene.id);
        const target = { currentProjectId: projectIdRef.current, outputProjectId, projectExists: Boolean(outputProject), sourceNode, sourceNodeId, latestScene, sceneId: output.scene.id, shotId: output.shot.id };
        if (!isDirectorOutputTargetCurrent(target) || !sourceNode || !latestScene) throw new Error("輸出期間專案或鏡頭已切換、刪除，請重試");
        const previewId = sourceNode.metadata?.directorPreviewNodeId || `image-director-${Date.now()}`;
        const mergedScene = mergeDirectorOutputPreview(latestScene, { sceneId: output.scene.id, shotId: output.shot.id, previewNodeId: previewId });
        if (!mergedScene) throw new Error("輸出期間鏡頭已切換或刪除，請重試");
        const previewSize = fitNodeSize(image.width, image.height);
        const nextNodes = [...nodesRef.current];
        const previewIndex = nextNodes.findIndex((item) => item.id === previewId);
        const existingPreview = previewIndex >= 0 ? nextNodes[previewIndex] : null;
        let clayVideoId = sourceNode.metadata?.directorClayVideoNodeId;
        if (videoUpload) clayVideoId ||= `video-director-clay-${Date.now()}`;
        const videoIndex = clayVideoId ? nextNodes.findIndex((item) => item.id === clayVideoId) : -1;
        const existingVideo = videoIndex >= 0 ? nextNodes[videoIndex] : null;
        const outputPositions = resolveDirectorOutputPositions({
            source: { position: sourceNode.position, width: sourceNode.width },
            previewSize,
            existingPreviewPosition: existingPreview?.position,
            existingVideoPosition: existingVideo?.position,
        });
        const previewNode: CanvasNodeData = {
            ...existingPreview,
            id: previewId,
            type: CanvasNodeType.Image,
            title: `${sourceNode.title} · 導演臺構圖`,
            position: outputPositions.previewPosition,
            width: previewSize.width,
            height: previewSize.height,
            metadata: { ...existingPreview?.metadata, ...imageMetadata(image), prompt: output.prompt, workflowKind: "reference_set", assetTags: ["導演臺構圖", `鏡頭:${sourceNode.title}`] },
        };
        if (previewIndex >= 0) nextNodes[previewIndex] = previewNode;
        else nextNodes.push(previewNode);

        if (videoUpload) {
            const outputVideoId = clayVideoId;
            if (!outputVideoId) throw new Error("影片節點 ID 未準備好，請重試匯出");
            const videoNode: CanvasNodeData = {
                ...existingVideo,
                id: outputVideoId,
                type: CanvasNodeType.Video,
                title: `${sourceNode.title} · 白膜影片`,
                position: outputPositions.videoPosition,
                width: existingVideo?.width || 360,
                height: existingVideo?.height || 220,
                metadata: { ...existingVideo?.metadata, ...directorClayVideoMetadata(videoUpload, image), prompt: output.prompt, workflowKind: "reference_video", assetTags: ["導演臺白膜", `鏡頭:${sourceNode.title}`] },
            };
            if (videoIndex >= 0) nextNodes[videoIndex] = videoNode;
            else nextNodes.push(videoNode);
        }

        const mediaNodes = nextNodes.filter((item) => item.id === previewId || Boolean(clayVideoId && item.id === clayVideoId));
        const assetIds = new Map<string, string>();
        let confirmed = true;
        for (const mediaNode of mediaNodes) {
            const result = await ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId, node: mediaNode, source: "canvas-manual", expectedScope });
            assetIds.set(mediaNode.id, result.assetId);
            if (!result.confirmed) confirmed = false;
        }
        if (!userScopeMatches(expectedScope)) throw new UserScopeAbandonedError();
        // 素材登記同樣會等待磁碟/網路。提交前再核驗，並以最新畫布為基底，
        // 避免在等待期間切換專案或編輯其他節點後寫回過期快照。
        const commitProject = useCanvasStore.getState().projects.find((item) => item.id === outputProjectId);
        const commitSourceNode = nodesRef.current.find((item) => item.id === sourceNodeId);
        const commitScene = commitProject?.directorScenes.find((item) => item.id === output.scene.id);
        if (!isDirectorOutputTargetCurrent({ ...target, currentProjectId: projectIdRef.current, projectExists: Boolean(commitProject), sourceNode: commitSourceNode, latestScene: commitScene })) throw new Error("輸出期間專案或鏡頭已切換、刪除，請重試");
        const committedScene = mergeDirectorOutputPreview(commitScene!, { sceneId: output.scene.id, shotId: output.shot.id, previewNodeId: previewId });
        if (!committedScene) throw new Error("輸出期間鏡頭已切換或刪除，請重試");
        const retiredReferenceIds = new Set([commitSourceNode?.metadata?.directorDepthNodeId, commitSourceNode?.metadata?.directorNormalNodeId].filter(Boolean));
        const referenceAssetNodeIds = Array.from(new Set([
            ...(commitSourceNode?.metadata?.referenceAssetNodeIds || []).filter((id) => !retiredReferenceIds.has(id)),
            previewId,
            ...(clayVideoId ? [clayVideoId] : []),
        ]));
        const directorMetadata: Partial<CanvasNodeMetadata> = {
            directorSceneId: output.scene.id,
            directorShotId: output.shot.id,
            directorPreviewNodeId: previewId,
            directorDepthNodeId: undefined,
            directorNormalNodeId: undefined,
            directorClayVideoNodeId: clayVideoId,
            videoCameraMoveId: output.shot.cameraMove,
            videoCameraMovePrompt: output.prompt,
            referenceAssetNodeIds,
        };
        const committedNodes = [...nodesRef.current];
        for (const mediaNode of mediaNodes) {
            const index = committedNodes.findIndex((item) => item.id === mediaNode.id);
            if (index >= 0) {
                const current = committedNodes[index];
                committedNodes[index] = { ...current, ...mediaNode, position: current.position, width: current.width, height: current.height, metadata: { ...current.metadata, ...mediaNode.metadata } };
            } else committedNodes.push(mediaNode);
        }
        const finalizedNodes = committedNodes.map((item) => {
            const assetId = assetIds.get(item.id);
            if (assetId) return { ...item, metadata: { ...item.metadata, assetId } };
            return item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, ...directorMetadata } } : item;
        });
        const outputNodeIds = [previewId, videoUpload ? clayVideoId : null].filter((id): id is string => Boolean(id));
        const committedConnections = ensureDirectorOutputConnections(connectionsRef.current, sourceNodeId, outputNodeIds, nanoid);
        nodesRef.current = finalizedNodes;
        connectionsRef.current = committedConnections;
        setNodes(finalizedNodes);
        setConnections(committedConnections);
        saveDirectorScene(committedScene);
        return { confirmed };
    }, [connectionsRef, directorNodeId, domainProjectId, nodesRef, projectId, saveDirectorScene, setConnections, setNodes]);

    return { applyDirectorOutput, captureDirectorCover, createDirectorShot, openDirectorWorkbench, saveDirectorScene, shouldCaptureCover };
}
