import React, { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardTableHeight } from "@/lib/canvas/canvas-storyboard-layout";
import { batchReferenceHandleY } from "@/lib/canvas/canvas-batch-table";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export const ConnectionPath = React.memo(function ConnectionPath({
    connection,
    from,
    to,
    fromScrollTop = 0,
    toScrollTop = 0,
    active,
    visualMode = "full",
    hideVisual = false,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    fromScrollTop?: number;
    toScrollTop?: number;
    active: boolean;
    visualMode?: "full" | "hover-only";
    hideVisual?: boolean;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useActiveTheme()];
    const [hovered, setHovered] = useState(false);
    const { pathD, startX, startY, endX, endY } = canvasConnectionPath(connection, from, to, fromScrollTop, toScrollTop);
    const emphasized = active || hovered;
    // The public read-only LibTV overview uses hairline, low-contrast graph
    // wires at 10% zoom. Keep the fixture's wires visually faithful without
    // changing the normal interactive connection treatment.
    const denseReadonlyWire = connection.id.startsWith("libtv-dense-");
    const showVisual = shouldShowConnectionVisual({ visualMode, hovered, hideVisual });
    const showEmphasis = !hideVisual && emphasized && !denseReadonlyWire;
    const gradientId = `canvas-flow-${connection.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    return (
        <g data-canvas-connection-id={connection.id}>
            {showEmphasis ? <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={startX} y1={startY} x2={endX} y2={endY}>
                    <stop offset="0%" stopColor={theme.node.muted} stopOpacity={0.18} />
                    <stop offset="48%" stopColor={theme.accent.primary} stopOpacity={0.58} />
                    <stop offset="100%" stopColor={theme.accent.primary} stopOpacity={0.34} />
                </linearGradient>
                {/* 流光頭部的軟化漸變：兩端透明、中間亮，避免短劃線看起來是硬色塊 */}
                <linearGradient id={`${gradientId}-comet`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={theme.accent.primary} stopOpacity={0} />
                    <stop offset="45%" stopColor={theme.accent.primary} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={theme.accent.primary} stopOpacity={0} />
                </linearGradient>
            </defs> : null}
            {/* 光暈：只在強調態渲染。blur 是 filter，成本隨線條數量線性上升，
                常態幾十條線全開會明顯掉幀，所以刻意只給懸停/選中的那一條。
                墊在底襯描邊之下，不改動常態可讀性那幾層。 */}
            {showEmphasis ? <path
                d={pathD}
                stroke={theme.accent.primary}
                strokeWidth="8"
                vectorEffect="non-scaling-stroke"
                strokeOpacity={0.18}
                fill="none"
                strokeLinecap="round"
                style={{ pointerEvents: "none", filter: "blur(3px)" }}
            /> : null}
            <path
                data-connection-id={connection.id}
                data-connection-active={active ? "true" : "false"}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                vectorEffect="non-scaling-stroke"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            {showVisual ? <path
                d={pathD}
                stroke={theme.node.muted}
                strokeWidth={denseReadonlyWire ? 0.75 : emphasized ? 5 : 2.5}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={denseReadonlyWire ? 0.12 : emphasized ? 0.18 : 0.1}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={denseReadonlyWire ? "2 12" : undefined}
                style={{ pointerEvents: "none" }}
            /> : null}
            {showVisual ? <path
                d={pathD}
                stroke={emphasized ? theme.accent.primary : theme.node.muted}
                strokeWidth={denseReadonlyWire ? 0.75 : emphasized ? 2.8 : 1.5}
                vectorEffect="non-scaling-stroke"
                strokeOpacity={denseReadonlyWire ? 0.16 : emphasized ? 0.95 : 0.62}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={denseReadonlyWire ? "2 12" : undefined}
                style={{ pointerEvents: "none" }}
            /> : null}
            {showVisual ? <>
                <circle cx={startX} cy={startY} r={denseReadonlyWire ? 0.35 : emphasized ? 3.5 : 2} fill={emphasized ? theme.accent.primary : theme.node.muted} fillOpacity={denseReadonlyWire ? 0.12 : emphasized ? 0.9 : 0.56} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
                <circle cx={endX} cy={endY} r={denseReadonlyWire ? 0.35 : emphasized ? 3.5 : 2} fill={emphasized ? theme.accent.primary : theme.node.muted} fillOpacity={denseReadonlyWire ? 0.12 : emphasized ? 0.9 : 0.56} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
            </> : null}
            {showVisual && emphasized ? <path
                className="canvas-connection-flow"
                d={pathD}
                stroke={`url(#${gradientId})`}
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
                strokeOpacity="0.84"
                strokeDasharray="18 26"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: "none" }}
            /> : null}
            {/* 流光：一小段高亮沿路徑跑。週期與虛線流動刻意不同（2.1s vs 1.25s），
                兩者錯拍才像有光在走；同頻會鎖成一條整體平移的虛線。 */}
            {showEmphasis ? <path
                className="canvas-connection-comet"
                d={pathD}
                stroke={`url(#${gradientId}-comet)`}
                strokeWidth="2.6"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="16 118"
                fill="none"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
            /> : null}
        </g>
    );
}, (previous, next) => previous.connection === next.connection && previous.from === next.from && previous.to === next.to && previous.active === next.active && previous.visualMode === next.visualMode && previous.hideVisual === next.hideVisual && previous.fromScrollTop === next.fromScrollTop && previous.toScrollTop === next.toScrollTop);

