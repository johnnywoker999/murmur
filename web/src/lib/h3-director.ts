export type H3DirectorBeat = { offset: number; prompt?: string; end_image_url?: string; audio_url?: string };
export type H3DirectorConfig = {
    prompt: string;
    aspect_ratio?: "16:9" | "9:16" | "1:1";
    resolution?: "480p" | "768p" | "1080p";
    memory?: number;
    seed?: number;
    audio_bitrate?: 96000 | 128000 | 192000;
    image_url?: string;
    end_image_url?: string;
    audio_url?: string;
    script?: H3DirectorBeat[];
};
export type H3DirectorUpdate = { prompt?: string; end_image_url?: string; audio_url?: string; audio_behavior?: "replace" | "queue"; replan?: boolean; script?: H3DirectorBeat[]; script_mode?: "replace" | "append" };
export type H3DirectorPhase = "opening" | "configuring" | "live" | "stopping" | "closed" | "failed";

function prompt(value: string | undefined, required = false) {
    if (value === undefined && !required) return;
    if (typeof value !== "string" || !value.trim() || value.length > 50000) throw new Error("導演提示詞須為 1–50000 字");
}
function mediaURL(value: string | undefined) {
    if (value === undefined) return;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    } catch {
        throw new Error("導演參考素材須為 HTTPS 連結");
    }
}
function script(beats: H3DirectorBeat[] | undefined) {
    if (beats === undefined) return;
    if (!Array.isArray(beats) || beats.length < 1 || beats.length > 64) throw new Error("導演指令碼須包含 1–64 段");
    let previous = -1,
        lastEnd = -3;
    for (const beat of beats) {
        if (!Number.isSafeInteger(beat.offset) || beat.offset < 0 || beat.offset <= previous) throw new Error("指令碼時間須為遞增的非負整數秒");
        previous = beat.offset;
        prompt(beat.prompt);
        mediaURL(beat.end_image_url);
        mediaURL(beat.audio_url);
        if (!beat.prompt && !beat.end_image_url && !beat.audio_url) throw new Error("每段指令碼須包含提示詞、畫面或音訊");
        if (beat.end_image_url) {
            if (beat.offset - lastEnd < 3) throw new Error("指令碼終點畫面須至少間隔 3 秒");
            lastEnd = beat.offset;
        }
    }
}

export function h3DirectorConfigure(config: H3DirectorConfig) {
    for (const key of Object.keys(config)) if (!["prompt", "aspect_ratio", "resolution", "memory", "seed", "audio_bitrate", "image_url", "end_image_url", "audio_url", "script"].includes(key)) throw new Error("導演初始化引數不受支援");
    prompt(config.prompt, true);
    mediaURL(config.image_url);
    mediaURL(config.end_image_url);
    mediaURL(config.audio_url);
    script(config.script);
    if (config.script && (config.end_image_url || config.audio_url)) throw new Error("指令碼模式須把終點畫面和音訊放入指令碼");
    if (config.memory !== undefined && (!Number.isInteger(config.memory) || config.memory < 1 || config.memory > 50)) throw new Error("導演記憶段數須為 1–50");
    if (config.seed !== undefined && !Number.isSafeInteger(config.seed)) throw new Error("隨機種子須為整數");
    if (config.aspect_ratio !== undefined && !["16:9", "9:16", "1:1"].includes(config.aspect_ratio)) throw new Error("導演畫面比例不受支援");
    if (config.resolution !== undefined && !["480p", "768p", "1080p"].includes(config.resolution)) throw new Error("導演解析度不受支援");
    if (config.audio_bitrate !== undefined && ![96000, 128000, 192000].includes(config.audio_bitrate)) throw new Error("導演音訊位元速率不受支援");
    return { type: "configure", protocol_version: 1, prompt_version: 1, aspect_ratio: "16:9", resolution: "768p", memory: 12, ...config };
}

export function validateH3DirectorUpdate(update: H3DirectorUpdate) {
    for (const key of Object.keys(update)) if (!["prompt", "end_image_url", "audio_url", "audio_behavior", "replan", "script", "script_mode"].includes(key)) throw new Error("導演更新引數不受支援");
    prompt(update.prompt);
    mediaURL(update.end_image_url);
    mediaURL(update.audio_url);
    script(update.script);
    if (update.script && (update.prompt || update.end_image_url || update.audio_url)) throw new Error("指令碼更新不能同時傳送提示詞、畫面或音訊");
    if (!update.script && !update.prompt && !update.end_image_url && !update.audio_url) throw new Error("請填寫導演指令或參考素材");
    if (update.replan !== undefined && typeof update.replan !== "boolean") throw new Error("重規劃設定無效");
    if (update.audio_behavior !== undefined && !["replace", "queue"].includes(update.audio_behavior)) throw new Error("配音方式無效");
    if (update.script_mode !== undefined && !["replace", "append"].includes(update.script_mode)) throw new Error("指令碼方式無效");
    return update;
}

// A session identity and version belong to one live connection. Reopening or
// replaying a paid operation is always a separate user action.
export class H3DirectorControl {
    phase: H3DirectorPhase = "opening";
    private version = 1;
    private configured = false;
    constructor(
        private readonly send: (message: object) => void,
        private readonly onPhase: (phase: H3DirectorPhase) => void = () => {},
    ) {}
    private setPhase(phase: H3DirectorPhase) {
        this.phase = phase;
        this.onPhase(phase);
    }
    configure(config: H3DirectorConfig) {
        if (this.phase !== "opening") throw new Error("當前導演會話已配置");
        const value = h3DirectorConfigure(config);
        this.setPhase("configuring");
        this.send(value);
    }
    accept(message: Record<string, unknown>) {
        if (this.phase === "closed" || this.phase === "failed") return;
        if (message.type === "configured" && message.prompt_version === 1 && this.phase === "configuring") {
            this.configured = true;
            this.setPhase("live");
        }
        if (message.type === "stream_exhausted") this.setPhase("closed");
        if (message.type === "error") this.setPhase("failed");
    }
    update(input: H3DirectorUpdate) {
        if (!this.configured || this.phase !== "live") throw new Error("請等待導演會話準備完成");
        const value = validateH3DirectorUpdate(input);
        if (this.version >= Number.MAX_SAFE_INTEGER) throw new Error("導演指令版本已耗盡");
        this.send({ type: "prompt", prompt_version: ++this.version, ...value });
    }
    stop() {
        if (["closed", "failed", "stopping"].includes(this.phase)) return;
        this.setPhase("stopping");
        this.send({ type: "stop" });
    }
    fail() {
        if (this.phase !== "closed") this.setPhase("failed");
    }
    close() {
        if (this.phase !== "failed") this.setPhase("closed");
    }
}
