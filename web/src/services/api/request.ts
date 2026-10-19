import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

import { assertUserScope, isUserScopeAbandonedError, type CapturedUserScope } from "@/lib/user-scope-guard";

export type ApiParams = Record<string, string | string[] | number | number[] | undefined>;

export type BackendEnvelope<T> = {
    code: number;
    data: T;
    msg: string;
    reason?: string;
    details?: Record<string, unknown>;
};

/**
 * 業務錯誤的統一載體：HTTP 200 只代表傳輸完成，code/reason 才決定業務是否成功。
 * 呼叫方應依賴機器可讀欄位做分支，message 僅用於向用戶展示，避免把後端文案當協議解析。
 */

export class ApiError extends Error {
    readonly status?: number;
    readonly code?: number;
    readonly reason?: string;
    readonly details?: Record<string, unknown>;
    readonly requestId?: string;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
    readonly cause?: unknown;

    constructor(message: string, options: { status?: number; code?: number; reason?: string; details?: Record<string, unknown>; requestId?: string; retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {}) {
        super(message);
        this.name = "ApiError";
        this.status = options.status;
        this.code = options.code;
        this.reason = options.reason;
        this.details = options.details;
        this.requestId = options.requestId;
        this.retryable = options.reason === "local_credential_failed" || options.reason === "local_disk_full" ? false : options.retryable ?? isRetryableStatus(options.status ?? options.code);
        this.retryAfterMs = options.retryAfterMs;
        this.cause = options.cause;
    }
}

export function getTransportFailureKind(error: unknown): "timeout" | "network" | undefined {
    const cause = error instanceof ApiError ? error.cause : error;
    if (!axios.isAxiosError(cause) || cause.response || axios.isCancel(cause)) return undefined;
    return cause.code === "ECONNABORTED" || cause.code === "ETIMEDOUT" ? "timeout" : "network";
}

// 所有後端 JSON 請求共用同一例項，避免認證、Base URL 和錯誤語義在模組間漂移。
export let apiBaseURL = import.meta.env.VITE_CANVAS_BACKEND_URL || "/api";
// 本地預覽和桌面模式都必須在後端暫不可用時儘快降級到本地工作區；
// 沒有超時會讓啟動水合一直停留在 loading，Playwright 和使用者都看不到頁面。
export const apiClient = axios.create({ baseURL: apiBaseURL, withCredentials: true, timeout: 4_000 });

export function configureApiRuntime(baseURL: string, launchToken: string, uiBootstrapToken?: string) {
    apiBaseURL = baseURL;
    apiClient.defaults.baseURL = baseURL;
    apiClient.defaults.headers.common["X-Desktop-Token"] = launchToken;
    if (uiBootstrapToken) apiClient.defaults.headers.common["X-Beeftv-UI-Bootstrap"] = uiBootstrapToken;
    else delete apiClient.defaults.headers.common["X-Beeftv-UI-Bootstrap"];
}

/**
 * 解包後端業務信封的唯一邊界。這裡把非零業務 code 轉成 ApiError，保留 reason、重試語義和 Retry-After；
 * 取消請求必須繼續丟擲 AbortError，不能被包裝成普通失敗，否則頁面切換會被誤報為錯誤。
 */

export async function request<T>(promise: Promise<{ data: BackendEnvelope<T>; status?: number; headers?: unknown }>) {
    try {
        const response = await promise;
        if (response.data.code !== 0) {
            throw new ApiError(response.data.msg || "請求失敗", {
                status: response.status,
                code: response.data.code,
                reason: response.data.reason,
                details: response.data.details,
                requestId: responseRequestId(response.headers),
                retryable: isRetryableStatus(response.status) || isRetryableStatus(response.data.code),
                retryAfterMs: retryAfterMilliseconds(response.headers),
            });
        }
        return response.data.data;
    } catch (error) {
        throw unwrapTransportError(error);
    }
}

function unwrapTransportError(error: unknown): never {
    if (error instanceof ApiError || (error instanceof DOMException && error.name === "AbortError") || isUserScopeAbandonedError(error)) {
        throw error;
    }
    if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === axios.AxiosError.ERR_CANCELED)) {
        throw new DOMException("請求已取消", "AbortError");
    }
    if (axios.isAxiosError<BackendEnvelope<unknown>>(error)) {
        const status = error.response?.status;
        const code = error.response?.data?.code;
        throw new ApiError(error.response?.data?.msg || transportFailureMessage(status, error.message), {
            status,
            code,
            reason: error.response?.data?.reason,
            details: error.response?.data?.details,
            requestId: responseRequestId(error.response?.headers),
            retryable: isRetryableStatus(status) || isRetryableStatus(code),
            retryAfterMs: retryAfterMilliseconds(error.response?.headers),
            cause: error,
        });
    }
    throw error;
}

