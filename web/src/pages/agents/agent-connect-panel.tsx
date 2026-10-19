import { App, Button } from "antd";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { useCopyText } from "@/hooks/use-copy-text";
import { createAgentClient, type AgentClientKind, type AgentClientRegistration } from "@/services/api/agent-clients";

import { agentClientKindLabel, agentClientSetupBlock } from "./agent-client-presentation";

export function AgentConnectPanel({ kind, onClose, onConfigured, verifiedClientIds, onBusyChange }: { kind: AgentClientKind | null; onClose: () => void; onConfigured: () => void; verifiedClientIds: string[]; onBusyChange: (busy: boolean) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [submitting, setSubmitting] = useState(false);
    const [registration, setRegistration] = useState<AgentClientRegistration | null>(null);

    useEffect(() => {
        if (!kind) return;
        setSubmitting(false);
        setRegistration(null);
    }, [kind]);

    const connect = async () => {
        if (!kind) return;
        setSubmitting(true);
        onBusyChange(true);
        try {
            const result = await createAgentClient({ kind });
            setRegistration(result);
            onConfigured();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "連線失敗，請稍後重試");
        } finally {
            setSubmitting(false);
            onBusyChange(false);
        }
    };

    const setup = agentClientSetupBlock(registration?.setup);
    const verified = Boolean(registration && verifiedClientIds.includes(registration.client.id));

    return (
        <div className="agent-connect-panel" aria-label={`連線 ${agentClientKindLabel(kind || "other")}`}>
            {registration && setup ? (
                <div className="flex flex-col gap-3 py-1">
                    <p role="status" className="text-sm">{verified ? "已檢測到該工具訪問 MURMUR AI，連線驗證成功。" : "等待工具連線。請執行下方命令或新增配置，再在工具中啟用 MURMUR AI。"}</p>
                    <p className="text-xs leading-5 text-foreground/60">{setup.instruction}</p>
                    <pre className="max-h-64 overflow-auto rounded-md bg-surface-active px-3.5 py-3 text-[12px] leading-5 font-mono whitespace-pre-wrap break-all text-foreground/85">{setup.text}</pre>
                    <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 text-xs leading-5 text-foreground/50">這段內容只顯示一次，關掉後需要重新連線。</p>
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(setup.text)}>複製</Button>
                    </div>
                </div>
            ) : registration ? (
                <p className="py-2 text-xs leading-5 text-foreground/60">沒有拿到接入內容，請斷開後重新連線。</p>
            ) : (
                <div className="flex flex-col gap-3 py-1">
                    <p className="text-xs leading-5 text-foreground/60">連線後可使用 MURMUR AI 的全部創作工具。每次操作的審批由 {agentClientKindLabel(kind || "other")} 負責。</p>
                </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
                <Button disabled={submitting} onClick={onClose}>{registration ? "收起" : "取消"}</Button>
                {!registration && <Button type="primary" loading={submitting} onClick={() => void connect()}>生成連線配置</Button>}
            </div>
        </div>
    );
}
