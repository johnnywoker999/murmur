import { Button, Select, Tooltip } from "antd";
import { ArrowUp, Square, X, Paperclip, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { AssistantPermissionMode } from "@/services/api/agent-assistant";
import { CanvasAssistantModelPicker } from "./canvas-assistant-model-picker";

const LINE_HEIGHT = 21;
const MIN_LINES = 3;
const MAX_LINES = 8;

type Props = {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    streaming: boolean;
    disabled: boolean;
    disabledReason?: string;
    references: CanvasResourceReference[];
    selectedCount: number;
    selectionAttached: boolean;
    onDetachSelection: () => void;
    modelBusy?: boolean;
    canSupplement?: boolean;
    supplementBusy?: boolean;
    hasAttachments?: boolean;
    inputBusy?: boolean;
    onFiles?: (files: File[]) => void;
    onOpenSkills?: () => void;
    onOpenReferences?: () => void;
    inputContent?: React.ReactNode;
    permissionMode?: AssistantPermissionMode;
    permissionLocked?: boolean;
    onPermissionChange?: (mode: AssistantPermissionMode) => void;
};

export function CanvasAssistantComposer({
    value,
    onChange,
    onSend,
    onStop,
    streaming,
    disabled,
    disabledReason,
    references,
    selectedCount,
    selectionAttached,
    onDetachSelection,
    modelBusy,
    canSupplement,
    supplementBusy,
    hasAttachments,
    inputBusy,
    onFiles,
    onOpenSkills,
    onOpenReferences,
    inputContent,
    permissionMode = "canvas",
    permissionLocked,
    onPermissionChange,
}: Props) {
    const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
    const fileInput = useRef<HTMLInputElement>(null);
    const height = Math.min(MAX_LINES * LINE_HEIGHT, Math.max(MIN_LINES * LINE_HEIGHT, contentHeight));
    const canSend = !disabled && (!streaming || canSupplement) && !supplementBusy && !inputBusy && (Boolean(value.trim()) || Boolean(hasAttachments));

    return (
        <footer className="canvas-assistant-composer" onDragOver={event => { if (onFiles && !disabled && event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }}
            onDrop={event => { if (onFiles && !disabled && event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); onFiles([...event.dataTransfer.files]); } }}
            onPasteCapture={event => { const files = [...event.clipboardData.files]; if (onFiles && !disabled && files.length) { event.preventDefault(); event.stopPropagation(); onFiles(files); const text = event.clipboardData.getData("text/plain"); if (text) onChange(value + text); } }}>
            <input ref={fileInput} type="file" accept="image/*,video/*,audio/*" multiple hidden aria-label="新增參考素材檔案" onChange={event => { onFiles?.([...event.target.files || []]); event.target.value = ""; }} />
            {!streaming && selectionAttached && selectedCount > 0 ? <div className="canvas-assistant-chips">
                    <span className="canvas-assistant-chip">
                        已選 {selectedCount} 個節點
                        <button type="button" aria-label="這條訊息不帶已選節點" onClick={onDetachSelection}>
                            <X className="size-3" />
                        </button>
                    </span>
            </div> : null}

            {inputContent}

            <div className="canvas-assistant-input" style={{ height: height + 14 }}>
                <CanvasResourceMentionTextarea
                    value={value}
                    references={references}
                    onChange={onChange}
                    onSubmit={() => { if (canSend) onSend(); }}
                    includeAssetLibrary
                    containerClassName="h-full min-h-0"
                    className="thin-scrollbar h-full w-full resize-none overflow-y-auto border-none bg-transparent px-3 py-1.5 text-[var(--fs-caption)] leading-[21px] !shadow-none !outline-none !ring-0 focus:!shadow-none focus:!outline-none focus:!ring-0 placeholder:text-[var(--muted-foreground)]"
                    onContentSizeChange={setContentHeight}
                    disabled={disabled}
                    placeholder={streaming ? "補充這次創作的要求" : "描述你的想法，或用 @ 引用素材"}
                    aria-label="給助手的訊息"
                />
            </div>

            {disabled && disabledReason ? <span className="canvas-assistant-meta">{disabledReason}</span> : null}

            <div className="canvas-assistant-composer-tools">
                {onFiles ? <Tooltip title="新增參考素材"><Button type="text" size="small" aria-label="新增參考素材" disabled={disabled || inputBusy} icon={<Paperclip size={15} />} onClick={() => fileInput.current?.click()} /></Tooltip> : null}
                {onOpenSkills ? <Tooltip title="選擇技能"><Button type="text" size="small" aria-label="選擇技能" disabled={disabled} icon={<Sparkles size={15} />} onClick={onOpenSkills} /></Tooltip> : null}
                {onOpenReferences ? <Button type="text" size="small" disabled={disabled} onClick={onOpenReferences}>畫布素材</Button> : null}
            </div>
            <div className="canvas-assistant-composer-footer">
                <div className="canvas-assistant-composer-settings">
                <CanvasAssistantModelPicker busy={disabled || streaming || Boolean(modelBusy)} />
                {onPermissionChange ? <Tooltip title={permissionLocked ? "本輪許可權已固定，結束後可更改" : "選擇助手可訪問和修改的範圍"}>
                    <Select className="canvas-assistant-permission" size="small" variant="borderless" aria-label="助手許可權" value={permissionMode} disabled={disabled || permissionLocked}
                        placement="topRight" popupMatchSelectWidth={false} onChange={onPermissionChange} options={[
                            { value: "read-only", label: "只讀", title: "檢視和分析，不修改內容" },
                            { value: "canvas", label: "當前畫布", title: "檢視素材並修改當前畫布" },
                            { value: "full-access", label: "完全訪問", title: "檢視素材，可修改所有畫布" },
                        ]} />
                </Tooltip> : null}
                </div>
                <div className="canvas-assistant-composer-actions">
                {streaming ? (
                    <>
                        <Button size="small" disabled={!canSend} loading={supplementBusy} onClick={onSend}>補充</Button>
                        <Button size="small" icon={<Square className="size-3" />} onClick={onStop}>停止</Button>
                    </>
                ) : (
                    <Tooltip title="Enter 傳送 · Shift + Enter 換行" placement="topRight">
                        <Button className="canvas-assistant-send" shape="circle" type="primary" aria-label="傳送" disabled={!canSend} icon={<ArrowUp className="size-4" />} onClick={onSend} />
                    </Tooltip>
                )}
                </div>
            </div>
        </footer>
    );
}
