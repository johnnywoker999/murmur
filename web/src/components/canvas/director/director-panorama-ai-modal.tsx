import { Button, Modal } from "antd";
import { ArrowUp, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function DirectorPanoramaAIModal({ open, busy, status, onClose, onGenerate }: { open: boolean; busy: boolean; status: string; onClose: () => void; onGenerate: (file: File) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");

    useEffect(() => {
        if (!file) { setPreviewUrl(""); return; }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const selectFile = (next?: File) => {
        if (next?.type.startsWith("image/")) setFile(next);
    };

    return <Modal title="AI生成" open={open} width={680} footer={null} onCancel={onClose} destroyOnHidden={false}>
        <input ref={inputRef} type="file" accept={"image/" + "*"} className="hidden" onChange={(event) => { selectFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <button type="button" aria-label={file ? "更換參考圖片" : "上傳圖片"} className="flex h-[min(46vh,360px)] w-full flex-col items-center justify-center overflow-hidden rounded-xl border text-sm transition hover:bg-white/5" style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); }}>
            {previewUrl ? <img src={previewUrl} alt={file?.name || "參考圖片"} className="max-h-full max-w-full object-contain" /> : <><ImagePlus className="mb-3 size-5" aria-hidden /><span>上傳圖片</span></>}
        </button>
        <div className="mt-4 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs opacity-65" aria-live="polite">{status || "關閉彈窗不會中斷生成，完成後可在歷史記錄檢視結果"}</span>
            <Button type="primary" shape="circle" aria-label="生成" icon={<ArrowUp className="size-4" />} disabled={!file || busy} loading={busy} onClick={() => { if (file) onGenerate(file); }} />
        </div>
    </Modal>;
}
