import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Checkbox } from "./checkbox";

/**
 * CheckboxGroup — 核取方塊組（自研，原生 input，無依賴）。
 *
 * - 容器不預設佈局：呼叫方用 className 決定排列（垂直傳 `flex flex-col gap-1.5`，
 *   網格傳 `grid grid-cols-2 gap-2`），與 AntD Checkbox.Group 行為一致。
 * - 受控 value: V[] + onChange(values)，泛型覆蓋列舉/字串場景；
 *   可直接替換 AntD Checkbox.Group（options/value/onChange/disabled）。
 * - 對標：AntD Checkbox.Group。
 */

export interface CheckboxGroupOption<V extends string = string> {
    value: V;
    label: ReactNode;
    disabled?: boolean;
}

export interface CheckboxGroupProps<V extends string = string> {
    value?: V[];
    onChange?: (values: V[]) => void;
    options: Array<CheckboxGroupOption<V>>;
    /** 組整體停用 */
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}

export function CheckboxGroup<V extends string = string>({ value = [], onChange, options, disabled = false, ariaLabel, className }: CheckboxGroupProps<V>) {
    const toggle = (optionValue: V, checked: boolean) => {
        if (disabled) return;
        const next = checked ? [...value, optionValue] : value.filter((item) => item !== optionValue);
        onChange?.(next);
    };

    return (
        <div data-slot="checkbox-group" role="group" aria-label={ariaLabel} className={className}>
            {options.map((option) => (
                <Checkbox key={option.value} checked={value.includes(option.value)} disabled={disabled || option.disabled} onChange={(event) => toggle(option.value, event.target.checked)}>
                    {option.label}
                </Checkbox>
            ))}
        </div>
    );
}
