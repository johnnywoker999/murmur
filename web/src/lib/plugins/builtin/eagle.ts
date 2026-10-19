import { nanoid } from "nanoid";

import { addEagleItem, createEagleFolder, downloadEagleItem, eagleItemFileUrl, eagleItemThumbnailUrl, getEagleLibrary, listEagleItems, type EagleFolder, type EagleItem } from "@/services/api/eagle";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import type { Asset } from "@/stores/use-asset-store";
import { registerPlugin } from "../plugin-registry";
import type { AssetSourceProvider, ExternalAssetItem, PluginHostContext, RegisteredPlugin } from "../plugin-types";

export const EAGLE_PLUGIN_ID = "eagle-asset-connector";
export const EAGLE_DEFAULT_BASE_URL = "http://127.0.0.1:41595";

const eaglePluginDocumentation = `# Eagle 素材庫

Eagle 外掛把桌面 Eagle 資料庫接入站點素材面板。瀏覽器不會直接訪問 Eagle：所有讀取、搜尋、下載和寫入請求先到站點後端，再由後端訪問管理員配置的 Eagle Local API 地址。

## 使用前準備

1. 安裝並啟動 Eagle 桌面客戶端，開啟要使用的資料庫。
2. 確認 Eagle Local API 可用；預設地址為 \`${EAGLE_DEFAULT_BASE_URL}\`。
3. 以管理員身份進入外掛設定，填寫 Base URL 並讀取資料夾。
4. 儲存配置後，在素材庫選擇 Eagle 來源，即可瀏覽和匯入素材。

> Eagle 必須保持執行。關閉客戶端、切換資料庫或修改本地 API 埠後，站點會收到連線失敗，不能用空列表掩蓋。

## 站點後端介面

| 操作 | 站點介面 | 用途 |
| --- | --- | --- |
| 讀取資料庫 | \`GET /api/plugins/eagle/library?baseUrl=...\` | 獲取 Eagle 版本、資料庫名稱和資料夾樹 |
| 列出素材 | \`GET /api/plugins/eagle/items\` | 按資料夾、關鍵詞和分頁讀取素材 |
| 縮圖 | \`GET /api/plugins/eagle/items/{id}/thumbnail\` | 代理 Eagle 縮圖 |
| 原檔案 | \`GET /api/plugins/eagle/items/{id}/file\` | 下載並匯入站點資源儲存 |
| 寫入素材 | \`POST /api/plugins/eagle/items?baseUrl=...\` | 把圖片、影片或音訊寫回 Eagle |
| 建立資料夾 | \`POST /api/plugins/eagle/folders?baseUrl=...\` | 在 Eagle 中建立目錄 |

這些是站點內部登入態 API，使用 Cookie 鑑權；不要把它們當作 Eagle 官方介面直接呼叫。

## 瀏覽與搜尋

外掛讀取 Eagle 資料夾樹並生成完整層級路徑。素材列表支援 \`folderId\`、\`keyword\`、\`limit\`、\`offset\`。資料夾列表在當前外掛例項內快取；建立資料夾後會失效並重新讀取。切換 Eagle 資料庫時應重新開啟外掛設定確認目錄。

## 匯入到站點

匯入時，後端代理下載 Eagle 原檔案，前端再寫入站點自己的圖片或媒體儲存。圖片保留可識別的寬高和 MIME；影片、音訊和其他模型檔案保留位元組數、副檔名、Eagle item ID、資料夾和來源後設資料。

| Eagle 內容 | 站點結果 | 當前限制 |
| --- | --- | --- |
| 圖片 | 圖片素材 | 使用原圖，不把縮圖當成品 |
| 影片 | 影片素材 | 後設資料缺寬高時使用 1280×720 展示兜底，不改寫原檔案 |
| 音訊 | 音訊素材 | 時長以瀏覽器媒體探測結果為準 |
| 其他檔案 | 模型素材 | 僅作為檔案資源儲存 |
| 文本/實體 | 不支援 | 匯入會明確報錯 |

## 寫回 Eagle

外掛可把站點圖片、影片或音訊轉換為 data URL，再呼叫 Eagle 新增素材。已有本地 Blob 優先直接讀取；只有沒有本地副本時才下載遠端生成地址。預設單個手動上傳檔案不超過 96 MB，且 MIME 必須以 \`image/\`、\`video/\` 或 \`audio/\` 開頭。

啟用“自動上傳生成結果”後，生成資產可以寫入配置的目標資料夾。自動寫回失敗必須顯示為寫回失敗，不應把“站點已儲存”誤報為“Eagle 已儲存”。

## 配置欄位

| 欄位 | 說明 | 預設值 |
| --- | --- | --- |
| \`baseUrl\` | Eagle Local API 地址，只允許明確的 HTTP(S) 地址 | \`${EAGLE_DEFAULT_BASE_URL}\` |
| \`autoUploadGenerated\` | 是否把支援的生成結果自動寫回 Eagle | 開啟 |
| \`generatedFolderId\` | 自動寫回目標資料夾 ID | 空，使用 Eagle 預設位置 |

## 安全邊界

- Eagle 通常執行在本機。後端必須繼續執行私網目標校驗，只允許管理員明確配置的本機服務，不能把該代理變成任意 URL 抓取器。
- \`baseUrl\` 只儲存服務地址，不包含 Token、Cookie 或查詢金鑰。
- 原檔案和 data URL 不進入日誌、localStorage 或錯誤上報。
- 多使用者部署中，伺服器的 \`127.0.0.1\` 指伺服器自身，不是訪問者電腦；請使用 Eagle 官方可訪問的客戶端連線方式，不能假裝直連可用。

## 常見問題

| 現象 | 檢查項 |
| --- | --- |
| 無法讀取資料庫 | Eagle 是否執行、Base URL/埠、後端能否訪問該主機 |
| 資料夾為空 | Eagle 當前開啟的資料庫、篩選條件、資料夾層級 |
| 有縮圖但匯入失敗 | 原檔案是否仍存在、檔案許可權、後端響應狀態 |
| 寫回失敗 | 檔案大小/MIME、目標資料夾是否存在、遠端生成連結是否過期 |
| 部署伺服器連線不到本機 Eagle | 網路拓撲不成立，需要本地橋接而不是更換前端 URL |

## 官方資料

- [Eagle API Documentation](https://api.eagle.cool/)
- [Eagle 產品與下載](https://eagle.cool/)
`;

