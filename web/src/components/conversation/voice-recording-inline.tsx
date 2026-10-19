import { Button, Spin } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useEffect, useRef, useState } from "react";

import { Check, Mic, Square, X } from "lucide-react";

import { AudioWaveform } from "./audio-waveform";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";

type VoiceRecordingInlineProps = {
    /** 轉寫完成回撥，返回轉寫文本 */
    onTranscribed: (text: string) => void;
    /** 取消錄製回撥 */
    onCancel: () => void;
};

type TranscribeState = "idle" | "transcribing" | "done" | "error";

/**
 * 內聯語音錄製條（輸入行內展示）
 * 掛載後自動開始錄音，顯示波形動畫；點選停止後自動轉寫為文字（瀏覽器 Web Speech API，無需後端與 API Key）
 */
export function VoiceRecordingInline({ onTranscribed, onCancel }: VoiceRecordingInlineProps) {
    const theme = canvasThemes[useActiveTheme()];
    const {
        state,
        waveform,
        duration,
        error: recorderError,
        start: startRecording,
        stop: stopRecording,
        cancel: cancelRecording,
    } = useVoiceRecording({
        maxDuration: 60,
    });
    const {
        supported: speechSupported,
        error: speechError,
        start: startSpeech,
        stop: stopSpeech,
        cancel: cancelSpeech,
    } = useSpeechRecognition();
    const [transcribeState, setTranscribeState] = useState<TranscribeState>("idle");
    const [transcribeError, setTranscribeError] = useState("");
    const stopRequestedRef = useRef(false);
    const wasRecordingRef = useRef(false);

    // 掛載後自動開始錄音與語音識別，解除安裝時清理
    useEffect(() => {
        if (!speechSupported) {
            setTranscribeError("當前瀏覽器不支援語音識別，請使用 Chrome 或 Edge 瀏覽器");
            setTranscribeState("error");
            return;
        }
        void startRecording();
        startSpeech();
        return () => {
            cancelRecording();
            cancelSpeech();
        };
    }, [startRecording, cancelRecording, startSpeech, cancelSpeech, speechSupported]);

    const handleStop = async () => {
        if (stopRequestedRef.current || transcribeState !== "idle") return;
        stopRequestedRef.current = true;
        setTranscribeState("transcribing");
        setTranscribeError("");
        const text = await stopSpeech();
        void stopRecording();
        const trimmed = text.trim();
        if (!trimmed) {
            setTranscribeError("未識別到語音內容，請重試");
            setTranscribeState("error");
            stopRequestedRef.current = false;
            return;
        }
        setTranscribeState("done");
        // 短暫展示成功狀態後回撥
        window.setTimeout(() => onTranscribed(trimmed), 600);
    };

    // 錄音達到最大時長自動停止時，自動觸發轉寫
    useEffect(() => {
        if (state === "recording") wasRecordingRef.current = true;
        if (state === "idle" && wasRecordingRef.current && transcribeState === "idle" && !stopRequestedRef.current) {
            wasRecordingRef.current = false;
            void handleStop();
        }
    }, [state, transcribeState]);

    const handleRetry = () => {
        stopRequestedRef.current = false;
        wasRecordingRef.current = false;
        setTranscribeError("");
        setTranscribeState("idle");
        void startRecording();
        startSpeech();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const displayError = recorderError || (speechError ? speechError.message : "") || (transcribeState === "error" ? transcribeError : "");

    return (
        <div
            className="voice-recording-inline flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2 py-1.5"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
        >
            {displayError ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-xs" style={{ color: "#dc2626" }}>
                        {displayError}
                    </span>
                    {speechSupported ? (
                        <Tooltip title="重試">
                            <Button
                                type="text"
                                size="small"
                                icon={<Mic className="size-3.5" />}
                                onClick={handleRetry}
                                style={{ color: theme.node.muted }}
                            />
                        </Tooltip>
                    ) : null}
                    <Tooltip title="取消">
                        <Button
                            type="text"
                            size="small"
                            icon={<X className="size-3.5" />}
                            onClick={onCancel}
                            style={{ color: theme.node.muted }}
                        />
                    </Tooltip>
                </div>
            ) : transcribeState === "transcribing" ? (
                <div className="flex items-center gap-2 px-2" style={{ color: theme.node.muted }}>
                    <Spin size="small" />
                    <span className="text-xs">正在轉寫...</span>
                </div>
            ) : transcribeState === "done" ? (
                <div className="flex items-center gap-2 px-2" style={{ color: "#16a34a" }}>
                    <Check className="size-4" />
                    <span className="text-xs">轉寫完成</span>
                </div>
            ) : (
                <>
                    <AudioWaveform
                        waveform={waveform}
                        color={theme.accent.primary}
                        height={32}
                        width={160}
                        animated={state === "recording"}
                    />
                    {state === "recording" ? (
                        <span className="font-mono text-xs tabular-nums" style={{ color: theme.node.text }}>
                            {formatDuration(duration)}
                        </span>
                    ) : null}
                    <Tooltip title="取消">
                        <Button
                            type="text"
                            size="small"
                            icon={<X className="size-3.5" />}
                            onClick={() => {
                                cancelRecording();
                                cancelSpeech();
                                onCancel();
                            }}
                            style={{ color: theme.node.muted }}
                        />
                    </Tooltip>
                    <Tooltip title="停止並轉寫">
                        <Button
                            type="text"
                            size="small"
                            icon={<Square className="size-3.5" />}
                            onClick={handleStop}
                            disabled={state !== "recording" || transcribeState !== "idle"}
                            style={{ color: theme.accent.primary }}
                        />
                    </Tooltip>
                </>
            )}
        </div>
    );
}
