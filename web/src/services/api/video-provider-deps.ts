import type { VideoResponseTools } from "./video-response";
import type { VideoTransport } from "./video-transport";

/** Provider 依賴顯式注入，避免各協議重新建立客戶端或重複解包響應。 */
export type VideoProviderDeps = {
    transport: VideoTransport;
    response: VideoResponseTools;
};
