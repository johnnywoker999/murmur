// 編輯器命令協議（ADR-0002）：時間線唯一修改入口。
// 命令 = 可序列化 { op, payload }，handler 為純函式（禁止依賴元件例項），
// 未知 op 或非法 payload 一律拋錯（fail-closed），保證可回放、可撤銷、可黃金檔案測試。
// 外掛可經宿主 API register 自定義 op，與內建命令共用同一登入檔與校驗紀律。

import type { SrtEntry, TimelineClip, TimelineProject, TimelineTrack, TimelineTrackKind } from "@/types/timeline";

export type EditCommand = { op: string; payload: unknown };
export type CommandHandler = (state: TimelineProject, payload: unknown) => TimelineProject;

export type EditorCommandRegistry = {
    /** 註冊命令 handler（宿主與外掛共用；同名 op 覆蓋，外掛的註冊順序即優先順序）。 */
    register: (op: string, handler: CommandHandler) => void;
    /** 應用命令：未知 op 拋錯（fail-closed）；返回新狀態（不可變更新）。 */
    apply: (state: TimelineProject, cmd: EditCommand) => TimelineProject;
    knownOps: () => string[];
};

// ---------------------------------------------------------------------------
// 內建命令的 payload 型別；登入檔、AI 命令契約和黃金測試必須共享同一組 op。
// ---------------------------------------------------------------------------

export type AddClipPayload = { clip: TimelineClip };
export type MoveClipPayload = { id: string; startMs: number; trackId?: string };
export type TrimClipPayload = { id: string; startMs?: number; durationMs?: number; sourceStartMs?: number };
export type SplitClipPayload = { id: string; splitAtMs: number };
export type RemoveClipPayload = { id: string };
export type SetClipPropertyPayload = {
    id: string;
    patch: Partial<Pick<TimelineClip, "title" | "text" | "volume" | "fadeInMs" | "fadeOutMs" | "subtitleEntryIndex">>;
};
export type AddSubtitlePayload = { clip: TimelineClip };
export type RemoveSubtitlePayload = { id: string };
/** 從節點權威 subtitleEntries 重建時間線條字幕 clip（§3.1 快照契約：單向顯式同步，替換過期快照）。 */
/** 新增空軌道（addTrack）。id/order/label 由 handler 按當前狀態確定，保證 undo/redo 重放確定性。 */
export type AddTrackPayload = { kind: TimelineTrackKind };

/** 移除整條軌道及其全部片段（removeTrack）。守衛：同 kind 至少保留一條軌道（防唯一字幕/影片軌被刪光後編輯失錨）。 */
export type RemoveTrackPayload = { trackId: string };

/** 軌道開關（setTrackFlag）：可見性 / 靜音。flag 白名單校驗，fail-closed。 */
export type SetTrackFlagPayload = { trackId: string; flag: "visible" | "muted"; value: boolean };
export type RebuildSubtitleClipsPayload = {
    /** 畫布節點 id（subtitleEntries 權威源）。 */
    nodeId: string;
    /** 權威字幕條目快照（按此重建，text 進入 clip 快照）。 */
    entries: SrtEntry[];
    /** 目標字幕軌道 id；預設取第一個字幕軌道。 */
    trackId?: string;
};

export const EDITOR_COMMAND_OPS = [
    "addClip",
    "moveClip",
    "trimClip",
    "splitClip",
    "removeClip",
    "setClipProperty",
    "addSubtitle",
    "removeSubtitle",
    "rebuildSubtitleClips",
    "addTrack",
    "removeTrack",
    "setTrackFlag",
] as const;

// ---------------------------------------------------------------------------
// 校驗輔助
// ---------------------------------------------------------------------------

function fail(op: string, message: string): never {
    throw new Error(`edit command "${op}" rejected: ${message}`);
}

