import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { IMAGE_FILES_STORE_NAME, localForageInstance } from "@/lib/localforage-storage";
import { isLocalRuntimeMode } from "@/lib/runtime-mode";
import { getActiveUserScope } from "@/lib/user-scope";
import { assertUserScope, captureUserScope, isUserScopeAbandonedError, type CapturedUserScope } from "@/lib/user-scope-guard";
import { importResourceFromUrl, isResourceUrl, resourceFileUrl, resourceIdFromStorageKey, resourceStorageKey, ResourceUploadError, uploadResourceFile } from "@/services/api/resources";
import { cacheResourceObjectUrl, getCachedResourceBlob, getCachedResourceObjectUrl, primeResourceBlobCache } from "@/services/resource-blob-cache";
import { usesBrowserLocalResourceStore } from "@/services/workspace-resource-storage";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    /**
     * true 表示直傳失敗、檔案當前只存在於本機 IndexedDB。
     * 本地 Go 資源服務不可用時，檔案會暫存於本機 IndexedDB；此時 `url`
     * 是頁面級 objectURL，重新整理後需要從本地快取恢復。UI 不得把它說成已寫入資源庫。
     */
    pendingRemoteUpload?: boolean;
    /** 直傳失敗原因，僅在 pendingRemoteUpload 為 true 時有值，供 UI 如實告知使用者。 */
    remoteUploadError?: string;
};

const store = localForageInstance(IMAGE_FILES_STORE_NAME);
const objectUrls = new Map<string, string>();

export async function uploadImage(input: string | Blob, onProgress?: (uploadedBytes: number, totalBytes: number) => void, expectedScope?: CapturedUserScope): Promise<UploadedImage> {
    // 同一個邏輯上傳在本地資源服務不可用後會退回 IndexedDB。
    // 提前生成穩定 key，確保恢復路徑仍能定位同一份本地媒體。
    const expected = expectedScope ?? captureUserScope();
    const storageKey = `image:${expected.userScope}:${nanoid()}`;
    const localRuntime = isLocalRuntimeMode();
    if (!localRuntime && typeof input === "string" && shouldImportRemoteImage(input)) {
        try {
            assertUserScope(expected);
            const resource = await importResourceFromUrl(input, "image", { idempotencyKey: storageKey, expectedScope: expected });
            assertUserScope(expected);
            return {
                url: resource.publicUrl || resourceFileUrl(resource.id),
                storageKey: resourceStorageKey(resource.id),
                width: resource.width || 1024,
                height: resource.height || 1024,
                bytes: resource.size || 0,
                mimeType: resource.mimeType || "image/png",
            };
        } catch (error) {
            if (isUserScopeAbandonedError(error)) throw error;
            // Keep the browser-side path as a fallback for CORS-enabled HTTPS images.
        }
    }
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    assertUserScope(expected);
    const previewUrl = URL.createObjectURL(blob);
    try {
        const meta = await readImageMeta(previewUrl);
        assertUserScope(expected);
        if (usesBrowserLocalResourceStore()) {
            assertUserScope(expected);
            await store.setItem(storageKey, blob);
            objectUrls.set(storageKey, previewUrl);
            return { url: previewUrl, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
        }
        let remoteUploadError = "";
        // The desktop Go resource service is local storage, not cloud sync. Use it
        // as the canonical durable store in local mode; IndexedDB remains a safe
        // browser fallback when the backend is temporarily unavailable.
        try {
            const resource = await uploadResourceFile(blob, "image", { width: meta.width, height: meta.height, fileName: input instanceof File ? input.name : undefined, idempotencyKey: storageKey, expectedScope: expected }, onProgress);
            assertUserScope(expected);
            try {
                await primeResourceBlobCache(resourceStorageKey(resource.id), blob, expected);
            } catch (error) {
                if (isUserScopeAbandonedError(error)) throw error;
            }
            URL.revokeObjectURL(previewUrl);
            return {
                url: resource.publicUrl || resourceFileUrl(resource.id),
                storageKey: resourceStorageKey(resource.id),
                width: resource.width || meta.width,
                height: resource.height || meta.height,
                bytes: resource.size || blob.size,
                mimeType: resource.mimeType || blob.type || meta.mimeType,
            };
        } catch (error) {
            if (isUserScopeAbandonedError(error)) throw error;
            // 鑑權失效、越權、體積超限這類失敗重傳也是同樣結果，不能退化成"稍後自動同步"。
            if (error instanceof ResourceUploadError && error.permanent) throw error;
            remoteUploadError = error instanceof Error ? error.message : "圖片直傳失敗";
        }
        assertUserScope(expected);
        // 本地服務暫時不可用時退回瀏覽器本地快取，確保當前創作不中斷。
        await store.setItem(storageKey, blob);
        const url = previewUrl;
        objectUrls.set(storageKey, url);
        return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType, pendingRemoteUpload: true, remoteUploadError };
    } catch (error) {
        URL.revokeObjectURL(previewUrl);
        throw error;
    }
}

