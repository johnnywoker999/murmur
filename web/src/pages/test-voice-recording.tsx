import { useState } from "react";
import { Button, Card, message } from "antd";
import { Mic, Send } from "lucide-react";

import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

/**
 * 語音錄製功能測試頁面
 * 驗證輸入行內聯波形錄製和 STT 轉寫閉環
 */
export default function TestVoiceRecording() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [prompt, setPrompt] = useState("");
    const [sending, setSending] = useState(false);

    const handleTranscribed = (text: string) => {
        // 轉寫結果填入輸入框，供使用者確認或直接傳送
        setPrompt((current) => (current.trim() ? `${current} ${text}` : text));
        message.success("語音已轉寫為文字");
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) return;
        setSending(true);
        try {
            // 原型階段：傳送到對話入口由呼叫方接入；此處僅輸出
            console.log("傳送文本:", prompt);
            message.success("傳送成功（原型階段，僅控制台輸出）");
            setPrompt("");
        } finally {
            setSending(false);
        }
    };


    return (
        <div className="min-h-screen p-8" style={{ background: theme.spatial.surface }}>
            <div className="mx-auto max-w-2xl">
                <Card
                    title={
                        <div className="flex items-center gap-2">
                            <Mic className="size-5" style={{ color: theme.accent.primary }} />
                            <span>即時對話功能測試（MVP）</span>
                        </div>
                    }
                    style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border }}
                >
                    <div className="space-y-4">
                        {/* 文本輸入 */}
                        <div>
                            <label className="mb-2 block text-sm font-medium" style={{ color: theme.node.text }}>
                                文本輸入（語音轉寫結果會自動填入）
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="輸入訊息，或點選即時對話按鈕用語音輸入..."
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-current"
                                style={{
                                    background: theme.node.fill,
                                    borderColor: theme.toolbar.border,
                                    color: theme.node.text,
                                    minHeight: 80,
                                }}
                            />
                        </div>

                        {/* 音訊預覽 */}

                        {/* 控制欄：即時對話按鈕（點選後在輸入行展開波形錄製條） */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-1 items-center gap-2">
                                <VoiceRecordingButton onTranscribed={handleTranscribed} />
                            </div>
                            <Button
                                type="primary"
                                icon={<Send className="size-4" />}
                                disabled={!prompt.trim()}
                                loading={sending}
                                onClick={handleSubmit}
                                style={{ background: theme.accent.primary, borderColor: theme.accent.primary, color: theme.accent.onPrimary }}
                            >
                                傳送
                            </Button>
                        </div>

                        {/* 說明 */}
                        <div className="rounded-lg border p-3 text-xs" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.muted }}>
                            <div className="font-semibold" style={{ color: theme.node.text }}>
                                使用說明：
                            </div>
                            <ul className="mt-1 list-inside list-disc space-y-1">
                                <li>點選麥克風按鈕，輸入行內展開波形錄製條並自動開始錄音</li>
                                <li>波形動畫即時顯示音量變化</li>
                                <li>點選停止按鈕完成錄製，自動上傳並轉寫</li>
                                <li>轉寫結果自動填入輸入框，可編輯後傳送</li>
                                <li>轉寫失敗時在錄製條內提示，可點選麥克風重試</li>
                            </ul>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
