import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ToolButton — 工具啟用態按鈕（持久切換，可展開面板）。
 *
 * 用途：工具類按鈕——畫布工具 Dock、面板工具組：被按下時保持高亮（aria-pressed），
 *   或展開浮層面板（expands → aria-expanded）。active 持久態與 hover/按壓態區分
 *   明顯，配合畫布 ToolDefinition（active/expands/disabled 謂詞）渲染。
 * token：active 態 bg-surface-active + text-foreground，常態 bg-transparent +
 *   text-muted-foreground，hover bg-surface-hover；焦點環 ring-ring；
 *   danger 態啟用文字用 text-status-error。間距由 size 檔位控制。
 * 圖示契約：`icon` 傳 ReactNode（內聯 JSX 或元件元素），與畫布 tool-registry 的
 *   ToolDefinition.icon 欄位一致（icons 是內聯 JSX 如 <Undo2 />）；尺寸由本元件
 *   [&_svg] 規則統一控制。禁傳 icon className 改尺寸。
 * 對標：接管畫布工具 Dock 中按鈕渲染（aria-pressed 語義）；AntD Tooltip+Button
 *   組合的工具按鈕場景。參考 BoardUI tool 切換語義。
 * 明暗：全部顏色走 token；active 用按壓底語義 token，明暗自動適配。
 */
export const toolButtonVariants = cva(
    ["inline-flex select-none items-center justify-center gap-1.5 rounded-md", "font-medium transition-colors", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", "disabled:pointer-events-none disabled:opacity-45"],
    {
        variants: {
            variant: {
                // 工具條/面板內常規（常態透明，啟用常駐底）
                ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                // 常駐淺底（面板內分組工具）
                default: "bg-surface-secondary text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            },
            size: {
                xs: "h-6 px-1.5 text-tiny [&_svg]:size-3.5",
                sm: "h-7 px-2 text-caption [&_svg]:size-4",
                default: "h-8 px-2.5 text-caption [&_svg]:size-4",
                lg: "h-9 px-3 text-body [&_svg]:size-[18px]",
            },
            tone: {
                default: "",
                danger: "data-[active=true]:text-status-error",
            },
            active: {
                true: "",
                false: "",
            },
        },
        compoundVariants: [
            {
                variant: ["ghost", "default"],
                active: true,
                className: "bg-surface-active text-foreground hover:text-foreground",
            },
        ],
        defaultVariants: {
            variant: "ghost",
            size: "default",
            tone: "default",
            active: false,
        },
    },
);

export type ToolButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof toolButtonVariants> & {
        /** 圖示內容：ReactNode（內聯 JSX，與 tool-registry ToolDefinition.icon 對齊） */
        icon?: ReactNode;
        /** 持久啟用態（對映 aria-pressed=true） */
        active?: boolean;
        /** 面板展開型工具：active 走 aria-expanded 語義而非 pressed */
        expands?: boolean;
        loading?: boolean;
        /** 顯式文本標籤（提供時按帶標籤佈局渲染） */
        label?: ReactNode;
    };

export function ToolButton({ variant, size, tone, icon, active = false, expands = false, loading = false, label, className, type = "button", disabled, ...props }: ToolButtonProps) {
    const pressed = !expands && active;
    const expanded = expands && active;
    return (
        <button
            data-slot="tool-button"
            type={type}
            disabled={disabled || loading}
            aria-pressed={pressed || undefined}
            aria-expanded={expanded || undefined}
            aria-busy={loading || undefined}
            data-active={active || undefined}
            className={cn(toolButtonVariants({ variant, size, tone, active }), className)}
            {...props}
        >
            {loading ? <Loader2 aria-hidden className="animate-spin" /> : icon}
            {label != null ? <span>{label}</span> : null}
        </button>
    );
}
