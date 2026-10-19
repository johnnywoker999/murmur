import { ImageOff, Layers3 } from "lucide-react";

export function MediaPlaceholder({ failed = false, label }: { failed?: boolean; label?: string }) {
    const Icon = failed ? ImageOff : Layers3;
    return <span className="product-media-placeholder" role={failed ? "img" : undefined} aria-label={failed ? "封面載入失敗" : undefined}>
        <span className="product-media-placeholder-icon"><Icon aria-hidden="true" /></span>
        <span>{label || (failed ? "封面暫不可用" : "從一個想法開始")}</span>
    </span>;
}
