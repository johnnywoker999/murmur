const VIDEO_FRAME_TIMEOUT_MS = 20_000;
const VIDEO_FRAME_PRESENTATION_TIMEOUT_MS = 1_500;
const MINIMUM_SEEK_EPSILON_MS = 1;
const LAST_FRAME_EPSILON_MS = 100;
const VIDEO_TAIL_PRESENTATION_EPSILON_SECONDS = 0.02;

export type CapturedVideoFrame = {
    timeMs: number;
    blob: Blob;
    width: number;
    height: number;
};

export type VideoFrameCaptureFailure = {
    timeMs: number;
    error: string;
};

export type VideoFrameCaptureResult = {
    frames: CapturedVideoFrame[];
    failures: VideoFrameCaptureFailure[];
};

export function normalizeVideoFrameTimes(timesMs: number[], durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
    const lastFrameMs = Math.max(0, Math.round(durationMs) - LAST_FRAME_EPSILON_MS);
    return Array.from(new Set(timesMs.filter(Number.isFinite).map((timeMs) => Math.min(lastFrameMs, Math.max(0, Math.round(timeMs)))))).sort((left, right) => left - right);
}

export function videoFrameSeekSeconds(timeMs: number, durationMs: number) {
    return Math.min(Math.max(0, durationMs - MINIMUM_SEEK_EPSILON_MS), Math.max(MINIMUM_SEEK_EPSILON_MS, timeMs)) / 1000;
}

export async function waitForPresentedVideoFrame(video: HTMLVideoElement, timeoutMs = VIDEO_FRAME_PRESENTATION_TIMEOUT_MS) {
    try {
        if (typeof video.requestVideoFrameCallback !== "function") {
            await video.play();
            await waitForAnimationFrames();
            return;
        }
        const isSeekingToEnd = Number.isFinite(video.duration) && video.duration - video.currentTime <= VIDEO_TAIL_PRESENTATION_EPSILON_SECONDS;
        const presented = isSeekingToEnd
            ? waitForVideoEvent(video, "ended", "影片尾幀解碼超時", timeoutMs)
            : new Promise<void>((resolve, reject) => {
                  let settled = false;
                  const finish = (error?: unknown) => {
                      if (settled) return;
                      settled = true;
                      globalThis.clearTimeout(timer);
                      if (error) reject(error);
                      else resolve();
                  };
                  const timer = globalThis.setTimeout(() => finish(new Error("影片畫面解碼超時")), timeoutMs);
                  video.requestVideoFrameCallback(() => finish());
              });
        await video.play();
        await presented;
    } finally {
        video.pause();
    }
}

function waitForAnimationFrames() {
    return new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== "function") {
            globalThis.setTimeout(resolve, 0);
            return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
}

export async function captureVideoFrames(source: Blob | string, timesMs: number[]): Promise<VideoFrameCaptureResult> {
    const blob = await readVideoBlob(source);
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    try {
        const loaded = waitForVideoEvent(video, "loadeddata", "影片讀取超時或編碼不受瀏覽器支援");
        video.src = objectUrl;
        video.load();
        await loaded;

        if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("無法確定影片時長");
        if (!video.videoWidth || !video.videoHeight) throw new Error("無法讀取影片畫面尺寸");
        const normalizedTimes = normalizeVideoFrameTimes(timesMs, video.duration * 1000);
        if (!normalizedTimes.length) throw new Error("請至少選擇一個有效時間點");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("瀏覽器無法建立圖片畫布");
        const frames: CapturedVideoFrame[] = [];
        const failures: VideoFrameCaptureFailure[] = [];
        for (const timeMs of normalizedTimes) {
            try {
                const targetSeconds = videoFrameSeekSeconds(timeMs, video.duration * 1000);
                if (Math.abs(video.currentTime - targetSeconds) > 0.0005) {
                    const seeked = waitForVideoEvent(video, "seeked", `無法定位到 ${formatVideoFrameTime(timeMs)}`);
                    video.currentTime = targetSeconds;
                    await seeked;
                }
                await waitForPresentedVideoFrame(video);
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                frames.push({ timeMs, blob: await canvasToPngBlob(canvas), width: canvas.width, height: canvas.height });
            } catch (error) {
                failures.push({ timeMs, error: error instanceof Error ? error.message : "畫面提取失敗" });
            }
        }
        if (!frames.length) throw new Error(failures[0]?.error || "畫面提取失敗");
        return { frames, failures };
    } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(objectUrl);
    }
}

export function resolveVideoFramePresetTimeMs(
    preset: "current" | "first" | "last",
    durationMs: number,
    currentMs: number,
) {
    if (preset === "first") return 0;
    if (preset === "last") {
        return Number.isFinite(durationMs) && durationMs > 0
            ? Math.max(0, Math.round(durationMs) - 1)
            : Number.MAX_SAFE_INTEGER;
    }
    return Number.isFinite(currentMs) && currentMs > 0 ? Math.round(currentMs) : 0;
}

export function videoFrameFetchCredentials(source: string): RequestCredentials {
    if (/^https?:\/\//i.test(source)) {
        try {
            const parsed = new URL(source);
            if (/\/(?:api\/)?resources\/[^/]+\/file$/u.test(parsed.pathname)) return "include";
            if (typeof window !== "undefined" && parsed.origin && parsed.origin !== window.location?.origin) {
                return "omit";
            }
        } catch {
            return "omit";
        }
    }
    if (/^\/(?:api\/)?resources\/[^/]+\/file(?:[?#].*)?$/u.test(source)) return "include";
    return "same-origin";
}

async function readVideoBlob(source: Blob | string) {
    if (source instanceof Blob) return source;
    try {
        const response = await fetch(source, { credentials: videoFrameFetchCredentials(source) });
        if (!response.ok) throw new Error(String(response.status));
        return await response.blob();
    } catch {
        throw new Error("無法讀取影片檔案，請重新上傳影片後再提取畫面");
    }
}

export function formatVideoFrameTime(timeMs: number) {
    const totalMs = Math.max(0, Math.round(timeMs));
    const minutes = Math.floor(totalMs / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const milliseconds = totalMs % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadeddata" | "seeked" | "ended", errorMessage: string, timeoutMs = VIDEO_FRAME_TIMEOUT_MS) {
    return new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof globalThis.setTimeout>;
        const cleanup = () => {
            globalThis.clearTimeout(timer);
            video.removeEventListener(eventName, onSuccess);
            video.removeEventListener("error", onError);
        };
        const onSuccess = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error(errorMessage));
        };
        video.addEventListener(eventName, onSuccess, { once: true });
        video.addEventListener("error", onError, { once: true });
        timer = globalThis.setTimeout(onError, timeoutMs);
    });
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("畫面圖片編碼失敗"))), "image/png"));
}
