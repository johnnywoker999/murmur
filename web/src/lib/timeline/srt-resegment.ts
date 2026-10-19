import type { SrtEntry } from "@/types/timeline";
import { serializeSrtEntries } from "./srt-parser";

export const DEFAULT_MAX_CHARS_PER_ENTRY = 35;
export const MIN_CHARS_PER_ENTRY = 20;
export const MAX_CHARS_PER_ENTRY_LIMIT = 60;
export const MIN_SEGMENT_DURATION_MS = 300;

const CJK_PUNCTUATION = "，。；！？、：";
const LATIN_PUNCTUATION = ",.;!?:";

/**
 * 在 text 中為 targetLen 附近找最佳斷點。
 * 返回切分位置 cut（前段為 text.slice(0, cut)，後段為 text.slice(cut)）。
 * 優先順序：中文標點 > 英文標點 > 空格 > 硬切 targetLen。
 * 在同一優先順序內選最靠右的位置（靠近 targetLen）。
 */
export function findBestBreakPoint(text: string, targetLen: number): number {
    if (text.length <= targetLen) {
        return text.length;
    }

    const windowStart = Math.max(1, Math.floor(targetLen * 0.6));
    const windowEnd = targetLen;

    // 優先順序 1：中文標點 — 從右向左掃描，最靠右優先
    for (let i = windowEnd - 1; i >= windowStart - 1; i -= 1) {
        if (CJK_PUNCTUATION.includes(text[i])) {
            return i + 1;
        }
    }

    // 優先順序 2：英文標點
    for (let i = windowEnd - 1; i >= windowStart - 1; i -= 1) {
        if (LATIN_PUNCTUATION.includes(text[i])) {
            return i + 1;
        }
    }

    // 優先順序 3：空格
    for (let i = windowEnd - 1; i >= windowStart - 1; i -= 1) {
        if (text[i] === " ") {
            return i + 1;
        }
    }

    // 優先順序 4：硬切
    return targetLen;
}

/**
 * 對已切分好的段列表應用最小時長約束（MIN_SEGMENT_DURATION_MS）。
 * 逐段檢查：若某段時長不足，將其 endMs 向後推，同時把下一段的 startMs 相應推移。
 * 最後一段的 endMs 始終等於原始 entry.endMs，不做調整。
 * 若總時長本身不足以滿足所有段的最小時長，接受違規（不崩潰，不重排）。
 */
function enforceMinDuration(segments: SrtEntry[], originalEndMs: number): SrtEntry[] {
    if (segments.length <= 1) {
        return segments;
    }
    const result = segments.map((s) => ({ ...s }));
    for (let i = 0; i < result.length - 1; i++) {
        const dur = result[i].endMs - result[i].startMs;
        if (dur < MIN_SEGMENT_DURATION_MS) {
            const needed = MIN_SEGMENT_DURATION_MS - dur;
            // 最多能推到下一段結束（即 originalEndMs 對於最後兩段），但不超過 originalEndMs
            const cap = Math.min(result[i + 1].endMs, originalEndMs);
            const newEnd = Math.min(result[i].endMs + needed, cap);
            result[i].endMs = newEnd;
            result[i + 1].startMs = newEnd;
        }
    }
    // 確保末段 endMs 不變
    result[result.length - 1].endMs = originalEndMs;
    return result;
}

/**
 * 把一個超長 entry 切成若干不超過 maxChars 的子 entry，遞迴切分。
 * 時間按字元數等比分配，最終應用 MIN_SEGMENT_DURATION_MS 下限。
 */
export function splitLongEntry(entry: SrtEntry, maxChars: number): SrtEntry[] {
    if (entry.text.length <= maxChars) {
        return [entry];
    }

    const cut = findBestBreakPoint(entry.text, maxChars);
    let frontText = entry.text.slice(0, cut).replace(/\s+$/, "");
    let backText = entry.text.slice(cut).replace(/^\s+/, "");

    if (frontText.length === 0 || backText.length === 0) {
        // 退化情況：空白裁剪後一側為空，回退到硬切
        frontText = entry.text.slice(0, maxChars);
        backText = entry.text.slice(maxChars);
    }

    const totalLen = frontText.length + backText.length;
    const durationMs = entry.endMs - entry.startMs;
    const frontDuration = Math.round((durationMs * frontText.length) / totalLen);
    const splitPointMs = entry.startMs + frontDuration;

    const frontEntry: SrtEntry = {
        index: entry.index,
        startMs: entry.startMs,
        endMs: splitPointMs,
        text: frontText,
    };
    const backEntry: SrtEntry = {
        index: entry.index,
        startMs: splitPointMs,
        endMs: entry.endMs,
        text: backText,
    };

    const frontSegments = frontText.length > maxChars ? splitLongEntry(frontEntry, maxChars) : [frontEntry];
    const backSegments = backText.length > maxChars ? splitLongEntry(backEntry, maxChars) : [backEntry];

    const segments = [...frontSegments, ...backSegments];
    return enforceMinDuration(segments, entry.endMs);
}

/**
 * 遍歷 entries，對每條超長的呼叫 splitLongEntry，最後重新編號 index 為 1..N。
 */
export function resegmentSrtEntries(entries: SrtEntry[], maxChars: number): SrtEntry[] {
    const split: SrtEntry[] = [];
    for (const entry of entries) {
        split.push(...splitLongEntry(entry, maxChars));
    }
    return split.map((entry, idx) => ({ ...entry, index: idx + 1 }));
}
