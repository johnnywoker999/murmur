import { Code } from "lucide-react";

import { useUpstreamNodes } from "@/components/canvas/canvas-node-graph-context";
import { getNodeResourceKind } from "@/lib/canvas/node-registry";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

import { SandboxedFrame } from "./sandboxed-frame";

type HtmlNodeContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

/**
 * HTML 展示節點：在沙箱 iframe 裡預覽 HTML。
 *
 * 原始碼取自身 metadata.content，為空時回落上游文本（與 SVG / Markdown 一致）。
 * 自身有原始碼時，上游文本作為資料填進 `{{input}}`，所以「模板 + 資料」兩條線可以分開接。
 *
 * 指令碼可執行（allow-scripts），但 SandboxedFrame 結構上不允許同時給 allow-same-origin
 * —— 否則頁面能讀到本源登入態。
 */
export function HtmlNodeContent({ node, theme }: HtmlNodeContentProps) {
    const upstream = useUpstreamNodes(node.id);
    const inherited = upstream.find((item) => getNodeResourceKind(item) === "text");
    const upstreamText = inherited?.metadata?.content || inherited?.metadata?.prompt || "";
    const own = node.metadata?.content || "";
    // 與 SVG / Markdown 一致：自身為空時把上游文本當原始碼，這樣「AI 寫頁面 → 連線 → 看效果」
    // 不需要先把原始碼搬進本節點。
    const source = own || upstreamText;
    // 原始碼本身就來自上游時，{{input}} 沒有第二份資料可填——替換成空串，
    // 否則會把同一段內容再塞回自己裡。
    const input = own ? upstreamText : "";

    if (!source.trim()) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.muted }}>
                <Code className="size-5 opacity-60" />
                <span style={{ fontSize: "var(--fs-label)" }}>連線輸出 HTML 的文本節點</span>
                <span style={{ fontSize: "var(--fs-tiny)" }}>原始碼裡的 {"{{input}}"} 會替換為上游文本</span>
            </div>
        );
    }

    return <SandboxedFrame srcDoc={source.replaceAll("{{input}}", input)} theme={theme} allowScripts />;
}
