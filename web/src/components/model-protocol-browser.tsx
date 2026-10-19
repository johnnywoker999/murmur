import { ChoiceBrowser } from "./choice-browser";
import type { ModelProtocolDefinition, ProtocolCapability } from "@/lib/model-protocols";

export function ModelProtocolBrowser({
    capability,
    protocols,
    ...props
}: {
    capability?: ProtocolCapability;
    protocols: ModelProtocolDefinition[];
    value?: string;
    onChange?: (value: string) => void;
    loading?: boolean;
    error?: string;
    disabled?: boolean;
    id?: string;
}) {
    const options = protocols
        .filter((protocol) => (!capability || protocol.capability === capability) && protocol.enabled !== false)
        .map((protocol) => ({
            value: protocol.value,
            label: protocol.label,
            subtitle: protocol.create,
            vendor: protocol.vendor,
            searchText: protocol.value,
            details: [
                { label: "請求", value: <code>{protocol.create}</code> },
                { label: "請求體", value: protocol.contentType },
                { label: "響應", value: protocol.poll ? "非同步輪詢" : "同步響應" },
                { label: "來源", value: protocol.media },
            ],
        }));

    return <ChoiceBrowser key={capability || "all"} {...props} label="呼叫協議" placeholder="搜尋協議名稱、廠商或請求路徑" options={options} />;
}
