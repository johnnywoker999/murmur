import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

type AiMessageCodeBlockProps = {
    children?: ReactNode;
    className?: string;
    isStreaming?: boolean;
};

type ShikiHighlighter = Awaited<ReturnType<typeof import("shiki").createHighlighter>>;

let highlighterPromise: Promise<ShikiHighlighter> | null = null;

const SHIKI_LANGS = [
    "javascript",
    "typescript",
    "jsx",
    "tsx",
    "json",
    "html",
    "css",
    "scss",
    "bash",
    "shellscript",
    "python",
    "sql",
    "markdown",
    "yaml",
    "diff",
    "xml",
    "java",
    "go",
    "rust",
    "c",
    "cpp",
    "csharp",
    "ruby",
    "php",
    "kotlin",
    "swift",
    "docker",
    "text",
] as const;

/** 使用者常見語言寫法 → shiki 語言名；未知語言回退純文本（無高亮但外殼不變）。 */
const LANGUAGE_ALIASES: Record<string, string> = {
    sh: "shellscript",
    shell: "shellscript",
    zsh: "shellscript",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    mts: "typescript",
    py: "python",
    yml: "yaml",
    md: "markdown",
    mdx: "markdown",
    rb: "ruby",
    rs: "rust",
    go: "go",
    "c++": "cpp",
    "c#": "csharp",
    cs: "csharp",
    kt: "kotlin",
    dockerfile: "docker",
    text: "text",
};

function loadHighlighter(): Promise<ShikiHighlighter> {
    if (!highlighterPromise) {
        highlighterPromise = import("shiki").then(({ createHighlighter }) =>
            createHighlighter({
                langs: [...SHIKI_LANGS],
                themes: ["github-light", "github-dark"],
            }),
        );
    }
    return highlighterPromise;
}

function collectText(node: ReactNode): string {
    if (node == null || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(collectText).join("");
    if (typeof node === "object" && "props" in node) {
        return collectText((node.props as { children?: ReactNode }).children);
    }
    return "";
}

function detectLanguage(children: ReactNode, ownClassName?: string): string {
    const pattern = /language-([^\s]+)/;
    const own = typeof ownClassName === "string" ? ownClassName.match(pattern) : null;
    if (own) return own[1];
    const first = Array.isArray(children) ? children[0] : children;
    if (first && typeof first === "object" && "props" in first) {
        const className = (first.props as { className?: unknown }).className;
        const match = typeof className === "string" ? className.match(pattern) : null;
        if (match) return match[1];
    }
    return "";
}

/**
 * 自研程式碼塊：語言標籤 + 複製按鈕 + 統一圓角/邊框/底色；
 * 訊息結束後用 shiki 對程式碼上色（懶載入，github-light/dark 雙主題 CSS 變數，
 * 由 .dark 類切換），流式期間保持單色避免逐幀閃爍。
 */
export function AiMessageCodeBlock({ children, className, isStreaming = false, ...props }: AiMessageCodeBlockProps) {
    const [copied, setCopied] = useState(false);
    const [highlightHtml, setHighlightHtml] = useState<string | null>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const codeText = collectText(children);
    const language = detectLanguage(children, className).toLowerCase();

    useEffect(() => {
        if (isStreaming || !codeText.trim()) {
            setHighlightHtml(null);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(() => {
            void loadHighlighter()
                .then(async (highlighter) => {
                    if (cancelled) return;
                    const aliased = LANGUAGE_ALIASES[language];
                    const lang = aliased ?? ((SHIKI_LANGS as readonly string[]).includes(language) ? language : "text");
                    const html = await highlighter.codeToHtml(codeText.trimEnd(), {
                        lang,
                        themes: { light: "github-light", dark: "github-dark" },
                        defaultColor: false,
                        cssVariablePrefix: "--shiki-",
                    });
                    if (!cancelled) setHighlightHtml(html);
                })
                .catch(() => {});
        }, 120);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [codeText, language, isStreaming]);

    const handleCopy = () => {
        const payload = codeText.trimEnd();
        void navigator.clipboard?.writeText(payload).catch(() => {});
        setCopied(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    };

    return (
        <div className="ai-message-codeblock">
            <div className="ai-message-codeblock-header">
                <span className="ai-message-codeblock-lang">{language || "code"}</span>
                <button type="button" className="ai-message-codeblock-copy" aria-label={copied ? "已複製" : "複製程式碼"} onClick={handleCopy}>
                    {copied ? <Check /> : <Copy />}
                    <span>{copied ? "已複製" : "複製"}</span>
                </button>
            </div>
            {highlightHtml ? (
                <div className="ai-message-codeblock-pre" dangerouslySetInnerHTML={{ __html: highlightHtml }} />
            ) : (
                <pre {...props} className="ai-message-codeblock-pre">
                    {children}
                </pre>
            )}
        </div>
    );
}
