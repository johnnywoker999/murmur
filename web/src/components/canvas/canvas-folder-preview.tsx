import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "antd";
import { FileAudio, FileText, MoreHorizontal, Pencil, Plus, SlidersHorizontal, Sparkles, Video } from "lucide-react";

import { CANVAS_FOLDER_THEME_OPTIONS, resolveCanvasFolderTheme, resolveCanvasFolderThemeCover } from "@/lib/canvas/canvas-folder-theme";
import { canvasNodeVideoPreviewUrl } from "@/lib/canvas/canvas-media-preview";
import type { CanvasFolderStyle, CanvasFolderTheme, CanvasNodeData } from "@/types/canvas";
import { CanvasNodeType } from "@/types/canvas";

const FOLDER_STYLE_OPTIONS: Array<{ key: CanvasFolderStyle; label: string }> = [
    { key: "glass", label: "流光玻璃" },
    { key: "stacked", label: "內容陳列" },
    { key: "midnight", label: "午夜封面" },
    { key: "paper", label: "紙感收藏" },
    { key: "cinema", label: "電影膠片" },
    { key: "compact", label: "緊湊資料" },
];

export const CanvasFolderPreview = React.memo(function CanvasFolderPreview({
    data,
    childNodes,
    active,
    isDropTarget,
    readOnly,
    onToggleCollapsed,
    onTitleChange,
    onStyleChange,
    onThemeChange,
}: {
    data: CanvasNodeData;
    childNodes: CanvasNodeData[];
    active: boolean;
    isDropTarget: boolean;
    readOnly: boolean;
    onToggleCollapsed: (nodeId: string) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onStyleChange: (nodeId: string, style: CanvasFolderStyle) => void;
    onThemeChange: (nodeId: string, theme: CanvasFolderTheme) => void;
}) {
    const style = data.metadata?.folder?.style || "glass";
    const theme = resolveCanvasFolderTheme(data.metadata?.folder?.theme);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(data.title);
    const previewNodes = useMemo(() => childNodes.filter(canPreviewFolderNode).slice(0, 3), [childNodes]);
    const themeCover = resolveCanvasFolderThemeCover(theme, data.metadata?.folder?.themeCover);
    const showAdd = style === "glass" || childNodes.length === 0;
    const folderMenu = {
        selectedKeys: [`style:${style}`, `theme:${theme}`],
        items: [
            {
                key: "styles",
                label: "資料夾樣式",
                children: FOLDER_STYLE_OPTIONS.map((item) => ({ key: `style:${item.key}`, label: item.label })),
            },
            {
                key: "themes",
                label: "主題皮膚",
                children: CANVAS_FOLDER_THEME_OPTIONS.map((item) => ({ key: `theme:${item.key}`, label: item.label })),
            },
        ],
        onClick: ({ key }: { key: string }) => {
            if (key.startsWith("style:")) onStyleChange(data.id, key.slice(6) as CanvasFolderStyle);
            if (key.startsWith("theme:")) onThemeChange(data.id, key.slice(6) as CanvasFolderTheme);
        },
    };

    useEffect(() => setTitle(data.title), [data.title]);

    const commitTitle = () => {
        const next = title.trim() || "未命名資料夾";
        setTitle(next);
        setEditing(false);
        onTitleChange(data.id, next);
    };

    return (
        <div className={`canvas-folder-preview canvas-folder-preview-${style}${active ? " is-active" : ""}${isDropTarget ? " is-drop-target" : ""}`}>
            <div className="canvas-folder-back" aria-hidden>
                <FolderThemeMedia source={themeCover} />
            </div>

            <div className="canvas-folder-paper-sheet" aria-hidden />

            <div className="canvas-folder-preview-stack" aria-hidden>
                {(previewNodes.length ? previewNodes : [undefined, undefined]).map((node, index) => (
                    <div key={node?.id || `folder-placeholder-${index}`} className={`canvas-folder-preview-card canvas-folder-preview-card-${index + 1}`}>
                        <FolderNodeMedia node={node} />
                    </div>
                ))}
            </div>

            <div className="canvas-folder-front">
                <div className="canvas-folder-front-media" aria-hidden>
                    <FolderThemeMedia source={themeCover} />
                </div>
                <div className="canvas-folder-front-tint" aria-hidden />

                <div className="canvas-folder-copy">
                    {editing ? (
                        <input
                            autoFocus
                            className="canvas-folder-title-input"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onBlur={commitTitle}
                            onMouseDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") commitTitle();
                                if (event.key === "Escape") {
                                    setTitle(data.title);
                                    setEditing(false);
                                }
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            className="canvas-folder-title"
                            title={readOnly ? data.title : `${data.title} · 點選重新命名`}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (!readOnly) setEditing(true);
                            }}
                            onDoubleClick={(event) => {
                                event.stopPropagation();
                                if (!readOnly) setEditing(true);
                            }}
                        >
                            <span>{data.title}</span>
                            {!readOnly ? <Pencil aria-hidden /> : null}
                        </button>
                    )}
                    <span className="canvas-folder-meta">{style === "midnight" ? formatFolderDate(data.metadata?.folder?.createdAt) : `${childNodes.length} 項內容`}</span>
                </div>

                {!readOnly ? (
                    showAdd ? (
                        <button
                            type="button"
                            className="canvas-folder-action canvas-folder-add"
                            aria-label="展開資料夾並新增內容"
                            title="展開資料夾並新增內容"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleCollapsed(data.id);
                            }}
                        >
                            <Plus />
                        </button>
                    ) : (
                        <Dropdown trigger={["click"]} menu={folderMenu}>
                            <button
                                type="button"
                                className="canvas-folder-action canvas-folder-options"
                                aria-label={`資料夾選項，當前 ${childNodes.length} 項`}
                                title="切換資料夾樣式與主題"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <MoreHorizontal />
                            </button>
                        </Dropdown>
                    )
                ) : null}

                {!readOnly && showAdd ? (
                    <Dropdown trigger={["click"]} menu={folderMenu}>
                        <button type="button" className="canvas-folder-style-trigger" aria-label="切換資料夾樣式與主題" title="切換資料夾樣式與主題" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                            <MoreHorizontal />
                        </button>
                    </Dropdown>
                ) : null}

                {readOnly && childNodes.length > 0 ? <span className="canvas-folder-count">{childNodes.length}</span> : null}
            </div>
        </div>
    );
});

