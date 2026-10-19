// 媒體時長探測工具：上傳前通過 <video>/<audio> 後設資料讀取真即時長（毫秒）。
// 結果隨上傳 meta 傳給後端，供資源摘要和時間線片段使用；這裡不負責驗證完整播放能力。

const PROBE_TIMEOUT_MS = 8000;

function isProbeable(file: File): boolean {
    return /^video\//.test(file.type) || /^audio\//.test(file.type);
}

/**
 * 返回可確認的媒體時長；非音影片、瀏覽器不支援解碼、後設資料錯誤或超時都返回 undefined。
 * 這是上傳附加資訊而不是寫入前置條件，呼叫方必須允許缺少時長，但不能編造預設時長。
 */
export async function probeMediaDurationMs(file: File): Promise<number | undefined> {
    return (await probeMediaMetadata(file))?.durationMs;
}

export type MediaMetadata = { durationMs?: number; width?: number; height?: number };

export async function probeMediaMetadata(file: File): Promise<MediaMetadata | undefined> {
    if (!isProbeable(file)) return undefined;
    const url = URL.createObjectURL(file);
    const el: HTMLVideoElement | HTMLAudioElement = /^video\//.test(file.type)
        ? document.createElement("video")
        : document.createElement("audio");
    let timeoutId: number | undefined;
    el.preload = "metadata";
    // 某些瀏覽器只有在靜音時才允許影片元素主動載入後設資料；這裡只禁止聲音，不觸發自動播放。
    el.muted = true;
    try {
        const metadata = await new Promise<MediaMetadata>((resolve, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("媒體後設資料讀取超時")), PROBE_TIMEOUT_MS);
            el.onloadedmetadata = () => {
                const durationSeconds = el.duration;
                resolve({ durationMs: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : undefined, width: "videoWidth" in el && typeof el.videoWidth === "number" ? el.videoWidth || undefined : undefined, height: "videoHeight" in el && typeof el.videoHeight === "number" ? el.videoHeight || undefined : undefined });
            };
            el.onerror = () => resolve({});
            el.src = url;
        });
        return metadata;
    } catch {
        return undefined;
    } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        el.onloadedmetadata = null;
        el.onerror = null;
        el.removeAttribute("src");
        el.load();
        URL.revokeObjectURL(url);
    }
}
