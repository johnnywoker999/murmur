import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * StatusBadge — 語義狀態徽章。
 *
 * 兩種形態：
 * - outline（預設）：圓點 + 文本，圓點承擔狀態色，底色 bg-secondary/60。
 * - filled：tone 色塊純文本膠囊（AntD Tag variant="filled" 觀感），無圓點。
 *
 * 用途：展示實體的語義狀態（成功/告警/失敗/進行中/中性），如任務狀態、同步狀態、
 *   節點狀態；替代 AntD Tag 的狀態標籤場景與各頁面私有實現。
 * token：outline 圓點取 bg-status-{success|warning|error|loading}、中性取前景色；
 *   底色 bg-secondary/60、文本 text-muted-foreground；filled 容器取
 *   bg-status-{tone}/15 + text-status-{tone}（中性取前景色混合）。
 * 對標：AntD Tag（狀態色標籤，variant="filled" 對應 filled）、BoardUI status-dot（狀態點）。
 * 明暗：全部顏色走 token，明暗雙主題自動適配。
 */
export const statusBadgeTone = cva("shrink-0 rounded-full", {
    variants: {
        tone: {
            neutral: "bg-foreground/50",
            success: "bg-status-success",
            warning: "bg-status-warning",
            error: "bg-status-error",
            loading: "bg-status-loading",
        },
    },
    defaultVariants: {
        tone: "neutral",
    },
});

export const statusBadgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full", {
    variants: {
        variant: {
            outline: "bg-secondary/60",
            filled: "font-medium",
        },
        size: {
            default: "px-2 py-0.5 text-caption",
            sm: "gap-1 px-1.5 py-px text-tiny",
        },
    },
    defaultVariants: {
        variant: "outline",
        size: "default",
    },
});

/** filled 容器底色：tone 色 12–15% 淡底（中性為前景色 8%） */
const filledTintClass: Record<string, string> = {
    neutral: "bg-foreground/8",
    success: "bg-status-success/15",
    warning: "bg-status-warning/15",
    error: "bg-status-error/15",
    loading: "bg-status-loading/15",
};

/** filled 文本色：tone 原色（中性為前景色 70%） */
const filledInkClass: Record<string, string> = {
    neutral: "text-foreground/70",
    success: "text-status-success",
    warning: "text-status-warning",
    error: "text-status-error",
    loading: "text-status-loading",
};

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> &
    VariantProps<typeof statusBadgeTone> &
    VariantProps<typeof statusBadgeVariants> & {
        /** 徽章文本；狀態語義由文本承擔（無文本時元件退化為純圓點/色塊） */
        label?: ReactNode;
    };

export function StatusBadge({ tone, variant = "outline", size, label, className, children, ...props }: StatusBadgeProps) {
    const resolvedTone = tone ?? "neutral";
    return (
        <span data-slot="status-badge" className={cn(statusBadgeVariants({ variant, size }), variant === "filled" && filledTintClass[resolvedTone], className)} {...props}>
            {variant === "outline" ? <span aria-hidden className={cn(statusBadgeTone({ tone }), "size-1.5", tone === "loading" && "motion-safe:animate-pulse")} /> : null}
            {label != null ? <span className={cn("text-muted-foreground", variant === "filled" && filledInkClass[resolvedTone])}>{label}</span> : null}
            {children}
        </span>
    );
}