function responseRequestId(headers: unknown): string | undefined {
    if (!headers || typeof headers !== "object") return undefined;
    const bag = headers as { get?: (name: string) => unknown; [key: string]: unknown };
    const value = bag.get?.("x-request-id") ?? bag["x-request-id"] ?? bag["X-Request-ID"];
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(value) ? value : undefined;
}

function transportFailureMessage(status?: number, fallback?: string) {
    switch (status) {
        case 502:
            return "後端服務暫時不可用，請稍後重試";
        case 503:
            return "服務暫時不可用，請稍後重試";
        case 504:
            return "服務響應超時，請稍後重試";
        default:
            return fallback || "請求失敗";
    }
}

function isRetryableStatus(status?: number) {
    return status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

function retryAfterMilliseconds(headers: unknown) {
    if (!headers || typeof headers !== "object") return undefined;
    const headerBag = headers as { get?: (name: string) => unknown; [key: string]: unknown };
    const rawValue = headerBag.get?.("retry-after") ?? headerBag["retry-after"] ?? headerBag["Retry-After"];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    if (!text) return undefined;
    const seconds = Number(text);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const retryAt = Date.parse(text);
    if (!Number.isFinite(retryAt)) return undefined;
    return Math.max(0, retryAt - Date.now());
}

export type HttpRequestConfig = Omit<AxiosRequestConfig, "method" | "url" | "data" | "baseURL"> & {
    expectedScope?: CapturedUserScope;
};

function assertExpectedHttpScope(config?: { expectedScope?: CapturedUserScope }) {
    if (config?.expectedScope) assertUserScope(config.expectedScope);
}

apiClient.interceptors.request.use((config) => {
    assertExpectedHttpScope(config as HttpRequestConfig);
    return config;
});

async function send<T>(method: string, url: string, data?: unknown, config?: HttpRequestConfig) {
    assertExpectedHttpScope(config);
    const result = await request<T>(apiClient.request<BackendEnvelope<T>>({ method, url, data, ...config }));
    assertExpectedHttpScope(config);
    return result;
}

/**
 * 業務 JSON 的唯一呼叫入口。模組不要再寫 `request(apiClient.get(...))`，也不要再 `axios.create`。
 * 攔截器仍掛在 `apiClient` 上；流式 fetch、媒體 blob 和渠道中轉走各自邊界。
 */
export const http = {
    get: <T>(url: string, config?: HttpRequestConfig) => send<T>("get", url, undefined, config),
    post: <T>(url: string, data?: unknown, config?: HttpRequestConfig) => send<T>("post", url, data, config),
    put: <T>(url: string, data?: unknown, config?: HttpRequestConfig) => send<T>("put", url, data, config),
    patch: <T>(url: string, data?: unknown, config?: HttpRequestConfig) => send<T>("patch", url, data, config),
    delete: <T>(url: string, config?: HttpRequestConfig) => send<T>("delete", url, undefined, config),
    async raw<T>(config: AxiosRequestConfig & { expectedScope?: CapturedUserScope }): Promise<AxiosResponse<T>> {
        try {
            assertExpectedHttpScope(config);
            const result = await apiClient.request<T>(config);
            assertExpectedHttpScope(config);
            return result;
        } catch (error) {
            throw unwrapTransportError(error);
        }
    },
};

export function compactApiParams(params: ApiParams) {
    return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && (!Array.isArray(value) || value.length > 0))) as ApiParams;
}

export function serializeApiParams(params?: ApiParams) {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) value.forEach((item) => queryParams.append(key, String(item)));
        else queryParams.set(key, String(value));
    }
    return queryParams;
}
