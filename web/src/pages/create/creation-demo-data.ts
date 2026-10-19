import type { CreationConversation } from "./creation-types";

/** 固定的演示會話：只用於展示 Agent 對話流，不會寫入本地會話或呼叫生成介面。 */
export function createDemoConversation(): CreationConversation {
    const base = "2026-09-19T10:00:00.000Z";
    return {
        id: "demo-conversation",
        title: "模擬影片創作流程",
        updatedAt: base,
        messages: [
            {
                id: "demo-user-plan",
                role: "user",
                content: "我想做一段 6 秒的電影感影片：夜晚的香港街頭，鏡頭緩慢推進，霓虹燈倒映在雨水中。",
                createdAt: base,
                mode: "text",
                status: "done",
            },
            {
                id: "demo-assistant-plan",
                role: "assistant",
                content: "我會先把想法拆成一個可執行的鏡頭：雨夜街景建立氛圍，鏡頭緩慢向前推進，最後落到霓虹倒影。接下來可以直接生成影片。",
                createdAt: "2026-09-19T10:00:05.000Z",
                mode: "text",
                status: "done",
            },
            {
                id: "demo-user-generate",
                role: "user",
                content: "按這個方案生成影片，畫幅 16:9，時長 6 秒。",
                createdAt: "2026-09-19T10:00:12.000Z",
                mode: "video",
                status: "done",
                settings: { ratio: "16:9", seconds: "6", quality: "auto", videoQuality: "720", count: "1" },
            },
            {
                id: "demo-assistant-generating",
                role: "assistant",
                content: "",
                createdAt: "2026-09-19T10:00:14.000Z",
                mode: "video",
                status: "pending",
                generationStage: "rendering",
                settings: { ratio: "16:9", seconds: "6", quality: "auto", videoQuality: "720", count: "1" },
            },
        ],
    };
}
