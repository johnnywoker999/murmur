import { getMediaBlob } from "@/services/file-storage";
import { assertUsableSegmentOutput } from "./canvas-video-segment-args";
import { prewarmFFmpeg, withFFmpegLease, type CanvasFFmpegProgress } from "./canvas-ffmpeg-session";

export type MergeVideoInput = { id: string; url?: string; storageKey?: string };
export type MergeVideoProgress = CanvasFFmpegProgress;

// ffmpeg 只在使用者明確合併影片時載入，避免把 wasm 和 worker 放進畫布首屏包體。
export async function loadFFmpeg(onProgress?: (progress: MergeVideoProgress) => void) {
    if (typeof __BEEFTV_HEAVY_MEDIA_ENABLED__ !== "undefined" && !__BEEFTV_HEAVY_MEDIA_ENABLED__) {
        throw new Error("精簡版未包含 FFmpeg 本地媒體工具；請安裝完整媒體包或使用模型生成與原素材編排");
    }
    return prewarmFFmpeg(onProgress);
}

/**
 * Start the shared browser worker before a user confirms a media operation.
 * The promise and worker are identical to `loadFFmpeg`, so this only moves
 * first-use initialization out of the blocking submit path.
 */
export function warmFFmpeg() {
    return loadFFmpeg();
}

export async function mergeVideos(inputs: MergeVideoInput[], onProgress?: (progress: MergeVideoProgress) => void, signal?: AbortSignal) {
    if (inputs.length < 2) throw new Error("至少選擇 2 個影片才能合併");
    signal?.throwIfAborted();
    return withFFmpegLease(async ({ ffmpeg, filePrefix }) => {
        const { fetchFile } = await import("@ffmpeg/util");
        const files: string[] = [];
        const concatName = `${filePrefix}concat.txt`;
        const mergedName = `${filePrefix}merged.mp4`;
        try {
            for (let index = 0; index < inputs.length; index += 1) {
                signal?.throwIfAborted();
                const input = inputs[index];
                const storedBlob = input.storageKey ? await getMediaBlob(input.storageKey) : null;
                const remoteBlob = !storedBlob && input.url ? await fetch(input.url, { signal }).then((response) => {
                    if (!response.ok) throw new Error(`影片資源請求失敗（${response.status}）`);
                    return response.blob();
                }) : null;
                const blob = storedBlob || remoteBlob;
                if (!blob) throw new Error(`無法讀取第 ${index + 1} 個影片`);
                const name = `${filePrefix}input-${index}.mp4`;
                await ffmpeg.writeFile(name, await fetchFile(blob));
                files.push(name);
                onProgress?.({ phase: "reading", progress: Math.round(((index + 1) / inputs.length) * 45) });
            }
            const concatList = files.map((file) => `file '${file}'`).join("\n");
            await ffmpeg.writeFile(concatName, concatList);
            onProgress?.({ phase: "encoding", progress: 55 });
            // 先嚐試無損拼接；不同模型輸出的編碼引數不一致時再回退到統一轉碼。
            let exitCode = await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", concatName, "-c", "copy", mergedName]);
            if (exitCode !== 0) {
                exitCode = await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", concatName, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", mergedName]);
            }
            if (exitCode !== 0) throw new Error("影片編碼失敗，請確認影片編碼格式相容");
            signal?.throwIfAborted();
            const output = await ffmpeg.readFile(mergedName);
            assertUsableSegmentOutput(output, "video");
            onProgress?.({ phase: "encoding", progress: 100 });
            return new Blob([output as BlobPart], { type: "video/mp4" });
        } catch (error) {
            signal?.throwIfAborted();
            throw error;
        } finally {
            if (!signal?.aborted) await Promise.all([...files, concatName, mergedName].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
        }
    }, { signal, onProgress });
}