export const eagleAssetPlugin: RegisteredPlugin = {
    manifest: {
        id: EAGLE_PLUGIN_ID,
        name: "Eagle 素材庫",
        version: "0.3.0",
        publishedAt: "2026-08-21",
        updatedAt: "2026-08-22",
        apiVersion: "beeftv.plugin/v1",
        description: "把 Eagle 作為站點的外部素材來源，直接瀏覽原始資料夾並讀寫 Eagle 檔案。",
        documentation: eaglePluginDocumentation,
        author: "開源社群",
        permissions: ["asset.read", "asset.search", "asset.upload", "external.open"],
        trusted: true,
        configuration: {
            fields: [
                { name: "baseUrl", type: "url", label: "Eagle Base URL", required: true, default: EAGLE_DEFAULT_BASE_URL },
                { name: "autoUploadGenerated", type: "boolean", label: "自動上傳生成結果", default: true },
                { name: "generatedFolderId", type: "string", label: "生成結果資料夾" },
            ],
        },
        runtime: { web: "trusted-backend" },
        contributes: { assetSources: ["eagle"] },
    },
    createAssetSource: ({ config }: PluginHostContext) => {
        const configuredBaseUrl = config.baseUrl;
        return createEagleAssetSource(typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() ? configuredBaseUrl.trim() : undefined);
    },
};

export function createEagleAssetSource(baseUrl = EAGLE_DEFAULT_BASE_URL): AssetSourceProvider {
    let folderCache: EagleFolder[] | null = null;

    const getFolders = async (signal?: AbortSignal) => {
        if (signal?.aborted) throw new DOMException("請求已取消", "AbortError");
        if (!folderCache) folderCache = (await getEagleLibrary(baseUrl)).library.folders;
        return folderCache;
    };

    return {
        listFolders: async (signal) => (await getFolders(signal)).map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId })),
        list: async (query) => {
            const [result, folders] = await Promise.all([listEagleItems({ baseUrl, folderId: query.folderId, keyword: query.keyword, limit: query.limit, offset: query.offset }), getFolders(query.signal)]);
            const pathMap = buildFolderPathMap(folders);
            return result.items.map((item) => toExternalItem(item, baseUrl, pathMap));
        },
        importAsset: (item, signal) => importEagleAsset(item, baseUrl, signal),
        uploadAsset: (asset, signal) => uploadEagleAsset(asset, baseUrl, undefined, signal),
        uploadAssetToFolder: (asset, folderId, signal) => uploadEagleAsset(asset, baseUrl, folderId, signal),
        uploadFile: (file, folderId, signal) => uploadEagleFile(file, baseUrl, folderId, signal),
        createFolder: async (name, parentId) => {
            await createEagleFolder(baseUrl, { name, parentId });
            folderCache = null;
        },
    };
}

