# 上傳統一外掛包

宿主只有一種外掛：一個版本化 Manifest 描述一個外掛包可以向宿主貢獻的全部能力。Provider、工作流、畫布節點、媒體轉換、素材源、Agent 和命令都寫在同一個 `contributes` 下；執行時可以不同，但不會再出現“協議外掛”和“UI 外掛”兩套清單。

## 1. 包格式

上傳檔案必須是 `.beeftv-plugin` ZIP 包，大小不超過 48 MiB。包內必須有根目錄 `manifest.json`；不能上傳裸 JSON。清單和可選的 Web 執行時程式碼、靜態資源屬於同一個版本、許可權和生命週期：

```text
my-plugin.beeftv-plugin
├── manifest.json
├── web/entry.js       # 可選；必須配合 runtime.web=sandbox 或 worker
├── web/assets/...     # 可選靜態資源
└── docs/...           # 可選檔案
```

後端 Provider 只使用清單中的宣告式對映，不執行包內程式碼。UI/功能程式碼必須宣告 `entry`，由宿主隔離執行時載入；不能把指令碼注入主應用頁面。當前版本先完成包校驗、儲存和入口合同，未授權的 Web 程式碼不會自動進入主頁面。

## 2. 最小清單

`manifest.json` 必須是 UTF-8 JSON。外掛 ID 使用小寫 kebab-case。Manifest 不得包含 Cookie、Token 或 API Key。`entry` 只能指向包內 `web/` 檔案。

```json
{
  "apiVersion": "beeftv.plugin/v1",
  "id": "acme-comfyui", "name": "Acme ComfyUI", "version": "1.0.0", "author": "Acme", "description": "通過工作流貢獻提供影片生成能力",
  "permissions": ["generation.run", "media.read"],
  "configuration": { "fields": [{ "name": "apiKey", "type": "secret", "label": "API Token", "required": true }] },
  "contributes": {
    "providers": [{
      "id": "acme-comfyui", "label": "Acme ComfyUI", "capabilities": ["video"], "scopes": ["user.custom-channel", "canvas"],
      "baseUrl": "https://api.example.com", "auth": { "type": "bearer", "field": "apiKey" },
      "create": { "method": "POST", "path": "/workflows/{{model}}", "fields": { "prompt": "request.prompt", "duration": "request.duration" } },
      "poll": { "method": "GET", "path": "/tasks/{{taskId}}" },
      "response": { "taskIdPaths": ["data.task_id"], "statusPaths": ["data.status"], "resultPaths": ["data.results"], "resultKind": "video", "resultEphemeral": true }
    }],
    "workflows": [{
      "id": "minimax-h3", "label": "MiniMax H3 文生影片", "providerId": "acme-comfyui", "capability": "video",
      "parameters": [{ "name": "duration", "type": "number", "required": true }, { "name": "resolution", "type": "string", "values": ["720p", "1080p"] }],
      "defaults": { "duration": 5, "resolution": "720p" }
    }]
  }
}
```

帶 Web 功能的外掛在同一份清單中增加：

```json
{
  "entry": "web/entry.js",
  "surfaces": ["fullscreen"],
  "runtime": { "web": "sandbox" }
}
```

## 3. Contribution 規則

- `providers` 宣告上游能力和欄位對映。鑑權、Base URL、超時、私網校驗、輪詢、下載和計費由宿主負責。
- `workflows` 宣告一個 provider 下的具體工作流或模型入口。AutoDL/ComfyUI 等工作流型 API 必須在這裡擴充套件，不能為每個工作流新增宿主程式碼。
- `canvasNodes` 宣告節點 ID、預設尺寸和 schema。`renderer` 為 `declarative` 時使用宿主 schema renderer；`sandbox` 由隔離執行時承載。
- `transforms` 宣告媒體或生成請求轉換，必須匹配清單許可權和受控 runtime。
- `assetSources`、`usageObservers`、`agents`、`commands` 和 `importExport` 是同一清單的其他貢獻面。

一個外掛可以同時宣告多種貢獻，但 ID 必須在外掛包內唯一，並且所有貢獻共享同一個安裝、啟停、許可權和版本生命週期。

## 4. Provider 與工作流

請求欄位右側只能引用宿主統一請求，例如 `request.prompt`、`request.model`、`request.duration`、`request.extra`。宣告式欄位也支援安全的物件/陣列路徑（例如 `request.images.0.url`）和通用字串變換（`|trim`、`|lower`、`|upper`），不執行外掛程式碼。渠道宣告的列舉值由畫布完整保留，外掛可使用通用大小寫變換適配上游，不應要求宿主增加渠道專用歸一化。欄位解析為空時會省略該欄位，適合對映可選參考素材。Provider 如果把 `requiresPublicMediaUrls` 設為 `true`，宿主會在請求前把使用者資源轉換為短期簽名公網 URL。響應對映支援物件路徑和陣列下標，並可用 `errorPaths` 宣告上游錯誤碼路徑。同步 provider 只需要 `create` 和 `response`；非同步 provider 再宣告 `poll`。

結果 URL 如果是短期地址，必須設定 `resultEphemeral: true`。宿主會在任務完成後立即下載並儲存資源，畫布和任務記錄只儲存宿主資源引用。

## 5. 安全與執行邊界

- API Key 只在渠道配置中輸入和儲存，不進入 Manifest、URL、日誌或任務正文。
- 上傳外掛不能請求 `host:` 執行器，不能執行任意瀏覽器指令碼。
- 外部請求必須通過後端 provider runtime，宿主統一執行 SSRF、防重放、超時、併發、錯誤和計費策略。
- 外掛宣告的許可權是最小許可權；沒有對應許可權的 contribution 不會被啟用。

上傳、啟用、停用和解除安裝都作用於同一個外掛 registry record。清單校驗失敗時整包不會安裝，不會留下半啟用的 provider、節點或工作流。
