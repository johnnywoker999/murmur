import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Kbd — 快捷鍵提示鍵帽。
 *
 * 用途：展示鍵盤快捷鍵（⌘K、Shift+Enter、Esc 等），純展示，非互動。
 * token：字號 `fs-tiny`（text-tiny）、字型 font-mono、背景 bg-background（半透明）、
 *   邊框 var(--workspace-border)、文本 text-foreground。
 * 對標：接管私有實現 workspace-sidebar-nav.tsx / workspace-command-palette.tsx /
 *   canvas 快捷鍵彈窗中的 `<kbd>` 重複樣式；形態參考 shadcn kbd 與 BoardUI kbd。
 * 明暗：背景為背景色半透明 + 主題邊框，明暗雙主題自動適配，無額外差異。
 */
export interface KbdProps extends HTMLAttributes<HTMLElement> {}

export function Kbd({ className, children, ...props }: KbdProps) {
    return (
        <kbd
            data-slot="kbd"
            className={cn("inline-flex h-5 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-sm", "border border-[color:var(--workspace-border)] bg-background/60 px-1.5", "font-mono text-tiny font-medium text-foreground/60", className)}
            {...props}
        >
            {children}
        </kbd>
    );
}