async function importEagleAsset(item: ExternalAssetItem, baseUrl: string, signal?: AbortSignal): Promise<Asset> {
    const kind = item.kind;
    if (kind === "text" || kind === "entity") throw new Error("當前 Eagle 匯入暫不支援文本或實體素材");
    const blob = await downloadEagleItem(item.id, baseUrl, signal);
    const now = new Date().toISOString();
    const metadata = {
        source: "eagle",
        eagle: {
            itemId: item.id,
            baseUrl,
            folderId: item.folderId,
            folderIds: item.folderIds || [],
            folderPath: item.folderPath || [],
            extension: item.metadata?.extension,
        },
    };
    if (kind === "image") {
        const uploaded = await uploadImage(blob);
        return {
            id: nanoid(), kind, title: item.title, coverUrl: uploaded.url, tags: item.tags || [], source: "Eagle 素材庫", createdAt: now, updatedAt: now, metadata,
            data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: item.width || uploaded.width, height: item.height || uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType },
        };
    }
    const uploaded = await uploadMediaFile(blob, `eagle-${kind}`);
    if (kind === "video") {
        return {
            id: nanoid(), kind, title: item.title, coverUrl: "", tags: item.tags || [], source: "Eagle 素材庫", createdAt: now, updatedAt: now, metadata,
            data: { url: uploaded.url, storageKey: uploaded.storageKey, width: item.width || uploaded.width || 1280, height: item.height || uploaded.height || 720, bytes: uploaded.bytes, mimeType: uploaded.mimeType },
        };
    }
    if (kind === "audio") {
        return {
            id: nanoid(), kind, title: item.title, coverUrl: "", tags: item.tags || [], source: "Eagle 素材庫", createdAt: now, updatedAt: now, metadata,
            data: { url: uploaded.url, storageKey: uploaded.storageKey, durationMs: uploaded.durationMs, bytes: uploaded.bytes, mimeType: uploaded.mimeType },
        };
    }
    return {
        id: nanoid(), kind: "model", title: item.title, coverUrl: "", tags: item.tags || [], source: "Eagle 素材庫", createdAt: now, updatedAt: now, metadata,
        data: { url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, fileName: item.title },
    };
}

type EagleWritableAsset = Extract<Asset, { kind: "image" | "video" | "audio" }>;

async function uploadEagleAsset(asset: Asset, baseUrl: string, folderId?: string, signal?: AbortSignal): Promise<ExternalAssetItem> {
    if (!isEagleWritableAsset(asset)) throw new Error("當前僅支援將圖片、影片或音訊寫回 Eagle");
    const dataUrl = await assetToDataUrl(asset, signal);
    const result = await addEagleItem(baseUrl, {
        url: dataUrl,
        name: eagleAssetName(asset),
        folderId,
        tags: asset.tags,
        annotation: asset.note,
        website: typeof asset.metadata?.eagle === "object" && asset.metadata.eagle && "url" in asset.metadata.eagle ? String(asset.metadata.eagle.url || "") : undefined,
    });
    return { id: result.item.id || "eagle:" + asset.id, title: eagleAssetName(asset), kind: asset.kind, tags: asset.tags, mimeType: asset.data.mimeType };
}

function isEagleWritableAsset(asset: Asset): asset is EagleWritableAsset {
    return asset.kind === "image" || asset.kind === "video" || asset.kind === "audio";
}

async function assetToDataUrl(asset: EagleWritableAsset, signal?: AbortSignal) {
    if (asset.kind === "image") {
        return imageToDataUrl({ dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, url: asset.data.dataUrl, name: asset.title, mimeType: asset.data.mimeType });
    }
    const stored = asset.data.storageKey ? await getMediaBlob(asset.data.storageKey) : null;
    if (stored) return fileToDataUrl(withMimeType(stored, asset.data.mimeType), signal);
    const url = asset.data.url;
    if (!url) throw new Error("生成結果沒有可寫入 Eagle 的媒體地址");
    if (url.startsWith("data:")) return url;
    const response = await fetch(url, { credentials: "include", signal });
    if (!response.ok) throw new Error("讀取生成媒體失敗，無法寫入 Eagle");
    return fileToDataUrl(withMimeType(await response.blob(), asset.data.mimeType), signal);
}

function eagleAssetName(asset: EagleWritableAsset) {
    const title = asset.title.trim() || (asset.kind === "image" ? "生成圖片" : asset.kind === "video" ? "生成影片" : "生成音訊");
    if (/\.[a-z0-9]{2,8}$/i.test(title)) return title;
    const extension = asset.kind === "image" ? extensionFromMime(asset.data.mimeType, "png") : asset.kind === "video" ? extensionFromMime(asset.data.mimeType, "mp4") : extensionFromMime(asset.data.mimeType, "mp3");
    return title + "." + extension;
}

