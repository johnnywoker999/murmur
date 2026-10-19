import type { CSSProperties } from "react";

import type { SubtitleHighlight, SubtitleStyle } from "@/types/timeline";
import { SubtitleHighlightedText } from "./canvas-subtitle-text";

type CanvasSubtitleOverlayProps = {
    text: string;
    highlight?: SubtitleHighlight;
    style: SubtitleStyle;
};

const POSITION_STYLE: Record<SubtitleStyle["position"], CSSProperties> = {
    top: { top: "6%" },
    center: { top: "50%", transform: "translateY(-50%)" },
    bottom: { bottom: "8%" },
};

/**
 * 畫布影片節點上的即時字幕疊加層：按字幕樣式定位到影片畫面內。
 * 純展示層（pointer-events-none），不攔截畫布拖拽與播放器控制元件。
 */
export function CanvasSubtitleOverlay({ text, highlight, style }: CanvasSubtitleOverlayProps) {
    return (
        <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center" style={{ ...POSITION_STYLE[style.position], paddingLeft: "4%", paddingRight: "4%" }}>
            <span
                className="max-w-full whitespace-pre-wrap text-center"
                style={{
                    fontSize: style.fontSize,
                    lineHeight: 1.4,
                    color: style.color,
                    textShadow: "0 1px 3px rgba(0, 0, 0, 0.9)",
                }}
            >
                <SubtitleHighlightedText text={text} highlight={highlight} style={style} />
            </span>
        </div>
    );
}
