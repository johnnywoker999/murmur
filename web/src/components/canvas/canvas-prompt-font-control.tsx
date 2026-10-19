import { Minus, Plus } from "lucide-react";
import { DEFAULT_PROMPT_FONT_SIZE, MAX_PROMPT_FONT_SIZE, MIN_PROMPT_FONT_SIZE, useCreationPreferencesStore } from "@/stores/use-creation-preferences-store";

export function CanvasPromptFontControl({ defaultFontSize = DEFAULT_PROMPT_FONT_SIZE }: { defaultFontSize?: number }) {
    const fontSize = useCreationPreferencesStore((state) => state.preferences.promptFontSize ?? defaultFontSize);
    const remember = useCreationPreferencesStore((state) => state.rememberPromptFontSize);
    return <div className="canvas-prompt-font-control" role="group" aria-label="提示詞字號" data-canvas-no-zoom>
        <span aria-hidden>字號</span>
        <button type="button" aria-label="縮小提示詞字號" title="縮小提示詞字號" disabled={fontSize <= MIN_PROMPT_FONT_SIZE} onClick={() => remember(fontSize - 2)}><Minus size={12} /></button>
        <output aria-label="當前提示詞字號">{fontSize}</output>
        <button type="button" aria-label="放大提示詞字號" title="放大提示詞字號" disabled={fontSize >= MAX_PROMPT_FONT_SIZE} onClick={() => remember(fontSize + 2)}><Plus size={12} /></button>
    </div>;
}
