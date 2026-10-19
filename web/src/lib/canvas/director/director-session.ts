import type { DirectorScene, DirectorScreenshot } from "../../../types/director";

/**
 * 開啟期間本地 draft 是唯一權威：只有 scene id 變化（或首次掛載）才重建會話。
 * 同 id 的父級映象迴流絕不能重新 clone / 清歷史 / 重置播放頭。
 */
export function shouldReinitializeDirectorSession(input: { initializedSceneId: string | null; nextSceneId: string | null }) {
    const { initializedSceneId, nextSceneId } = input;
    if (!nextSceneId) return false;
    return initializedSceneId !== nextSceneId;
}

/** 以 id upsert，呼叫方必須傳入「當前最新」陣列，避免舊閉包覆蓋併發儲存。 */
export function upsertDirectorSceneById(scenes: DirectorScene[], scene: DirectorScene): DirectorScene[] {
    return scenes.some((item) => item.id === scene.id) ? scenes.map((item) => (item.id === scene.id ? scene : item)) : [...scenes, scene];
}

/** Commit a canvas director-node description to its shot prompt; stale shot ids fall back safely. */
export function updateDirectorShotPrompt(scene: DirectorScene, requestedShotId: string | undefined, input: string): DirectorScene {
    const prompt = input.trim();
    if (!prompt || scene.shots.length === 0) return scene;
    const shotId = requestedShotId && scene.shots.some((shot) => shot.id === requestedShotId)
        ? requestedShotId
        : scene.shots.some((shot) => shot.id === scene.activeShotId) ? scene.activeShotId : scene.shots[0].id;
    const current = scene.shots.find((shot) => shot.id === shotId)!;
    if (current.prompt === prompt) return scene;
    return { ...scene, shots: scene.shots.map((shot) => shot.id === shotId ? { ...shot, prompt } : shot) };
}

/**
 * 輸出上傳可能跨越數秒。只把生成出的預覽引用合併到最新場景，絕不拿輸出開始時的
 * scene 快照覆蓋期間發生的標題、物件、關鍵幀或鏡頭編輯。
 */
export function mergeDirectorOutputPreview(scene: DirectorScene, input: { sceneId: string; shotId: string; previewNodeId: string }) {
    if (scene.id !== input.sceneId || !scene.shots.some((shot) => shot.id === input.shotId)) return null;
    return {
        ...scene,
        shots: scene.shots.map((shot) => (shot.id === input.shotId ? { ...shot, previewNodeId: input.previewNodeId, depthNodeId: undefined, normalNodeId: undefined } : shot)),
    };
}

/** Asynchronous uploads and asset registration must not publish into a switched canvas or deleted shot. */
export function isDirectorOutputTargetCurrent(input: {
    currentProjectId: string | null;
    outputProjectId: string;
    projectExists: boolean;
    sourceNode: { id: string; metadata?: { directorSceneId?: string } } | undefined;
    sourceNodeId: string;
    latestScene: Pick<DirectorScene, "id" | "shots"> | undefined;
    sceneId: string;
    shotId: string;
}): boolean {
    return input.currentProjectId === input.outputProjectId
        && input.projectExists
        && input.sourceNode?.id === input.sourceNodeId
        && input.sourceNode.metadata?.directorSceneId === input.sceneId
        && input.latestScene?.id === input.sceneId
        && input.latestScene.shots.some((shot) => shot.id === input.shotId);
}

/** 截圖上傳完成後合入最新場景，避免舊快照覆蓋期間的其他編輯。 */
export function appendDirectorScreenshot(scene: DirectorScene, input: { sceneId: string; shotId: string; screenshot: DirectorScreenshot }): DirectorScene {
    if (scene.id !== input.sceneId || !scene.shots.some((shot) => shot.id === input.shotId)) return scene;
    return {
        ...scene,
        shots: scene.shots.map((shot) => shot.id === input.shotId ? { ...shot, screenshots: [...(shot.screenshots || []), input.screenshot] } : shot),
    };
}

export function nextDirectorScreenshotName(cameraName: string, existingCount: number): string {
    return `${cameraName}-shot-${String(existingCount + 1).padStart(2, "0")}`;
}

/** 長截圖/錄製結束前，場景引用與活動鏡頭必須仍是操作開始時的快照。 */
export function isDirectorOutputSnapshotCurrent(scene: DirectorScene | null, expected: { scene: DirectorScene; shotId: string }) {
    if (scene !== expected.scene) return false;
    const activeShot = scene.shots.find((shot) => shot.id === scene.activeShotId) || scene.shots[0];
    return activeShot?.id === expected.shotId;
}
