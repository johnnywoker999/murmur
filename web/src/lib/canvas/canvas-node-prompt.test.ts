import assert from "node:assert/strict";
import test from "node:test";

import "./node-registry/definitions/index.ts";
// @ts-expect-error -- Node 原生 TypeScript 測試執行器需要保留副檔名。
import { canvasNodeHasCommittedContent, writeCanvasNodePrompt } from "./canvas-node-prompt.ts";
// @ts-expect-error -- Node 原生 TypeScript 測試執行器需要保留副檔名。
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas.ts";

function node(type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id: `${type}-node`,
        type,
        title: "測試節點",
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata,
    };
}

test("媒體節點已有結果時只更新下一版提示詞草稿", () => {
    for (const type of [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio]) {
        const current = node(type, {
            content: `https://example.com/${type}`,
            prompt: "已提交提示詞",
            composerContent: "舊草稿",
            status: "success",
        });

        assert.equal(canvasNodeHasCommittedContent(current), true);
        assert.deepEqual(writeCanvasNodePrompt(current, "下一版提示詞").metadata, {
            content: `https://example.com/${type}`,
            prompt: "已提交提示詞",
            composerContent: "下一版提示詞",
            status: "success",
        });
    }
});

test("空媒體草稿同時初始化提交提示詞和編輯提示詞", () => {
    const current = node(CanvasNodeType.Video, { status: "idle" });

    assert.equal(canvasNodeHasCommittedContent(current), false);
    assert.deepEqual(writeCanvasNodePrompt(current, "第一版提示詞").metadata, {
        status: "idle",
        prompt: "第一版提示詞",
        composerContent: "第一版提示詞",
    });
});

test("圖片僅保留 storageKey 時仍視為已有媒體結果", () => {
    const current = node(CanvasNodeType.Image, {
        storageKey: "canvas/image/result.png",
        prompt: "已提交提示詞",
    });

    assert.equal(canvasNodeHasCommittedContent(current), true);
    assert.equal(writeCanvasNodePrompt(current, "新草稿").metadata?.prompt, "已提交提示詞");
});

test("文本提示詞本身不構成已提交內容", () => {
    const draft = node(CanvasNodeType.Text, { prompt: "文本草稿" });
    const committed = node(CanvasNodeType.Text, { content: "已生成文本", prompt: "已提交提示詞" });

    assert.equal(canvasNodeHasCommittedContent(draft), false);
    assert.equal(canvasNodeHasCommittedContent(committed), true);
    assert.equal(writeCanvasNodePrompt(draft, "新文本草稿").metadata?.prompt, "新文本草稿");
    assert.equal(writeCanvasNodePrompt(committed, "下一版文本草稿").metadata?.prompt, "已提交提示詞");
});

test("呼叫方可先清理失敗任務後設資料，再由統一寫入器儲存草稿", () => {
    const current = node(CanvasNodeType.Video, {
        content: "https://example.com/video.mp4",
        prompt: "已提交提示詞",
        promptTemplateOperation: "storyboard-video",
        promptTemplateVariables: { shot: "1" },
        taskId: "failed-task",
    });
    const metadata = { ...current.metadata, taskId: undefined };

    const updated = writeCanvasNodePrompt(current, "修訂草稿", {
        metadata,
        clearPromptTemplate: true,
    });

    assert.equal(updated.metadata?.prompt, "已提交提示詞");
    assert.equal(updated.metadata?.composerContent, "修訂草稿");
    assert.equal(updated.metadata?.taskId, undefined);
    assert.equal(updated.metadata?.promptTemplateOperation, undefined);
    assert.equal(updated.metadata?.promptTemplateVariables, undefined);
});
