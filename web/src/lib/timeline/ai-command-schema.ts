// AI 編輯命令的邊界層：同一份登入檔同時約束模型輸出和宿主執行，避擴音示詞與真實能力列表分叉。
// 本檔案只負責 JSON 結構解析、批次預檢和提示詞契約生成；命令的引數合法性仍由編輯命令登入檔統一判定。
// 預檢使用與正式執行相同的純函式登入檔，保證“模型看見的能力”和“宿主實際允許的能力”一致。

import { getEditorCommandRegistry, type EditCommand } from "@/lib/timeline/editor-commands";
import type { TimelineProject } from "@/types/timeline";

/** LLM 輸出 JSON 結構：reasoning 可選，commands 至少一條。 */
export type AiCommandPlan = {
    reasoning?: string;
    commands: EditCommand[];
};

export type AiCommandBatchVerdict =
    | { ok: true }
    | { ok: false; index: number; op: string; error: string };

export class AiCommandPlanError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AiCommandPlanError";
    }
}

/** 從 LLM 回覆中提取首個 JSON 物件（容忍 markdown fence / 前字尾雜訊）。 */
function extractFirstJsonObject(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    if (start < 0) throw new AiCommandPlanError("輸出中未找到 JSON 物件（需要 { commands: [...] }）");
    // 從首個 { 起逐字元數括號，找配對的收尾 }（字串內括號不計）。
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i += 1) {
        const ch = candidate[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
        } else if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) return candidate.slice(start, i + 1);
        }
    }
    throw new AiCommandPlanError("JSON 物件未閉合（缺少收尾 }）");
}

function assertPlanShape(raw: unknown): asserts raw is AiCommandPlan {
    if (typeof raw !== "object" || raw === null) throw new AiCommandPlanError("輸出必須是 JSON 物件");
    const plan = raw as Record<string, unknown>;
    if (plan.reasoning !== undefined && typeof plan.reasoning !== "string") {
        throw new AiCommandPlanError("reasoning 必須是字串");
    }
    if (!Array.isArray(plan.commands)) throw new AiCommandPlanError("缺少 commands 陣列");
    if (plan.commands.length > AI_EDITING_MAX_COMMANDS) {
        throw new AiCommandPlanError(`commands 超過 ${AI_EDITING_MAX_COMMANDS} 條上限`);
    }
    // commands 為空陣列 = 只讀問答 / 無可用命令，合法終態
    plan.commands.forEach((cmd, i) => {
        if (typeof cmd !== "object" || cmd === null) throw new AiCommandPlanError(`commands[${i}] 必須是物件`);
        const c = cmd as Record<string, unknown>;
        if (typeof c.op !== "string" || c.op.length === 0) throw new AiCommandPlanError(`commands[${i}].op 必須是非空字串`);
        if (typeof c.payload !== "object" || c.payload === null || Array.isArray(c.payload)) {
            throw new AiCommandPlanError(`commands[${i}].op=${c.op} 缺少物件 payload`);
        }
    });
}

/**
 * 解析模型文本為 AiCommandPlan；結構非法時拋 AiCommandPlanError，呼叫方可將明確原因展示給使用者或回傳模型修正。
 * commands 為空陣列表示只讀問答或當前能力無法完成，呼叫方不應把它當成“執行成功的空修改”。
 */
export function parseAiCommandPlan(text: string): AiCommandPlan {
    let raw: unknown;
    try {
        raw = JSON.parse(extractFirstJsonObject(text));
    } catch (error) {
        if (error instanceof AiCommandPlanError) throw error;
        throw new AiCommandPlanError(`JSON 解析失敗：${(error as Error).message}`);
    }
    assertPlanShape(raw);
    return raw;
}

/**
 * 批級預檢：把整批命令按序 dry-run 到當前時間線（immutable 純函式，無副作用）。
 * 任何一條觸發登入檔的拒絕規則（未知 op、非法 payload 或引用不存在）即整批拒絕，
 * 返回首個失敗命令的位置和原因；正式執行不得繞過這一步或只提交部分命令。
 */
