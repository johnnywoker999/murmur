import { Input } from "antd";
import { ArrowUp, ImagePlus } from "lucide-react";

/**
 * 導演畫布上的文本意圖輸入。
 * 只編輯已有 shot.prompt；不展示尚未接入的自然語言場景生成操作。
 */
export function DirectorPreviewComposer({ prompt, onPromptChange, intent = "shot", onAddReference, onSubmit, submitting = false, submitUnavailable = false }: { prompt: string; onPromptChange: (prompt: string) => void; intent?: "shot" | "scene"; onAddReference?: () => void; onSubmit?: () => void; submitting?: boolean; submitUnavailable?: boolean }) {
    const sceneIntent = intent === "scene";
    return (
        <div className={`director-preview-composer${sceneIntent ? " director-scene-composer" : ""}`} role="group" aria-label={sceneIntent ? "場景描述" : "鏡頭意圖"}>
            <Input.TextArea aria-label={sceneIntent ? "場景描述" : "當前鏡頭意圖"} data-canvas-no-zoom autoSize={{ minRows: 1, maxRows: 3 }} value={prompt} placeholder={sceneIntent ? "描述想搭建的場景" : "選中一個元素或機位，描述當前鏡頭的動作與敘事意圖…"} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (sceneIntent && event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (!submitUnavailable) onSubmit?.(); } }} />
            {sceneIntent ? <div className="director-scene-composer-actions">
                <button type="button" data-canvas-no-zoom aria-label="新增場景參考圖片" title="上傳圖片並作為場景參考立牌新增" disabled={submitting} onMouseDown={(event) => event.preventDefault()} onClick={onAddReference}><ImagePlus aria-hidden /></button>
                <button type="button" data-canvas-no-zoom data-unavailable={submitUnavailable || undefined} aria-label="將當前場景傳送到畫布" title={submitUnavailable ? "AI 自動構建暫未開放" : "將當前 3D 構圖和描述應用到畫布"} disabled={submitting || submitUnavailable} onMouseDown={(event) => event.preventDefault()} onClick={onSubmit}>{submitting ? <span className="director-composer-submit-spinner" aria-hidden /> : <ArrowUp aria-hidden />}</button>
            </div> : null}
        </div>
    );
}
