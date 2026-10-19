import { http } from "@/services/api/request";

let connectionEpoch = 0;
export function getBeefAPIConnectionEpoch() {
    return connectionEpoch;
}

export type BeefAPIAccount = {
    id: string;
    username?: string;
    display_name?: string;
    email?: string;
};

export type BeefAPIConnectionState = "disconnected" | "connecting" | "connection_error" | "pending" | "connected" | "expired" | "cancelled" | "rejected" | "store_error" | "catalog_failed" | "revoked";

export type BeefAPIConnectionSummary = {
    state: BeefAPIConnectionState | string;
    userCode?: string;
    verificationUri?: string;
    expiresAt?: string;
    account?: BeefAPIAccount | null;
    keyName?: string;
    tokenId?: string;
    market?: string;
    walletUrl?: string;
    balance?: "unknown" | "zero" | "available" | string;
    catalogFailed?: boolean;
    errorReason?: string;
    connectedAt?: string;
    credentialRef?: string;
    hasCredential?: boolean;
};

export function getBeefAPIConnection(signal?: AbortSignal) {
    return http.get<BeefAPIConnectionSummary>("/beefapi/connection", { signal });
}

export function startBeefAPIConnection(signal?: AbortSignal) {
    connectionEpoch++;
    // Authorization may need a proxy handshake and one safe direct attempt.
    return http.post<BeefAPIConnectionSummary>("/beefapi/connection/start", {}, { signal, timeout: 35_000 });
}

export function cancelBeefAPIConnection(signal?: AbortSignal) {
    connectionEpoch++;
    return http.post<BeefAPIConnectionSummary>("/beefapi/connection/cancel", {}, { signal });
}

export function disconnectBeefAPIConnection(signal?: AbortSignal) {
    connectionEpoch++;
    return http.post<BeefAPIConnectionSummary>("/beefapi/connection/disconnect", {}, { signal });
}

export function openBeefAPIWallet(signal?: AbortSignal) {
    return http.post<{ opened: boolean }>("/beefapi/connection/open-wallet", {}, { signal });
}

export function beefAPIConnectionLabel(summary: BeefAPIConnectionSummary | null | undefined) {
    const state = summary?.state || "disconnected";
    switch (state) {
        case "connecting":
            return summary?.errorReason || "正在連線 MURMUR AI";
        case "connection_error":
            return summary?.errorReason || "無法連線 MURMUR AI 服務，請檢查網路後重試";
        case "pending":
            return summary?.errorReason || (summary?.userCode ? `請在瀏覽器中確認 ${summary.userCode}` : "請在瀏覽器中確認授權");
        case "connected":
            return connectedAccountLabel(summary);
        case "expired":
            return "授權已過期，請重新連線";
        case "cancelled":
            return "已取消本次連線";
        case "rejected":
            return "授權被拒絕";
        case "store_error":
            return "儲存連線失敗，請重試";
        case "catalog_failed":
            return "模型列表讀取失敗，請重試";
        case "revoked":
            return "連線已失效，請重新連線";
        default:
            return "未連線";
    }
}

function connectedAccountLabel(summary: BeefAPIConnectionSummary | null | undefined) {
    const account = summary?.account;
    const name = account?.email || account?.display_name || account?.username;
    if (name && summary?.balance === "zero") return `已連線 ${name}，餘額為 0`;
    if (name) return `已連線 ${name}`;
    if (summary?.balance === "zero") return "已連線，餘額為 0";
    return "已連線";
}
