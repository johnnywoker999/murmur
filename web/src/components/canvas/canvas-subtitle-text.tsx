import type { SubtitleHighlight, SubtitleStyle } from "@/types/timeline";

type SubtitleHighlightedTextProps = {
    text: string;
    highlight?: SubtitleHighlight;
    style: SubtitleStyle;
};

/**
 * 字幕文本的統一樣式渲染：未啟用高亮或沒有高亮資料時原樣輸出，否則給重點詞上底色。
 * 字幕彈窗與畫布影片節點疊加層共用，保證兩處高亮效果一致。
 */
export function SubtitleHighlightedText({ text, highlight, style }: SubtitleHighlightedTextProps) {
    if (!style.highlightEnabled || !highlight) return text;
    return (
        <>
            {text.slice(0, highlight.start)}
            <span
                style={{
                    background: style.highlightBackgroundColor,
                    color: style.highlightTextColor,
                    borderRadius: style.highlightRadius,
                    padding: `${style.highlightPaddingY}px ${style.highlightPaddingX}px`,
                }}
            >
                {text.slice(highlight.start, highlight.end)}
            </span>
            {text.slice(highlight.end)}
        </>
    );
}