function assertClipShape(op: string, clip: unknown): asserts clip is TimelineClip {
    if (typeof clip !== "object" || clip === null) fail(op, "clip must be an object");
    const c = clip as TimelineClip;
    if (typeof c.id !== "string" || c.id.length === 0) fail(op, "clip.id must be a non-empty string");
    if (!["video", "audio", "subtitle", "text", "image"].includes(c.kind)) fail(op, `clip.kind must be a valid clip kind, got "${c.kind}"`);
    if (typeof c.trackId !== "string" || c.trackId.length === 0) fail(op, "clip.trackId must be a non-empty string");
    if (typeof c.nodeId !== "string" || c.nodeId.length === 0) fail(op, "clip.nodeId must be a non-empty string");
    if (typeof c.startMs !== "number" || !Number.isFinite(c.startMs) || c.startMs < 0) fail(op, "clip.startMs must be a non-negative finite number");
    if (typeof c.durationMs !== "number" || !Number.isFinite(c.durationMs) || c.durationMs <= 0) fail(op, "clip.durationMs must be a positive finite number");
}

function findTrackOrThrow(op: string, state: TimelineProject, trackId: string) {
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) fail(op, `track "${trackId}" does not exist`);
    return track;
}

function findClipOrThrow(op: string, state: TimelineProject, id: string): TimelineClip {
    const clip = state.clips.find((c) => c.id === id);
    if (!clip) fail(op, `clip "${id}" does not exist`);
    return clip;
}

/** 時間線總時長 = 所有片段末端最大值（與 normalizeTimelineProject 同源）。 */
function recomputeDurationMs(state: TimelineProject): number {
    return state.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
}

function withClips(state: TimelineProject, clips: TimelineClip[]): TimelineProject {
    return { ...state, clips, durationMs: recomputeDurationMs({ ...state, clips }) };
}

// ---------------------------------------------------------------------------
// 黃金命令集合 handler
// ---------------------------------------------------------------------------

function handleAddClip(state: TimelineProject, payload: unknown): TimelineProject {
    const { clip } = payload as AddClipPayload;
    assertClipShape("addClip", clip);
    if (clip.kind === "subtitle") fail("addClip", 'subtitle clips must use op "addSubtitle"');
    findTrackOrThrow("addClip", state, clip.trackId);
    return withClips(state, [...state.clips, clip]);
}

function handleMoveClip(state: TimelineProject, payload: unknown): TimelineProject {
    const { id, startMs, trackId } = payload as MoveClipPayload;
    if (typeof startMs !== "number" || !Number.isFinite(startMs) || startMs < 0) fail("moveClip", "startMs must be a non-negative finite number");
    const clip = findClipOrThrow("moveClip", state, id);
    if (trackId !== undefined) findTrackOrThrow("moveClip", state, trackId);
    const moved = { ...clip, startMs, ...(trackId !== undefined ? { trackId } : {}) };
    return withClips(state, state.clips.map((c) => (c.id === id ? moved : c)));
}

function handleTrimClip(state: TimelineProject, payload: unknown): TimelineProject {
    const { id, startMs, durationMs, sourceStartMs } = payload as TrimClipPayload;
    const clip = findClipOrThrow("trimClip", state, id);

    const nextStartMs = startMs ?? clip.startMs;
    const nextDurationMs = durationMs ?? clip.durationMs;
    const nextSourceStartMs = sourceStartMs ?? clip.sourceStartMs ?? 0;

    if (!Number.isFinite(nextStartMs) || nextStartMs < 0) fail("trimClip", "startMs must be a non-negative finite number");
    if (!Number.isFinite(nextDurationMs) || nextDurationMs <= 0) fail("trimClip", "durationMs must be a positive finite number");
    if (!Number.isFinite(nextSourceStartMs) || nextSourceStartMs < 0) fail("trimClip", "sourceStartMs must be a non-negative finite number");

    // 源時長已知時限制裁剪上限（UI 與命令層同一條規則，防止匯出越界）。
    const sourceDuration = clip.sourceDurationMs ?? 0;
    if (sourceDuration > 0) {
        if (nextDurationMs > sourceDuration) fail("trimClip", `durationMs ${nextDurationMs} exceeds sourceDurationMs ${sourceDuration}`);
        if (nextSourceStartMs + nextDurationMs > sourceDuration) fail("trimClip", "sourceStartMs + durationMs exceeds sourceDurationMs");
    }

    const trimmed: TimelineClip = {
        ...clip,
        startMs: nextStartMs,
        durationMs: nextDurationMs,
        sourceStartMs: nextSourceStartMs,
    };
    return withClips(state, state.clips.map((c) => (c.id === id ? trimmed : c)));
}

