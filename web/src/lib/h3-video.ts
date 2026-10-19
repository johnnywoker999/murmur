export type H3VideoOptions = {
    seed?: number;
    prompt_expansion_mode?: "disabled" | "fast" | "balanced" | "quality";
    enable_safety_checker?: boolean;
    sync_mode?: boolean;
    damage_level?: "light" | "medium" | "heavy";
};

export const H3_STYLES = {
    "minimax-h3-max-style-hand-drawn": "手繪",
    "minimax-h3-max-style-16bit-pixel": "16 位畫素",
    "minimax-h3-max-style-low-poly": "低多邊形",
    "minimax-h3-max-style-retro-toon-70s": "70 年代動畫",
    "minimax-h3-max-style-vhs": "VHS",
} as const;

export function isH3Style(model: string): boolean {
    return Object.hasOwn(H3_STYLES, model.split("::").at(-1) || "");
}

export function h3VideoOperation(model: string, input: { imageCount: number; characterCount?: number; videoCount: number; audioCount: number }, stored?: string) {
    const images = input.imageCount + (input.characterCount || 0);
    if (isH3Style(model)) return images ? "image_to_video" : "text_to_video";
    if ((stored === "reference_to_video" && images + input.videoCount + input.audioCount > 0) || input.videoCount > 0 || input.audioCount > 1 || images > 2) return "reference_to_video";
    if (images) return "image_to_video";
    if (input.audioCount) return "audio_to_video";
    return "text_to_video";
}

export function isH3Model(model: string): boolean {
    return isH3Style(model) || ["minimax-h3", "minimax-h3-max", "minimax-h3-max-turbo"].includes(model.split("::").at(-1) || "");
}

export function h3GenerationControls(model: string, options?: H3VideoOptions): H3VideoOptions {
    if (isH3Style(model)) {
        if (options?.seed !== undefined && !Number.isSafeInteger(options.seed)) throw new Error("隨機種子須為整數");
        const vhs = model.split("::").at(-1) === "minimax-h3-max-style-vhs";
        if (options?.damage_level && (!vhs || !["light", "medium", "heavy"].includes(options.damage_level))) throw new Error("所選風格不支援該磁帶磨損設定");
        return { ...(options?.seed !== undefined ? { seed: options.seed } : {}), ...(vhs ? { damage_level: options?.damage_level || "medium" } : {}) };
    }
    const value = { prompt_expansion_mode: "balanced" as const, ...options, enable_safety_checker: true, sync_mode: false };
    if (value.seed !== undefined && !Number.isSafeInteger(value.seed)) throw new Error("隨機種子須為整數");
    if (value.prompt_expansion_mode === "fast" && model.split("::").at(-1) !== "minimax-h3") throw new Error("當前模型不支援快速提示詞增強，請選擇均衡或高質量");
    if (!value.prompt_expansion_mode || !["disabled", "fast", "balanced", "quality"].includes(value.prompt_expansion_mode)) throw new Error("提示詞增強設定無效");
    for (const key of ["enable_safety_checker", "sync_mode"] as const) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error("H3 開關設定無效");
    delete value.damage_level;
    return value;
}

export function h3Duration(model: string, value: string): string {
    const name = model.split("::").at(-1);
    const seconds = value.trim() === "" ? 5 : Number(value);
    const base = name === "minimax-h3" || isH3Style(model);
    if (!Number.isFinite(seconds) || seconds < (base ? 5 : 0.92) || seconds > 15 || (base && !Number.isInteger(seconds))) throw new Error(base ? "H3 時長鬚為 5–15 秒整數" : "H3 Max / Turbo 時長鬚在 0.92–15 秒之間");
    return String(seconds);
}

export type H3Media = { id: string; type: "image" | "video" | "audio"; url: string };
// Resolve card groups only after character images/voices have been hydrated.
// Explicit prompt mentions may select a subset of the connected nodes.
export function h3ResolvedReferenceOrder(order: string[] | undefined, media: Array<{ id: string; sourceNodeId?: string }>): string[] | undefined {
    if (!order) return undefined;
    const resolved: string[] = [];
    const append = (id: string) => { if (!resolved.includes(id)) resolved.push(id); };
    for (const nodeId of order) {
        for (const item of media) if (item.id === nodeId || item.sourceNodeId === nodeId) append(item.id);
    }
    for (const item of media) append(item.id);
    return resolved;
}
type H3FrameOptions = { videoEditOperation?: string; videoStartFrameNodeId?: string; videoEndFrameNodeId?: string; videoMiddleFrameNodeId?: string; videoMiddleFrameTime?: number; videoReferenceOrder?: string[] };

