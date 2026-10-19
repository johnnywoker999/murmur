import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from "lucide-react";

import { IconButton } from "@/components/ui/base/buttons";

import { cn } from "@/lib/utils";

/**
 * Callout — 語義提示橫幅（圖示 + 標題 + 正文 + 可選操作）。
 *
 * 用途：頁面/面板內的輕量提示（資訊/成功/告警/錯誤），可帶操作按鈕；替代 AntD
 *   Alert 的靜態展示場景與頁面私有提示塊。
 * token：底 bg-surface-secondary、邊框 var(--workspace-border)/border-border、
 *   標題 text-foreground、正文 text-muted-foreground、tone 圖示色
 *   text-status-{success|warning|error}（info/default 用 text-muted-foreground）。
 * 對標：AntD Alert；dbx ErrorBanner（錯誤橫幅場景）；形態參考 shadcn alert。
 * 明暗：全部顏色走 token，明暗雙主題自動適配。
 */
export type CalloutTone = "info" | "success" | "warning" | "error";

const calloutIconByTone: Record<CalloutTone, LucideIcon> = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
};

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
    /** 語義 tone：default 等同 info（中性） */
    tone?: CalloutTone | "default";
    title?: ReactNode;
    /** 自定義圖示元件引用；預設按 tone 取 Info/CheckCircle2/AlertTriangle/XCircle */
    icon?: LucideIcon;
    action?: ReactNode;
    /** 顯示右上角關閉按鈕（closable）；點選後由呼叫方移除自身 */
    onClose?: () => void;
    /** 關閉按鈕的無障礙標籤 */
    closeLabel?: string;
}

export function Callout({ tone = "default", title, icon, action, onClose, closeLabel = "關閉", className, children, ...props }: CalloutProps) {
    const resolved = tone === "default" ? "info" : tone;
    const Icon = icon ?? calloutIconByTone[resolved];
    return (
        <div data-slot="callout" data-tone={resolved} className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-surface-secondary px-3.5 py-2.5", className)} {...props}>
            <Icon
                aria-hidden
                strokeWidth={1.75}
                className={cn("mt-px size-4 shrink-0", resolved === "success" && "text-status-success", resolved === "warning" && "text-status-warning", resolved === "error" && "text-status-error", resolved === "info" && "text-muted-foreground")}
            />
            <div className="min-w-0 flex-1">
                {title != null ? <p className="text-caption font-medium text-foreground">{title}</p> : null}
                {children != null ? <div className={cn("text-caption leading-relaxed text-muted-foreground", title != null && "mt-0.5")}>{children}</div> : null}
            </div>
            {action != null || onClose != null ? (
                <div className="flex shrink-0 items-start gap-1">
                    {action != null ? <div className="shrink-0">{action}</div> : null}
                    {onClose != null ? <IconButton variant="ghost" size="sm" icon={X} aria-label={closeLabel} onClick={onClose} /> : null}
                </div>
            ) : null}
        </div>
    );
}
