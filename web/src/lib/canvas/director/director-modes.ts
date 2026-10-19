import type { DirectorRenderMode } from "@/types/director";

/**
 * 導演臺一級模式。
 *
 * mode 是工作臺 UI 狀態，絕不寫入 DirectorScene —— 場景是內容，模式是當前怎麼看內容。
 * 這裡只做純粹的「模式 -> 能力」對映與切換清理，元件層照著 capabilities 決定顯示什麼。
 */

export type DirectorMode = "layout" | "pose" | "animate" | "camera";

export type DirectorModeCapabilities = {
    /** 時間軸是否顯示。只有動畫模式顯示。 */
    timeline: boolean;
    /** 是否允許記錄/刪除關鍵幀與 Auto Key。只有動畫模式允許。 */
    keyframes: boolean;
    /** 是否開放骨骼檢視與多選骨骼編輯。單個演員的姿勢檢查器不受此能力限制。 */
    bones: boolean;
    /** 是否突出 shot/camera 檢查器與運鏡入口。攝影機模式突出。 */
    cameraTools: boolean;
    /** 該模式允許的渲染檢視。擺場不給深度/法線這類高階檢視。 */
    renderModes: DirectorRenderMode[];
};

const CAPABILITIES: Record<DirectorMode, DirectorModeCapabilities> = {
    // 擺場：先把人和物放對位置，隱藏骨骼疊加檢視/多選骨骼編輯、關鍵幀、Auto Key、深度/法線。
    layout: { timeline: false, keyframes: false, bones: false, cameraTools: false, renderModes: ["beauty", "clay"] },
    // 姿態：調骨骼與姿勢，但不預設製造關鍵幀。
    pose: { timeline: false, keyframes: false, bones: true, cameraTools: false, renderModes: ["beauty", "clay", "pose"] },
    // 動畫：唯一顯示時間軸、允許 Auto Key 與錄製關鍵幀的模式。
    animate: { timeline: true, keyframes: true, bones: true, cameraTools: false, renderModes: ["beauty", "clay", "pose"] },
    // 攝影機：突出機位、對齊檢視與運鏡；深度/法線在這裡才有意義。
    camera: { timeline: false, keyframes: false, bones: false, cameraTools: true, renderModes: ["beauty", "clay", "depth", "normal"] },
};

export const DIRECTOR_MODES: Array<{ mode: DirectorMode; label: string; hint: string }> = [
    { mode: "layout", label: "擺場", hint: "擺放演員、道具與燈光" },
    { mode: "pose", label: "姿態", hint: "調整選中演員的骨骼與姿勢" },
    { mode: "animate", label: "動畫", hint: "時間軸、關鍵幀與 Auto Key" },
    { mode: "camera", label: "攝影機", hint: "機位、對齊檢視與運鏡" },
];

export const DIRECTOR_DEFAULT_MODE: DirectorMode = "layout";

/** 入口先是擺場；左側機位預設列表只是導航，不應強制切換右側檢查器。 */
export const DIRECTOR_ENTRY_MODE: DirectorMode = "layout";

export function directorModeCapabilities(mode: DirectorMode): DirectorModeCapabilities {
    return CAPABILITIES[mode] ?? CAPABILITIES[DIRECTOR_DEFAULT_MODE];
}

export type DirectorModeTransition = {
    mode: DirectorMode;
    playing: boolean;
    autoKey: boolean;
    renderMode: DirectorRenderMode;
};

/**
 * 切換模式時必須一起收斂的執行時狀態。
 *
 * 關鍵安全邊界：離開動畫模式一定停播 + 關 Auto Key。
 * 否則播放迴圈仍在推進 playhead，而 Auto Key 會在使用者以為只是「換了個模式」時
 * 繼續往場景裡寫關鍵幀 —— 那是後臺偷偷改內容。
 *
 * renderMode 同時被夾回目標模式允許的集合：不能帶著深度檢視退回擺場。
 */
export function resolveDirectorModeTransition(input: { mode: DirectorMode; playing: boolean; autoKey: boolean; renderMode: DirectorRenderMode }): DirectorModeTransition {
    const capabilities = directorModeCapabilities(input.mode);
    return {
        mode: input.mode,
        playing: capabilities.timeline ? input.playing : false,
        autoKey: capabilities.keyframes ? input.autoKey : false,
        renderMode: capabilities.renderModes.includes(input.renderMode) ? input.renderMode : "beauty",
    };
}
