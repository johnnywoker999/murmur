import { MEDIA_CONVERSION_NODE_TYPE } from "@/lib/media-conversion/contracts";

import { registerPlugin } from "../plugin-registry";
import { PLUGIN_API_VERSION, type PluginManifest, type RegisteredPlugin } from "../plugin-types";

export const MEDIA_CONVERSION_PLUGIN_ID = "media-conversion";

const manifest: PluginManifest = {
    apiVersion: PLUGIN_API_VERSION,
    id: MEDIA_CONVERSION_PLUGIN_ID,
    name: "媒體轉換節點",
    version: "0.1.0",
    publishedAt: "2026-09-08",
    updatedAt: "2026-09-08",
    description: "在畫布中提供圖片和影片首幀轉換節點，支援灰度、Canny 邊緣、AI 線稿、本地 Depth Anything V2 深度圖和 OpenPose 姿態骨架。",
    documentation:
        "# 媒體轉換節點\n\n連線圖片到轉換節點後，可以在節點內選擇灰度圖、Canny 邊緣、AI 線稿、深度圖或姿態骨架；連線影片時，灰度圖和 Canny 邊緣會先提取影片首幀再處理。AI 線稿使用本機 ControlNet Aux 預處理模型，深度圖使用本機已安裝的 Depth Anything V2 Small 模型，姿態骨架使用 ControlNet Aux 的 OpenPose 人體預處理模型執行；這些操作都不會載入 Stable Diffusion 重繪管線。姿態轉換隻繪製人體骨架，未檢測到人物時會跳過並提示。透明摳圖和影片高階逐幀模型仍在驗證，會明確提示不可用。\n\n該外掛只讀取當前節點的媒體輸入，並把結果儲存回當前畫布節點的本地素材儲存。",
    author: "MURMUR AI 團隊",
    surfaces: ["node"],
    permissions: ["canvas.read", "canvas.write", "media.read"],
    trusted: true,
    runtime: { web: "declarative" },
    contributes: {
        transforms: [
            {
                id: MEDIA_CONVERSION_NODE_TYPE,
                input: "media",
                output: "media",
                runtime: "declarative",
            },
        ],
    },
};

export const mediaConversionPlugin: RegisteredPlugin = { manifest };

registerPlugin(mediaConversionPlugin);
