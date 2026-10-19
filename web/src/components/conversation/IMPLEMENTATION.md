# 即時對話功能實現（第一階段 MVP）

## 專案概述

實現第一階段（MVP）：**本地語音錄製 + 瀏覽器語音識別轉寫**。點選"即時對話"按鈕 → 輸入行內展開波形錄製條 → 停止後自動轉寫為文字 → 文字填入輸入框或直接傳送。

第一階段**不接入語音大模型、不依賴後端與 API Key**，轉寫由瀏覽器內建 Web Speech API 完成，零配置可用。

---

## 互動流程

1. 點選"即時對話"按鈕（`VoiceRecordingButton`）
2. 輸入行內展開 `VoiceRecordingInline` 錄製條（不彈窗），自動開始錄音
3. 顯示波形動畫（AnalyserNode 即時音量）+ 時長
4. 點選停止 → 停止錄音並觸發瀏覽器語音識別
5. 識別成功 → 短暫顯示"轉寫完成" → 回撥文本，由呼叫方填入輸入框或直接傳送
6. 識別失敗（無語音 / 許可權拒絕 / 網路異常）→ 錄製條內提示並支援重試

---

## 技術架構

```
使用者點選"即時對話"按鈕
        │
        ▼
VoiceRecordingButton（輸入行內展開錄製條，不彈窗）
        │
        ▼
VoiceRecordingInline 內聯波形錄製條
        ├── useVoiceRecording：MediaRecorder 錄製 + AnalyserNode 即時波形
        ├── AudioWaveform：SVG 波形動畫 + 時長顯示
        └── useSpeechRecognition：Web Speech API 即時轉寫
                │
                ▼
點選停止 → speech.stop() 返回文本 → onTranscribed(文本) → 填入輸入框
```

## 前端實現

### 元件

| 檔案 | 說明 |
|------|------|
| `components/conversation/voice-recording-button.tsx` | 語音輸入按鈕：點選後輸入行內展開錄製條（區域性狀態，不彈窗） |
| `components/conversation/voice-recording-inline.tsx` | 內聯波形錄製條：波形 + 時長 + 停止/取消，停止後自動轉寫 |
| `components/conversation/audio-waveform.tsx` | SVG 波形視覺化元件 |
| `components/conversation/index.ts` | 元件統一匯出 |

### Hook

| 檔案 | 說明 |
|------|------|
| `hooks/use-voice-recording.ts` | 語音錄製邏輯（MediaRecorder + AnalyserNode，波形/時長/停止/取消） |
| `hooks/use-speech-recognition.ts` | 瀏覽器語音識別（Web Speech API，start/stop/cancel，返回文本與錯誤） |

## 接入位置

- 建立頁主輸入行：`web/src/pages/create/index.tsx`（`CreationComposer` 的 `creation-chat-controls`）
- 畫布：舊內建 Agent 停靠面板已退場，畫布側暫不再接入語音輸入
- 測試頁：`web/src/pages/test-voice-recording.tsx`（路由 `/test-voice-recording`）

## 使用示例

```tsx
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";

<VoiceRecordingButton
  disabled={isBusy}
  onTranscribed={(text) => setPrompt((prev) => (prev.trim() ? `${prev} ${text}` : text))}
/>
```

## 瀏覽器支援

- 語音識別使用 Web Speech API（`SpeechRecognition` / `webkitSpeechRecognition`），Chrome / Edge 支援
- 不支援時錄製條內提示"當前瀏覽器不支援語音識別，請使用 Chrome 或 Edge 瀏覽器"，並可取消
- 識別語言預設 `zh-CN`，可通過 `useSpeechRecognition({ lang })` 調整

## 已刪除內容

以下第二階段實驗程式碼已全部刪除：

### 前端

- `components/conversation/realtime-conversation.tsx`、`realtime-conversation-button.tsx`、`voice-recording-overlay.tsx`
- `hooks/use-websocket.ts`、`stores/conversation-mode-store.ts`
- `services/api/stt.ts`（後端 Whisper 轉寫客戶端）

### 後端

- `service/stt.go`（OpenAI Whisper 轉寫）、`model/stt.go`（`stt_results` 表）
- `handler/routes.go` 中 `RegisterSTTRoutes`、`main.go` 中路由註冊
- `database/schema.go` 中 `STTResult` 模型註冊、`repository/repository.go` 中 `CreateSTTResult`

## 驗證情況

- 後端 `go build ./...`：通過
- 前端 `npx tsc --noEmit`：無本次新增型別錯誤（上游遺留 style profile / image.ts 錯誤除外）
- 瀏覽器手動測試（真實麥克風 + 語音識別）未執行，需在 Chrome/Edge 下驗證

## 下一步

- [x] 內聯波形錄製 + 瀏覽器語音識別自動轉寫（第一階段 MVP）
- [x] 移除第二階段實驗程式碼（WebSocket / WebRTC / Realtime API）
- [ ] 語音播放功能（TTS）
- [ ] 語音訊息傳送和顯示
- [ ] 真正即時對話（WebSocket + WebRTC + Realtime API，後續階段）
