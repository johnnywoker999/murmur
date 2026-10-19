import type { AgentClient, AgentClientKind, AgentClientMode, AgentClientSetup } from "@/services/api/agent-clients";

export const agentClientKinds: AgentClientKind[] = ["codex", "claude", "claude-desktop", "cursor", "other"];

const kindLabels: Record<AgentClientKind, string> = {
    codex: "Codex",
    claude: "Claude Code",
    "claude-desktop": "Claude Desktop",
    cursor: "Cursor",
    other: "其他 MCP 客戶端",
};

const kindSummaries: Record<AgentClientKind, string> = {
    codex: "在終端裡連線 Codex。",
    claude: "在終端裡連線 Claude Code。",
    "claude-desktop": "在 Claude 桌面應用裡連線。",
    cursor: "在 Cursor 的配置裡連線。",
    other: "支援 MCP 的工具都能連。",
};

const modeLabels: Record<AgentClientMode, string> = {
    "read-only": "舊版只讀連線",
    "read-write": "全部創作工具",
};

const modeSummaries: Record<AgentClientMode, string> = {
    "read-only": "此連線保持只讀；重新連線後可使用全部創作工具。",
    "read-write": "可使用 MURMUR AI 的全部創作工具，操作審批由連線的 Agent 負責。",
};

export function agentClientKindLabel(kind: AgentClientKind | string) {
    return kindLabels[kind as AgentClientKind] || "其他 MCP 客戶端";
}

export function agentClientKindSummary(kind: AgentClientKind) {
    return kindSummaries[kind];
}

export function agentClientModeLabel(mode: AgentClientMode | string) {
    return modeLabels[mode as AgentClientMode] || modeLabels["read-only"];
}

export function agentClientModeSummary(mode: AgentClientMode) {
    return modeSummaries[mode];
}

export type AgentClientSetupBlock = {
    /** 待貼上的整段內容；憑證只存在於這裡，頁面不再單獨展示。 */
    text: string;
    format: "command" | "json";
    instruction: string;
};

const COMMAND_INSTRUCTION = "貼上到終端執行；Windows 請使用 PowerShell。連線時請保持 MURMUR AI 開啟。";

const configInstructions: Record<AgentClientKind, string> = {
    codex: "貼上到你使用的工具的 MCP 配置檔案裡。",
    claude: "貼上到你使用的工具的 MCP 配置檔案裡。",
    "claude-desktop": "開啟 Claude Desktop 的設定 → 開發者 → 編輯配置，將 beeftv 項合併到 mcpServers，保留已有服務，然後完全退出並重新開啟 Claude。連線時請保持 MURMUR AI 開啟。",
    cursor: "貼上到 ~/.cursor/mcp.json。",
    other: "貼上到你使用的工具的 MCP 配置檔案裡。",
};

/**
 * codex / claude 給一條終端命令，cursor / other 給一段配置。
 * 後端只會給出其中一種；若與型別不一致，按實際給到的那一種展示，避免頁面空白。
 */
export function agentClientSetupBlock(setup: AgentClientSetup | undefined): AgentClientSetupBlock | null {
    if (!setup) return null;
    const command = setup.command?.trim() || "";
    const json = setup.json?.trim() || "";
    const prefersCommand = setup.kind === "codex" || setup.kind === "claude";
    const text = prefersCommand ? command || json : json || command;
    if (!text) return null;
    const format: "command" | "json" = text === command ? "command" : "json";
    return { text, format, instruction: format === "command" ? COMMAND_INSTRUCTION : configInstructions[setup.kind] || configInstructions.other };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 最近使用：沒用過要說沒用過，不要顯示一個假的時間。 */
export function agentClientLastUsedLabel(lastUsedAt: string | null | undefined, now: number = Date.now()) {
    if (!lastUsedAt) return "還沒用過";
    const used = Date.parse(lastUsedAt);
    if (!Number.isFinite(used)) return "還沒用過";
    const elapsed = now - used;
    if (elapsed < MINUTE) return "剛剛";
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} 分鐘前`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} 小時前`;
    if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)} 天前`;
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(used);
}

export function agentClientDisplayLabel(client: AgentClient) {
    return client.label?.trim() || agentClientKindLabel(client.kind);
}
