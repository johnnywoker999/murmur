import { ART_CRITIQUE_PLUGIN_ID } from "@/lib/art-critique/contracts";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";

import { EDITOR_SHELL_PLUGIN_ID } from "./builtin/editor/editor-shell";

/**
 * 官方“應用型”外掛清單：這些外掛在管理頁按使用者自主啟停處理，而不是系統協議。
 *
 * 之前管理頁、使用者外掛頁和後端各自維護一份清單，管理頁漏掉 AI 審美分析和剪輯
 * 工作臺，導致二者被誤判為系統協議並在管理頁顯示“已停用”。這裡收斂為唯一來源。
 */
export const OFFICIAL_APPLICATION_PLUGIN_IDS = [
    RUNNINGHUB_PLUGIN_ID,
    EAGLE_PLUGIN_ID,
    PROMPT_OPTIMIZER_PLUGIN_ID,
    ART_CRITIQUE_PLUGIN_ID,
    EDITOR_SHELL_PLUGIN_ID,
] as const;

const officialApplicationIdSet = new Set<string>(OFFICIAL_APPLICATION_PLUGIN_IDS);

/** 判斷外掛是否為官方應用型外掛（使用者可在外掛頁自主啟停）。 */
export function isOfficialApplicationPluginId(pluginId: string) {
    return officialApplicationIdSet.has(pluginId);
}