function extensionFromMime(mimeType: string, fallback: string) {
    const value = mimeType.toLowerCase();
    if (value.includes("png")) return "png";
    if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
    if (value.includes("webm")) return "webm";
    if (value.includes("quicktime")) return "mov";
    if (value.includes("wav")) return "wav";
    if (value.includes("ogg")) return "ogg";
    if (value.includes("mp4")) return "mp4";
    if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
    return fallback;
}

function withMimeType(blob: Blob, mimeType: string) {
    return mimeType && blob.type !== mimeType ? blob.slice(0, blob.size, mimeType) : blob;
}
async function uploadEagleFile(file: File, baseUrl: string, folderId?: string, signal?: AbortSignal): Promise<ExternalAssetItem> {
    if (file.size > 96 * 1024 * 1024) throw new Error("單個檔案不能超過 96 MB");
    if (!isEagleMediaType(file.type)) throw new Error("Eagle 寫入目前支援圖片、影片和音訊檔案");
    const dataUrl = await fileToDataUrl(file, signal);
    const result = await addEagleItem(baseUrl, {
        url: dataUrl,
        name: file.name,
        folderId,
    });
    const itemId = result.item.id || "eagle:" + nanoid();
    const extension = file.name.includes(".") ? file.name.split(".").pop() || "" : "";
    return {
        id: itemId,
        title: file.name,
        kind: kindFromExtension(extension),
        thumbnailUrl: result.item.id ? eagleItemThumbnailUrl(result.item.id, baseUrl) : undefined,
        fileUrl: result.item.id ? eagleItemFileUrl(result.item.id, baseUrl) : undefined,
        mimeType: file.type || mimeTypeFromExtension(extension),
        bytes: file.size,
        folderId,
        folderIds: folderId ? [folderId] : [],
        metadata: { extension },
    };
}

function isEagleMediaType(mimeType: string) {
    const value = mimeType.toLowerCase();
    return value.startsWith("image/") || value.startsWith("video/") || value.startsWith("audio/");
}
function fileToDataUrl(file: Blob, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const cleanup = () => signal?.removeEventListener("abort", abort);
        const abort = () => {
            reader.abort();
            cleanup();
            reject(new DOMException("請求已取消", "AbortError"));
        };
        reader.onload = () => {
            cleanup();
            if (typeof reader.result !== "string") {
                reject(new Error("無法讀取待寫入的檔案"));
                return;
            }
            resolve(reader.result);
        };
        reader.onerror = () => {
            cleanup();
            reject(new Error("無法讀取待寫入的檔案"));
        };
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        reader.readAsDataURL(file);
    });
}

function toExternalItem(item: EagleItem, baseUrl: string, pathMap: Map<string, string[]>) {
    const kind = kindFromExtension(item.extension);
    const folderIds = item.folderIds || [];
    const tags = item.tags || [];
    return {
        id: item.id,
        title: item.name,
        kind,
        thumbnailUrl: eagleItemThumbnailUrl(item.id, baseUrl),
        fileUrl: eagleItemFileUrl(item.id, baseUrl),
        mimeType: mimeTypeFromExtension(item.extension),
        width: item.width,
        height: item.height,
        bytes: item.size,
        tags,
        folderId: folderIds[0],
        folderIds,
        folderPath: folderIds[0] ? pathMap.get(folderIds[0]) : [],
        description: item.annotation,
        metadata: { extension: item.extension, modificationTime: item.modificationTime, url: item.url, deleted: item.deleted },
    } satisfies ExternalAssetItem;
}

function buildFolderPathMap(folders: EagleFolder[]) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const result = new Map<string, string[]>();
    for (const folder of folders) {
        const path: string[] = [];
        const seen = new Set<string>();
        let current: EagleFolder | undefined = folder;
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            path.unshift(current.name);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        result.set(folder.id, path);
    }
    return result;
}

function kindFromExtension(extension: string): Asset["kind"] {
    const value = extension.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"].includes(value)) return "image";
    if (["mp4", "mov", "webm", "mkv", "avi"].includes(value)) return "video";
    if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(value)) return "audio";
    if (["glb", "gltf", "obj", "fbx", "usdz", "blend"].includes(value)) return "model";
    return "model";
}

function mimeTypeFromExtension(extension: string) {
    const value = extension.toLowerCase();
    if (["jpg", "jpeg"].includes(value)) return "image/jpeg";
    if (value === "png") return "image/png";
    if (value === "webp") return "image/webp";
    if (value === "gif") return "image/gif";
    if (value === "svg") return "image/svg+xml";
    if (value === "mp4") return "video/mp4";
    if (value === "webm") return "video/webm";
    if (value === "mp3") return "audio/mpeg";
    if (value === "wav") return "audio/wav";
    if (value === "glb") return "model/gltf-binary";
    return "application/octet-stream";
}


registerPlugin(eagleAssetPlugin);