function handleSplitClip(state: TimelineProject, payload: unknown): TimelineProject {
    const { id, splitAtMs } = payload as SplitClipPayload;
    if (typeof splitAtMs !== "number" || !Number.isFinite(splitAtMs)) fail("splitClip", "splitAtMs must be a finite number");
    const clip = findClipOrThrow("splitClip", state, id);

    const clipEnd = clip.startMs + clip.durationMs;
    if (splitAtMs <= clip.startMs || splitAtMs >= clipEnd) {
        fail("splitClip", `splitAtMs ${splitAtMs} must be strictly inside clip [${clip.startMs}, ${clipEnd})`);
    }

    const leftDuration = splitAtMs - clip.startMs;
    const rightDuration = clipEnd - splitAtMs;
    const left: TimelineClip = { ...clip, durationMs: leftDuration };
    const right: TimelineClip = {
        ...clip,
        id: `${clip.id}:split:${splitAtMs}`,
        startMs: splitAtMs,
        durationMs: rightDuration,
        sourceStartMs: (clip.sourceStartMs ?? 0) + leftDuration,
    };

    const index = state.clips.findIndex((c) => c.id === id);
    const clips = [...state.clips.slice(0, index), left, right, ...state.clips.slice(index + 1)];
    return withClips(state, clips);
}

function handleRemoveClip(state: TimelineProject, payload: unknown): TimelineProject {
    const { id } = payload as RemoveClipPayload;
    if (typeof id !== "string" || id.length === 0) fail("removeClip", "id must be a non-empty string");
    findClipOrThrow("removeClip", state, id);
    return withClips(state, state.clips.filter((c) => c.id !== id));
}

/** setClipProperty 允許修改的屬性白名單；結構欄位（id/kind/nodeId/trackId/startMs/durationMs/...）由專門命令負責。 */
const CLIP_PROPERTY_WHITELIST = new Set(["title", "text", "volume", "fadeInMs", "fadeOutMs", "subtitleEntryIndex"]);

function handleSetClipProperty(state: TimelineProject, payload: unknown): TimelineProject {
    const { id, patch } = payload as SetClipPropertyPayload;
    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) fail("setClipProperty", "patch must be an object");
    const keys = Object.keys(patch);
    if (keys.length === 0) fail("setClipProperty", "patch must not be empty");
    for (const key of keys) {
        if (!CLIP_PROPERTY_WHITELIST.has(key)) fail("setClipProperty", `property "${key}" is not editable via setClipProperty (use the dedicated op)`);
    }
    findClipOrThrow("setClipProperty", state, id);

    const updated = { ...findClipOrThrow("setClipProperty", state, id), ...patch };
    return withClips(state, state.clips.map((c) => (c.id === id ? updated : c)));
}

function handleAddSubtitle(state: TimelineProject, payload: unknown): TimelineProject {
    const { clip } = payload as AddSubtitlePayload;
    assertClipShape("addSubtitle", clip);
    if (clip.kind !== "subtitle") fail("addSubtitle", `clip.kind must be "subtitle", got "${clip.kind}"`);
    findTrackOrThrow("addSubtitle", state, clip.trackId);
    return withClips(state, [...state.clips, clip]);
}

function handleRemoveSubtitle(state: TimelineProject, payload: unknown): TimelineProject {
    const { id } = payload as RemoveSubtitlePayload;
    if (typeof id !== "string" || id.length === 0) fail("removeSubtitle", "id must be a non-empty string");
    const clip = findClipOrThrow("removeSubtitle", state, id);
    if (clip.kind !== "subtitle") fail("removeSubtitle", `clip "${id}" is not a subtitle clip`);
    return withClips(state, state.clips.filter((c) => c.id !== id));
}

