import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Switch — 開關（自研，button role=switch，無依賴）。
 *
 * 設計約束（對齊 ui/README 與 ADR-0008）：
 * - <button type="button" role="switch" aria-checked> 承載語義與鍵盤（Space/Enter 原生），
 *   :focus-visible outline 落自身；無裸色、只消費三層 token。
 * - 開 = bg-foreground + 反色 thumb（bg-background 語義對齊 Checkbox 選中態），
 *   關 = bg-surface-tertiary + 髮絲內描邊 + surface-strong 抬升 thumb（同 SegmentedControl 選中面）。
 * - thumb 滑動用 translate-x 位移（尺寸檔固定行程），motion-reduce 關閉過渡。
 * - data-state="on|off" 暴露給上下文 CSS 覆蓋（admin 語義綠等保留於頁面層，不侵入元件）。
 * - API 對齊 AntD Switch：checked/defaultChecked/onChange/disabled/size/checkedChildren/
 *   unCheckedChildren/loading + aria-* 透傳；受控與否由 checked 是否傳入決定，
 *   onChange(checked) 單參。頂層元件接收 checked/onChange → Form.Item valuePropName="checked" 注入相容。
 * 對標：AntD Switch；boardui base/switch。
 */

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "size" | "onChange"> {
    /** 開關尺寸。預設 md；AntD small → sm 對映。 */
    size?: "sm" | "md";
    /** 受控：是否開啟 */
    checked?: boolean;
    /** 非受控初始值 */
    defaultChecked?: boolean;
    /** loading：拇指位換轉圈，忽略點選（視覺保留 checked 態） */
    loading?: boolean;
    /** 開啟時軌道內左側文案（2 字寬度檔） */
    checkedChildren?: ReactNode;
    /** 關閉時軌道內右側文案 */
    unCheckedChildren?: ReactNode;
    /** 變化回撥（AntD 同簽名：僅布林參） */
    onChange?: (checked: boolean) => void;
}

/** 幾何檔：軌道尺寸與 thumb 行程（thumb 用 left-0.5 起始 + translate-x 檔位） */
const SWITCH_SIZE: Record<"sm" | "md", { root: string; thumbPlain: string; thumbText: string; hasTextRoot: string }> = {
    sm: {
        root: "h-5 w-8 rounded-full",
        thumbPlain: "size-3.5 data-[state=on]:translate-x-3.5",
        thumbText: "size-3.5 data-[state=on]:translate-x-3.5",
        hasTextRoot: "",
    },
    md: {
        root: "h-6 w-11 rounded-full",
        thumbPlain: "size-4 data-[state=on]:translate-x-6",
        thumbText: "size-4 data-[state=on]:translate-x-9",
        hasTextRoot: "w-14",
    },
};

export function Switch({ size = "md", checked: checkedProp, defaultChecked = false, loading = false, checkedChildren, unCheckedChildren, onChange, disabled, className, "aria-label": ariaLabel, ...props }: SwitchProps) {
    const [innerChecked, setInnerChecked] = useState(defaultChecked);
    const controlled = checkedProp !== undefined;
    const checked = controlled ? checkedProp : innerChecked;
    const hasText = checkedChildren !== undefined || unCheckedChildren !== undefined;

    const handleClick = () => {
        if (disabled || loading) {
            return;
        }
        const next = !checked;
        if (!controlled) {
            setInnerChecked(next);
        }
        onChange?.(next);
    };

    const geometry = SWITCH_SIZE[size];
    const thumbClass = hasText ? geometry.thumbText : geometry.thumbPlain;

    return (
        <button
            type="button"
            role="switch"
            data-slot="switch"
            data-state={checked ? "on" : "off"}
            aria-checked={checked}
            aria-label={ariaLabel}
            aria-busy={loading || undefined}
            disabled={disabled}
            onClick={handleClick}
            className={cn(
                "relative inline-flex shrink-0 select-none items-center align-middle transition-colors motion-reduce:transition-none",
                "data-[state=on]:bg-foreground",
                "data-[state=off]:bg-surface-tertiary data-[state=off]:ring-1 data-[state=off]:ring-inset data-[state=off]:ring-foreground/15",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-45",
                geometry.root,
                hasText && size === "md" && geometry.hasTextRoot,
                className,
            )}
            {...props}
        >
            {/* 關態文案（右側） */}
            {unCheckedChildren !== undefined ? (
                <span
                    aria-hidden="true"
                    className={cn("absolute top-1/2 right-1.5 -translate-y-1/2 text-xs leading-none font-medium transition-opacity motion-reduce:transition-none", checked ? "text-foreground/55 opacity-0" : "text-foreground/55 opacity-100")}
                >
                    {unCheckedChildren}
                </span>
            ) : null}
            {/* 開態文案（左側，反色） */}
            {checkedChildren !== undefined ? (
                <span aria-hidden="true" className={cn("absolute top-1/2 left-1.5 -translate-y-1/2 text-xs leading-none font-medium transition-opacity motion-reduce:transition-none", checked ? "text-background opacity-100" : "text-background opacity-0")}>
                    {checkedChildren}
                </span>
            ) : null}
            {/* thumb / loading 轉圈 */}
            {loading ? (
                <span aria-hidden="true" className={cn("absolute inset-0 m-auto size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent", checked ? "text-background" : "text-foreground/60")} />
            ) : (
                <span
                    aria-hidden="true"
                    data-state={checked ? "on" : "off"}
                    className={cn("sc-switch-thumb absolute left-0.5 top-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-surface-strong transition-transform duration-200 ease-out motion-reduce:transition-none", thumbClass)}
                />
            )}
        </button>
    );
}
