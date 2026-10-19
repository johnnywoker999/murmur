import { canvasNodeToAsset } from "@/lib/canvas/canvas-node-asset";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { useAssetStore, type Asset, type NewAsset } from "@/stores/use-asset-store";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { TimelineDirectMedia } from "@/types/timeline";

export type CanvasAssetRepairResult = {
    createdAssets: number;
    updatedProjects: number;
};

export function repairMissingCanvasAssets(projectIds?: Set<string>, partialAssets = false): CanvasAssetRepairResult {
    const assetStore = useAssetStore.getState();
    const canvasStore = useCanvasStore.getState();
    const assetIdByStorageKey = new Map<string, string>();
    const storageKeyByAssetId = new Map<string, string>();
    const knownAssetIds = new Set<string>();
    for (const asset of assetStore.assets) {
        knownAssetIds.add(asset.id);
        const storageKey = assetStorageKey(asset);
        if (storageKey) {
            storageKeyByAssetId.set(asset.id, storageKey);
            if (!assetIdByStorageKey.has(storageKey)) assetIdByStorageKey.set(storageKey, asset.id);
        }
    }

    let createdAssets = 0;
    let updatedProjects = 0;
    for (const project of canvasStore.projects) {
        if (projectIds && !projectIds.has(project.id)) continue;
        if (partialAssets) {
            for (const node of project.nodes) {
                if (node.metadata?.assetId) {
                    knownAssetIds.add(node.metadata.assetId);
                    // 節點宣告只用於補充本地未載入的素材對映，不能覆蓋素材庫的真實繫結：
                    // 原地重生成的節點可能保留舊 assetId 卻指向新資源，覆蓋會讓修復永遠放行錯誤配對。
                    if (node.metadata.storageKey && !storageKeyByAssetId.has(node.metadata.assetId)) storageKeyByAssetId.set(node.metadata.assetId, node.metadata.storageKey);
                }
            }
            for (const clip of project.timeline?.clips || []) {
                if (clip.directMedia?.assetId) {
                    knownAssetIds.add(clip.directMedia.assetId);
                    if (clip.directMedia.storageKey && !storageKeyByAssetId.has(clip.directMedia.assetId)) storageKeyByAssetId.set(clip.directMedia.assetId, clip.directMedia.storageKey);
                }
            }
        }
        const repaired = repairProject(project, knownAssetIds, assetIdByStorageKey, storageKeyByAssetId, (node) => {
            const input = canvasNodeToAsset(node, { canvasId: project.id, source: "canvas-upload" });
            if (!input) return undefined;
            const assetId = useAssetStore.getState().addAsset(input);
            knownAssetIds.add(assetId);
            const storageKey = node.metadata?.storageKey;
            if (storageKey) {
                assetIdByStorageKey.set(storageKey, assetId);
                storageKeyByAssetId.set(assetId, storageKey);
            }
            createdAssets += 1;
            return assetId;
        });
        if (!repaired) continue;
        canvasStore.updateProject(project.id, repaired);
        updatedProjects += 1;
    }
    return { createdAssets, updatedProjects };
}

function repairProject(
    project: CanvasProject,
    knownAssetIds: Set<string>,
    assetIdByStorageKey: Map<string, string>,
    storageKeyByAssetId: Map<string, string>,
    createAsset: (node: CanvasNodeData) => string | undefined,
): Pick<CanvasProject, "nodes" | "timeline"> | null {
    let changed = false;
    const nodes = project.nodes.map((node) => {
        if (!isDurableMediaNode(node)) return node;
        const assetId = matchingAssetId(node.metadata?.assetId, node.metadata?.storageKey, knownAssetIds, assetIdByStorageKey, storageKeyByAssetId) || createAsset(node);
        if (!assetId || node.metadata?.assetId === assetId) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, assetId } };
    });
    const timeline = project.timeline
        ? {
              ...project.timeline,
              clips: project.timeline.clips.map((clip) => {
                  const media = clip.directMedia;
                  if (!media || media.kind === "text" || !mediaContent(media)) return clip;
                  const assetId = matchingAssetId(media.assetId, media.storageKey, knownAssetIds, assetIdByStorageKey, storageKeyByAssetId) || createAsset(timelineMediaNode(media));
                  if (!assetId || media.assetId === assetId) return clip;
                  changed = true;
                  return { ...clip, directMedia: { ...media, assetId } };
              }),
          }
        : project.timeline;
    return changed ? { nodes, timeline } : null;
}

