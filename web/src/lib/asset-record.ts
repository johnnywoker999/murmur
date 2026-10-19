import type { Asset, AssetKind, AssetStatus, AudioAsset, EntityAsset, ImageAsset, ModelAsset, TextAsset, VideoAsset } from "@/stores/use-asset-store";
import { parseAssetCategory } from "@/lib/asset-category";

const ASSET_KINDS: readonly AssetKind[] = ["text", "image", "video", "audio", "model", "entity"];
const ASSET_STATUSES: readonly AssetStatus[] = ["draft", "review", "confirmed", "archived"];

/**
 * 素材持久化合同的執行時邊界。它只接受能被後續業務安全消費的完整記錄，絕不通過空 URL、通配 MIME 或零尺寸偽造預設值。
 * 展示層可以隔離歷史壞記錄，但新增、更新和寫回前必須經過這裡的嚴格校驗。
 */

export function parseAssetRecord(value: unknown): Asset {
    if (!isRecord(value)) throw new Error("素材記錄不是物件");
    const id = requireTrimmedString(value, "id");
    const kind = requireTrimmedString(value, "kind");
    if (!ASSET_KINDS.includes(kind as AssetKind)) throw new Error(`不支援的素材型別 ${kind}`);
    const title = requireString(value, "title");
    const coverUrl = requireString(value, "coverUrl");
    const tags = requireStringArray(value.tags, "tags");
    const createdAt = requireString(value, "createdAt");
    const updatedAt = requireString(value, "updatedAt");
    const folderId = optionalTrimmedString(value, "folderId");
    const status = optionalAssetStatus(value.status);
    const primaryVersionId = optionalTrimmedString(value, "primaryVersionId");
    const source = optionalString(value, "source");
    const note = optionalString(value, "note");
    const arkAssetId = optionalTrimmedString(value, "arkAssetId");
    const portraitCertified = optionalBoolean(value, "portraitCertified");
    const metadata = optionalRecord(value.metadata, "metadata");
    const category = value.category === undefined ? undefined : parseAssetCategory(value.category);
    const data = requireRecord(value.data, "data");
    const base = {
        id,
        title,
        coverUrl,
        tags,
        createdAt,
        updatedAt,
        ...(folderId ? { folderId } : {}),
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(primaryVersionId ? { primaryVersionId } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(arkAssetId ? { arkAssetId } : {}),
        ...(portraitCertified !== undefined ? { portraitCertified } : {}),
        ...(metadata ? { metadata } : {}),
    };

    if (kind === "text") {
        return { ...base, kind, data: { content: requireString(data, "content") } } satisfies TextAsset;
    }
    if (kind === "image") {
        const parsed = {
            dataUrl: requireString(data, "dataUrl"),
            storageKey: optionalString(data, "storageKey"),
            width: requirePositiveNumber(data, "width"),
            height: requirePositiveNumber(data, "height"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "image"),
        };
        requireMediaLocator(parsed.dataUrl, parsed.storageKey, "圖片", "dataUrl");
        return { ...base, kind, data: parsed } satisfies ImageAsset;
    }
    if (kind === "video") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            // 上游影片結果經常不帶 width/height。0 表示未知，不是偽造尺寸；
            // 若按「必須大於 0」拒絕，生成成功的影片會在入庫時被判失敗。
            width: requireNonNegativeNumber(data, "width"),
            height: requireNonNegativeNumber(data, "height"),
            durationMs: optionalNonNegativeNumber(data, "durationMs"),
            hasAudio: optionalBoolean(data, "hasAudio"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "video"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, "影片", "url");
        return { ...base, kind, data: parsed } satisfies VideoAsset;
    }
    if (kind === "audio") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            durationMs: optionalNonNegativeNumber(data, "durationMs"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireMediaMimeType(data, "audio"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, "音訊", "url");
        return { ...base, kind, data: parsed } satisfies AudioAsset;
    }
    if (kind === "model") {
        const parsed = {
            url: requireString(data, "url"),
            storageKey: optionalString(data, "storageKey"),
            bytes: requireNonNegativeNumber(data, "bytes"),
            mimeType: requireConcreteMimeType(data),
            fileName: requireTrimmedString(data, "fileName"),
        };
        requireMediaLocator(parsed.url, parsed.storageKey, "模型", "url");
        return { ...base, kind, data: parsed } satisfies ModelAsset;
    }
    if (kind === "entity") {
        return { ...base, kind, data: { definition: requireRecord(data.definition, "definition") } } satisfies EntityAsset;
    }
    throw new Error(`不支援的素材型別 ${kind}`);
}

