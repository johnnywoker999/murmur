import { Button } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useState } from "react";

import { Mic } from "lucide-react";

import { cn } from "@/lib/utils";
import { VoiceRecordingInline } from "./voice-recording-inline";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";

type VoiceRecordingButtonProps = {
    /** 轉寫完成回撥，返回轉寫文本 */
    onTranscribed: (text: string) => void;
    /** 是否停用（如傳送中或未連線） */
    disabled?: boolean;
    className?: string;
};

/**
 * 語音輸入按鈕：點選後在輸入行內展開波形錄製條，錄製完成自動 STT 轉寫
 * 使用區域性狀態，多個輸入行可獨立使用
 */
export function VoiceRecordingButton({ onTranscribed, disabled, className }: VoiceRecordingButtonProps) {
    const theme = canvasThemes[useActiveTheme()];
    const [open, setOpen] = useState(false);

    return (
        <>
            <Tooltip title="即時對話">
                <Button
                    type="text"
                    shape="circle"
                    className={cn("!h-8 !w-8 !min-w-8", className)}
                    disabled={disabled}
                    style={className ? undefined : { color: theme.node.muted }}
                    icon={<Mic className="size-4" />}
                    onClick={() => setOpen(true)}
                    aria-label="即時對話"
                />
            </Tooltip>
            {open ? (
                <VoiceRecordingInline
                    onTranscribed={(text) => {
                        setOpen(false);
                        onTranscribed(text);
                    }}
                    onCancel={() => setOpen(false)}
                />
            ) : null}
        </>
    );
}