function matchingAssetId(explicitId: string | undefined, storageKey: string | undefined, knownAssetIds: Set<string>, assetIdByStorageKey: Map<string, string>, storageKeyByAssetId: Map<string, string>) {
    if (explicitId && knownAssetIds.has(explicitId) && (!storageKey || storageKeyByAssetId.get(explicitId) === storageKey)) return explicitId;
    return storageKey ? assetIdByStorageKey.get(storageKey) : undefined;
}

function isDurableMediaNode(node: CanvasNodeData) {
    return isCanvasMediaNodeType(node) && Boolean(node.metadata?.content || node.metadata?.storageKey);
}

function timelineMediaNode(media: TimelineDirectMedia): CanvasNodeData {
    const type = media.kind === "audio" ? CanvasNodeType.Audio : media.kind === "video" ? CanvasNodeType.Video : CanvasNodeType.Image;
    return {
        id: media.id,
        type,
        title: media.title,
        position: { x: 0, y: 0 },
        width: media.width || 320,
        height: media.height || (type === CanvasNodeType.Audio ? 120 : 240),
        metadata: {
            content: mediaContent(media),
            storageKey: media.storageKey,
            naturalWidth: media.width,
            naturalHeight: media.height,
            durationMs: media.durationMs,
            bytes: media.bytes,
            mimeType: media.mimeType,
        },
    };
}

function mediaContent(media: TimelineDirectMedia) {
    return media.url || media.dataUrl || media.content || "";
}

function assetStorageKey(asset: Asset) {
    return asset.kind === "text" || asset.kind === "entity" ? undefined : asset.data.storageKey;
}

export type CanvasAssetRebindResult = {
    reboundNodes: number;
    createdAssets: number;
    updatedProjects: number;
};

const LOCAL_MEDIA_KEY_PATTERN = /^(image|video|audio|file|video-reference|audio-reference):/;
const RESOURCE_URL_PATTERN = /\/resources\/([A-Za-z0-9_-]{1,80})\/file/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * 強制對齊畫布媒體與素材的繫結：以素材記錄實際引用的資源為準校驗節點宣告的
 * (assetId, 資源) 對，不一致時重綁到引用同一資源的現有素材，缺失則按節點新建。
 * 服務端畫布不變式只認「資源被 assetId 對應素材引用」，重綁後按素材先於畫布
 * 推送即可在不破壞該不變式的前提下用本地畫布覆蓋雲端。
 */
export function rebindInconsistentCanvasAssets(records: Asset[], projectIds?: Set<string>): CanvasAssetRebindResult {
    const identitiesByAssetId = new Map<string, Set<string>>();
    const assetIdByIdentity = new Map<string, string>();
    const registerAsset = (asset: Asset) => {
        const identities = assetIdentities(asset);
        identitiesByAssetId.set(asset.id, identities);
        for (const identity of identities) {
            if (!assetIdByIdentity.has(identity)) assetIdByIdentity.set(identity, asset.id);
        }
    };
    for (const asset of records) registerAsset(asset);

    let reboundNodes = 0;
    let createdAssets = 0;
    let updatedProjects = 0;
    const canvasStore = useCanvasStore.getState();
    for (const project of canvasStore.projects) {
        if (projectIds && !projectIds.has(project.id)) continue;
        let projectChanged = false;
        const resolveAssetId = (declaredId: string | undefined, identity: string, buildAsset: () => NewAsset | null): string | undefined => {
            if (declaredId && identitiesByAssetId.get(declaredId)?.has(identity)) return declaredId;
            const candidate = assetIdByIdentity.get(identity);
            if (candidate) return candidate;
            const input = buildAsset();
            if (!input) return declaredId;
            const assetStore = useAssetStore.getState();
            const assetId = assetStore.addAsset(input);
            identitiesByAssetId.set(assetId, new Set([identity]));
            if (!assetIdByIdentity.has(identity)) assetIdByIdentity.set(identity, assetId);
            createdAssets += 1;
            return assetId;
        };
        const nodes = project.nodes.map((node) => {
            if (!isCanvasMediaNodeType(node)) return node;
            const identity = mediaNodeIdentity(node.metadata?.storageKey, node.metadata?.content);
            if (!identity) return node;
            const assetId = resolveAssetId(node.metadata?.assetId, identity, () => canvasNodeToAsset(node, { canvasId: project.id, source: "canvas-manual" }));
            if (!assetId || node.metadata?.assetId === assetId) return node;
            reboundNodes += 1;
            projectChanged = true;
            return { ...node, metadata: { ...node.metadata, assetId } };
        });
        const timeline = project.timeline
            ? {
                  ...project.timeline,
                  clips: project.timeline.clips.map((clip) => {
                      const media = clip.directMedia;
                      const identity = media && media.kind !== "text" ? mediaNodeIdentity(media.storageKey, mediaContent(media)) : undefined;
                      if (!media || !identity) return clip;
                      const assetId = resolveAssetId(media.assetId, identity, () => canvasNodeToAsset(timelineMediaNode(media), { canvasId: project.id, source: "canvas-manual" }));
                      if (!assetId || media.assetId === assetId) return clip;
                      reboundNodes += 1;
                      projectChanged = true;
                      return { ...clip, directMedia: { ...media, assetId } };
                  }),
              }
            : project.timeline;
        if (!projectChanged) continue;
        canvasStore.updateProject(project.id, { nodes, timeline });
        updatedProjects += 1;
    }
    return { reboundNodes, createdAssets, updatedProjects };
}

