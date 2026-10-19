import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { CanvasAssistantSidebar } from "@/pages/canvas/canvas-assistant-sidebar";
import type { CanvasAssistantController } from "@/pages/canvas/use-canvas-assistant";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { AgentHostStatus, AssistantTurn } from "@/services/api/agent-assistant";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType } from "@/types/canvas";

/**
 * DEV 實驗室：只為驗收助手停靠欄的視覺與狀態分支。
 *
 * 不連後端、不調模型：所有資料都是本頁寫死的樣例，用查詢引數切換場景
 * （?state=ready|unavailable|starting&narrow=1&dark=1）。生產構建不含此路由。
 */
const REFERENCES: CanvasResourceReference[] = [
    { id: "n1", nodeId: "n1", kind: "text", label: "鏡頭1", title: "鏡頭1-開場", active: true, sourceType: CanvasNodeType.Text, mentionToken: "@[node:n1]" },
    { id: "n2", nodeId: "n2", kind: "image", label: "鏡頭2", title: "鏡頭2-衝突", active: true, sourceType: CanvasNodeType.Image, mentionToken: "@[node:n2]" },
];

const TURNS: AssistantTurn[] = [
    {
        turnId: "turn-1",
        userText: "把劇本拆成三個鏡頭，並按順序連起來",
        selectedNodeIds: ["n1", "n2"],
        reply: "已經按開場、衝突、收尾拆成三個鏡頭，並按這個順序連好。\n\n- **鏡頭1 開場**：雨夜巷口，遠景壓住情緒\n- **鏡頭2 衝突**：近景對峙，光只打半張臉\n- **鏡頭3 收尾**：中景離場，留一句沒說完的臺詞",
        toolCalls: [
            { toolCallId: "t1", tool: "canvas.nodes.create" },
            { toolCallId: "t2", tool: "canvas.edge.create" },
            { toolCallId: "t3", tool: "canvas.node.update", isError: true, error: "conflict" },
        ],
        change: { revisionBefore: 12, revisionAfter: 13, createdNodeIds: ["n3", "n4", "n5"], updatedNodeIds: [], createdEdgeIds: ["e1", "e2"] },
        proposals: [{ proposalId: "p1", kind: "image", nodeIds: ["n3", "n4", "n5"], model: "seedream-4", modelKey: "beefapi::seedream-4" }],
        error: null,
        cancelled: false,
        createdAt: new Date("2026-09-29T10:00:00Z").toISOString(),
    },
];

function stubController(open: boolean, setOpen: (next: boolean) => void, width: number, setWidth: (next: number) => void, status: AgentHostStatus | null): CanvasAssistantController {
    const noop = () => {};
    const asyncNoop = async () => {};
    return {
        canvasId: "lab",
        open,
        setOpen,
        width,
        setWidth,
        status,
        statusBusy: false,
        modelBusy: false,
        sessions: [
            { sessionId: "s1", title: "把劇本拆成三個鏡頭，並按順序連起來", updatedAt: new Date().toISOString(), turnCount: 1 },
            { sessionId: "s2", title: "檢查哪些鏡頭還缺參考圖", updatedAt: new Date().toISOString(), turnCount: 3 },
        ],
        sessionId: "s1",
        turns: status?.available ? TURNS : [],
        historyLoaded: true,
        historyError: null,
        sessionBusy: false,
        reloadHistory: async () => true,
        pendingUserText: null,
        pendingSelectedNodeIds: [],
        pendingAttachments: [],
        pendingSkills: [],
        permissionMode: "canvas",
        permissionLocked: false,
        setPermissionMode: noop,
        streamed: "",
        streaming: false,
        awaitingReceipt: false,
        supplements: [],
        supplementBusy: false,
        canSupplement: false,
		lifecycleNotice: null,
        error: null,
        canRetry: false,
        turnStatus: {},
        handledProposals: new Set<string>(),
        markProposalHandled: noop,
        markProposalDismissed: noop,
        send: asyncNoop,
        stop: asyncNoop,
        retryLast: noop,
        dismissError: noop,
        startNewSession: asyncNoop,
        activateSession: asyncNoop,
        undoTurn: asyncNoop,
        restartHost: asyncNoop,
    };
}

export default function AssistantPanelLab() {
    const [params] = useSearchParams();
    const state = params.get("state") || "ready";
    const narrow = params.get("narrow") === "1";
    const dark = params.get("dark") === "1";
    const [open, setOpen] = useState(true);
    const [width, setWidth] = useState(380);

    // CSS 變數和 antd 主題必須同時切：只切一邊會讓按鈕文字和底色撞在一起。
    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        useThemeStore.getState().setTheme(dark ? "dark" : "light");
    }, [dark]);

    const status: AgentHostStatus | null =
        state === "unavailable"
            ? { available: false, reason: "credential_missing" }
            : state === "starting"
              ? { available: false, reason: "host_starting" }
              : state === "no-model"
                ? { available: false, reason: "model_not_configured" }
                : { available: true, model: { id: "deepseek-v3", channelId: "beefapi", channelName: "BeefAPI" } };

    const assistant = stubController(open, setOpen, width, setWidth, status);
    if (state === "interrupted") {
        assistant.turns = [{ ...TURNS[0], proposals: [], error: "本輪達到等待上限", errorReason: "turn_timeout", change: { ...TURNS[0].change!, timelineUpdated: true } }];
    }
    if (state === "streaming") {
        assistant.streaming = true;
        assistant.canSupplement = true;
        assistant.pendingUserText = "檢查參考影片的聲音，去掉中間黑屏，保留咖啡和蛋糕的結尾";
        assistant.streamed = "已找到中間的黑屏，正在檢查這段聲音。";
        assistant.supplements = [{ text: "不要刪除片尾的兩秒停頓", status: "accepted" }];
        assistant.lifecycleNotice = "正在檢查媒體";
    }

    return (
        <div className="flex h-screen min-h-0" style={{ background: "var(--background)", color: "var(--foreground)" }}>
            <div className="flex min-w-0 flex-1 items-center justify-center" style={{ background: "var(--muted)" }}>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>畫布區域（實驗室佔位）</p>
            </div>
            <CanvasAssistantSidebar
                assistant={assistant}
                canvasTitle="雨夜巷口"
                dockable={!narrow}
                readOnly={params.get("readonly") === "1"}
                selectedNodeIds={["n1", "n2"]}
                references={REFERENCES}
                onLocateNodes={() => {}}
                onRunProposal={() => {}}
                onOpenModelSettings={() => {}}
            />
        </div>
    );
}
