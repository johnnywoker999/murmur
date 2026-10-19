import assert from "node:assert/strict";
import test from "node:test";
import { markdownPlainText } from "./markdown-plain-text";

test("markdownPlainText 剝離標題、加粗和列表記號", () => {
    assert.equal(markdownPlainText("## 結論先行\n\n**沒有建立任何節點**\n- 第一點\n- 第二點"), "結論先行 沒有建立任何節點 第一點 第二點");
});

test("markdownPlainText 圍欄程式碼塊替換為佔位詞，包括未閉合的圍欄", () => {
    assert.equal(markdownPlainText("看這段：\n```json\n{\"a\":1}\n```"), "看這段： 程式碼塊");
    assert.equal(markdownPlainText("開頭 ```js\nconst a = 1;"), "開頭 程式碼塊");
});

test("markdownPlainText 連結保留文案，圖片保留 alt", () => {
    assert.equal(markdownPlainText("[檔案](https://example.com) 和 ![分鏡](a.png)"), "檔案 和 分鏡");
});

test("markdownPlainText 表格壓縮為單元格文本", () => {
    assert.equal(markdownPlainText("| 鏡頭 | 時長 |\n| --- | --- |\n| 1 | 3s |"), "鏡頭 時長 1 3s");
});

test("markdownPlainText 行內程式碼與引用塊只保留內容", () => {
    assert.equal(markdownPlainText("> 引用 `generate_media` 工具"), "引用 generate_media 工具");
});