/** 收集畫布媒體節點與時間線片段宣告過 assetId 的媒體引用，供強制覆蓋前批次拉取服務端素材記錄。 */
export function collectCanvasMediaAssetIds(projects: CanvasProject[]): Set<string> {
    const ids = new Set<string>();
    for (const project of projects) {
        for (const node of project.nodes) {
            if (isCanvasMediaNodeType(node) && node.metadata?.assetId && mediaNodeIdentity(node.metadata.storageKey, node.metadata.content)) ids.add(node.metadata.assetId);
        }
        for (const clip of project.timeline?.clips || []) {
            const media = clip.directMedia;
            if (media?.assetId && media.kind !== "text" && mediaNodeIdentity(media.storageKey, mediaContent(media))) ids.add(media.assetId);
        }
    }
    return ids;
}

function isCanvasMediaNodeType(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio;
}

function mediaNodeIdentity(storageKey: string | undefined, content: string | undefined) {
    const fromKey = mediaIdentityFromValue(storageKey);
    if (fromKey) return fromKey;
    const resourceId = resourceIdFromStorageKey(content);
    if (resourceId) return resourceIdFromIdentity(resourceId);
    const urlMatch = RESOURCE_URL_PATTERN.exec(content || "");
    return urlMatch ? urlMatch[1] : undefined;
}

function mediaIdentityFromValue(value: string | undefined) {
    const key = value?.trim();
    if (!key || key.startsWith("data:") || key.startsWith("blob:")) return undefined;
    const resourceId = resourceIdFromStorageKey(key);
    if (resourceId) return resourceIdFromIdentity(resourceId);
    const urlMatch = RESOURCE_URL_PATTERN.exec(key);
    if (urlMatch) return urlMatch[1];
    // 本地儲存 key（image:/video:…）上傳時以 key 為冪等標識，同名必得同資源，可作穩定身份。
    return LOCAL_MEDIA_KEY_PATTERN.test(key) ? key : undefined;
}

function resourceIdFromIdentity(candidate: string | undefined) {
    const id = candidate?.trim() || "";
    return RESOURCE_ID_PATTERN.test(id) ? id : undefined;
}

/** 映象服務端 guard 的素材資源定位來源：storageKey、resourceKey 與 URL 形態的資源引用。 */
function assetIdentities(asset: Asset) {
    const identities = new Set<string>();
    const data = asset.kind === "text" || asset.kind === "entity" ? undefined : asset.data;
    const values = [
        typeof asset.metadata?.resourceKey === "string" ? asset.metadata.resourceKey : "",
        assetStorageKey(asset) || "",
        ...(data && "url" in data && typeof data.url === "string" ? [data.url] : []),
        ...(data && "dataUrl" in data && typeof data.dataUrl === "string" ? [data.dataUrl] : []),
        asset.coverUrl || "",
    ];
    for (const value of values) {
        const identity = mediaIdentityFromValue(value);
        if (identity) identities.add(identity);
    }
    return identities;
}
