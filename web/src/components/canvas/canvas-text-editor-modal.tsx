import { App, Button, ColorPicker, Dropdown, Input, Popover } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import {
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Bold,
    ChevronDown,
    Code2,
    Eraser,
    Highlighter,
    Italic,
    Link2,
    List,
    ListOrdered,
    Minus,
    MoreHorizontal,
    Quote,
    Redo2,
    Save,
    Strikethrough,
    Underline,
    Undo2,
    X,
} from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { createCanvasRichTextExtensions, isSafeCanvasRichTextLink } from "@/lib/canvas/canvas-rich-text";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

type CanvasTextEditorModalProps = {
    node: CanvasNodeData | null;
    open: boolean;
    onClose: () => void;
    onSave: (nodeId: string, title: string, content: string, richText: Record<string, unknown>) => Promise<void> | void;
};

export function CanvasTextEditorModal({ node, open, onClose, onSave }: CanvasTextEditorModalProps) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const [title, setTitle] = useState("");
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const editor = useEditor({
        immediatelyRender: false,
        extensions: createCanvasRichTextExtensions("輸入文本內容…"),
        content: emptyTextDocument(),
        editorProps: {
            attributes: {
                class: "min-h-full px-8 py-7 text-[var(--fs-body-lg)] leading-7 outline-none sm:px-12 lg:px-16",
                "aria-label": "文本節點富文本編輯區",
            },
        },
        onUpdate: () => setDirty(true),
    });

    useEffect(() => {
        if (!open || !node || !editor) return;
        editor.commands.setContent((node.metadata?.richText as JSONContent | undefined) || plainTextDocument(node.metadata?.content || ""), { emitUpdate: false });
        setTitle(node.title || "文本");
        setDirty(false);
        setSaving(false);
        window.setTimeout(() => editor.commands.focus("start"), 0);
    }, [editor, node?.id, open]);

    const characterCount = editor?.storage.characterCount?.characters?.() || 0;
    const wordCount = useMemo(() => countWords(editor?.getText() || ""), [characterCount, editor]);

    const save = async () => {
        if (!node || !editor || saving) return;
        setSaving(true);
        try {
            await onSave(node.id, title.trim() || "文本", editor.getText({ blockSeparator: "\n" }).trimEnd(), editor.getJSON() as Record<string, unknown>);
            setDirty(false);
            message.success("文本節點已儲存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "文本儲存失敗");
        } finally {
            setSaving(false);
        }
    };

    const close = () => {
        if (!dirty || saving) return onClose();
        modal.confirm({
            title: "放棄未儲存的修改？",
            content: "關閉後，本次富文本編輯不會寫回畫布節點。",
            okText: "放棄修改",
            cancelText: "繼續編輯",
            onOk: onClose,
        });
    };

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
            event.preventDefault();
            void save();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [dirty, editor, node?.id, open, saving, title]);

    return (
        <AppModal
            className="canvas-text-editor-modal"
            open={open && Boolean(node)}
            title={null}
            footer={null}
            closable={false}
            centered
            destroyOnHidden
            width="min(1180px, calc(100vw - 24px))"
            onCancel={close}
            flush styles={{ container: { borderRadius: 8 } }}
        >
            <section className="flex h-[min(88dvh,840px)] flex-col overflow-hidden" style={{ background: theme.node.panel, color: theme.node.text }}>
                <header className="flex h-13 shrink-0 items-center gap-3 border-b px-3" style={{ borderColor: theme.node.stroke }}>
                    <Input
                        variant="borderless"
                        value={title}
                        onChange={(event) => { setTitle(event.target.value); setDirty(true); }}
                        className="!h-9 min-w-0 max-w-[360px] flex-1 !px-1 text-sm font-semibold"
                        placeholder="文本節點標題"
                        aria-label="文本節點標題"
                    />
                    <span className="hidden shrink-0 text-[var(--fs-label)] sm:inline" style={{ color: theme.node.muted }}>{characterCount.toLocaleString("zh-CN")} 字 · {wordCount.toLocaleString("zh-CN")} 詞</span>
                    <span className="ml-auto hidden text-[var(--fs-label)] sm:inline" style={{ color: dirty ? theme.accent.primary : theme.node.muted }}>{dirty ? "有未儲存修改" : "已儲存"}</span>
                    <Button size="small" type="primary" icon={<Save className="size-3.5" />} loading={saving} disabled={!dirty} onClick={() => void save()}>儲存</Button>
                    <Tooltip title="關閉">
                        <Button size="small" type="text" icon={<X className="size-4" />} aria-label="關閉文本編輯器" onClick={close} />
                    </Tooltip>
                </header>

                <TextEditorToolbar editor={editor} />

                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto" style={{ background: theme.canvas.background }}>
                    <div
                        className="mx-auto min-h-full w-full max-w-[920px] [&_.ProseMirror]:min-h-[calc(min(88dvh,840px)-126px)] [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:opacity-70 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-black/6 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 dark:[&_.ProseMirror_code]:bg-white/8 [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:mt-5 [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_hr]:my-6 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_ol]:my-3 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-black/90 [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:text-white [&_.ProseMirror_ul]:my-3 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-foreground/35 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
                    >
                        <EditorContent editor={editor} />
                    </div>
                </div>

                <footer className="flex h-8 shrink-0 items-center gap-3 border-t px-3 text-[var(--fs-tiny)]" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    <span className="hidden sm:inline">支援標題、列表、引用、連結、程式碼和顏色格式</span>
                    <span className="ml-auto">Ctrl/⌘S 儲存</span>
                </footer>
            </section>
        </AppModal>
    );
}

