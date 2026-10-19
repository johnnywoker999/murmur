const maxChapterHeadingLength = 120;
const chineseChapterNumber = "[零〇○一二兩三四五六七八九十百千萬億壹貳叄肆伍陸柒捌玖拾佰仟\\d]+";
const englishChapterNumber = "(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const chapterTitleSuffix = "(?:\\s*[-—–:：·.]\\s*.*|\\s+.*)?";
const chapterHeadingPatterns = [
    new RegExp(`^(?:正文\\s*)?第\\s*${chineseChapterNumber}\\s*[章節捲回部篇集季幕]${chapterTitleSuffix}$`, "i"),
    new RegExp(`^(?:卷|篇|部|集|季|幕)\\s*${chineseChapterNumber}${chapterTitleSuffix}$`, "i"),
    new RegExp(`^(?:序|序幕|序章|序言|前言|前記|楔子|引子|引言|開篇|終章|尾聲|後記)${chapterTitleSuffix}$`, "i"),
    new RegExp(`^(?:番外(?:篇)?|附錄)(?:\\s*(?:第\\s*)?${chineseChapterNumber}\\s*[章節回篇]?)?${chapterTitleSuffix}$`, "i"),
    new RegExp(`^(?:chapter|book|part|volume)\\s+${englishChapterNumber}\\b${chapterTitleSuffix}$`, "i"),
    new RegExp(`^(?:prologue|preface|introduction|epilogue|afterword|appendix)${chapterTitleSuffix}$`, "i"),
];

export type ImportedNovelChapter = { title: string; plainText: string };

function chapterTitleFromLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed || Array.from(trimmed).length > maxChapterHeadingLength) return null;

    const title = trimmed
        .replace(/^[#＃]{1,6}\s*/, "")
        .replace(/^[\s=_*~\-—–]+|[\s=_*~\-—–]+$/g, "")
        .trim();
    const candidate = title
        .normalize("NFKC")
        .replace(/[【】\[\]「」『』〈〉《》〖〗]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // 只把較短且整行符合章節結構的文本當作標題，避免正文中提到“第一章”時誤切分。
    return chapterHeadingPatterns.some((pattern) => pattern.test(candidate)) ? title : null;
}

export function decodeNovelText(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        // 中文網文 TXT 常由舊版編輯器匯出為 GBK；GB18030 相容 GBK，並能覆蓋更多漢字。
        return new TextDecoder("gb18030").decode(bytes);
    }
}

export function splitTextIntoChapters(text: string) {
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [{ title: "第 1 章", plainText: "" }];
    const lines = normalized.split("\n");
    const sections: Array<{ title: string; lines: string[] }> = [];
    let current: { title: string; lines: string[] } | null = null;
    const preface: string[] = [];

    for (const line of lines) {
        const chapterTitle = chapterTitleFromLine(line);
        if (chapterTitle) {
            if (current) sections.push(current);
            current = { title: chapterTitle, lines: [] };
            continue;
        }
        if (current) current.lines.push(line);
        else preface.push(line);
    }
    if (current) sections.push(current);
    if (!sections.length) return [{ title: "第 1 章", plainText: normalized }];
    if (preface.some((line) => line.trim())) sections.unshift({ title: "序章", lines: preface });
    return sections.map((section): ImportedNovelChapter => ({ title: section.title, plainText: section.lines.join("\n").trim() }));
}