export function canvasConnectionPath(connection: CanvasConnection, from: CanvasNodeData, to: CanvasNodeData, fromScrollTop = 0, toScrollTop = 0) {
    if (connection.pathD) return { pathD: connection.pathD, startX: from.position.x + from.width, startY: from.position.y + from.height / 2, endX: to.position.x, endY: to.position.y + to.height / 2 };
    const startX = from.position.x + from.width;
    const startY = connectionHandleY(from, connection.fromHandleId, fromScrollTop);
    const endX = to.position.x;
    const endY = connectionHandleY(to, connection.toHandleId, toScrollTop);
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    return { pathD: `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`, startX, startY, endX, endY };
}

export function shouldShowConnectionVisual({ visualMode, hovered, hideVisual }: { visualMode: "full" | "hover-only"; hovered: boolean; hideVisual: boolean }) {
    return !hideVisual && (visualMode === "full" || hovered);
}

export function activeConnectionPath(node: CanvasNodeData | undefined, handle: ConnectionHandle, mouseWorld: Position, target?: CanvasNodeData, nodeScrollTop = 0) {
    if (!node) return "";
    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? connectionHandleY(node, handle.handleId, nodeScrollTop) : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : connectionHandleY(node, handle.handleId, nodeScrollTop);
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? connectionHandleY(target) : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? connectionHandleY(target) : endY;
    const distance = Math.abs(snappedEndX - snappedStartX);
    return `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + distance * 0.5} ${snappedStartY}, ${snappedEndX - distance * 0.5} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;
}

/**
 * 連線在節點上的接入 Y。
 *
 * 單埠的一側（左右各一個出入口，除分鏡指令碼外都是）**永遠取邊的正中**：
 * 之前按滑鼠落點比例取 Y，多條線接同一個埠就會沿著邊散開，視覺上像節點有很多埠。
 * 真正的多埠只存在於分鏡指令碼的 `row:` 控制程式碼；普通節點始終連線到邊緣
 * 垂直中心，避免同一個節點因滑鼠落點產生漂移的“偽埠”。
 */
export function connectionHandleY(node: CanvasNodeData, handleId?: string, scrollTop = 0) {
    const batchY = batchReferenceHandleY(node, handleId);
    if (batchY !== undefined) return batchY;
    if (handleId === "storyboard:context") return node.position.y + node.height - (node.metadata?.storyboardComposerHeight || 104) / 2;
    if (!handleId?.startsWith("row:")) return node.position.y + node.height / 2;
    const rowId = handleId.slice(4);
    const index = (node.metadata?.storyboard?.rows || []).findIndex((row) => row.id === rowId);
    if (index < 0) return node.position.y + node.height / 2;
    const tableHeight = storyboardTableHeight(node.height, node.metadata?.storyboardComposerHeight);
    const localY = Math.min(Math.max(index * STORYBOARD_ROW_HEIGHT + STORYBOARD_ROW_HEIGHT / 2 - scrollTop, 4), tableHeight - 4);
    return node.position.y + STORYBOARD_HEADER_HEIGHT + localY;
}
