export type CanvasStarterMode = "guided" | "freeform";

export type CanvasEmptyStateKind = "none" | "guided" | "freeform" | "linked";

export function resolveCanvasEmptyStateKind({
    nodeCount,
    shortDramaEnabled,
    isProjectLinked,
    starterMode,
}: {
    nodeCount: number;
    shortDramaEnabled: boolean;
    isProjectLinked: boolean;
    starterMode?: CanvasStarterMode;
}): CanvasEmptyStateKind {
    if (nodeCount > 0) return "none";
    if (!shortDramaEnabled) return "freeform";
    if (isProjectLinked) return "linked";
    // LibTV 的畫布預設直接進入自由節點狀態；短劇引導保留為顯式選擇後的入口，
    // 避免新畫布第一次開啟就被流程卡片覆蓋，且與已有畫布的空狀態保持一致。
    return starterMode === "guided" ? "guided" : "freeform";
}
