export type CanvasShortcutItem = {
    id: string;
    title: string;
    keys: string[][];
};

export const CANVAS_SHORTCUTS: CanvasShortcutItem[] = [
    { id: "search", title: "搜尋畫布節點", keys: [["⌘", "F"]] },
    { id: "assistant", title: "開啟／關閉助手", keys: [["⌘", "J"]] },
    { id: "focus", title: "進入專注模式", keys: [["⌘", "Shift", "F"]] },
    { id: "move-tool", title: "切換移動工具", keys: [["V"]] },
    { id: "hand-tool", title: "切換抓手工具", keys: [["H"]] },
    { id: "select-all", title: "全選節點", keys: [["⌘", "A"]] },
    { id: "zoom-in", title: "放大畫布", keys: [["⌘", "+"]] },
    { id: "zoom-out", title: "縮小畫布", keys: [["⌘", "−"]] },
    { id: "actual-size", title: "恢復 100%", keys: [["⌘", "1"]] },
    { id: "fit-canvas", title: "適應全部節點", keys: [["⌘", "0"], ["⌘", "2"]] },
    { id: "fit-selection", title: "適應選中節點", keys: [["⌘", "3"]] },
    { id: "escape", title: "關閉節點搜尋", keys: [["Esc"]] },
];
