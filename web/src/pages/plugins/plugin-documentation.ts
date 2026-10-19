import type { PluginManifest, PluginManifestV2 } from "@/lib/plugins/plugin-types";

const permissionLabels: Record<string, string> = {
    "canvas.read": "讀取畫布",
    "canvas.write": "修改畫布",
    "asset.read": "讀取素材",
    "asset.search": "搜尋素材",
    "asset.import": "匯入素材",
    "asset.upload": "上傳素材",
    "generation.run": "呼叫生成",
    "ai.text": "呼叫已配置的文本/視覺理解模型",
    "external.open": "開啟外部詳情",
};

export function getPluginDocumentation(manifest: PluginManifest | PluginManifestV2) {
    if (manifest.documentation?.trim()) return manifest.documentation.trim();

    const capabilities = manifest.permissions.map((permission) => permissionLabels[permission] || permission);
    return [
        `# ${manifest.name}`,
        "",
        manifest.description || "該外掛沒有提供簡介。",
        "",
        "## 外掛資訊",
        "",
        `- 作者：${manifest.author || "未宣告"}`,
        `- 版本：${manifest.version}`,
        `- 能力：${capabilities.join("、") || "未宣告"}`,
        "",
        manifest.contributes.providers?.length
            ? "> 此外掛沒有提供接入檔案。請聯絡外掛作者補充 `documentation`，不要僅憑清單欄位推測上游介面。"
            : "> 該外掛當前沒有單獨的使用檔案。",
    ].join("\n");
}
