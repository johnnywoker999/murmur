import { create } from "zustand";

import { DIRECTOR_DEFAULT_MODE, DIRECTOR_ENTRY_MODE, directorModeCapabilities, resolveDirectorModeTransition, type DirectorMode } from "@/lib/canvas/director/director-modes";
import { DIRECTOR_DEFAULT_VIEW_MODE, type DirectorViewMode } from "@/lib/canvas/director/director-view-modes";
import type { DirectorRenderMode } from "@/types/director";

type DirectorWorkbenchStore = {
    workspaceView: "scene" | "preview";
    workspaceViewRestore: { viewMode: DirectorViewMode; sequencerVisible: boolean; renderMode: DirectorRenderMode } | null;
    selectedObjectId: string | null;
    selectedBone: string | null;
    selectedLightId: string | null;
    mode: DirectorMode;
    /** 取景模式（3D/CAM/五個正交軸向）。純視口狀態，不影響一級模式的能力矩陣。 */
    viewMode: DirectorViewMode;
    transformMode: "translate" | "rotate" | "scale";
    renderMode: DirectorRenderMode;
    playhead: number;
    playing: boolean;
    autoKey: boolean;
    sequencerHeight: number;
    sequencerVisible: boolean;
    setSelectedObjectId: (id: string | null) => void;
    setSelectedBone: (bone: string | null) => void;
    setSelectedLightId: (id: string | null) => void;
    /** 切換一級模式。離開動畫模式時一併停播、關 Auto Key、夾回合法渲染檢視。 */
    setMode: (mode: DirectorMode) => void;
    /** 切換取景模式。UI-only：不寫入 DirectorScene，不產生 undo/history。 */
    setViewMode: (mode: DirectorViewMode) => void;
    /** 頂層工作區切換隻影響視口與時間線顯示，不寫入場景資料。 */
    setWorkspaceView: (view: "scene" | "preview") => void;
    setTransformMode: (mode: DirectorWorkbenchStore["transformMode"]) => void;
    /** 切換渲染檢視。當前模式不允許的檢視一律忽略，不做靜默降級。 */
    setRenderMode: (mode: DirectorRenderMode) => void;
    setPlayhead: (time: number) => void;
    setPlaying: (playing: boolean) => void;
    setAutoKey: (autoKey: boolean) => void;
    setSequencerHeight: (height: number) => void;
    setSequencerVisible: (visible: boolean) => void;
    reset: () => void;
};

const initialState = {
    workspaceView: "scene" as const,
    workspaceViewRestore: null,
    mode: DIRECTOR_ENTRY_MODE,
    viewMode: DIRECTOR_DEFAULT_VIEW_MODE,
    selectedObjectId: null,
    selectedBone: null,
    selectedLightId: null,
    transformMode: "translate" as const,
    renderMode: "beauty" as const,
    playhead: 0,
    playing: false,
    autoKey: false,
    sequencerHeight: 130,
    sequencerVisible: false,
};

export const useDirectorWorkbenchStore = create<DirectorWorkbenchStore>((set) => ({
    ...initialState,
    setSelectedObjectId: (selectedObjectId) => set({ selectedObjectId, selectedBone: null, selectedLightId: null }),
    setSelectedBone: (selectedBone) => set({ selectedBone }),
    setSelectedLightId: (selectedLightId) => set({ selectedLightId, selectedObjectId: null, selectedBone: null }),
    setMode: (mode) => set((state) => ({
        ...resolveDirectorModeTransition({ mode, playing: state.playing, autoKey: state.autoKey, renderMode: state.renderMode }),
        sequencerVisible: mode === "animate" ? true : state.sequencerVisible,
    })),
    setViewMode: (viewMode) => set({ viewMode }),
    setWorkspaceView: (workspaceView) => set((state) => {
        if (workspaceView === state.workspaceView) return {};
        if (workspaceView === "preview") {
            return {
                workspaceView,
                workspaceViewRestore: { viewMode: state.viewMode, sequencerVisible: state.sequencerVisible, renderMode: state.renderMode },
                viewMode: "camera",
                sequencerVisible: true,
                renderMode: "beauty",
            };
        }
        return {
            workspaceView,
            viewMode: state.workspaceViewRestore?.viewMode || state.viewMode,
            sequencerVisible: state.workspaceViewRestore?.sequencerVisible ?? state.sequencerVisible,
            renderMode: state.workspaceViewRestore?.renderMode || state.renderMode,
            workspaceViewRestore: null,
        };
    }),
    setTransformMode: (transformMode) => set({ transformMode }),
    // 夾在 store 層而不是隻在 UI 層過濾：dock 與頂欄是兩條路徑，
    // 只擋其中一條遲早會漏（本輪就漏過一次：dock 的「骨骼檢視」在擺場模式仍可點）。
    setRenderMode: (renderMode) => set((state) => (directorModeCapabilities(state.mode).renderModes.includes(renderMode) ? { renderMode } : {})),
    setPlayhead: (playhead) => set({ playhead }),
    setPlaying: (playing) => set({ playing }),
    setAutoKey: (autoKey) => set({ autoKey }),
    setSequencerHeight: (sequencerHeight) => set({ sequencerHeight: Math.max(130, Math.min(620, sequencerHeight)) }),
    setSequencerVisible: (sequencerVisible) => set({ sequencerVisible }),
    reset: () => set(initialState),
}));
