import { isBeefAPIEndpoint } from "@/lib/beefapi-video-contracts";
import { apiBaseURL } from "@/services/api/request";
import { isSystemProxyBaseUrl, MANAGED_BEEFAPI_CREDENTIAL_REF, type AiConfig, type ChannelHeader } from "@/stores/use-config-store";

type RelayConfig = Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat"> & { headers?: ChannelHeader[]; credentialRef?: string };

export type ChannelRequest = {
    url: string;
    headers: Record<string, string>;
    credentials: RequestCredentials;
};

function isManagedEnterpriseRelay(config: Pick<RelayConfig, "baseUrl" | "credentialRef">) {
    if (config.credentialRef === MANAGED_BEEFAPI_CREDENTIAL_REF) return true;
    try {
        return isBeefAPIEndpoint(config.baseUrl || "");
    } catch {
        return false;
    }
}

/** 自定義渠道統一經登入態後端中轉，避免依賴第三方服務的瀏覽器 CORS。 */
export function channelRequest(config: RelayConfig, upstreamUrl: string, headers: HeadersInit = {}): ChannelRequest {
    const normalizedHeaders = new Headers(headers);
    const managed = isManagedEnterpriseRelay(config);
    // Mac Wails uses wails:; WebView2 uses http://wails.localhost and still has CORS.
    if (typeof window !== "undefined" && window.location?.protocol === "wails:" && !managed) {
        const normalizedUpstreamUrl = requireHttpUrl(upstreamUrl, "當前模型請求地址");
        normalizedHeaders.set("Authorization", `Bearer ${config.apiKey}`);
        for (const header of config.headers || []) {
            const name = header.name.trim();
            if (name) normalizedHeaders.set(name, header.value);
        }
        return { url: normalizedUpstreamUrl, headers: Object.fromEntries(normalizedHeaders.entries()), credentials: "omit" };
    }
    if (isSystemProxyBaseUrl(config.baseUrl)) {
        return { url: upstreamUrl, headers: Object.fromEntries(normalizedHeaders.entries()), credentials: "include" };
    }

    const normalizedBaseUrl = requireHttpUrl(config.baseUrl, "當前模型渠道 Base URL");
    const normalizedUpstreamUrl = requireHttpUrl(upstreamUrl, "當前模型請求地址");
    normalizedHeaders.delete("X-Canvas-Upstream-Headers");
    normalizedHeaders.delete("x-goog-api-key");
    normalizedHeaders.set("Authorization", `Bearer ${config.apiKey}`);
    normalizedHeaders.set("X-Canvas-Upstream-URL", normalizedUpstreamUrl);
    normalizedHeaders.set("X-Canvas-Upstream-Format", config.apiFormat === "gemini" ? "gemini" : config.apiFormat === "claude" ? "claude" : "openai");
    normalizedHeaders.set("X-Canvas-Upstream-Base-URL", normalizedBaseUrl);
    if (config.headers?.length) normalizedHeaders.set("X-Canvas-Upstream-Headers", encodeChannelHeaders(config.headers));
    return {
        url: `${apiBaseURL.replace(/\/+$/u, "")}/ai/custom`,
        headers: Object.fromEntries(normalizedHeaders.entries()),
        credentials: "include",
    };
}

function requireHttpUrl(value: string, label: string) {
    const normalized = value.trim();
    let parsed: URL;
    try {
        parsed = new URL(normalized);
    } catch {
        throw new Error(`${label} 無效，請填寫完整地址，例如：https://api.example.com/v1`);
    }
    if (!parsed.hostname || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        throw new Error(`${label} 無效，請填寫完整地址，例如：https://api.example.com/v1`);
    }
    return parsed.toString();
}

function encodeChannelHeaders(headers: ChannelHeader[]) {
    const bytes = new TextEncoder().encode(JSON.stringify(headers));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}