function canPreviewFolderNode(node: CanvasNodeData) {
    return node.type !== CanvasNodeType.Frame;
}

function FolderThemeMedia({ source }: { source: string }) {
    return <img src={source} alt="" loading="eager" decoding="async" draggable={false} />;
}

function FolderNodeMedia({ node }: { node?: CanvasNodeData }) {
    if (node?.type === CanvasNodeType.Image && node.metadata?.content) {
        return <img src={node.metadata.content} alt="" loading="lazy" decoding="async" draggable={false} />;
    }
    const videoPreview = node ? canvasNodeVideoPreviewUrl(node) : "";
    if (videoPreview) {
        return <img src={videoPreview} alt="" loading="lazy" decoding="async" draggable={false} />;
    }
    if (node?.type === CanvasNodeType.Drawing && (node.metadata?.drawingPreviewUrl || node.metadata?.content)) {
        return <img src={node.metadata.drawingPreviewUrl || node.metadata.content} alt="" loading="lazy" decoding="async" draggable={false} />;
    }
    if (node?.type === CanvasNodeType.Video) return <Video className="canvas-folder-file-icon" />;
    if (node?.type === CanvasNodeType.Audio) return <FileAudio className="canvas-folder-file-icon" />;
    if (node?.type === CanvasNodeType.Skill) return <Sparkles className="canvas-folder-file-icon" />;
    if (node?.type === CanvasNodeType.Config) return <SlidersHorizontal className="canvas-folder-file-icon" />;
    if (node?.type === CanvasNodeType.Text || node?.type === CanvasNodeType.Script) {
        return <span className="canvas-folder-text-preview">{node.metadata?.content || node.title}</span>;
    }
    if (node) return <FileText className="canvas-folder-file-icon" />;
    return <span className="canvas-folder-file-sheet" />;
}

function formatFolderDate(value?: string) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "剛剛建立";
    return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}
