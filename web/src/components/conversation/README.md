# 即時對話功能元件（第一階段 MVP）
本目錄實現第一階段（MVP）：**本地語音錄製 + 瀏覽器語音識別轉寫**。點選"即時對話"按鈕 → 輸入行內展開波形錄製條 → 停止後自動轉寫為文字 → 文字填入輸入框或直接傳送。

## 零配置說明

第一階段**不接入語音大模型、不依賴後端與 API Key**：錄音完成後直接使用瀏覽器內建 Web Speech API（`SpeechRecognition`）識別，轉寫全程在前端完成。

- 支援的瀏覽器：Chrome / Edge（Chromium 核心）
- 不支援時錄製條內會明確提示，並可取消
- 識別語言預設 `zh-CN`，見 `useSpeechRecognition` 的 `lang` 引數

---

## 元件列表

### 1. `VoiceRecordingButton` - 語音輸入按鈕

點選後輸入行內展開波形錄製條（不彈窗），自動開始錄音；停止後自動轉寫並回撥文本。使用區域性狀態，多個輸入行可獨立使用。

**使用示例：**
```tsx
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";

<VoiceRecordingButton
  disabled={isBusy}
  onTranscribed={(text) => setPrompt((prev) => (prev.trim() ? `${prev} ${text}` : text))}
/>
```

### 2. `VoiceRecordingInline` - 內聯波形錄製條

輸入行內展示的錄製控制元件：波形動畫 + 時長 + 停止/取消按鈕；停止後自動轉寫，失敗可重試。`VoiceRecordingButton` 預設使用本元件。

**使用示例：**
```tsx
import { VoiceRecordingInline } from "@/components/conversation/voice-recording-inline";

<VoiceRecordingInline
  onTranscribed={(text) => setPrompt((prev) => (prev.trim() ? `${prev} ${text}` : text))}
  onCancel={() => setOpen(false)}
/>
```

### 3. `AudioWaveform` - 音訊波形視覺化

SVG 波形視覺化元件，支援即時資料更新。

---

## Hook

### `useVoiceRecording` - 語音錄製 Hook

封裝 MediaRecorder API 和 AnalyserNode，提供錄製狀態、波形資料、控制方法（供波形動畫與時長展示）。

### `useSpeechRecognition` - 瀏覽器語音識別 Hook

封裝 Web Speech API（`SpeechRecognition`/`webkitSpeechRecognition`），提供 `start()` / `stop(): Promise<string>` / `cancel()`，返回是否支援、識別錯誤。轉寫不依賴後端。

---

## 完整整合示例

```tsx
import { useState } from "react";
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";

function ChatInput() {
  const [prompt, setPrompt] = useState("");

  const handleTranscribed = (text: string) => {
    // 轉寫結果填入輸入框，使用者確認後傳送
    setPrompt((current) => (current.trim() ? `${current} ${text}` : text));
  };

  return (
    <div className="flex items-center gap-2">
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="輸入訊息..." />
      {/* 點選後輸入行內展開波形錄製條，停止後自動轉寫 */}
      <VoiceRecordingButton onTranscribed={handleTranscribed} />
      <button>傳送</button>
    </div>
  );
}
```

## 接入位置

- 建立頁主輸入行：`web/src/pages/create/index.tsx`（`CreationComposer` 的 `creation-chat-controls`）
- 畫布：舊內建 Agent 停靠面板已退場，畫布側暫不再接入語音輸入
- 測試頁：`web/src/pages/test-voice-recording.tsx`

## 下一步
- [x] 內聯波形錄製（不彈窗），停止後自動轉寫
- [x] 移除第二階段實驗程式碼（WebSocket / Realtime API / 舊浮層元件）
- [x] 移除後端 STT 介面與資料庫表（第一階段不接入語音大模型）
- [ ] 語音播放功能（TTS）
- [ ] 語音訊息傳送和顯示
- [ ] 多模態對話（圖片、影片）
- [ ] 真正即時對話（WebSocket + WebRTC + Realtime API，後續階段）
