import { Dropdown, type MenuProps } from "antd";
import type { MenuInfo } from "rc-menu/lib/interface";

import { Bone, Camera, Clapperboard, Compass, Layers, LoaderCircle, MousePointer2, Palette, Rotate3D, RotateCcw, Save, Scaling, Video } from "lucide-react";
import { useState, type ReactNode } from "react";

import { releaseDirectorFocusAfterPointer } from "@/lib/canvas/director/director-shortcuts";
import { DIRECTOR_MODES, type DirectorMode } from "@/lib/canvas/director/director-modes";
import type { DirectorRenderMode } from "@/types/director";

type DirectorViewportDockProps = {
    transformMode: "translate" | "rotate" | "scale";
    renderMode: DirectorRenderMode;
    /** 當前模式允許的渲染檢視。dock 只展示這些，避免成為繞過模式門控的第二條路徑。 */
    renderModes: DirectorRenderMode[];
    onTransformModeChange: (mode: DirectorViewportDockProps["transformMode"]) => void;
    onRenderModeChange: (mode: DirectorRenderMode) => void;
    timelineOpen: boolean;
    onToggleTimeline: () => void;
    captureBusy: boolean;
    captureReady: boolean;
    onCapture: () => void;
    onExportClay: () => void;
    exportBusy: boolean;
    onApplyToCanvas: () => void;
    applyBusy: boolean;
    saveRetryable: boolean;
    saveRetryBusy: boolean;
    onRetrySave: () => void;
    mode?: DirectorMode;
    onModeChange?: (mode: DirectorMode) => void;
    workspaceView?: "scene" | "preview";
    onWorkspaceViewChange?: (view: "scene" | "preview") => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
};

/** 渲染檢視按鈕的展示順序與圖示。實際可見項由 renderModes 過濾。 */
const RENDER_VIEW_BUTTONS: Array<{ mode: DirectorRenderMode; label: string; icon: ReactNode }> = [
    { mode: "beauty", label: "構圖預覽", icon: <Camera /> },
    { mode: "clay", label: "彩色白膜", icon: <Palette /> },
    { mode: "pose", label: "骨骼檢視", icon: <Bone /> },
    { mode: "depth", label: "深度檢視", icon: <Layers /> },
    { mode: "normal", label: "法線檢視", icon: <Compass /> },
];

const TRANSFORM_BUTTONS = [
    { mode: "translate", label: "移動", shortcut: "V", icon: <MousePointer2 /> },
    { mode: "rotate", label: "旋轉", shortcut: "R", icon: <Rotate3D /> },
    { mode: "scale", label: "縮放", shortcut: "F", icon: <Scaling /> },
] as const;

