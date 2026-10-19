import type { CanvasTheme } from "@/lib/canvas-theme";

type SandboxedFrameProps = {
    /** 完整的 HTML 檔案字串，作為 iframe 的 srcDoc */
    srcDoc: string;
    theme: CanvasTheme;
    /**
     * 是否允許檔案內指令碼執行。
     *
     * ⚠️ 只給 allow-scripts，**絕不同時給 allow-same-origin** —— 兩者並存等於取消沙箱：
     * 檔案能拿到本源 DOM 與儲存（含登入態）。這裡刻意不暴露 sandbox 的完整取值，
     * 就是為了讓這條約束沒有被繞過的入口。
     */
    allowScripts?: boolean;
};

/**
 * 沙箱 iframe —— SVG 與 HTML 節點共用。
 *
 * 依賴裡沒有 DOMPurify，手寫消毒不可靠（script / on* / foreignObject 等繞法很多），
 * 所以兩種節點都不走 innerHTML，統一塞進沙箱 iframe 渲染。
 */
export function SandboxedFrame({ srcDoc, theme, allowScripts = false }: SandboxedFrameProps) {
    return (
        <iframe
            title="節點預覽"
            className="h-full w-full border-0"
            sandbox={allowScripts ? "allow-scripts" : ""}
            srcDoc={srcDoc}
            data-canvas-no-zoom
            style={{ background: theme.node.fill }}
            // 指標交給檔案自己處理，但按下時別讓畫布把它當成拖拽節點。
            onMouseDown={(event) => event.stopPropagation()}
        />
    );
}

/** 把一段片段包成可渲染的最小檔案；居中且不溢位節點。 */
export function centeredFrameDocument(body: string, extraCss = "") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent}body{display:grid;place-items:center;overflow:hidden}svg,img{max-width:100%;max-height:100%}${extraCss}</style></head><body>${body}</body></html>`;
}
