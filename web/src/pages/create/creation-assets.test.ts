import assert from "node:assert/strict";
import test from "node:test";

// Node 原生 TypeScript 測試執行器要求保留副檔名，專案編譯器不允許該寫法。
// @ts-expect-error -- Node 原生 TypeScript 測試執行器需要保留副檔名。
import { creationAssetKey, isSameCreationAsset } from "./creation-assets.ts";

test("同一任務的同一結果只能匹配同一個素材", () => {
    const identity = { taskId: "task-1", resultIndex: 0 };
    const asset = { metadata: { creationAssetKey: creationAssetKey(identity) } };

    assert.equal(isSameCreationAsset(asset, identity), true);
    assert.equal(isSameCreationAsset(asset, { taskId: "task-1", resultIndex: 1 }), false);
});

test("不同任務的結果不能被誤判為重複素材", () => {
    const asset = { metadata: { creationAssetKey: creationAssetKey({ taskId: "task-1", resultIndex: 0 }) } };

    assert.equal(isSameCreationAsset(asset, { taskId: "task-2", resultIndex: 0 }), false);
});

test("修復前只儲存任務 ID 的素材首個結果仍可被識別", () => {
    const asset = { metadata: { source: "create-generation", taskId: "task-legacy" } };

    assert.equal(isSameCreationAsset(asset, { taskId: "task-legacy", resultIndex: 0 }), true);
    assert.equal(isSameCreationAsset(asset, { taskId: "task-legacy", resultIndex: 1 }), false);
});
