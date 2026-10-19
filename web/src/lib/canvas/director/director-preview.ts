import type { DirectorScene, DirectorShot } from "../../../types/director";

/** 預覽來源的判定結果。image 之外都不渲染 <img>。 */
export type DirectorPreviewSource = { kind: "image"; url: string } | { kind: "loading" } | { kind: "empty" };

/** 讀取畫布節點正文；節點已刪除或無正文時返回空。 */
export type DirectorNodeContentReader = (nodeId: string | undefined) => string | undefined;

function usableContent(read: DirectorNodeContentReader, nodeId: string | undefined) {
    if (!nodeId) return null;
    const content = read(nodeId);
    if (!content) return null;
    // 節點被刪除、正文缺失或只有空白都必須安全落空；
    // 有效正文返回 trim 後的值，避免首尾空白拼進 <img src> 造成畸形請求。
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
}

/** 取當前鏡頭：優先 metadata 指定，其次場景第一個。 */
export function resolveDirectorActiveShot(scene: DirectorScene | null, shotId: string | undefined): DirectorShot | undefined {
    if (!scene) return undefined;
    return scene.shots?.find((item) => item.id === shotId) || scene.shots?.[0];
}

/**
 * 預覽來源優先順序（嚴格自上而下）：
 * 1. 本節點持久化封面
 * 2. node.metadata.directorPreviewNodeId 指向的畫布節點正文
 * 3. 當前 DirectorShot.previewNodeId 指向的畫布節點正文（補 metadata 丟失）
 * 4. scene 為 null：場景尚在準備（loading）
 * 5. 其餘：誠實空態
 * 不改動任何 scene/node 狀態，只做讀取判定。
 */
export function resolveDirectorPreviewSource(input: { scene: DirectorScene | null; shot: DirectorShot | undefined; coverUrl?: string; failedUrl?: string | null; previewNodeId: string | undefined; readNodeContent: DirectorNodeContentReader }): DirectorPreviewSource {
    const coverUrl = input.coverUrl?.trim();
    if (coverUrl && coverUrl !== input.failedUrl) return { kind: "image", url: coverUrl };
    const fromMetadata = usableContent(input.readNodeContent, input.previewNodeId);
    if (fromMetadata && fromMetadata !== input.failedUrl) return { kind: "image", url: fromMetadata };
    const fromShot = usableContent(input.readNodeContent, input.shot?.previewNodeId);
    if (fromShot && fromShot !== input.failedUrl) return { kind: "image", url: fromShot };
    if (!input.scene) return { kind: "loading" };
    return { kind: "empty" };
}

/**
 * 載入失敗的門控：記錄「失敗的那個 URL」而不是布林標記。
 * 語義邊界：新給出的壞 URL 仍會先渲染一次，瀏覽器隨後才發出 onError —— 無法避免這一幀。
 * 本門控保證的是：同一個已失敗的 URL 不會被反覆渲染，且換成另一個 URL 時自動重試，
 * 無需外部手動清理標記。
 */
export function gateDirectorPreviewFailure(source: DirectorPreviewSource, failedUrl: string | null): DirectorPreviewSource {
    if (source.kind !== "image" || !failedUrl) return source;
    return source.url === failedUrl ? { kind: "empty" } : source;
}
