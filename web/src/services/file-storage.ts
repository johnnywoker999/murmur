import { nanoid } from "nanoid";

import { getActiveUserScope } from "@/lib/user-scope";
import { assertUserScope, captureUserScope, isUserScopeAbandonedError, type CapturedUserScope } from "@/lib/user-scope-guard";
import { captureVideoPoster, detectVideoAudioTrackFromBlob } from "@/lib/video-poster";
import { resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, ResourceUploadError, uploadResourceFile } from "@/services/api/resources";
import { apiBaseURL } from "@/services/api/request";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { createChannelTransport } from "@/services/api/channel-transport";
import { useConfigStore } from "@/stores/use-config-store";
import { cacheResourceObjectUrl, getCachedResourceBlob, getCachedResourceObjectUrl, primeResourceBlobCache } from "@/services/resource-blob-cache";
import { cleanupLocalMedia, deleteLocalMedia, getLocalMediaBlob, resolveLocalMediaUrl, saveLocalMedia, setLocalMediaBlob } from "@/services/local-media-repository";
import { usesBrowserLocalResourceStore } from "@/services/workspace-resource-storage";

export type UploadedFile = {
    url: string;
    storageKey: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
    hasAudio?: boolean;
    preview?: UploadedImage;
    /**
     * true 表示本地 Go 資源服務暫時不可用、檔案當前只存在於本機 IndexedDB。
     * 在那之前 `url` 是頁面級 objectURL，重新整理後需要從本地快取恢復。
     */
    pendingRemoteUpload?: boolean;
    /** 直傳失敗原因，僅在 pendingRemoteUpload 為 true 時有值。 */
    remoteUploadError?: string;
};

