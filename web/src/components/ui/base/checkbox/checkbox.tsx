import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — 核取方塊（自研，原生 input + 自繪 glyph，無依賴）。
 *
 * 設計約束（對齊 ui/README 與 ADR-0008）：
 * - 原生 <input type="checkbox"> 承載語義與鍵盤（簡單件不走 react-aria-components）；
 *   hidden input + peer 視覺盒：:focus-visible ring 落在盒上，aria 狀態由原生保證。
 * - 只消費三層 token：box border-border / 選中 bg-foreground + text-background（中性反色），
 *   hover 加深 border、焦點 ring-ring、停用 opacity；無裸色。
 * - indeterminate：非受控 DOM 屬性，useLayoutEffect 同步到 input.indeterminate
 *   （樣式經 data-indeterminate 落在視覺盒上）。
 * - API 對齊 AntD Checkbox：checked/defaultChecked/disabled/indeterminate/onChange/children，
 *   可直接替換；value 傳 string 時隨原生 input 提交。
 * 對標：AntD Checkbox；boardui base/checkbox。
 */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
    /** 核取方塊尺寸（視覺盒）。預設 md。 */
    size?: "sm" | "md";
    /** 半選態（視覺 + input.indeterminate） */
    indeterminate?: boolean;
    /** 右側標籤 */
    children?: ReactNode;
    /** bare：不渲染 label 根（外層已由呼叫方提供 label/點選區時用，避免 label 巢狀） */
    bare?: boolean;
    /** 類名附加到根元素 */
    className?: string;
}

const BOX_SIZE: Record<"sm" | "md", string> = {
    sm: "size-3.5 rounded-[3px]",
    md: "size-4 rounded",
};

export function Checkbox({ size = "md", indeterminate = false, children, bare = false, className, disabled, checked, ...props }: CheckboxProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useLayoutEffect(() => {
        if (inputRef.current) {
            inputRef.current.indeterminate = indeterminate;
        }
    }, [indeterminate]);

    const inner = (
        <>
            <input ref={inputRef} type="checkbox" disabled={disabled} checked={checked} className="peer sr-only" {...props} />
            <span
                aria-hidden="true"
                data-indeterminate={indeterminate || undefined}
                className={cn(
                    "flex shrink-0 items-center justify-center border transition-colors motion-reduce:transition-none",
                    "border-border text-background",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
                    "peer-checked:border-foreground peer-checked:bg-foreground",
                    "peer-disabled:opacity-45",
                    !checked && !indeterminate && "bg-transparent group-hover/checkbox:border-foreground/50",
                    BOX_SIZE[size],
                )}
            >
                {/* checked 勾（indeterminate 時隱藏，改顯短橫線） */}
                <svg viewBox="0 0 12 12" className={cn("size-3 stroke-current stroke-[2.2]", indeterminate ? "hidden" : "block")}>
                    <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {/* indeterminate 短橫線 */}
                <svg viewBox="0 0 12 12" className={cn("size-3 stroke-current stroke-[2]", indeterminate ? "block" : "hidden")}>
                    <path d="M2.8 6 H9.2" fill="none" strokeLinecap="round" />
                </svg>
            </span>
        </>
    );

    if (bare) {
        return <span className={cn("group/checkbox inline-flex items-center", disabled && "cursor-not-allowed", className)}>{inner}</span>;
    }

    return (
        <label data-slot="checkbox" className={cn("group/checkbox inline-flex cursor-pointer select-none items-center gap-2 align-middle", disabled && "cursor-not-allowed", className)}>
            {inner}
            {children !== undefined && <span className={cn("text-sm leading-none text-foreground", disabled && "opacity-60")}>{children}</span>}
        </label>
    );
}
