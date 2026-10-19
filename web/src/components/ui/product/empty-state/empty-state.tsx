import type { HTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * EmptyState — 空態佔位（圖示 + 標題 + 說明 + 可選操作）。
 *
 * 用途：列表/面板/畫布無資料或零結果時的引導佔位；替代 AntD Empty 的使用場景
 *   （搜尋零結果、資源為空、列表為空等頁面私有實現）。
 * token：圖示圈底 bg-secondary 半透明、圖示色 text-muted-foreground、標題
 *   text-foreground、說明 text-muted-foreground、字號 fs-body/fs-caption；間距走 --space-*。
 * 圖示契約：`icon` 傳 lucide 元件引用（預設 Inbox），尺寸/顏色由本元件用 token 決定，
 *   禁止呼叫方傳 icon className 改尺寸。
 * 對標：AntD Empty；形態參考 BoardUI empty-state。
 * 明暗：全部顏色走 token，明暗雙主題自動適配。
 */
export const emptyStateVariants = cva("flex flex-col items-center justify-center text-center", {
    variants: {
        size: {
            default: "gap-2.5 py-12",
            compact: "gap-1.5 py-6",
        },
    },
    defaultVariants: {
        size: "default",
    },
});

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof emptyStateVariants> & {
        /** lucide 圖示元件引用；預設 Inbox */
        icon?: LucideIcon;
        title?: ReactNode;
        description?: ReactNode;
        /** 操作區（按鈕/連結等），非必須 */
        action?: ReactNode;
    };

export function EmptyState({ size, icon: Icon = Inbox, title, description, action, className, ...props }: EmptyStateProps) {
    return (
        <div data-slot="empty-state" className={cn(emptyStateVariants({ size }), className)} {...props}>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                <Icon aria-hidden className="size-5 text-muted-foreground" strokeWidth={1.75} />
            </div>
            {title != null ? <p className="text-body font-medium text-foreground">{title}</p> : null}
            {description != null ? <p className="max-w-sm text-caption text-muted-foreground">{description}</p> : null}
            {action != null ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}
