export function selectDirectorRecordingMimeType(isTypeSupported: (type: string) => boolean): string {
    return ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"].find(isTypeSupported) || "";
}

export function waitForDirectorDecodedFrame(video: HTMLVideoElement, timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("error", onError);
        };
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("白膜影片無法解碼，請重試或檢查系統影片格式支援")); };
        const timer = setTimeout(() => { cleanup(); reject(new Error("白膜影片首幀解碼超時，請重試")); }, timeoutMs);
        video.addEventListener("loadeddata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}
