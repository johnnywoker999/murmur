import { Shapes } from "lucide-react";

import { useUpstreamNodes } from "@/components/canvas/canvas-node-graph-context";
import { getNodeResourceKind } from "@/lib/canvas/node-registry";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

import { centeredFrameDocument, SandboxedFrame } from "./sandboxed-frame";

type SvgNodeContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

/** 只取到第一個 <svg> 根元素，避免上游文本里的說明文字被一起塞進檔案。 */
function extractSvgSource(text: string) {
    const start = text.indexOf("<svg");
    if (start < 0) return "";
    const end = text.lastIndexOf("</svg>");
    return end > start ? text.slice(start, end + "</svg>".length) : "";
}

/**
 * SVG 展示節點：把 SVG 原始碼渲染成圖形。
 *
 * 原始碼取自身 metadata.content，為空時回落上游文本素材——「讓 AI 輸出 SVG 程式碼 → 連線 → 看圖」
 * 是這個節點存在的理由。渲染走沙箱 iframe（見 sandboxed-frame），不給指令碼許可權。
 */
export function SvgNodeContent({ node, theme }: SvgNodeContentProps) {
    const upstream = useUpstreamNodes(node.id);
    const inherited = upstream.find((item) => getNodeResourceKind(item) === "text");
    const raw = node.metadata?.content || inherited?.metadata?.content || inherited?.metadata?.prompt || "";
    const svg = extractSvgSource(raw);

    if (!svg) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.muted }}>
                <Shapes className="size-5 opacity-60" />
                <span style={{ fontSize: "var(--fs-label)" }}>{raw.trim() ? "上游內容裡沒有找到 <svg> 原始碼" : "連線輸出 SVG 的文本節點"}</span>
            </div>
        );
    }

    return <SandboxedFrame srcDoc={centeredFrameDocument(svg)} theme={theme} />;
}
