import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * IconButton — 純圖示按鈕（正方形、尺寸檔位、語義變體、loading 態）。
 *
 * 用途：面板/工具條裡的圖示觸發按鈕（新建、刪除、收起、關閉等）；替代 AntD
 *   Button `type="text"/"ghost" icon` 小尺寸場景與各頁私有 icon-button。
 * token：底 bg-surface-hover（ghost 懸停）/bg-surface-active（active 按壓）、
 *   圖示 text-muted-foreground（danger 用 text-status-error）、焦點環 ring-ring；
 *   hover/active 態全用語義 token，無裸色。
 * 圖示契約：`icon` 傳 lucide 元件引用，尺寸按 `size` 檔位由本元件決定；禁止呼叫方
 *   傳 icon className 改尺寸。必須傳 `aria-label`（純圖示無文本）。
 * 對標：dbx ui/button variants（ghost/outline/destructive、icon-xs/sm/lg）；
 *   AntD Button icon-only。
 * 明暗：全部顏色走 token；active 按壓底用 bg-surface-active，明暗自動適配。
 */
export const iconButtonVariants = cva(
    ["inline-flex shrink-0 items-center justify-center rounded-md", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", "disabled:pointer-events-none disabled:opacity-45", "motion-safe:active:scale-[0.96]"],
    {
        variants: {
            variant: {
                // 純透明 + hover 浮底（最常用：面板/工具條）
                ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
                // 常駐淺底
                default: "bg-surface-secondary text-muted-foreground hover:bg-surface-hover hover:text-foreground active:bg-surface-active",
                // 描邊
                outline: "border border-border bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                // 危險（文本色常駐紅）
                danger: "text-status-error hover:bg-surface-hover active:bg-surface-active",
                // 實心（中性黑底白圖示，主操作；active 反轉成白底黑字 + 內描邊，供選中態使用）
                solid: "bg-foreground text-background hover:opacity-85 active:opacity-75 data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-border",
            },
            size: {
                xs: "size-6 [&_svg]:size-3.5",
                sm: "size-7 [&_svg]:size-4",
                default: "size-8 [&_svg]:size-4",
                lg: "size-9 [&_svg]:size-[18px]",
            },
        },
        defaultVariants: {
            variant: "ghost",
            size: "default",
        },
    },
);

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof iconButtonVariants> & {
        /** lucide 圖示元件引用 */
        icon: LucideIcon;
        /** loading：替換為 spinner 並停用 */
        loading?: boolean;
        /** data-active 語義高亮（如開關組內當前項），僅裝飾，不改變 aria-pressed */
        active?: boolean;
    };

export function IconButton({ variant, size, icon: Icon, loading = false, active = false, className, type = "button", disabled, ...props }: IconButtonProps) {
    return (
        <button data-slot="icon-button" type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-active={active || undefined} className={cn(iconButtonVariants({ variant, size }), className)} {...props}>
            {loading ? <Loader2 aria-hidden className="animate-spin" /> : <Icon aria-hidden />}
        </button>
    );
}