function shouldImportRemoteImage(input: string) {
    return /^https?:\/\//i.test(input) && !isResourceUrl(input);
}

export async function resolveImageUrl(storageKey?: string, fallback = "", options?: { cacheMiss?: boolean }) {
    if (!storageKey) return fallback;
    const resourceId = resourceIdFromStorageKey(storageKey);
    if (resourceId) {
        const cached = await getCachedResourceObjectUrl(storageKey).catch(() => "");
        if (cached) return cached;
        if (options?.cacheMiss) {
            const populated = await cacheResourceObjectUrl(storageKey).catch(() => "");
            if (populated) return populated;
        }
        return resourceFileUrl(resourceId);
    }
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    if (resourceIdFromStorageKey(storageKey)) return getCachedResourceBlob(storageKey);
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    if (resourceIdFromStorageKey(storageKey)) return primeResourceBlobCache(storageKey, blob);
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string; name?: string; type?: string; mimeType?: string }) {
    if (image.storageKey) {
        const blob = await getImageBlob(image.storageKey);
        if (blob) return blobToDataUrl(await normalizeImageBlob(blob, image.name || image.url));
    }
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url) return url;
    if (url.startsWith("data:image/")) return url;
    if (url.startsWith("data:")) return blobToDataUrl(await normalizeImageBlob(await (await fetch(url)).blob(), image.name));
    const blob = await (await fetch(url, { credentials: isResourceUrl(url) ? "include" : "same-origin" })).blob();
    return blobToDataUrl(await normalizeImageBlob(blob, image.name || url));
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            if (resourceIdFromStorageKey(key)) return;
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown, scope = getActiveUserScope()) {
    const usedKeys = collectImageStorageKeys(usedData);
    const currentPrefixes = [`image:${scope}:`, `generation-image:${scope}:`];
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (currentPrefixes.some((prefix) => key.startsWith(prefix)) && !usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && (value.storageKey.startsWith("image:") || value.storageKey.startsWith("generation-image:") || resourceIdFromStorageKey(value.storageKey))) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("讀取圖片失敗"));
        reader.readAsDataURL(blob);
    });
}

async function normalizeImageBlob(blob: Blob, sourceName = "") {
    if (blob.type.startsWith("image/")) return blob;
    const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    const mimeType = detectImageMimeType(bytes) || imageMimeTypeFromName(sourceName);
    if (!mimeType) throw new Error("無法識別參考圖片格式，請重新上傳 PNG、JPEG、WebP 或 GIF 圖片");
    return blob.slice(0, blob.size, mimeType);
}

function detectImageMimeType(bytes: Uint8Array) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith("GIF8")) return "image/gif";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
    return "";
}

function imageMimeTypeFromName(value: string) {
    const path = value.toLowerCase().split(/[?#]/)[0];
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".gif")) return "image/gif";
    if (path.endsWith(".bmp")) return "image/bmp";
    return "";
}