export async function uploadMediaFile(input: Blob, prefix = "file", onProgress?: (uploadedBytes: number, totalBytes: number) => void, expectedScope?: CapturedUserScope): Promise<UploadedFile> {
    // 直傳和失敗後的本地同步必須複用同一上傳身份，避免響應丟失後建立第二個物件。
    const expected = expectedScope ?? captureUserScope();
    const storageKey = `${prefix}:${expected.userScope}:${nanoid()}`;
    const blob = input;
    const isVideo = prefix === "video" || blob.type.startsWith("video/");
    const previewUrl = URL.createObjectURL(blob);
    let retainPreviewUrl = false;

    try {
        let captured: Awaited<ReturnType<typeof captureVideoPoster>> | undefined;
        if (isVideo) {
            try {
                captured = await captureVideoPoster(previewUrl);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
                // 封面和軌道資訊屬於展示增強：失敗不阻斷原檔案上傳，但必須留下可診斷訊號。
                console.warn("讀取影片封面與媒體資訊失敗，繼續上傳原檔案", { mimeType: blob.type, bytes: blob.size, error });
            }
        }
        assertUserScope(expected);

        // 瀏覽器軌道探測對部分 MP4/MOV 會誤報；只有未確認存在音軌時才做二次解析，
        // 避免正常上傳重複讀取整個檔案。
        let parsedHasAudio: boolean | undefined;
        if (isVideo && captured?.hasAudio !== true) {
            try {
                parsedHasAudio = await detectVideoAudioTrackFromBlob(blob);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
                console.warn("解析影片音軌失敗，繼續上傳但不寫入音軌結論", { mimeType: blob.type, bytes: blob.size, error });
            }
        }
        assertUserScope(expected);
        const resolvedHasAudio = parsedHasAudio ?? (captured?.hasAudio === false ? undefined : captured?.hasAudio);

        let meta: { width?: number; height?: number; durationMs?: number; hasAudio?: boolean };
        if (captured) {
            meta = { width: captured.poster ? captured.width : undefined, height: captured.poster ? captured.height : undefined, durationMs: captured.durationMs, hasAudio: resolvedHasAudio };
        } else if (blob.type.startsWith("audio/")) {
            try {
                meta = await readAudioMeta(previewUrl);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
                console.warn("讀取音訊時長失敗，繼續上傳原檔案", { mimeType: blob.type, bytes: blob.size, error });
                meta = {};
            }
        } else {
            meta = { hasAudio: resolvedHasAudio };
        }
        assertUserScope(expected);

        let poster: UploadedImage | undefined;
        if (captured?.poster) {
            try {
                poster = await uploadImage(captured.poster, undefined, expected);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
                // 預覽圖失敗不應把已經可用的影片降級成本地檔案；影片本體仍按強校驗上傳。
                console.warn("上傳影片預覽圖失敗，繼續儲存影片本體", { mimeType: blob.type, bytes: blob.size, error });
            }
        }
        assertUserScope(expected);

        if (usesBrowserLocalResourceStore()) {
            assertUserScope(expected);
            await saveLocalMedia(storageKey, blob, previewUrl);
            retainPreviewUrl = true;
            return { url: previewUrl, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta, preview: poster };
        }

        let remoteUploadError = "";
        // The native desktop Go resource service is the canonical local store.
        // Browser local mode keeps IndexedDB as its offline/development store.
        try {
            const kind = isVideo ? "video" : prefix === "audio" || blob.type.startsWith("audio/") ? "audio" : "file";
            const resource = await uploadResourceFile(blob, kind, { ...meta, fileName: input instanceof File ? input.name : undefined, idempotencyKey: storageKey, expectedScope: expected }, onProgress);
            assertUserScope(expected);
            try {
                await primeResourceBlobCache(resourceStorageKey(resource.id), blob, expected);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
                // 快取隻影響後續讀取效能，服務端資源已經成功落盤，不得把快取失敗誤報為上傳失敗。
                console.warn("預熱媒體快取失敗，服務端資源已儲存", { resourceId: resource.id, error });
            }
            return {
                url: resource.publicUrl || resourceFileUrl(resource.id),
                storageKey: resourceStorageKey(resource.id),
                bytes: resource.size || blob.size,
                mimeType: resource.mimeType || blob.type || "application/octet-stream",
                width: resource.width || meta.width,
                height: resource.height || meta.height,
                durationMs: resource.durationMs || meta.durationMs,
                hasAudio: meta.hasAudio,
                preview: poster,
            };
        } catch (error) {
            if (isUserScopeAbandonedError(error)) throw error;
            // 與圖片上傳同一套判定：永久性失敗必須當場暴露，不能混進“稍後自動同步”。
            if (error instanceof ResourceUploadError && error.permanent) throw error;
            remoteUploadError = error instanceof Error ? error.message : "媒體直傳失敗";
        }

        assertUserScope(expected);
        // 本地資源服務暫時不可用時退回瀏覽器本地快取，保持當前編輯可用。
        await saveLocalMedia(storageKey, blob, previewUrl);
        retainPreviewUrl = true;
        return {
            url: previewUrl,
            storageKey,
            bytes: blob.size,
            mimeType: blob.type || "application/octet-stream",
            ...meta,
            preview: poster,
            pendingRemoteUpload: true,
            remoteUploadError,
        };
    } finally {
        // 只有本地降級結果需要把 objectURL 留給頁面；成功上傳和所有異常路徑都及時釋放。
        if (!retainPreviewUrl) URL.revokeObjectURL(previewUrl);
    }
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    // Older canvas snapshots stored resource paths without the `/api` prefix.
    // In desktop mode those paths are interpreted by Wails as asset-server
    // paths and return its plain-text 404 page. Normalize them before handing
    // the URL to a native media element.
    if (!storageKey) {
        const legacyResource = fallback.match(/^\/resources\/([^/?#]+)\/file(?:[?#].*)?$/u);
        if (legacyResource) {
            const suffix = fallback.slice(legacyResource[0].indexOf("/file") + "/file".length);
            return `${String(apiBaseURL).replace(/\/+$/u, "")}/resources/${encodeURIComponent(legacyResource[1])}/file${suffix}`;
        }
        return await materializeExternalMedia(fallback);
    }
    const resourceId = resourceIdFromStorageKey(storageKey);
    if (resourceId) {
        const cached = await getCachedResourceObjectUrl(storageKey).catch(() => "");
        // A native <video> cannot attach the desktop launch token. If the
        // resource is not already cached, eagerly fetch it through the
        // authenticated client and hand the player a Blob URL.
        if (cached) return cached;
        const hydrated = await cacheResourceObjectUrl(storageKey).catch(() => "");
        return hydrated || resourceFileUrl(resourceId);
    }
    return resolveLocalMediaUrl(storageKey, fallback);
}

// MCP-created generation nodes may contain a provider URL instead of a local
// resource key. Native media elements cannot attach the provider Bearer token,
// so materialize that URL once through the configured channel and play the
// resulting local/blob resource. This also makes old canvases self-healing.
const externalMediaInflight = new Map<string, Promise<string>>();
async function materializeExternalMedia(url: string) {
    if (!/^https?:\/\//i.test(url) || !/enterprise\.beefapi\.com/i.test(url)) return url;
    const existing = externalMediaInflight.get(url);
    if (existing) return existing;
    const pending = (async () => {
        const expected = captureUserScope();
        const config = useConfigStore.getState().config;
        const channel =
            config.channels.find((item) => {
                try {
                    return new URL(item.baseUrl).hostname === new URL(url).hostname;
                } catch {
                    return false;
                }
            }) || config.channels.find((item) => /beefapi/i.test(`${item.id} ${item.name} ${item.baseUrl}`));
        if (!channel) return url;
        const blob = await createChannelTransport(
            {
                baseUrl: channel.baseUrl,
                apiKey: channel.credentialRef ? "" : channel.apiKey,
                apiFormat: channel.apiFormat,
                headers: channel.headers,
                credentialRef: channel.credentialRef || (channel.id === "beefapi" ? "beefapi-enterprise" : undefined),
            },
            "video",
        ).getBlob(url);
        const key = `external-video:${expected.userScope}:${nanoid()}`;
        assertUserScope(expected);
        if (usesBrowserLocalResourceStore()) {
            const objectUrl = URL.createObjectURL(blob);
            await saveLocalMedia(key, blob, objectUrl);
            return objectUrl;
        }
        const resource = await uploadResourceFile(blob, "video", { fileName: "generated-video.mp4", idempotencyKey: key, expectedScope: expected });
        assertUserScope(expected);
        const storageKey = resourceStorageKey(resource.id);
        try {
            await primeResourceBlobCache(storageKey, blob, expected);
        } catch (error) {
            if (isUserScopeAbandonedError(error)) throw error;
        }
        return (await getCachedResourceObjectUrl(storageKey).catch(() => "")) || resourceFileUrl(resource.id);
    })();
    externalMediaInflight.set(url, pending);
    try {
        return await pending;
    } finally {
        externalMediaInflight.delete(url);
    }
}

export async function getMediaBlob(storageKey: string) {
    if (resourceIdFromStorageKey(storageKey)) return getCachedResourceBlob(storageKey);
    return getLocalMediaBlob(storageKey);
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    if (resourceIdFromStorageKey(storageKey)) return primeResourceBlobCache(storageKey, blob);
    return setLocalMediaBlob(storageKey, blob);
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await deleteLocalMedia(Array.from(keys).filter((key) => !resourceIdFromStorageKey(key)));
}

export async function cleanupUnusedMedia(usedData: unknown, scope = getActiveUserScope()) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const currentScope = scope;
    await cleanupLocalMedia(usedKeys, currentScope);
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.includes(":") || resourceIdFromStorageKey(value.storageKey))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
