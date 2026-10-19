import type { CSSProperties } from "react";
import { AlertCircle, ImageUp, FileText, Film, Music2 } from "lucide-react";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { uploadVeilOpacity } from "@/lib/canvas/canvas-file-upload";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { useCanvasNodeActions } from "./canvas-node-action-context";

export function CanvasFileUploadContent({ node, theme, reduceMotion = false }: { node: CanvasNodeData; theme: CanvasTheme; reduceMotion?: boolean }) {
    const { upload } = useCanvasNodeActions();
    const failed = node.metadata?.fileUpload === "error";
    const percent = node.metadata?.fileUploadProgress;
    const label = node.type === CanvasNodeType.Image ? "圖片" : node.type === CanvasNodeType.Video ? "影片" : node.type === CanvasNodeType.Audio ? "音訊" : "文本";
    const Icon = failed ? AlertCircle : node.type === CanvasNodeType.Video ? Film : node.type === CanvasNodeType.Audio ? Music2 : node.type === CanvasNodeType.Text ? FileText : ImageUp;
    return (
        <div className="canvas-file-upload" data-static={reduceMotion || failed || undefined} style={{ "--upload-surface": theme.node.fill, "--upload-text": theme.node.text, "--upload-muted": theme.node.muted } as CSSProperties}>
            <div className="canvas-file-upload-glow" aria-hidden="true" style={{ opacity: uploadVeilOpacity(percent) }} />
            <div className="canvas-file-upload-frost" aria-hidden="true" style={{ opacity: uploadVeilOpacity(percent) }} />
            <div className="canvas-file-upload-copy" role="status" aria-live="polite" aria-busy={!failed}>
                <Icon className="size-5" aria-hidden="true" />
                <span className="canvas-file-upload-label">{failed ? `${label}上傳未完成` : `正在上傳${label}`}</span>
                <span className="canvas-file-upload-detail">{failed ? node.metadata?.errorDetails || "請重新選擇檔案上傳" : percent === 100 ? "檔案已傳輸，正在儲存與處理" : percent !== undefined ? `已上傳 ${percent}%` : "正在準備檔案"}</span>
                {!failed && <span role="progressbar" aria-label={`${label}上傳進度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="sr-only" />}
                {failed && upload ? <button type="button" data-canvas-no-zoom className="canvas-file-upload-retry" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); upload(node); }}>重新選擇檔案</button> : null}
            </div>
        </div>
    );
}
