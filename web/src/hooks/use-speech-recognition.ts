import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = { isFinal: boolean; length: number; [index: number]: SpeechRecognitionAlternative };
type SpeechRecognitionResultList = { length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult };

type SpeechRecognitionLike = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onstart: (() => void) | null;
    onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    const globalWithSpeech = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return globalWithSpeech.SpeechRecognition || globalWithSpeech.webkitSpeechRecognition || null;
}

export type SpeechRecognitionError = {
    code: string;
    message: string;
};

type UseSpeechRecognitionOptions = {
    /** 語言程式碼，預設 zh-CN */
    lang?: string;
};

export type UseSpeechRecognitionReturn = {
    /** 瀏覽器是否支援 Web Speech API */
    supported: boolean;
    /** 識別錯誤（許可權、網路、不支援等） */
    error: SpeechRecognitionError | null;
    /** 開始識別，掛載後自動呼叫 */
    start: () => void;
    /** 停止識別並返回已累積的最終文本 */
    stop: () => Promise<string>;
    /** 取消識別並清空累積文本 */
    cancel: () => void;
};

/**
 * 瀏覽器內建語音識別 Hook（Web Speech API）
 * 第一階段 MVP 使用：不依賴後端、模型渠道或 API Key，零配置可用
 */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
    const { lang = "zh-CN" } = options;
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const finalTextRef = useRef("");
    const stopResolveRef = useRef<((text: string) => void) | null>(null);
    const stopTimerRef = useRef<number | null>(null);
    const [supported] = useState(() => Boolean(getSpeechRecognition()));
    const [error, setError] = useState<SpeechRecognitionError | null>(null);

    const start = useCallback(() => {
        const Constructor = getSpeechRecognition();
        if (!Constructor) {
            setError({ code: "unsupported", message: "當前瀏覽器不支援語音識別，請使用 Chrome 或 Edge" });
            return;
        }
        finalTextRef.current = "";
        const recognition = new Constructor();
        recognition.lang = lang;
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => setError(null);
        recognition.onresult = (event) => {
            let text = finalTextRef.current;
            for (let i = 0; i < event.results.length; i += 1) {
                const result = event.results[i];
                if (result.isFinal && result[0]?.transcript) {
                    text = [text, result[0].transcript.trim()].filter(Boolean).join(" ");
                }
            }
            finalTextRef.current = text;
        };
        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                setError({ code: event.error, message: "麥克風許可權被拒絕，請在瀏覽器設定中允許訪問麥克風" });
            } else if (event.error === "no-speech") {
                setError({ code: event.error, message: "未檢測到語音，請重試" });
            } else if (event.error === "network") {
                setError({ code: event.error, message: "語音識別服務不可用，請檢查網路後重試" });
            } else {
                setError({ code: event.error, message: `語音識別失敗（${event.error}）` });
            }
        };
        recognition.onend = () => {
            if (stopTimerRef.current !== null) {
                window.clearTimeout(stopTimerRef.current);
                stopTimerRef.current = null;
            }
            const resolve = stopResolveRef.current;
            stopResolveRef.current = null;
            resolve?.(finalTextRef.current);
        };
        recognitionRef.current = recognition;
        recognition.start();
    }, [lang]);

    const stop = useCallback((): Promise<string> => {
        return new Promise((resolve) => {
            const recognition = recognitionRef.current;
            if (!recognition) {
                resolve(finalTextRef.current);
                return;
            }
            stopResolveRef.current = resolve;
            // 兜底：部分瀏覽器 stop() 後 onend 可能不觸發，超時後返回已識別文本
            stopTimerRef.current = window.setTimeout(() => {
                if (stopResolveRef.current) {
                    stopResolveRef.current = null;
                    resolve(finalTextRef.current);
                }
            }, 1500);
            try {
                recognition.stop();
            } catch {
                if (stopTimerRef.current !== null) {
                    window.clearTimeout(stopTimerRef.current);
                    stopTimerRef.current = null;
                }
                stopResolveRef.current = null;
                resolve(finalTextRef.current);
            }
        });
    }, []);

    const cancel = useCallback(() => {
        if (stopTimerRef.current !== null) {
            window.clearTimeout(stopTimerRef.current);
            stopTimerRef.current = null;
        }
        stopResolveRef.current = null;
        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        if (recognition) {
            recognition.onend = null;
            try {
                recognition.abort();
            } catch { /* ignore */ }
        }
        finalTextRef.current = "";
    }, []);

    useEffect(() => cancel, [cancel]);

    return { supported, error, start, stop, cancel };
}
