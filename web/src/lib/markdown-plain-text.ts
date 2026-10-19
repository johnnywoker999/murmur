// 把 Markdown 訊息壓成一行純文本，用於歷史列表預覽和標題：
// 去掉記號本身（##、**、[]() 等），保留可讀內容；圍欄程式碼塊整體替換為佔位詞。
export function markdownPlainText(value: string, codePlaceholder = "程式碼塊") {
    return value
        .replace(/```[\s\S]*?(?:```|$)/gu, ` ${codePlaceholder} `)
        .replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gmu, " ")
        .replace(/`([^`]*)`/gu, "$1")
        .replace(/!\[([^\]]*)\]\(([^)]*)\)/gu, (_, alt: string, url: string) => ` ${alt || url} `)
        .replace(/\[([^\]]*)\]\(([^)]*)\)/gu, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
        .replace(/^\s{0,3}>\s?/gmu, "")
        .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gmu, " ")
        .replace(/^\s*[-*+]\s+/gmu, "")
        .replace(/^\s*\d+[.)]\s+/gmu, "")
        .replace(/(\*\*|__)(.*?)\1/gu, "$2")
        .replace(/~~(.*?)~~/gu, "$1")
        .replace(/(^|\W)(\*|_)(?=\S)([\s\S]*?\S)\2(?=\W|$)/gu, "$1$3")
        .replace(/<[^>]+>/gu, " ")
        .replace(/\|/gu, " ")
        .replace(/\s+/gu, " ")
        .trim();
}