export function validateAiCommandBatch(project: TimelineProject, plan: AiCommandPlan): AiCommandBatchVerdict {
    const registry = getEditorCommandRegistry();
    let state = project;
    for (let i = 0; i < plan.commands.length; i += 1) {
        const cmd = plan.commands[i];
        try {
            state = registry.apply(state, cmd);
        } catch (error) {
            return { ok: false, index: i, op: cmd.op, error: (error as Error).message };
        }
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// 模型提示詞契約：schema 同時用於宿主校驗與模型輸出約束，具體互動決策見 ADR-0007。
// ---------------------------------------------------------------------------

/** AI 命令 schema 版本；提示詞契約或解析規則變化時遞增，用於 golden 測試和快取失效對齊。 */
export const AI_COMMAND_SCHEMA_VERSION = 1;

/** 單次 AI 編輯最多允許的命令條數，防止一次模型輸出造成不可控的大範圍變更。 */
export const AI_EDITING_MAX_COMMANDS = 8;

/** 12 個黃金 op 的 LLM 可讀 payload 契約；op 集合與登入檔黃金同步（見測試）。 */
export const AI_EDITING_OP_CATALOG: ReadonlyArray<{
    op: string;
    desc: string;
    payload: string;
}> = [
    {
        op: "addClip",
        desc: "新增媒體/文本片段到已存在軌道",
        payload: "{ clip: { id(新唯一), kind: video|audio|image|text, trackId(必須存在), nodeId(源素材), startMs≥0, durationMs>0, title?, volume?, fadeInMs?, fadeOutMs? } }",
    },
    {
        op: "moveClip",
        desc: "移動片段（時間點/跨軌）",
        payload: "{ id, startMs≥0, trackId?(可選, 必須存在) }",
    },
    {
        op: "trimClip",
        desc: "裁剪片段（時間線位置/時長/源內起點）",
        payload: "{ id, startMs?(≥0), durationMs?(>0 且≤sourceDurationMs), sourceStartMs?(≥0, 與 durationMs 之和≤sourceDurationMs) }",
    },
    {
        op: "splitClip",
        desc: "在片段內部切一刀成兩段",
        payload: "{ id, splitAtMs(嚴格大於 startMs 且小於 startMs+durationMs) }",
    },
    {
        op: "removeClip",
        desc: "刪除片段",
        payload: "{ id }",
    },
    {
        op: "setClipProperty",
        desc: "修改片段屬性（白名單）",
        payload: "{ id, patch: { title? | text? | volume? | fadeInMs? | fadeOutMs? | subtitleEntryIndex? }（至少一項） }",
    },
    {
        op: "addSubtitle",
        desc: "新增字幕片段",
        payload: "{ clip: { kind: subtitle, trackId(字幕軌), id/nodeId/startMs/durationMs/text } }",
    },
    {
        op: "removeSubtitle",
        desc: "刪除字幕片段",
        payload: "{ id }",
    },
    {
        op: "rebuildSubtitleClips",
        desc: "按節點字幕條目重建字幕片段",
        payload: "{ nodeId, entries: [{ index≥0(唯一), startMs≥0, endMs>startMs, text }], trackId?(字幕軌) }",
    },
    {
        op: "addTrack",
        desc: "新增軌道（id/label 由系統生成，勿傳）",
        payload: "{ kind: video|image|text|audio|subtitle }",
    },
    {
        op: "removeTrack",
        desc: "刪除整條軌道及片段（每種軌道至少保留一條）",
        payload: "{ trackId }",
    },
    {
        op: "setTrackFlag",
        desc: "軌道開關",
        payload: "{ trackId, flag: visible|muted, value: boolean }",
    },
];

/** LLM 輸出結構說明（追加到系統提示詞，約束其為純 JSON）。 */
export const AI_EDITING_OUTPUT_FORMAT = `輸出要求：
- 只輸出一個 JSON 物件，不要任何解釋文字或 markdown。
- 結構：{ "reasoning": "一句話說明意圖", "commands": [ { "op": "命令名", "payload": { ... } } ] }
- commands：能執行時 1-8 條；使用者只是提問或無法用現有命令完成時為空陣列 []，此時 reasoning 直接回答使用者。
- payload 欄位嚴格按命令契約；時間一律毫秒；文本用簡體中文。
- 所有 id（clip/track/nodeId）必須來自上面時間線摘要，禁止編造。`;

/** 示例（示意完整 JSON 輸出，加入 system prompt）。 */
const AI_EDITING_OUTPUT_EXAMPLE = `示例：
{ "reasoning": "把第一個影片片段移到第 5 秒", "commands": [ { "op": "moveClip", "payload": { "id": "clip-a", "startMs": 5000 } } ] }`;

/** 組裝 AI 編輯系統提示詞：時間線摘要、可用 op 契約和輸出約束必須來自同一份登入檔。 */
export function buildAiEditingSystemPrompt(timelineSummary: string): string {
    const catalogLines = AI_EDITING_OP_CATALOG.map(
        (entry) => `- ${entry.op}：${entry.desc}。payload：${entry.payload}`,
    ).join("\n");
    return [
        "你是 MURMUR AI 影片剪輯工作臺的 AI 剪輯助手。根據使用者指令對時間線輸出受約束的編輯命令 JSON。",
        "時間線當前狀態：",
        timelineSummary,
        "可用命令契約（與編輯器同源，非法命令會被整批拒絕）：",
        catalogLines,
        AI_EDITING_OUTPUT_FORMAT,
        AI_EDITING_OUTPUT_EXAMPLE,
        "若使用者指令無法用現有命令完成（如要轉場、濾鏡、模板），輸出 commands: [] 並在 reasoning 說明缺什麼能力。",
    ].join("\n");
}
