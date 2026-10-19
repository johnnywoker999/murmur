import { http } from "@/services/api/request";

/** 外部編輯器/CLI 接入 MURMUR AI 畫布的客戶端型別。 */
export type AgentClientKind = "codex" | "claude" | "claude-desktop" | "cursor" | "other";

/** 授予外部客戶端的畫布許可權。 */
export type AgentClientMode = "read-only" | "read-write";

export type AgentClient = {
    id: string;
    label: string;
    kind: AgentClientKind;
    mode: AgentClientMode;
    createdAt: string;
    lastUsedAt: string | null;
};

export type AgentClientCli = {
    path: string;
    available: boolean;
    installCommand: string;
};

export type AgentClientList = {
    clients: AgentClient[];
    cli: AgentClientCli;
};

/**
 * 接入指引由後端生成：codex / claude 返回單條 `command`，cursor / other 返回 `json`。
 * 憑證只嵌在這段文本里，介面不再單獨返回可展示的明文。
 */
export type AgentClientSetup = {
    kind: AgentClientKind;
    title: string;
    command?: string;
    json?: string;
};

export type AgentClientRegistration = {
    client: AgentClient;
    token: string;
    setup: AgentClientSetup;
};

export function listAgentClients(signal?: AbortSignal) {
    return http.get<AgentClientList>("/agent-clients", { signal });
}

export function createAgentClient(body: { kind: AgentClientKind; label?: string }) {
    return http.post<AgentClientRegistration>("/agent-clients", { kind: body.kind, ...(body.label ? { label: body.label } : {}) });
}

export function revokeAgentClient(id: string) {
    return http.delete<{ revoked: boolean }>(`/agent-clients/${encodeURIComponent(id)}`);
}
