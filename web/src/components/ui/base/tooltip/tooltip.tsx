import type { ReactNode } from "react";
import { Tooltip as RACTooltip, TooltipTrigger, type Placement } from "react-aria-components";

import { cn } from "@/lib/utils";

/**
 * Tooltip — 氣泡提示（自研，react-aria-components overlay）。
 *
 * - API 對齊 AntD Tooltip（title/placement/children），title 為空時不渲染浮層。
 * - 浮層定位、進出場、焦點管理由 RAC 承擔（ADR-0008：複雜浮層以 RAC 為無障礙地基）。
 * - 樣式只吃語義 token：bg-surface-strong（light #fff / dark #2a2a2a）+ text-foreground +
 *   border-border hairline，無裸色；motion 走 RAC 動畫類 + motion-reduce 關停。
 * - trigger 包一層 inline-flex span：保證 RAC ref 定位可用（children 可為任意元件）。
 * - placement 對映 AntD → RAC（topLeft→top left …）。
 * 對標：AntD Tooltip；boardui base/tooltip。
 */

export type TooltipPlacement = "top" | "topLeft" | "topRight" | "bottom" | "bottomLeft" | "bottomRight" | "left" | "right";

const PLACEMENT_MAP: Record<TooltipPlacement, Placement> = {
    top: "top",
    topLeft: "top left",
    topRight: "top right",
    bottom: "bottom",
    bottomLeft: "bottom left",
    bottomRight: "bottom right",
    left: "left",
    right: "right",
};

export interface TooltipProps {
    title?: ReactNode;
    placement?: TooltipPlacement;
    /** 懸停延遲 ms（預設 350，貼近 AntD mouseEnterDelay） */
    delay?: number;
    className?: string;
    children: ReactNode;
}

export function Tooltip({ title, placement = "top", delay = 350, className, children }: TooltipProps) {
    if (!title) return <>{children}</>;

    return (
        <TooltipTrigger delay={delay}>
            <span className="inline-flex">{children}</span>
            <RACTooltip placement={PLACEMENT_MAP[placement]} offset={6} className={cn("z-50 max-w-64 rounded-md border border-border bg-surface-strong px-2 py-1 text-xs leading-relaxed text-foreground shadow-md", "ra-pop-in", className)}>
                {title}
            </RACTooltip>
        </TooltipTrigger>
    );
}
