import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface SettingsRowProps {
    label: string;
    description?: string;
    control?: ReactNode;
    align?: "center" | "top";
    className?: string;
    controlClassName?: string;
}

/**
 * SettingsRow —— 設定項行（左側標籤/說明 + 右側控制元件）。
 *
 * 用途：設定頁與偏好面板內"一行一個設定項"的排版，替代 Form.Item 的縱向大塊佈局。
 *   行間以細分隔線區分，資訊密度高、便於掃讀；最後一行自動去掉分隔線。
 * token：分隔線 border-foreground/10，標籤 text-foreground，說明 text-foreground/55。
 */
export function SettingsRow({ label, description, control, align = "center", className, controlClassName }: SettingsRowProps) {
    return (
        <div className={cn("flex w-full items-center gap-4 border-b border-foreground/10 py-3.5 last:border-b-0 last:pb-1", align === "top" && "items-start", className)}>
            <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{label}</span>
                {description ? <span className="mt-0.5 block text-xs leading-4 text-foreground/55">{description}</span> : null}
            </div>
            {control ? <div className={cn("shrink-0", controlClassName)}>{control}</div> : null}
        </div>
    );
}
