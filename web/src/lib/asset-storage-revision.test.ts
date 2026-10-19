import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- Node 原生 TypeScript 測試執行器需要保留副檔名。
import { parseAssetRecord } from "./asset-record.ts";

test("缺失圖片資料的歷史素材會被拒絕，而不是補齊可渲染欄位", () => {
    assert.throws(() => parseAssetRecord({
        id: "legacy-image",
        kind: "image",
        title: "歷史圖片",
        coverUrl: "https://example.com/image.png",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        data: undefined,
    }), /data/);
});