/** 軌道種類的基礎標籤；新增軌道 label = 基礎標籤 + 同種類現有軌道數 + 1。 */
export const TRACK_KIND_BASE_LABELS: Record<TimelineTrackKind, string> = {
    video: "影片",
    image: "圖片",
    text: "文本",
    audio: "音訊",
    subtitle: "字幕",
};

function handleAddTrack(state: TimelineProject, payload: unknown): TimelineProject {
    const { kind } = payload as AddTrackPayload;
    if (!(kind in TRACK_KIND_BASE_LABELS)) {
        fail("addTrack", `track kind must be one of "video" | "image" | "text" | "audio" | "subtitle", got "${String(kind)}"`);
    }
    // id/order/label 都由當前狀態確定：同一撤銷/重放路徑永遠得到同一結果（確定性）。
    let index = state.tracks.filter((t) => t.kind === kind).length + 1;
    let id = `${kind}-${index}`;
    while (state.tracks.some((t) => t.id === id)) {
        index += 1;
        id = `${kind}-${index}`;
    }
    const order = state.tracks.reduce((max, t) => Math.max(max, t.order), -1) + 1;
    const track: TimelineTrack = { id, kind, label: `${TRACK_KIND_BASE_LABELS[kind]} ${index}`, order };
    return { ...state, tracks: [...state.tracks, track] };
}

function handleRemoveTrack(state: TimelineProject, payload: unknown): TimelineProject {
    const { trackId } = payload as RemoveTrackPayload;
    if (typeof trackId !== "string" || trackId.length === 0) fail("removeTrack", "trackId must be a non-empty string");
    const track = findTrackOrThrow("removeTrack", state, trackId);
    // 每類軌道至少保留一條：刪除最後一條會讓吸附目標、字幕重建等編輯操作失錨。
    const lastOfKind = state.tracks.filter((t) => t.kind === track.kind).length <= 1;
    if (lastOfKind) fail("removeTrack", `cannot remove the last "${track.kind}" track`);
    // 軌道上片段隨軌道一併移除（moveClip/trimClip/splitClip 均已按 trackId 歸屬，無懸掛引用）。
    return {
        ...state,
        tracks: state.tracks.filter((t) => t.id !== trackId),
        clips: state.clips.filter((c) => c.trackId !== trackId),
    };
}

function handleSetTrackFlag(state: TimelineProject, payload: unknown): TimelineProject {
    const { trackId, flag, value } = payload as SetTrackFlagPayload;
    if (typeof trackId !== "string" || trackId.length === 0) fail("setTrackFlag", "trackId must be a non-empty string");
    if (flag !== "visible" && flag !== "muted") fail("setTrackFlag", "flag must be \"visible\" or \"muted\"");
    if (typeof value !== "boolean") fail("setTrackFlag", "value must be a boolean");
    findTrackOrThrow("setTrackFlag", state, trackId);
    return {
        ...state,
        tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, [flag]: value } : t)),
    };
}

/** 校驗 SrtEntry 陣列：形狀、區間、重複 index（fail-closed）。 */
function assertSubtitleEntries(op: string, entries: unknown): asserts entries is SrtEntry[] {
    if (!Array.isArray(entries)) fail(op, "entries must be an array of SrtEntry");
    const seen = new Set<number>();
    for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) fail(op, "entries must contain SrtEntry objects");
        const e = entry as SrtEntry;
        if (!Number.isInteger(e.index) || e.index < 0) fail(op, `entry index must be a non-negative integer, got ${e.index}`);
        if (seen.has(e.index)) fail(op, `duplicate entry index ${e.index}`);
        seen.add(e.index);
        if (!Number.isFinite(e.startMs) || e.startMs < 0) fail(op, `entry ${e.index} startMs must be a non-negative finite number`);
        if (!Number.isFinite(e.endMs) || e.endMs <= e.startMs) fail(op, `entry ${e.index} endMs must be greater than startMs`);
        if (typeof e.text !== "string") fail(op, `entry ${e.index} text must be a string`);
    }
}