export function h3ReferenceMode(model: string, input: { imageCount: number; videoCount: number; audioCount: number }, options: H3FrameOptions = {}): boolean {
    const base = model.split("::").at(-1) === "minimax-h3";
    const hasFrame = Boolean(options.videoStartFrameNodeId || options.videoEndFrameNodeId || options.videoMiddleFrameNodeId);
    return !isH3Style(model) && (options.videoEditOperation === "reference_to_video" || Boolean(options.videoMiddleFrameNodeId) || input.videoCount > 0 || input.audioCount > 1 || (base && input.imageCount > 0 && !hasFrame && options.videoEditOperation !== "image_to_video"));
}

export function h3MediaPayload(model: string, media: H3Media[], options: H3FrameOptions = {}, seconds = 5, resolution = "768p") {
    const name = model.split("::").at(-1),
        base = name === "minimax-h3",
        max = name === "minimax-h3-max",
        style = isH3Style(model);
    const selected = [options.videoStartFrameNodeId, options.videoEndFrameNodeId, options.videoMiddleFrameNodeId].filter(Boolean);
    const images = media.filter((m) => m.type === "image"),
        videos = media.filter((m) => m.type === "video"),
        audios = media.filter((m) => m.type === "audio");
    const referenceMode = h3ReferenceMode(model, { imageCount: images.length, videoCount: videos.length, audioCount: audios.length }, options);
    if (referenceMode && selected.length && !max) throw new Error("當前 H3 參考模式不能同時指定關鍵幀");
    if (options.videoMiddleFrameNodeId || options.videoMiddleFrameTime !== undefined) {
        const time = options.videoMiddleFrameTime,
            frame = Math.round((time ?? NaN) * 24);
        if (!max || !options.videoStartFrameNodeId || !options.videoEndFrameNodeId || !options.videoMiddleFrameNodeId || !Number.isFinite(time) || frame <= 0 || frame >= Math.round(seconds * 24) - 1 || !["480p", "768p"].includes(resolution.toLowerCase()))
            throw new Error("中間幀須同時指定首尾幀和片內時間，並使用 H3 Max 的 480P 或 768P");
    }
    const payload: Record<string, unknown> = {};
    const roles = [options.videoStartFrameNodeId, options.videoEndFrameNodeId, options.videoMiddleFrameNodeId] as const;
    const keys = ["first_frame_url", "last_frame_url", "middle_image_url"] as const;
    roles.forEach((id, index) => {
        if (!id) return;
        const image = images.find((m) => m.id === id);
        if (!image) throw new Error("已選擇的關鍵幀未包含在影片請求中");
        payload[keys[index]!] = image.url;
    });
    if (options.videoMiddleFrameNodeId) payload.middle_frame_time = options.videoMiddleFrameTime;
    if (style) {
        if (images.length > 1 || videos.length || audios.length || options.videoEndFrameNodeId || options.videoMiddleFrameNodeId) throw new Error("H3 Styles 支援一張首幀圖片");
        if (images[0]) payload.image_url = images[0].url;
        return { payload, referenceMode: false, frameMode: images.length > 0 };
    }
    if (referenceMode) {
        const refs = media.filter((m) => !selected.includes(m.id));
        if ((!refs.length && !selected.length) || refs.length > 12 || refs.filter((m) => m.type === "image").length > 9 || videos.length > 3 || audios.length > 3) throw new Error("H3 最多支援 9 張參考圖、3 段影片、3 段音訊，參考素材合計不超過 12 個");
        payload.operation = "reference_to_video";
        if (!base && options.videoReferenceOrder) {
            const ids = options.videoReferenceOrder.filter((id) => !selected.includes(id));
            if (ids.length !== refs.length || new Set(ids).size !== ids.length || refs.some((m) => !ids.includes(m.id))) throw new Error("參考素材順序與當前連線不一致，請重新排序");
            payload.reference_conditions = ids.map((id) => {
                const m = refs.find((m) => m.id === id)!;
                return { type: m.type, url: m.url };
            });
        } else
            for (const type of ["image", "video", "audio"] as const) {
                const urls = refs.filter((m) => m.type === type).map((m) => m.url);
                if (urls.length) payload[`reference_${type}_urls`] = urls;
            }
    } else {
        if (images.length > 2 || videos.length || audios.length > 1) throw new Error("H3 首尾幀模式支援最多 2 張圖片、1 段配音");
        if (selected.length && images.some((m) => !selected.includes(m.id))) throw new Error("首尾幀模式中的圖片須指定角色");
        if (!selected.length) images.forEach((m, index) => (payload[index ? "last_frame_url" : "first_frame_url"] = m.url));
        if (audios[0]) {
            if (seconds < 2) throw new Error("使用配音時影片須至少 2 秒");
            payload.target_audio_url = audios[0].url;
        }
    }
    return { payload, referenceMode, frameMode: !referenceMode && images.length > 0 };
}
