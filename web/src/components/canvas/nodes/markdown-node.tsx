import { FileText } from "lucide-react";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { useUpstreamNodes } from "@/components/canvas/canvas-node-graph-context";
import { getNodeResourceKind } from "@/lib/canvas/node-registry";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type MarkdownNodeContentProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
};

/**
 * Markdown 展示節點。
 *
 * 內容取自身 metadata.content；為空時回落到上游文本素材——這樣「AI 寫檔案 → 連一根線 →
 * 排版好的檔案」不需要先把內容搬進本節點。上游取用統一經 CanvasNodeGraphContext，
 * 判定文本素材複用登入檔的 resourceKind，不在這裡另立一套判斷。
 */
export function MarkdownNodeContent({ node, theme }: MarkdownNodeContentProps) {
    const upstream = useUpstreamNodes(node.id);
    const own = node.metadata?.content || "";
    const inherited = upstream.find((item) => getNodeResourceKind(item) === "text");
    const source = own || inherited?.metadata?.content || inherited?.metadata?.prompt || "";

    if (!source.trim()) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center" style={{ color: theme.node.muted }}>
                <FileText className="size-5 opacity-60" />
                <span style={{ fontSize: "var(--fs-label)" }}>連線文本節點，或雙擊編輯 Markdown</span>
            </div>
        );
    }

    return (
        // 滾動區要吞掉 wheel 並標 data-canvas-no-zoom，否則滾動會被畫布縮放攔走。
        <div
            className="h-full w-full overflow-y-auto overflow-x-hidden px-4 py-3"
            data-canvas-no-zoom
            style={{ color: theme.node.text }}
            onWheel={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <AIMessageMarkdown>{source}</AIMessageMarkdown>
        </div>
    );
}
