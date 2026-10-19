import { Select } from "antd";
import type { ReferenceMediaTransport } from "@/stores/use-config-store";

export function ReferenceMediaTransportFields({ value, onChange }: { value?: ReferenceMediaTransport; onChange: (value: ReferenceMediaTransport) => void }) {
    return <section className="space-y-3">
        <div className="text-xs font-medium">參考素材傳輸</div>
        <p className="text-xs leading-5 text-foreground/58">預設按請求協議處理。第三方介面要求不同，可分別調整圖片、影片和音訊的傳輸方式。</p>
        {(["image", "video", "audio"] as const).map((kind) => <label key={kind} className="flex min-w-0 flex-wrap items-center gap-3 text-xs">
            <span className="w-12 shrink-0">{{ image: "圖片", video: "影片", audio: "音訊" }[kind]}</span>
            <Select
                aria-label={`${{ image: "圖片", video: "影片", audio: "音訊" }[kind]}傳輸方式`}
                className="min-w-0 flex-1"
                value={value?.[kind] || "auto"}
                options={[{ value: "auto", label: "自動，按協議處理" }, { value: "inline", label: "直接傳素材" }, { value: "url", label: "上傳到我的物件儲存" }, { value: "link", label: "手動填寫 HTTPS 連結" }]}
                onChange={(transport) => onChange({ ...value, [kind]: transport })}
            />
        </label>)}
        <p className="text-xs leading-5 text-foreground/58">直接傳素材使用當前協議的檔案或 Base64 格式，需服務商支援。需要連結時，自動使用已啟用的物件儲存；未配置時可手動填寫。</p>
    </section>;
}
