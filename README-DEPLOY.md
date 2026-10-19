# 部署到 GitHub Pages（MURMUR AI 工作台）

純靜態部署：畫布、專案、資產全部存在**瀏覽器本地**（IndexedDB / localStorage），不需要後端。
生成能力會是停用狀態（沒有模型渠道、沒有本機 ComfyUI），適合展示與試用。

## 一、建立 repo 並推上去

```bash
cd D:/MURMUR
git init -b main
git add -A
git commit -m "feat: MURMUR AI workspace (BeefTV 1:1 fork + local ComfyUI bridge)"
gh repo create <你的帳號>/murmur-ai --public --source=. --push
```

沒有 `gh` 的話：在 GitHub 網頁上建一個 **public** repo（名稱建議 `murmur-ai`），然後

```bash
git remote add origin https://github.com/<你的帳號>/murmur-ai.git
git push -u origin main
```

## 二、開啟 Pages

repo → **Settings → Pages → Build and deployment → Source 選 `GitHub Actions`**。
推上去就會自動跑 `.github/workflows/pages.yml`（bun install → vite build → deploy）。

幾分鐘後網址是：

```
https://<你的帳號>.github.io/murmur-ai/
```

## 三、兩個關鍵設定

| 設定 | 說明 |
|---|---|
| `VITE_BASE_PATH` | workflow 已自動取 repo 名，**repo 叫什麼就對應什麼**。改名要同步。 |
| `VITE_INFINITE_CANVAS_URL` | 側欄「ComfyUI 無限畫布」指向哪。在 repo → Settings → Secrets and variables → **Actions → Variables** 建一個 `INFINITE_CANVAS_URL`，填你自己公開的無限畫布網址；留空就是 `http://127.0.0.1:3000`（只在本機有效）。 |

## 四、本機驗證 Pages 效果（子路徑）

```bash
cd D:/MURMUR/web
VITE_BASE_PATH=/murmur-ai/ bun run build:desktop
cp dist/index.html dist/404.html
mkdir -p ../.pages-preview/murmur-ai && cp -r dist/. ../.pages-preview/murmur-ai/
cd ../.pages-preview && python -m http.server 8300 --bind 127.0.0.1
# 開 http://127.0.0.1:8300/murmur-ai/
```

## 五、已知限制（靜態模式下）

- **不能生成**：沒有後端、沒有模型渠道。要看生成效果得跑本機版（`bun run dev` + Go 後端 + ComfyUI）。
- **資料只在單一瀏覽器**：清快取就沒了；跨裝置不同步。
- **無限畫布連結是外鏈**：靜態站沒有內嵌 8188，本機的 `127.0.0.1:3000` 對訪客無效，記得設 `INFINITE_CANVAS_URL`。
- **`dist/` 約 105MB**：Pages 單站上限 1GB、單檔 100MB，目前沒問題。

## 六、要「真的能用」的版本

靜態站只是門面。要能出片：

```bash
# 1) Go 後端（SQLite，127.0.0.1:8080）
cd D:/MURMUR
CANVAS_BACKEND_DATA_DIR=./data CANVAS_DESKTOP_LAUNCH_TOKEN=$(cat .dev-token) ./bin/server.exe

# 2) 前端（3001，自動注入 X-Desktop-Token）
cd web
VITE_API_PROXY_TARGET=http://127.0.0.1:8080 VITE_DESKTOP_LAUNCH_TOKEN=$(cat ../.dev-token) bun run dev
```