export function DirectorViewportDock({ transformMode, renderMode, renderModes, onTransformModeChange, onRenderModeChange, timelineOpen, onToggleTimeline, captureBusy, captureReady, onCapture, onExportClay, exportBusy, onApplyToCanvas, applyBusy, saveRetryable, saveRetryBusy, onRetrySave, mode = "layout", onModeChange = () => {}, workspaceView = "scene", onWorkspaceViewChange = () => {}, canUndo = false, canRedo = false, onUndo = () => {}, onRedo = () => {} }: DirectorViewportDockProps) {
    const [advancedMenu, setAdvancedMenu] = useState(false);
    const activeTransform = TRANSFORM_BUTTONS.find((item) => item.mode === transformMode) ?? TRANSFORM_BUTTONS[0];
    const releaseMenuFocus = (detail: number) => releaseDirectorFocusAfterPointer({ detail, currentTarget: document.activeElement as HTMLElement });
    const toolMenuItems: NonNullable<MenuProps["items"]> = [
        { type: "group" as const, key: "render", label: "檢視模式", children: RENDER_VIEW_BUTTONS.filter((item) => renderModes.includes(item.mode)).map((item) => ({ key: `render-${item.mode}`, icon: item.icon, label: item.label, onClick: ({ domEvent }) => { onRenderModeChange(item.mode); releaseMenuFocus(domEvent.detail); } })) },
        { type: "group" as const, key: "workbench", label: "工作臺", children: [
            { key: "export-clay", icon: exportBusy ? <LoaderCircle className="animate-spin" /> : <Video />, label: exportBusy ? "正在匯出白膜影片" : "匯出白膜影片", disabled: exportBusy, onClick: ({ domEvent }) => { onExportClay(); releaseMenuFocus(domEvent.detail); } },
            { key: "apply-to-canvas", icon: applyBusy ? <LoaderCircle className="animate-spin" /> : <Save />, label: applyBusy ? "正在應用到鏡頭" : "應用到鏡頭", disabled: applyBusy, onClick: ({ domEvent }) => { onApplyToCanvas(); releaseMenuFocus(domEvent.detail); } },
            ...(saveRetryable ? [{ key: "retry-save", icon: saveRetryBusy ? <LoaderCircle className="animate-spin" /> : <RotateCcw />, label: saveRetryBusy ? "正在重試儲存" : "重試儲存", disabled: saveRetryBusy, onClick: ({ domEvent }: MenuInfo) => { onRetrySave(); releaseMenuFocus(domEvent.detail); } }] : []),
        ] },
        { key: "director-navigation", label: "導演臺導航", icon: <Layers />, children: [
            { type: "group" as const, key: "director-mode", label: "導演臺模式", children: DIRECTOR_MODES.map((item) => ({ key: `director-mode-${item.mode}`, label: item.label, title: item.hint, onClick: ({ domEvent }) => { onModeChange(item.mode); releaseMenuFocus(domEvent.detail); } })) },
            { type: "group" as const, key: "workspace-view", label: "工作區檢視", children: [
                { key: "workspace-scene", label: "場景排程", onClick: ({ domEvent }) => { onWorkspaceViewChange("scene"); releaseMenuFocus(domEvent.detail); } },
                { key: "workspace-preview", label: "成片預演", onClick: ({ domEvent }) => { onWorkspaceViewChange("preview"); releaseMenuFocus(domEvent.detail); } },
            ] },
            { type: "group" as const, key: "history", label: "編輯歷史", children: [
                { key: "undo", icon: <RotateCcw />, label: "撤銷", disabled: !canUndo, onClick: ({ domEvent }) => { onUndo(); releaseMenuFocus(domEvent.detail); } },
                { key: "redo", icon: <RotateCcw className="scale-x-[-1]" />, label: "重做", disabled: !canRedo, onClick: ({ domEvent }) => { onRedo(); releaseMenuFocus(domEvent.detail); } },
            ] },
        ] },
    ];
    const transformMenuItems: NonNullable<MenuProps["items"]> = [
        ...TRANSFORM_BUTTONS.map((item) => ({
            key: item.mode,
            icon: item.icon,
            label: <span className="flex min-w-24 items-center justify-between gap-5"><span>{item.label}</span><span className="text-xs opacity-60">{item.shortcut}</span></span>,
            onClick: ({ domEvent }: MenuInfo) => { onTransformModeChange(item.mode); releaseMenuFocus(domEvent.detail); },
        })),
    ];
    return (
        <nav className="director-viewport-dock" aria-label="導演臺視口工具" data-director-mode={mode} data-workspace-view={workspaceView}>
            <Dropdown
                trigger={["click", "contextMenu"]}
                placement="topLeft"
                menu={{
                    selectable: true,
                    selectedKeys: [transformMode, `render-${renderMode}`, `director-mode-${mode}`, `workspace-${workspaceView}`],
                    items: advancedMenu ? toolMenuItems : transformMenuItems,
                }}
            >
                <button type="button" className="director-viewport-dock-button is-active" aria-label={activeTransform.label} aria-haspopup="menu" title={`${activeTransform.label} (${activeTransform.shortcut}) · 右鍵更多工具`} onClick={() => setAdvancedMenu(false)} onContextMenu={() => setAdvancedMenu(true)}>
                    {activeTransform.icon}
                </button>
            </Dropdown>
            <button type="button" className="director-viewport-dock-button disabled:opacity-40" aria-label="截圖" disabled={captureBusy || !captureReady} title={captureBusy ? "正在儲存截圖" : captureReady ? "截圖" : "視口載入中"} onClick={(event) => { onCapture(); releaseDirectorFocusAfterPointer(event); }}>{captureBusy ? <LoaderCircle className="animate-spin" /> : <Camera />}</button>
            <button type="button" className={`director-viewport-dock-button ${timelineOpen ? "is-active" : ""}`} aria-label="動畫時間軸" aria-pressed={timelineOpen} onClick={(event) => { onToggleTimeline(); releaseDirectorFocusAfterPointer(event); }}><Clapperboard /></button>
        </nav>
    );
}