function TextEditorToolbar({ editor }: { editor: Editor | null }) {
    const { message } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const [, setToolbarVersion] = useState(0);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkValue, setLinkValue] = useState("");

    useEffect(() => {
        if (!editor) return;
        const update = () => setToolbarVersion((value) => value + 1);
        editor.on("selectionUpdate", update);
        editor.on("transaction", update);
        return () => {
            editor.off("selectionUpdate", update);
            editor.off("transaction", update);
        };
    }, [editor]);

    const blockLabel = editor?.isActive("heading", { level: 1 }) ? "標題 1" : editor?.isActive("heading", { level: 2 }) ? "標題 2" : editor?.isActive("heading", { level: 3 }) ? "標題 3" : "正文";
    const alignment = editor?.isActive({ textAlign: "center" }) ? "center" : editor?.isActive({ textAlign: "right" }) ? "right" : editor?.isActive({ textAlign: "justify" }) ? "justify" : "left";
    const alignmentIcon = alignment === "center" ? <AlignCenter /> : alignment === "right" ? <AlignRight /> : alignment === "justify" ? <AlignJustify /> : <AlignLeft />;
    const applyLink = () => {
        const href = linkValue.trim();
        if (!editor) return;
        if (href && !isSafeCanvasRichTextLink(href)) {
            message.error("連結僅支援 http、https、mailto 或 tel 協議");
            return;
        }
        if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
        else editor.chain().focus().unsetLink().run();
        setLinkOpen(false);
    };

    return (
        <div className="hide-scrollbar flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b px-2" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <EditorToolButton label="撤銷" onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></EditorToolButton>
            <EditorToolButton label="重做" onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></EditorToolButton>
            <ToolbarDivider />
            <Dropdown
                trigger={["click"]}
                menu={{
                    selectedKeys: [blockLabel],
                    items: ["正文", "標題 1", "標題 2", "標題 3"].map((label) => ({ key: label, label })),
                    onClick: ({ key }) => key === "正文" ? editor?.chain().focus().setParagraph().run() : editor?.chain().focus().toggleHeading({ level: Number(key.slice(-1)) as 1 | 2 | 3 }).run(),
                }}
            >
                <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label="段落格式"><span>{blockLabel}</span><ChevronDown className="size-3" /></button>
            </Dropdown>
            <EditorToolButton label="粗體" active={Boolean(editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></EditorToolButton>
            <EditorToolButton label="斜體" active={Boolean(editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></EditorToolButton>
            <EditorToolButton label="下劃線" active={Boolean(editor?.isActive("underline"))} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></EditorToolButton>
            <EditorToolButton label="刪除線" active={Boolean(editor?.isActive("strike"))} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></EditorToolButton>
            <ToolbarDivider />
            <Dropdown
                trigger={["click"]}
                menu={{
                    selectedKeys: [alignment],
                    items: [
                        { key: "left", icon: <AlignLeft className="size-3.5" />, label: "左對齊" },
                        { key: "center", icon: <AlignCenter className="size-3.5" />, label: "居中" },
                        { key: "right", icon: <AlignRight className="size-3.5" />, label: "右對齊" },
                        { key: "justify", icon: <AlignJustify className="size-3.5" />, label: "兩端對齊" },
                    ],
                    onClick: ({ key }) => editor?.chain().focus().setTextAlign(key).run(),
                }}
            >
                <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center gap-0.5 rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label="文字對齊"><span className="[&_svg]:size-3.5">{alignmentIcon}</span><ChevronDown className="size-2.5" /></button>
            </Dropdown>
            <EditorToolButton label="無序列表" active={Boolean(editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></EditorToolButton>
            <EditorToolButton label="有序列表" active={Boolean(editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></EditorToolButton>
            <EditorToolButton label="引用" active={Boolean(editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></EditorToolButton>
            <Popover
                open={linkOpen}
                onOpenChange={(next) => { setLinkOpen(next); if (next) setLinkValue(String(editor?.getAttributes("link").href || "")); }}
                trigger="click"
                placement="bottom"
                content={<div className="flex w-72 gap-2"><Input size="small" value={linkValue} placeholder="https://example.com" onChange={(event) => setLinkValue(event.target.value)} onPressEnter={applyLink} /><Button size="small" type="primary" onClick={applyLink}>應用</Button></div>}
            >
                <span><EditorToolButton label="插入連結" active={Boolean(editor?.isActive("link"))} onClick={() => setLinkOpen(true)}><Link2 /></EditorToolButton></span>
            </Popover>
            <ToolbarDivider />
            <Tooltip title="文字顏色">
                <ColorPicker value={String(editor?.getAttributes("textStyle").color || theme.node.text)} onChangeComplete={(color) => editor?.chain().focus().setColor(color.toHexString()).run()}>
                    <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-xs font-bold outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label="文字顏色"><span className="border-b-2 px-0.5" style={{ borderColor: String(editor?.getAttributes("textStyle").color || theme.node.text) }}>A</span></button>
                </ColorPicker>
            </Tooltip>
            <Tooltip title="高亮顏色">
                <ColorPicker value={String(editor?.getAttributes("highlight").color || "#fde68a")} onChangeComplete={(color) => editor?.chain().focus().toggleHighlight({ color: color.toHexString() }).run()}>
                    <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label="高亮顏色"><Highlighter className="size-3.5" /></button>
                </ColorPicker>
            </Tooltip>
            <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{
                    items: [
                        { key: "code", icon: <Code2 className="size-3.5" />, label: "行內程式碼" },
                        { key: "codeBlock", icon: <span className="text-[var(--fs-tiny)] font-bold">{"<>"}</span>, label: "程式碼塊" },
                        { key: "rule", icon: <Minus className="size-3.5" />, label: "插入分隔線" },
                        { type: "divider" },
                        { key: "clear", icon: <Eraser className="size-3.5" />, label: "清除格式" },
                    ],
                    onClick: ({ key }) => {
                        if (key === "code") editor?.chain().focus().toggleCode().run();
                        else if (key === "codeBlock") editor?.chain().focus().toggleCodeBlock().run();
                        else if (key === "rule") editor?.chain().focus().setHorizontalRule().run();
                        else if (key === "clear") editor?.chain().focus().clearNodes().unsetAllMarks().run();
                    },
                }}
            >
                <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md outline-none hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8" aria-label="更多格式"><MoreHorizontal className="size-4" /></button>
            </Dropdown>
        </div>
    );
}

function EditorToolButton({ label, active = false, children, onClick }: { label: string; active?: boolean; children: ReactNode; onClick: () => void }) {
    const theme = canvasThemes[useActiveTheme()];
    return (
        <Tooltip title={label}>
            <button type="button" aria-label={label} aria-pressed={active} className="grid size-8 shrink-0 place-items-center rounded-md outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/8 [&_svg]:size-3.5" style={{ background: active ? theme.toolbar.activeBg : undefined, color: active ? theme.accent.primary : undefined }} onClick={onClick}>{children}</button>
        </Tooltip>
    );
}

function ToolbarDivider() {
    return <span className="mx-1 h-5 w-px shrink-0 bg-black/10 dark:bg-white/10" />;
}

function emptyTextDocument(): JSONContent {
    return { type: "doc", content: [{ type: "paragraph" }] };
}

function plainTextDocument(content: string): JSONContent {
    if (!content) return emptyTextDocument();
    return {
        type: "doc",
        content: content.split("\n").map((line) => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : undefined })),
    };
}

function countWords(content: string) {
    const latinWords = content.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
    const cjkCharacters = content.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length || 0;
    return latinWords + cjkCharacters;
}
