# Celadon UI 元件層

`web/src/components/ui/` 下的自研元件層。本文是元件目錄內的公開速查與維護約定。

## 分層

| 層          | 目錄              | 內容                                                                                         |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------- |
| base        | `ui/base/`        | 原語 + 基礎件：`buttons/`、`badges/`、`kbd/`、`segmented-control/` 等                        |
| product     | `ui/product/`     | 跨頁面模式件：`empty-state/`、`callout/`、`loading-state/`、`section-card/`、`property-row/` |
| fx          | `ui/fx/`          | 特效件（原 `aceternity/*` 歸位至此名稱空間，引用隨用隨遷，不重寫）                           |
| application | `ui/application/` | 產品塊（P3 起）：agent-chat、notification-center、app-shell 等                               |

> 視覺數值以倉庫內的主題變數和元件 token 為權威源，元件不得依賴倉庫外的私有樣式包。

## 目錄與匯出

- 每"族"一目錄（`base/badges/`），族內按檔案拆變體；族級 `index.ts` 彙總匯出（元件 + `XxxVariants` 型別）；**無全域性 barrel**。
- 匯入一律深路徑 `@/components/ui/<layer>/<family>`；元件 `PascalCase`、檔案 `kebab-case.tsx`、目錄 `kebab-case/`。
- 變體用 cva（`class-variance-authority`）定義並從 `index.ts` 匯出型別；`className` 經 `cn` 合併；ref 轉發；根元素 `data-slot`。

## 硬性紀律

1. 樣式只消費三層 token（`var(--*)` 或經 `@theme` 對映的工具類，如 `bg-surface`、`text-caption`、`text-status-success`）；**禁止裸 `text-[Npx]`/`rounded-[Npx]`/十六進位制色值**。字號/行高用註冊排版工具類或 token 引用。
2. 明暗自適應由 CSS 變數完成，不讀皮膚 ID；持久切換 `aria-pressed` + `data-active`，保留 `:focus-visible`，尊重 `prefers-reduced-motion`。
3. 圖示以 lucide 元件引用傳入（`icon={Move}`），尺寸/顏色由宿主元件決定，禁止呼叫方傳 icon className 改尺寸。
4. 元件頭註釋註明：用途、消費 token 組、對標/接管物件（AntD 元件或參考系統元件）、明暗差異要點。

## 進庫門檻

新元件必須滿足其一：① ≥2 處真實重複（PR 附 grep 證據）；② 隔離明確協議/互動契約。純透傳殼不進庫。

## 當前族目錄

- `base/kbd/` — Kbd（快捷鍵提示鍵帽）
- `base/badges/` — StatusBadge（狀態點徽章；NodeTypeBadge 規劃中）
- `base/buttons/` — IconButton / ToolButton（IconButton 含 ghost/default/outline/solid/danger 變體；ButtonGroup 規劃中）
- `base/segmented-control/` — SegmentedControl（分段單選，thumb 滑動，泛型 + block/size）
- `base/checkbox/` — Checkbox + CheckboxGroup（原生 input + 自繪 glyph，checked/indeterminate/bare）
- `base/select/` — Select（RAC 單選殼，value/options/allowClear；多選/搜尋 ComboBox 待建）
- `base/tooltip/` — Tooltip（RAC 浮層，AntD 8 向 placement 對映，title 空不渲染）
- `base/switch/` — Switch（button role=switch + data-state，checkedChildren 文本軌、loading、Form.Item 注入）
- `product/empty-state/` — EmptyState（空態佔位）
- `product/callout/` — Callout
- `product/app-modal/` — AppModal（產品彈窗殼，`flush` 去掉 AntD 預設內邊距）
- `product/app-drawer/` — AppDrawer（產品側欄殼）
- `base/buttons/` — IconButton / ToolButton / ButtonGroup（規劃中，P0）