export function parseAssetRecordList(values: unknown): Asset[] {
    if (!Array.isArray(values)) throw new Error("素材列表無效");
    return values.map((item, index) => {
        try {
            return parseAssetRecord(item);
        } catch (error) {
            const id = isRecord(item) && typeof item.id === "string" && item.id.trim() ? item.id : `#${index}`;
            throw new Error(`素材 ${id} 合同無效：${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

function requireMediaLocator(primary: string, storageKey: string | undefined, label: string, primaryKey: string) {
    if (!primary.trim() && !storageKey?.trim()) {
        throw new Error(`${label}素材缺少 ${primaryKey} 或 storageKey`);
    }
}

function requireString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string") throw new Error(`素材欄位 ${key} 必須是字串`);
    return value;
}

function requireTrimmedString(record: Record<string, unknown>, key: string): string {
    const value = requireString(record, key).trim();
    if (!value) throw new Error(`素材欄位 ${key} 不能為空`);
    return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    if (typeof record[key] !== "string") throw new Error(`素材欄位 ${key} 必須是字串`);
    return record[key] as string;
}

function optionalTrimmedString(record: Record<string, unknown>, key: string): string | undefined {
    const value = optionalString(record, key)?.trim();
    return value || undefined;
}

function requireStringArray(value: unknown, key: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`素材欄位 ${key} 必須是字串陣列`);
    }
    return value;
}

function requireRecord(value: unknown, key: string): Record<string, unknown> {
    if (!isRecord(value)) throw new Error(`素材欄位 ${key} 必須是物件`);
    return value;
}

function optionalRecord(value: unknown, key: string): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    return requireRecord(value, key);
}

function requireNonNegativeNumber(record: Record<string, unknown>, key: string): number {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`素材欄位 ${key} 必須是非負數字`);
    }
    return value;
}

function requirePositiveNumber(record: Record<string, unknown>, key: string): number {
    const value = requireNonNegativeNumber(record, key);
    if (value === 0) throw new Error(`素材欄位 ${key} 必須大於 0`);
    return value;
}

function requireConcreteMimeType(record: Record<string, unknown>): string {
    const mimeType = requireTrimmedString(record, "mimeType").toLowerCase();
    if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType) || mimeType.endsWith("/*")) {
        throw new Error("素材欄位 mimeType 必須是具體 MIME 型別");
    }
    return mimeType;
}

function requireMediaMimeType(record: Record<string, unknown>, kind: "image" | "video" | "audio"): string {
    const mimeType = requireConcreteMimeType(record);
    // application/octet-stream 是誠實的“型別未知”；除此之外必須與素材種類一致，
    // 防止圖片記錄攜帶 audio/* 等跨型別後設資料後在下載、轉碼階段才暴露錯誤。
    if (mimeType !== "application/octet-stream" && !mimeType.startsWith(`${kind}/`)) {
        throw new Error(`素材欄位 mimeType 與 ${kind} 型別不匹配`);
    }
    return mimeType;
}

function optionalNonNegativeNumber(record: Record<string, unknown>, key: string): number | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    return requireNonNegativeNumber(record, key);
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
    if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) return undefined;
    if (typeof record[key] !== "boolean") throw new Error(`素材欄位 ${key} 必須是布林值`);
    return record[key] as boolean;
}

function optionalAssetStatus(value: unknown): AssetStatus | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !ASSET_STATUSES.includes(value as AssetStatus)) {
        throw new Error("素材 status 無效");
    }
    return value as AssetStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