/**
 * 從節點權威 subtitleEntries 重建字幕 clip（§3.1 快照契約：單向顯式同步）。
 * 移除 nodeId 名下全部過期字幕快照，按 entries 重建；id 確定（nodeId:subtitle:index），
 * 重跑即原地替換，不產生漂移。預設軌道取第一個字幕軌。
 */
function handleRebuildSubtitleClips(state: TimelineProject, payload: unknown): TimelineProject {
    const { nodeId, entries, trackId } = payload as RebuildSubtitleClipsPayload;
    if (typeof nodeId !== "string" || nodeId.length === 0) fail("rebuildSubtitleClips", "nodeId must be a non-empty string");
    assertSubtitleEntries("rebuildSubtitleClips", entries);

    const explicitTrack = trackId !== undefined ? findTrackOrThrow("rebuildSubtitleClips", state, trackId) : null;
    if (explicitTrack && explicitTrack.kind !== "subtitle") fail("rebuildSubtitleClips", `track "${trackId}" is not a subtitle track`);
    const subtitleTrack = explicitTrack ?? state.tracks.find((t) => t.kind === "subtitle");
    if (!subtitleTrack) fail("rebuildSubtitleClips", "no subtitle track available");

    const rebuilt: TimelineClip[] = entries.map((entry) => ({
        id: `${nodeId}:subtitle:${entry.index}`,
        kind: "subtitle" as const,
        nodeId,
        trackId: subtitleTrack.id,
        startMs: entry.startMs,
        durationMs: entry.endMs - entry.startMs,
        subtitleEntryIndex: entry.index,
        text: entry.text,
    }));
    const clips = [...state.clips.filter((c) => !(c.kind === "subtitle" && c.nodeId === nodeId)), ...rebuilt];
    return withClips(state, clips);
}

// ---------------------------------------------------------------------------
// 登入檔
// ---------------------------------------------------------------------------

const BUILTIN_HANDLERS: ReadonlyArray<readonly [string, CommandHandler]> = [
    ["addClip", handleAddClip],
    ["moveClip", handleMoveClip],
    ["trimClip", handleTrimClip],
    ["splitClip", handleSplitClip],
    ["removeClip", handleRemoveClip],
    ["setClipProperty", handleSetClipProperty],
    ["addSubtitle", handleAddSubtitle],
    ["removeSubtitle", handleRemoveSubtitle],
    ["addTrack", handleAddTrack],
    ["removeTrack", handleRemoveTrack],
    ["setTrackFlag", handleSetTrackFlag],
    ["rebuildSubtitleClips", handleRebuildSubtitleClips],
];

/** 建立隔離的命令登入檔（測試/黃金檔案比對用獨立例項）。 */
export function createEditorCommandRegistry(): EditorCommandRegistry {
    const handlers = new Map<string, CommandHandler>(BUILTIN_HANDLERS);
    return {
        register: (op, handler) => {
            if (typeof op !== "string" || op.length === 0) throw new Error("edit command op must be a non-empty string");
            handlers.set(op, handler);
        },
        apply: (state, cmd) => {
            if (typeof cmd !== "object" || cmd === null || typeof cmd.op !== "string") {
                throw new Error("edit command must be { op, payload }");
            }
            const handler = handlers.get(cmd.op);
            if (!handler) throw new Error(`unknown edit command op "${cmd.op}"`);
            return handler(state, cmd.payload);
        },
        knownOps: () => [...handlers.keys()],
    };
}

// 宿主核心協議單例：編輯器 store、外掛經宿主 API 均註冊/消費此例項。
let sharedRegistry: EditorCommandRegistry | null = null;
export function getEditorCommandRegistry(): EditorCommandRegistry {
    sharedRegistry ??= createEditorCommandRegistry();
    return sharedRegistry;
}
