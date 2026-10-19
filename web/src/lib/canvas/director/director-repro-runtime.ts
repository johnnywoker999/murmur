/**
 * 復現場景的環境快照投影。
 *
 * 只在本地開發復現頁面展示，絕不自動髮網：本模組不引用任何 API 客戶端。
 * 所有字串都限長並剝掉 URL 的 query/hash 與憑證形態片段；
 * WebGL 不可用時必須穩定降級為 { available: false }，不能拋錯。
 */

export type DirectorReproRuntime = {
    appVersion: string;
    buildCommit: string;
    browser: string;
    os: string;
    timezone: string;
    devicePixelRatio: number;
};

export type DirectorReproWebgl =
    | { available: false; reason: "unsupported" | "context-failed" }
    | {
          available: true;
          version: string;
          vendor: string;
          renderer: string;
          maxTextureSize: number;
          maxRenderbufferSize: number;
          maxViewportWidth: number;
          maxViewportHeight: number;
      };

export type DirectorReproSnapshot = {
    runtime: DirectorReproRuntime;
    webgl: DirectorReproWebgl;
};

const MAX_TEXT = 160;

/**
 * 安全文本：遮蔽憑證、整段替換 URL、壓縮空白並限長。
 * WebGL 的 UNMASKED_RENDERER 在部分驅動上會帶較長標識甚至驅動地址，必須統一收斂。
 *
 * 順序有意義：先吃掉 `bearer <token>`（token 與關鍵字之間只有空白，沒有 :=），
 * 否則後面的 key[:=]value 規則只會遮住 "bearer" 本身而把 token 留在原地。
 * URL 一律替換為固定 [URL]：域名與路徑本身就可能是憑證載體或內網拓撲資訊，
 * 只剝 query/hash 不夠。
 */
export function safeReproText(value: unknown, maxLength = MAX_TEXT): string {
    if (typeof value !== "string") return "";
    let text = value.trim();
    if (!text) return "";

    text = text.replace(/\bbearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
    text = text.replace(/(authorization|cookie|set-cookie|api[_-]?key|secret[_-]?key|password|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
    text = text.replace(/https?:\/\/\S+/gi, "[URL]");
    // 裸 query/hash 片段（不帶協議）同樣不得保留。
    text = text.replace(/[?#]\S*/g, "");
    text = text.replace(/\s+/g, " ").trim();
    return text.slice(0, maxLength);
}

function boundedNumber(value: unknown, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

function boundedInteger(value: unknown, min: number, max: number): number {
    return Math.round(boundedNumber(value, min, max));
}

export function readDirectorReproRuntime(): DirectorReproRuntime {
    const nav = typeof navigator === "undefined" ? null : navigator;
    let timezone = "";
    try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
        timezone = "";
    }

    return {
        appVersion: safeReproText(import.meta.env.VITE_APP_VERSION || "dev", 48),
        buildCommit: safeReproText(import.meta.env.VITE_BUILD_COMMIT || "unknown", 48),
        browser: safeReproText(nav?.userAgent),
        os: safeReproText(nav?.platform, 48),
        timezone: safeReproText(timezone, 64),
        devicePixelRatio: boundedNumber(typeof window === "undefined" ? 1 : window.devicePixelRatio, 0.1, 8),
    };
}

type GlLike = {
    getParameter: (name: number) => unknown;
    getExtension: (name: string) => unknown;
    VERSION: number;
    VENDOR: number;
    RENDERER: number;
    MAX_TEXTURE_SIZE: number;
    MAX_RENDERBUFFER_SIZE: number;
    MAX_VIEWPORT_DIMS: number;
};

/**
 * 從已有上下文投影安全 WebGL 資訊。注入 gl 便於測試降級分支。
 * 任何 getParameter/getExtension 拋錯都收斂為 context-failed，不外洩異常。
 */
export function projectDirectorWebgl(gl: unknown): DirectorReproWebgl {
    if (!gl || typeof gl !== "object") return { available: false, reason: "unsupported" };
    const context = gl as GlLike;
    if (typeof context.getParameter !== "function") return { available: false, reason: "unsupported" };

    try {
        // UNMASKED_* 需要擴充套件；拿不到就退回未遮蔽的 VENDOR/RENDERER，兩者都可能為空。
        let vendor = context.getParameter(context.VENDOR);
        let renderer = context.getParameter(context.RENDERER);
        try {
            const debugInfo = typeof context.getExtension === "function" ? context.getExtension("WEBGL_debug_renderer_info") : null;
            if (debugInfo && typeof debugInfo === "object") {
                const info = debugInfo as { UNMASKED_VENDOR_WEBGL?: number; UNMASKED_RENDERER_WEBGL?: number };
                if (typeof info.UNMASKED_VENDOR_WEBGL === "number") vendor = context.getParameter(info.UNMASKED_VENDOR_WEBGL) ?? vendor;
                if (typeof info.UNMASKED_RENDERER_WEBGL === "number") renderer = context.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? renderer;
            }
        } catch {
            // 擴充套件不可用時保留未遮蔽值，不視為失敗。
        }

        const viewportDims = context.getParameter(context.MAX_VIEWPORT_DIMS);
        const dims = Array.isArray(viewportDims) || viewportDims instanceof Int32Array ? Array.from(viewportDims as ArrayLike<number>) : [];

        return {
            available: true,
            version: safeReproText(context.getParameter(context.VERSION), 96),
            vendor: safeReproText(vendor, 96),
            renderer: safeReproText(renderer, 96),
            maxTextureSize: boundedInteger(context.getParameter(context.MAX_TEXTURE_SIZE), 0, 1_048_576),
            maxRenderbufferSize: boundedInteger(context.getParameter(context.MAX_RENDERBUFFER_SIZE), 0, 1_048_576),
            maxViewportWidth: boundedInteger(dims[0], 0, 1_048_576),
            maxViewportHeight: boundedInteger(dims[1], 0, 1_048_576),
        };
    } catch {
        return { available: false, reason: "context-failed" };
    }
}

/**
 * 現場探測：建立一次性上下文讀取能力，失敗穩定降級。
 * 讀取完成後 best-effort 歸還上下文：瀏覽器的 WebGL 上下文數量有限，
 * 一次性 canvas 不釋放會擠佔真實視口的額度。
 * 釋放發生在快照取好之後，且異常一律吞掉，絕不影響已讀到的結果。
 */
export function probeDirectorWebgl(): DirectorReproWebgl {
    if (typeof document === "undefined") return { available: false, reason: "unsupported" };
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (!gl) return { available: false, reason: "unsupported" };
        const snapshot = projectDirectorWebgl(gl);
        releaseProbeContext(gl);
        return snapshot;
    } catch {
        return { available: false, reason: "context-failed" };
    }
}

/** 歸還探測用上下文；擴充套件不可用或呼叫拋錯都視為無操作。匯出以便測試釋放路徑。 */
export function releaseProbeContext(gl: unknown): void {
    try {
        const context = gl as { getExtension?: (name: string) => unknown };
        if (typeof context.getExtension !== "function") return;
        const loseContext = context.getExtension("WEBGL_lose_context");
        if (!loseContext || typeof loseContext !== "object") return;
        const losable = loseContext as { loseContext?: () => void };
        if (typeof losable.loseContext === "function") losable.loseContext();
    } catch {
        // 釋放失敗不影響已取到的 snapshot。
    }
}

export function readDirectorReproSnapshot(): DirectorReproSnapshot {
    return { runtime: readDirectorReproRuntime(), webgl: probeDirectorWebgl() };
}
