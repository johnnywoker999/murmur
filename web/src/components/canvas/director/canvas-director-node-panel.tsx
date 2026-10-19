import { useEffect, useState } from "react";
import { Clapperboard, Move3d } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { resolveDirectorActiveShot, resolveDirectorPreviewSource, type DirectorNodeContentReader } from "@/lib/canvas/director/director-preview";
import { resolveImageUrl } from "@/services/image-storage";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { DirectorScene } from "@/types/director";

export function CanvasDirectorNodePanel({ node, scene, readNodeContent, readNodeStorageKey, onOpen, professional = true }: { node: CanvasNodeData; scene: DirectorScene | null; readNodeContent: DirectorNodeContentReader; readNodeStorageKey?: DirectorNodeContentReader; onOpen: () => void; professional?: boolean }) {
    const theme = canvasThemes[useActiveTheme()];
    const shot = resolveDirectorActiveShot(scene, node.metadata?.directorShotId);
    // 記錄「失敗的那個 URL」而非布林量：同一個壞 URL 不再反覆渲染，換成另一個 URL 時自動重試。
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const coverStorageKey = node.metadata?.directorCoverStorageKey || (!node.metadata?.directorCoverUrl ? readNodeStorageKey?.(node.metadata?.directorPreviewNodeId) || readNodeStorageKey?.(shot?.previewNodeId) : undefined);
    const [resolvedCover, setResolvedCover] = useState<{ key: string; url: string } | null>(null);
    useEffect(() => {
        if (!coverStorageKey) return;
        let live = true;
        void resolveImageUrl(coverStorageKey, node.metadata?.directorCoverUrl || "", { cacheMiss: true })
            .then((url) => { if (live && url) setResolvedCover({ key: coverStorageKey, url }); })
            .catch(() => { /* 舊預覽或空態仍可使用。 */ });
        return () => { live = false; };
    }, [coverStorageKey, node.metadata?.directorCoverUrl]);
    const coverUrl = resolvedCover && resolvedCover.key === coverStorageKey ? resolvedCover.url : node.metadata?.directorCoverUrl;
    const preview = resolveDirectorPreviewSource({ scene, shot, coverUrl, failedUrl, previewNodeId: node.metadata?.directorPreviewNodeId, readNodeContent });

    return (
        <div className="relative flex h-full w-full min-h-0 items-center justify-center" style={{ color: theme.node.text }}>
            <div
                className="relative flex min-h-0 flex-1 items-center justify-center"
                data-director-open={preview.kind === "image" ? "preview" : "empty"}
            >
                <div
                    className="relative aspect-square h-full max-w-full overflow-hidden rounded-2xl border"
                    style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                >
                    {preview.kind === "image"
                        ? <img src={preview.url} alt={`${node.title} 導演臺場景封面`} className="h-full w-full object-contain" draggable={false} onError={() => setFailedUrl(preview.url)} />
                        : <DirectorPreviewState kind={preview.kind} theme={theme} />}
                </div>
                <button
                    type="button"
                    data-canvas-no-zoom
                    className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-xl px-6 py-4 text-base font-semibold shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-60"
                    style={{ background: theme.accent.primary, color: theme.accent.onPrimary, border: `1px solid ${theme.toolbar.border}` }}
                    aria-label={professional ? "開啟導演臺" : "切換到專業模式後編輯導演臺"}
                    disabled={!professional}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onOpen(); }}
                >
                    <Clapperboard className="size-8" aria-hidden />
                    {professional ? "開啟導演臺" : "專業模式可編輯"}
                </button>
            </div>
        </div>
    );
}

/**
 * 誠實空態/準備態：不繪製地面、地平線、機位或任何偽 3D 物體。
 * 顏色全部走畫布主題 token；層級靠字號/字重區分，不靠降低對比度。
 */
function DirectorPreviewState({ kind, theme }: { kind: "loading" | "empty"; theme: CanvasTheme }) {
    const loading = kind === "loading";
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-3 text-center">
            <Move3d className="size-7" style={{ color: theme.node.muted }} aria-hidden />
            <span className="text-xs leading-5" style={{ color: theme.node.muted }}>{loading ? "正在準備場景" : "在3D空間中搭建場景並進行多視角截圖"}</span>
        </div>
    );
}
