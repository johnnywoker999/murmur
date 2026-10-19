import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";
import { MediaPreview } from "@/components/media-preview";
import { captureVideoPoster } from "@/lib/video-poster";

/** 只解碼進入視口的影片，複用序列解碼佇列；縮圖隨元件釋放，不寫入使用者資產。 */
export function TaskVideoThumbnail({ src }: { src: string }) {
    const container = useRef<HTMLSpanElement>(null);
    const [poster, setPoster] = useState<{ source: string; url: string }>();
    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = "";
        let started = false;
        const capture = () => {
            if (started || controller.signal.aborted) return;
            started = true;
            void captureVideoPoster(src, { signal: controller.signal, maxWidth: 400 }).then((result) => {
                if (controller.signal.aborted || !result.poster) return;
                objectUrl = URL.createObjectURL(result.poster);
                setPoster({ source: src, url: objectUrl });
            }).catch((error) => {
                if (!controller.signal.aborted) console.warn("任務影片首幀提取失敗", error instanceof Error ? error.name : "UnknownError");
            });
        };
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                observer.disconnect();
                capture();
            }
        });
        if (container.current) observer.observe(container.current);
        return () => {
            controller.abort();
            observer.disconnect();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);
    return <span ref={container} className="block h-full w-full">
        {poster?.source === src ? <MediaPreview src={poster.url} kind="image" className="h-full w-full object-cover" /> : <span className="task-video-poster-placeholder"><Video /><small>影片預覽</small></span>}
    </span>;
}
