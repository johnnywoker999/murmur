export type GeneratedShortDramaChapter = {
    title: string;
    content: string;
};

export type GeneratedShortDramaOutline = {
    title: string;
    synopsis: string;
    chapters: GeneratedShortDramaChapter[];
};

export function parseGeneratedStory(answer: string): GeneratedShortDramaOutline {
    const cleaned = answer
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const payload = match ? JSON.parse(match[0]) as Record<string, unknown> : {};
    const title = String(payload.title || "").trim();
    const synopsis = String(payload.synopsis || "").trim();
    const chapters = Array.isArray(payload.chapters)
        ? payload.chapters
            .map((chapter: unknown) => {
                const item = typeof chapter === "object" && chapter ? chapter as Record<string, unknown> : {};
                return { title: String(item.title || "").trim(), content: String(item.content || "").trim() };
            })
            .filter((chapter: GeneratedShortDramaChapter) => chapter.title && chapter.content)
        : [];
    return { title: title || storyTitleFromAnswer(answer), synopsis, chapters };
}

export function storyTitleFromAnswer(answer: string) {
    const line = answer.split(/\r?\n/).find((item) => item.trim());
    return line ? line.trim().slice(0, 24) : "AI 生成短劇";
}

export function shortDramaOutlineVariables(input: {
    story: string;
    chapterCount: string;
    structure: string;
    wordCount: string;
    perspective: string;
    tone: string;
    characterScale: string;
    chapterLength: string;
}) {
    return {
        使用者故事: input.story,
        章節數量: input.chapterCount,
        敘事結構: input.structure,
        每章字數: input.wordCount,
        敘事視角: input.perspective,
        整體基調: input.tone,
        角色規模: input.characterScale,
        章節篇幅: input.chapterLength,
    };
}
