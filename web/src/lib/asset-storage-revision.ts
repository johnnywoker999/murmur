import type { Asset } from "@/stores/use-asset-store";
import { parseAssetRecord, parseAssetRecordList } from "@/lib/asset-record";

export type AssetStorageDocument = {
    state: { assets: Asset[] };
    version: number;
    storageRevision: number;
    tombstones: { assets: Record<string, number> };
};

export function parseAssetStorageDocument(value: string | null, fallback: Asset[] = []): AssetStorageDocument {
    if (!value) {
        return {
            state: { assets: parseAssetRecordList(fallback) },
            version: 0,
            storageRevision: 0,
            tombstones: { assets: {} },
        };
    }
    const parsed = JSON.parse(value) as {
        state?: { assets?: unknown };
        version?: unknown;
        storageRevision?: unknown;
        tombstones?: { assets?: unknown };
    };
    if (!Array.isArray(parsed.state?.assets)) throw new Error("素材持久狀態無效");
    const rawTombstones = parsed.tombstones?.assets;
    const tombstones =
        rawTombstones && typeof rawTombstones === "object" && !Array.isArray(rawTombstones) ? Object.fromEntries(Object.entries(rawTombstones).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : {};
    return {
        state: { assets: parseAssetRecordList(parsed.state.assets) },
        version: typeof parsed.version === "number" ? parsed.version : 0,
        storageRevision: typeof parsed.storageRevision === "number" && Number.isFinite(parsed.storageRevision) ? parsed.storageRevision : 0,
        tombstones: { assets: tombstones },
    };
}


export type InvalidAssetRecord = {
    index: number;
    id?: string;
    error: string;
};

export type AssetStorageRecovery = {
    document: AssetStorageDocument;
    invalid: InvalidAssetRecord[];
};

/**
 * 僅用於讀取歷史本地快取：保留仍符合合同的素材，並把壞記錄隔離到診斷結果。
 *
 * 這裡不能把壞記錄改成空 URL、通配 MIME 或其他“看起來可用”的預設值；
 * 讀路徑允許恢復可用部分，但寫路徑仍由 parseAssetRecord 嚴格阻斷損壞狀態。
 */
export function parseAssetStorageDocumentRecovering(value: string | null, fallback: Asset[] = []): AssetStorageRecovery {
    if (!value) {
        return {
            document: parseAssetStorageDocument(value, fallback),
            invalid: [],
        };
    }

    const parsed = JSON.parse(value) as {
        state?: { assets?: unknown };
        version?: unknown;
        storageRevision?: unknown;
        tombstones?: { assets?: unknown };
    };
    if (!Array.isArray(parsed.state?.assets)) throw new Error("素材持久狀態無效");

    const invalid: InvalidAssetRecord[] = [];
    const assets: Asset[] = [];
    parsed.state.assets.forEach((item, index) => {
        try {
            assets.push(parseAssetRecord(item));
        } catch (error) {
            const id = isRecord(item) && typeof item.id === "string" && item.id.trim() ? item.id : undefined;
            invalid.push({
                index,
                ...(id ? { id } : {}),
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });

    const rawTombstones = parsed.tombstones?.assets;
    const tombstones =
        rawTombstones && typeof rawTombstones === "object" && !Array.isArray(rawTombstones) ? Object.fromEntries(Object.entries(rawTombstones).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))) : {};

    return {
        document: {
            state: { assets },
            version: typeof parsed.version === "number" ? parsed.version : 0,
            storageRevision: typeof parsed.storageRevision === "number" && Number.isFinite(parsed.storageRevision) ? parsed.storageRevision : 0,
            tombstones: { assets: tombstones },
        },
        invalid,
    };
}

export function serializeAssetStorageDocument(document: AssetStorageDocument) {
    return JSON.stringify(document);
}

function deepEqual(left: unknown, right: unknown) {
    if (Object.is(left, right)) return true;
    return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeValue(base: unknown, local: unknown, durable: unknown): unknown {
    if (deepEqual(local, base)) return durable;
    if (deepEqual(durable, base)) return local;
    if (isRecord(base) && isRecord(local) && isRecord(durable)) return mergeRecord(base, local, durable);
    if (!isRecord(base) && isRecord(local) && isRecord(durable)) return mergeRecord({}, local, durable);
    return durable;
}

function mergeRecord(base: Record<string, unknown>, local: Record<string, unknown>, durable: Record<string, unknown>) {
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(durable)])) {
        const baseHas = Object.prototype.hasOwnProperty.call(base, key);
        const localHas = Object.prototype.hasOwnProperty.call(local, key);
        const durableHas = Object.prototype.hasOwnProperty.call(durable, key);
        if (!localHas && baseHas) {
            if (durableHas && !deepEqual(durable[key], base[key])) merged[key] = durable[key];
            continue;
        }
        if (!localHas) {
            if (durableHas) merged[key] = durable[key];
            continue;
        }
        if (!baseHas) {
            merged[key] = durableHas ? mergeValue(undefined, local[key], durable[key]) : local[key];
            continue;
        }
        if (!durableHas) {
            if (!deepEqual(local[key], base[key])) merged[key] = local[key];
            continue;
        }
        merged[key] = mergeValue(base[key], local[key], durable[key]);
    }
    return merged;
}

/**
 * 將本地記憶體快照合併到最新 durable 檔案：base 是讀取時看到的版本，local 是當前使用者修改，durable 是另一寫入者已落盤的版本。
 * 刪除通過 tombstone 記錄 revision，避免舊標籤頁把已刪除素材重新寫回來；欄位衝突按三方變更而不是最後寫入時間粗暴覆蓋。
 */

export function rebaseAssetSnapshot(input: { document: AssetStorageDocument; baseAssets: Asset[]; localAssets: Asset[]; baseRevision: number }) {
    const nextRevision = input.document.storageRevision + 1;
    const tombstones = { assets: { ...input.document.tombstones.assets } };
    const baseById = new Map(input.baseAssets.map((asset) => [asset.id, asset]));
    const localById = new Map(input.localAssets.map((asset) => [asset.id, asset]));
    const durableById = new Map(input.document.state.assets.map((asset) => [asset.id, asset]));
    const assets = [...input.document.state.assets];
    const positions = new Map(assets.map((asset, index) => [asset.id, index]));

    const remove = (id: string) => {
        const index = positions.get(id);
        if (index === undefined) return;
        assets.splice(index, 1);
        positions.clear();
        assets.forEach((asset, position) => positions.set(asset.id, position));
    };
    const set = (asset: Asset) => {
        const index = positions.get(asset.id);
        if (index === undefined) {
            positions.set(asset.id, assets.length);
            assets.push(asset);
        } else {
            assets[index] = asset;
        }
    };

    for (const id of new Set([...baseById.keys(), ...localById.keys()])) {
        const base = baseById.get(id);
        const local = localById.get(id);
        const durable = durableById.get(id);

        if (base && !local) {
            remove(id);
            tombstones.assets[id] = nextRevision;
            continue;
        }
        if (!local || (base && deepEqual(base, local))) continue;
        if (!durable) {
            if (base || (tombstones.assets[id] ?? 0) > input.baseRevision) continue;
            delete tombstones.assets[id];
            set(local);
            continue;
        }
        delete tombstones.assets[id];
        set(mergeRecord((base || {}) as unknown as Record<string, unknown>, local as unknown as Record<string, unknown>, durable as unknown as Record<string, unknown>) as unknown as Asset);
    }

    return {
        state: { assets },
        version: input.document.version,
        storageRevision: nextRevision,
        tombstones,
    } satisfies AssetStorageDocument;
}
