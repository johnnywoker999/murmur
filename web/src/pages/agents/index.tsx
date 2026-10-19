import { useQuery } from "@tanstack/react-query";
import { App, Button, Popconfirm } from "antd";
import { Plug } from "lucide-react";
import { useState } from "react";

import { PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { EmptyState } from "@/components/ui/product/empty-state";
import { useCopyText } from "@/hooks/use-copy-text";
import { ApiError } from "@/services/api/request";
import { listAgentClients, revokeAgentClient, type AgentClientKind } from "@/services/api/agent-clients";

import { agentClientDisplayLabel, agentClientKindLabel, agentClientKinds, agentClientLastUsedLabel, agentClientModeLabel } from "./agent-client-presentation";
import { AgentConnectPanel } from "./agent-connect-panel";

const AGENT_CLIENTS_QUERY_KEY = ["agent-clients"] as const;

export default function AgentsPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [connecting, setConnecting] = useState<AgentClientKind | null>(null);
    const [managing, setManaging] = useState<AgentClientKind | null>(null);
    const [setupBusy, setSetupBusy] = useState(false);
    const [revoking, setRevoking] = useState("");

    const clientsQuery = useQuery({
        queryKey: AGENT_CLIENTS_QUERY_KEY,
        queryFn: ({ signal }) => listAgentClients(signal),
        retry: false,
        refetchInterval: 5000,
    });

    // 後端還沒帶上這個能力時（404）不報錯，也不留一個壞掉的頁面。
    const unsupported = clientsQuery.error instanceof ApiError && clientsQuery.error.status === 404;
    const clients = clientsQuery.data?.clients || [];
    const cli = clientsQuery.data?.cli;

    const disconnect = async (id: string) => {
        setRevoking(id);
        try {
            await revokeAgentClient(id);
            message.success("已斷開");
            await clientsQuery.refetch();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "斷開失敗，請稍後重試");
        } finally {
            setRevoking("");
        }
    };

    return (
        <WorkspacePage>
            <PageHeader title="MURMUR AI MCP" />

            {unsupported ? (
                <EmptyState icon={Plug} title="當前版本還不支援" description="更新到新版本後就能在這裡連線 Codex、Claude Code 和 Cursor。" />
            ) : (
                <div className="agents-settings mt-4 pb-6">
                    {clientsQuery.isPending ? <p className="text-xs text-foreground/55">正在讀取…</p> : null}
                    {clientsQuery.error ? <div role="alert" className="mb-4 text-sm">無法讀取連線狀態。<Button type="link" onClick={() => void clientsQuery.refetch()}>重試</Button></div> : null}
                    <div className="agent-tool-list">
                        {agentClientKinds.map((kind) => {
                            const registered = clients.filter((client) => client.kind === kind);
                            const expanded = connecting === kind || managing === kind;
                            const status = clientsQuery.isPending || clientsQuery.error ? "狀態未知" : registered.some((client) => client.lastUsedAt) ? "已驗證連線" : registered.length ? "等待連線" : "未連線";
                            return <section key={kind} data-agent-client-kind={kind} className="agent-tool">
                                <div className="agent-tool-row">
                                    <h2>{agentClientKindLabel(kind)}</h2>
                                    <div className="agent-tool-actions">
                                        <span className="agent-tool-status">{status}</span>
                                        <Button aria-expanded={expanded} disabled={setupBusy || !cli?.available || clientsQuery.isPending || Boolean(clientsQuery.error)} onClick={() => {
                                            if (expanded) { setConnecting(null); setManaging(null); return; }
                                            setConnecting(registered.length ? null : kind);
                                            setManaging(registered.length ? kind : null);
                                        }}>{expanded ? "收起" : registered.length ? "管理" : "連線"}</Button>
                                    </div>
                                </div>
                                {managing === kind ? <div className="agent-management">
                                    {registered.map((client) => <div key={client.id} data-agent-client-id={client.id} className="agent-registration">
                                        <div className="agent-registration-info"><p className="text-sm font-medium break-words">{agentClientDisplayLabel(client)}</p><p className="text-xs text-foreground/55">{agentClientModeLabel(client.mode)} · 最近使用：{agentClientLastUsedLabel(client.lastUsedAt)}</p></div>
                                        <Popconfirm title="斷開這個工具？" description="斷開後它不能再讀取或修改畫布，需要重新連線。" okText="斷開" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => void disconnect(client.id)}>
                                            <Button loading={revoking === client.id}>斷開</Button>
                                        </Popconfirm>
                                    </div>)}
                                    <Button className="agent-add-connection mt-3" onClick={() => { setManaging(null); setConnecting(kind); }}>新增連線</Button>
                                </div> : null}
                                {connecting === kind ? <AgentConnectPanel key={kind} kind={kind} onClose={() => setConnecting(null)} onConfigured={() => void clientsQuery.refetch()} verifiedClientIds={clients.filter((client) => client.lastUsedAt).map((client) => client.id)} onBusyChange={setSetupBusy} /> : null}
                            </section>;
                        })}
                    </div>
                    {cli && !cli.available ? <p role="alert" className="mt-4 text-sm text-foreground/60">安裝檔案不完整，無法連線外部工具。請重新下載並完整解壓 MURMUR AI。</p> : null}
                    {cli?.available ? <details className="agent-cli-details"><summary>命令列工具</summary><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-foreground/55">在終端使用 beeftv 命令</p><Button size="small" onClick={() => copyText(cli.installCommand)}>複製安裝命令</Button></div></details> : null}
                </div>
            )}

        </WorkspacePage>
    );
}
