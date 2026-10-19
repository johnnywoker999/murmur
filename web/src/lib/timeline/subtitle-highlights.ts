import type { SrtEntry, SubtitleHighlight } from "@/types/timeline";

export function isValidSubtitleHighlight(entry: SrtEntry | undefined, highlight: SubtitleHighlight): boolean {
    if (!entry || entry.index !== highlight.entryIndex) {
        return false;
    }

    if (highlight.start < 0 || highlight.end <= highlight.start) {
        return false;
    }

    if (highlight.end > highlight.sourceText.length) {
        return false;
    }

    return highlight.highlightText === highlight.sourceText.slice(highlight.start, highlight.end);
}

export function isExpiredSubtitleHighlight(entry: SrtEntry | undefined, highlight: SubtitleHighlight): boolean {
    if (!entry || entry.index !== highlight.entryIndex) {
        return true;
    }

    return entry.text !== highlight.sourceText;
}

export function filterValidSubtitleHighlights(entries: SrtEntry[], highlights: SubtitleHighlight[]): SubtitleHighlight[] {
    const entryMap = new Map(entries.map((entry) => [entry.index, entry]));

    return highlights.filter((highlight) => {
        const entry = entryMap.get(highlight.entryIndex);
        return isValidSubtitleHighlight(entry, highlight) && !isExpiredSubtitleHighlight(entry, highlight);
    });
}

/**
 * 在重分段後，把舊高亮對映到新條目上。
 * 規則：highlightText 必須作為子串出現在某個新條目的 text 中；
 * 找到第一個匹配的條目，更新 entryIndex 和 start/end；
 * 找不到則放入 dropped（通常是跨切分點的關鍵詞）。
 */
export function remapHighlightsAfterResegment(oldHighlights: SubtitleHighlight[], newEntries: SrtEntry[]): { remapped: SubtitleHighlight[]; dropped: SubtitleHighlight[] } {
    const remapped: SubtitleHighlight[] = [];
    const dropped: SubtitleHighlight[] = [];

    for (const highlight of oldHighlights) {
        const target = newEntries.find((entry) => entry.text.includes(highlight.highlightText));
        if (!target) {
            dropped.push(highlight);
            continue;
        }
        const start = target.text.indexOf(highlight.highlightText);
        remapped.push({
            entryIndex: target.index,
            start,
            end: start + highlight.highlightText.length,
            highlightText: highlight.highlightText,
            sourceText: target.text,
        });
    }

    return { remapped, dropped };
}

// 無可用大模型配置時的本地回退：按終止標點取首段作為高亮，保證功能不中斷。
const TERMINAL_PUNCTUATION = "。！？；";

export function buildFallbackHighlights(entries: SrtEntry[]): SubtitleHighlight[] {
    const highlights: SubtitleHighlight[] = [];
    for (const entry of entries) {
        let terminalIndex = -1;
        for (let i = 0; i < entry.text.length; i += 1) {
            if (TERMINAL_PUNCTUATION.includes(entry.text[i])) {
                terminalIndex = i;
                break;
            }
        }
        if (terminalIndex <= 0) {
            continue;
        }
        const end = terminalIndex + 1;
        highlights.push({
            entryIndex: entry.index,
            start: 0,
            end,
            highlightText: entry.text.slice(0, end),
            sourceText: entry.text,
        });
    }
    return highlights;
}
