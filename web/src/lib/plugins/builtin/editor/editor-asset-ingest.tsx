// 展示專案資產庫，按來源區分「本地上傳」與「專案素材」；點選資產 → makeClipFromAsset
// → dispatch addClip 加入時間線（新增到匹配 kind 的軌道末尾）。資產是
// "僅時間線作用域"直連媒體（nodeId=asset:<id>）。匯入鏈路：uploadResourceFile →
// linkProjectAsset（後端按資源後設資料合成資產記錄）→ refreshAssets。

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Boxes, Check, ChevronDown, ChevronRight, Clapperboard, Film, FolderOpen, HardDrive, Image as ImageIcon, Loader2, Music2, Plus, X } from "lucide-react";

import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { defaultAssetCategoryForKind } from "@/lib/asset-category";
import { probeMediaDurationMs } from "@/lib/media-metadata";
import { makeClipFromAsset } from "@/lib/timeline/asset-ingest";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_SUBTITLE_TRACK_ID, DEFAULT_VIDEO_TRACK_ID } from "@/lib/timeline/timeline-tracks";
import { assertUserScope, captureUserScope, isUserScopeAbandonedError } from "@/lib/user-scope-guard";
import { getActiveUserScopeEpoch, subscribeUserScope } from "@/lib/user-scope";
import { linkProjectAsset } from "@/services/api/projects";
import { uploadResourceFile, type ResourceUploadMeta } from "@/services/api/resources";
import { resolveMediaUrl } from "@/services/file-storage";
import type { ProjectAsset } from "@/services/api/projects";
import type { TimelineProject } from "@/types/timeline";


const MEDIA_ACCEPT = "video/*,audio/*,image/*";
/** 庫內重複判定用的歸一鍵（檔名+媒體型別）。 */
function assetDedupeKey(title: string | undefined, mediaType: string): string {
    return `${(title || "").trim().toLowerCase()}|${mediaType}`;
}
/** 毫秒 → m:ss 時長文案。 */
function formatDurationMs(ms: number | undefined): string {
    if (!ms || ms <= 0) return "";
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|ogg|flac|aac)$/i;
const MEDIA_RE = /\.(mp4|mov|webm|mkv|m4v|avi)$/i;

/** 本地上傳標記（assetFromUploadedResource 寫入 payload.data.source）。畫布產物同步時寫入 canvas，僅作資料追溯，面板不再單列分組。 */
const SOURCE_UPLOADED = "uploaded";

/** 編輯器世代或專案已離開入口匯入；不展示給使用者，只用來中止過期寫入。 */
class EditorImportAbandonedError extends Error {
    constructor() {
        super("editor-import-abandoned");
        this.name = "EditorImportAbandonedError";
    }
}

function isAbandonedImportError(error: unknown) {
    return isUserScopeAbandonedError(error) || (error instanceof Error && error.name === "EditorImportAbandonedError");
}

type AssetFilter = "all" | "project" | "uploaded";

const FILTER_TABS: { id: AssetFilter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "project", label: "專案素材" },
    { id: "uploaded", label: "本地上傳" },
];

/** 按 MIME 與副檔名推斷媒體 kind；非媒體檔案返回 null。 */
function kindFromFile(file: File): "image" | "video" | "audio" | null {
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("image/")) return "image";
    if (IMAGE_RE.test(file.name)) return "image";
    if (AUDIO_RE.test(file.name)) return "audio";
    if (MEDIA_RE.test(file.name)) return "video";
    return null;
}

function trackIdForKind(kind: string, project: TimelineProject): string {
    const track = project.tracks.find((t) => t.kind === kind);
    if (track) return track.id;
    if (kind === "video" || kind === "image") return project.tracks.find((t) => t.kind === "video")?.id ?? DEFAULT_VIDEO_TRACK_ID;
    if (kind === "audio") return project.tracks.find((t) => t.kind === "audio")?.id ?? DEFAULT_AUDIO_TRACK_ID;
    return DEFAULT_SUBTITLE_TRACK_ID;
}

function trackEndMs(project: TimelineProject, trackId: string): number {
    return project.clips.filter((c) => c.trackId === trackId).reduce((max, c) => Math.max(max, c.startMs + c.durationMs), 0);
}

function AssetIcon({ mediaType }: { mediaType: string }) {
    const cls = "size-4";
    if (mediaType === "video") return <Film className={cls} />;
    if (mediaType === "audio") return <Music2 className={cls} />;
    if (mediaType === "image") return <ImageIcon className={cls} />;
    return <Clapperboard className={cls} />;
}

/** 列表行小縮圖：圖片媒體顯示真實畫面；影片/音訊無法在 <img> 解碼，
 *  統一渲染型別色塊+圖示佔位（不再出現破圖），影片縮圖由展開卡片提供。 */
function AssetThumb({ asset }: { asset: ProjectAsset }) {
    const isImage = asset.mediaType === "image";
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!isImage || !asset.storageKey) return;
        let alive = true;
        resolveMediaUrl(asset.storageKey)
            .then((resolved) => alive && setUrl(resolved ?? null))
            .catch(() => alive && setUrl(null));
        return () => {
            alive = false;
        };
    }, [asset.storageKey, isImage]);
    if (url) {
        return (
            <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--director-control-hover)]">
                <img src={url} alt="" className="size-full object-cover" />
            </div>
        );
    }
    const kind =
        asset.mediaType === "video"
            ? { icon: <Film className="size-4" />, tone: "text-[var(--director-accent)]", tile: "bg-[var(--director-accent)]/15" }
            : asset.mediaType === "audio"
              ? { icon: <Music2 className="size-4" />, tone: "text-[var(--director-dock-fg)]/70", tile: "bg-[var(--director-control-hover)]" }
              : { icon: <ImageIcon className="size-4" />, tone: "text-[var(--director-dock-fg)]/60", tile: "bg-[var(--director-control-hover)]" };
    return (
        <div className={`grid size-9 shrink-0 place-items-center overflow-hidden rounded-md ${kind.tile}`}>
            <span className={kind.tone}>{kind.icon}</span>
        </div>
    );
}

/** 嘗試用 <video> 抓取影片首幀作為封面 dataURL；失敗時保留媒體型別圖示。 */
function useVideoPoster(url: string | null): string | null {
    const [poster, setPoster] = useState<string | null>(null);
    useEffect(() => {
        if (!url) {
            setPoster(null);
            return;
        }
        let alive = true;
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = url;
        const seekToHead = () => {
            if (!alive || video.readyState < 1) return;
            try {
                video.currentTime = Math.min(0.05, Number.isFinite(video.duration) ? video.duration : 0.05);
            } catch {
                /* 忽略跨域/編解碼異常 */
            }
        };
        const grabFrame = () => {
            if (!alive || video.readyState < 2 || video.videoWidth === 0) return;
            try {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                if (dataUrl.length > 100) setPoster(dataUrl);
            } catch {
                /* canvas 跨域汙染等：放棄自動封面 */
            }
        };
        video.addEventListener("loadeddata", seekToHead);
        video.addEventListener("seeked", grabFrame);
        return () => {
            alive = false;
            video.removeAttribute("src");
            video.load();
        };
    }, [url]);
    return poster;
}

/** 展開卡片預覽：圖片直接展示；影片給出自動首幀封面 + 原生播放器；音訊為說明。 */
function MediaPreview({ asset }: { asset: ProjectAsset }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!asset.storageKey) return;
        let alive = true;
        resolveMediaUrl(asset.storageKey)
            .then((resolved) => alive && setUrl(resolved ?? null))
            .catch(() => alive && setUrl(null));
        return () => {
            alive = false;
        };
    }, [asset.storageKey]);
    const poster = useVideoPoster(asset.mediaType === "video" ? url : null);
    if (asset.mediaType === "image") {
        return url ? <img src={url} alt="" className="h-28 w-full rounded-md object-cover" /> : <div className="h-28 animate-pulse rounded-md bg-[var(--director-control-hover)]" />;
    }
    if (asset.mediaType === "video") {
        return (
            <div className="relative overflow-hidden rounded-md bg-black">
                <video
                    src={url ?? undefined}
                    poster={poster ?? undefined}
                    preload="metadata"
                    controls
                    playsInline
                    className="aspect-video w-full"
                />
                {!url ? <div className="aspect-video w-full animate-pulse bg-[var(--director-control-hover)]" /> : null}
            </div>
        );
    }
    return (
        <div className="flex h-16 items-center justify-center gap-2 rounded-md bg-[var(--director-control-hover)] text-[var(--director-dock-fg)]/60">
            <Music2 className="size-4" />
            <span className="text-[10px]">音訊素材 · 點選下方按鈕加入時間線</span>
        </div>
    );
}
/** 展開詳情浮層：覆蓋在素材列表上方（列表保持原位不被擠壓、滾動位置不變），
 *  自帶頭部（標題+關閉）、可滾動內容區與固定底部操作；Esc 或關閉按鈕退出。 */
function AssetDetailSheet({
    asset,
    added,
    onAdd,
    onClose,
}: {
    asset: ProjectAsset;
    added: boolean;
    onAdd: () => void;
    onClose: () => void;
}) {
    const closeRef = useRef<HTMLButtonElement | null>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setShown(true);
            return;
        }
        const raf = window.requestAnimationFrame(() => setShown(true));
        return () => window.cancelAnimationFrame(raf);
    }, []);
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        closeRef.current?.focus();
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);
    return (
        <div
            role="dialog"
            aria-label={`${asset.title || "素材"} 詳情`}
            className={`absolute inset-1.5 z-10 flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--director-sequencer-border)] bg-[var(--director-sequencer-surface-raised)] shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-150 ease-out ${
                shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
        >
            <div className="flex items-center gap-2 border-b border-[var(--director-sequencer-border)] px-2.5 py-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-[var(--director-accent)]/15">
                    <AssetIcon mediaType={asset.mediaType} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--director-dock-fg-strong)]">
                    {asset.title || asset.storageKey}
                </span>
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label="關閉詳情"
                    className="grid size-5 shrink-0 place-items-center rounded-md text-[var(--director-dock-fg)]/55 transition-colors hover:bg-[var(--director-control-hover)] hover:text-[var(--director-dock-fg-strong)]"
                >
                    <X className="size-3.5" />
                </button>
            </div>
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                <MediaPreview asset={asset} />
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    <dt className="text-[var(--director-dock-fg)]/60">媒體型別</dt>
                    <dd className="truncate text-right capitalize text-[var(--director-dock-fg-strong)]">{asset.mediaType}</dd>
                    <dt className="text-[var(--director-dock-fg)]/60">分類</dt>
                    <dd className="truncate text-right text-[var(--director-dock-fg-strong)]">{asset.category}</dd>
                    {asset.durationMs ? (
                        <>
                            <dt className="text-[var(--director-dock-fg)]/60">時長</dt>
                            <dd className="text-right tabular-nums text-[var(--director-dock-fg-strong)]">{formatDurationMs(asset.durationMs)}</dd>
                        </>
                    ) : null}
                </dl>
                {asset.previewText ? (
                    <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-[var(--director-dock-fg)]/60">{asset.previewText}</p>
                ) : null}
            </div>
            <div className="border-t border-[var(--director-sequencer-border)] p-2">
                <button
                    type="button"
                    disabled={added}
                    onClick={onAdd}
                    className={`flex h-7 w-full items-center justify-center gap-1 rounded-md text-[11px] font-medium transition-colors ${
                        added
                            ? "bg-[var(--director-success-soft)] text-[var(--director-success)]"
                            : "bg-[var(--director-accent)] text-[var(--director-on-accent)] hover:bg-[var(--director-accent-hover)]"
                    }`}
                >
                    {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                    {added ? "已新增到時間線" : "新增到時間線"}
                </button>
            </div>
        </div>
    );
}

export function EditorAssetIngest() {
    const { projectId } = useEditorHostContext();
    const scopeEpoch = useSyncExternalStore(subscribeUserScope, getActiveUserScopeEpoch, getActiveUserScopeEpoch);
    return <EditorAssetIngestSession key={JSON.stringify([projectId, scopeEpoch])} />;
}

function EditorAssetIngestSession() {
    const { projectId, assets, refreshAssets } = useEditorHostContext();
    const { project, dispatch } = useEditorStoreContext();
    const [added, setAdded] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importNote, setImportNote] = useState<string | null>(null);
    useEffect(() => {
        if (!importNote) return;
        const timer = window.setTimeout(() => setImportNote(null), 3200);
        return () => window.clearTimeout(timer);
    }, [importNote]);
    const [dragOver, setDragOver] = useState(false);

    const [filter, setFilter] = useState<AssetFilter>("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [openGroups, setOpenGroups] = useState<{ uploaded: boolean; project: boolean }>({ uploaded: true, project: true });
    const inputRef = useRef<HTMLInputElement | null>(null);
    const lastAddKey = useRef<string | null>(null);
    const lastAddAt = useRef(0);
    const mountedGenerationRef = useRef(0);
    const timelineReadyRef = useRef(Boolean(project));
    timelineReadyRef.current = Boolean(project);
    useEffect(() => {
        const generation = ++mountedGenerationRef.current;
        return () => {
            if (mountedGenerationRef.current === generation) mountedGenerationRef.current += 1;
        };
    }, []);
    // 展開浮層指向的素材被移除/重新整理消失時自動關閉，避免浮層殘留指向已不存在的資料。
    useEffect(() => {
        if (expandedId && !assets.some((a) => a.id === expandedId)) {
            setExpandedId(null);
        }
    }, [assets, expandedId]);

    if (!project) return null;

    const importFiles = async (fileList: FileList | File[]) => {
        const media = Array.from(fileList)
            .map((file) => ({ file, kind: kindFromFile(file) }))
            .filter((x): x is { file: File; kind: "image" | "video" | "audio" } => x.kind !== null);
        if (media.length === 0) {
            setImportError("僅支援影片、音訊與圖片檔案");
            return;
        }
        const expectedScope = captureUserScope();
        const originalProjectId = projectId;
        const startedMountedGeneration = mountedGenerationRef.current;
        const assertImportOwner = () => {
            assertUserScope(expectedScope);
            if (
                mountedGenerationRef.current !== startedMountedGeneration
                || !timelineReadyRef.current
            ) {
                throw new EditorImportAbandonedError();
            }
        };
        const stillMountedGeneration = () => mountedGenerationRef.current === startedMountedGeneration;
        setImporting(true);
        setImportError(null);
        setImportNote(null);
        let okCount = 0;
        let firstErrorMsg: string | null = null;
        const failedNames: string[] = [];
        try {
            // 去重：同名同型別視為同一素材。庫內已有或本批內重複的跳過，避免
            // 再次上傳同一大檔案生成重複 asset（歷史上重複匯入會把素材堆積成多條）。
            const seen = new Set<string>();
            const toImport = media.filter(({ file, kind }) => {
                const key = assetDedupeKey(file.name, kind);
                const known = assets.some((a) => assetDedupeKey(a.title, a.mediaType) === key);
                const duplicated = seen.has(key);
                seen.add(key);
                return !known && !duplicated;
            });
            const skipped = media.length - toImport.length;
            // 逐檔案匯入：單檔案失敗不中斷整批，彙總失敗數提示。
            const linkedIds: string[] = [];
            const linkInput = (file: File, kind: "image" | "video" | "audio", assetId: string) => ({
                assetId,
                category: defaultAssetCategoryForKind(kind),
                title: file.name,
            });
            for (const { file, kind } of toImport) {
                try {
                    assertImportOwner();
                    // 上傳前探測真即時長（影片/音訊），隨 meta 入庫供時間線片段使用。
                    const durationMs = await probeMediaDurationMs(file);
                    assertImportOwner();
                    const meta: ResourceUploadMeta = { expectedScope };
                    if (durationMs !== undefined) meta.durationMs = durationMs;
                    const resource = await uploadResourceFile(file, kind, meta);
                    assertImportOwner();
                    if (resource.status === "failed") {
                        failedNames.push(file.name);
                        if (!firstErrorMsg) firstErrorMsg = resource.error ? `「${file.name}」${resource.error}` : null;
                        continue;
                    }
                    let linked = false;
                    try {
                        assertImportOwner();
                        await linkProjectAsset(originalProjectId, linkInput(file, kind, resource.id), undefined, expectedScope);
                        linked = true;
                    } catch (error) {
                        if (isAbandonedImportError(error)) throw error;
                        // 連結偶發失敗（網路抖動/後端競態）時重試一次，避免資源已入庫卻未掛到專案下。
                        assertImportOwner();
                        try {
                            await linkProjectAsset(originalProjectId, linkInput(file, kind, resource.id), undefined, expectedScope);
                            linked = true;
                        } catch (retryError) {
                            if (isAbandonedImportError(retryError)) throw retryError;
                            linked = false;
                        }
                    }
                    assertImportOwner();
                    if (!linked) {
                        // 兩次掛載都失敗（asset 可能已建立但未掛上專案）：不刪除，提示重試——重試走冪等路徑可補掛。
                        failedNames.push(file.name);
                        if (!firstErrorMsg) firstErrorMsg = `「${file.name}」已上傳但掛載到專案失敗，請重試`;
                        continue;
                    }
                    okCount += 1;
                    linkedIds.push(resource.id);
                } catch (err) {
                    if (isAbandonedImportError(err)) throw err;
                    failedNames.push(file.name);
                    const detail = extractApiMessage(err);
                    if (!firstErrorMsg) firstErrorMsg = detail ? `「${file.name}」${detail}` : `「${file.name}」匯入失敗`;
                }
            }
            assertImportOwner();
            if (okCount > 0) {
                // 重新整理後校驗本次掛載的素材是否都出現在列表裡；若單次重新整理因網路抖動
                // 或後端提交延遲而拿不到最新結果，立即再重新整理一次，避免列表停留在舊快照。
                const firstList = await refreshAssets();
                assertImportOwner();
                if (firstList && linkedIds.some((id) => !firstList.some((asset) => asset.id === id))) {
                    await refreshAssets();
                    assertImportOwner();
                }
                setImportNote(skipped > 0 ? `已匯入 ${okCount} 個，跳過 ${skipped} 個重複檔案` : `已匯入 ${okCount} 個媒體`);
            } else if (skipped > 0 && failedNames.length === 0) {
                setImportNote(`媒體庫中已有同名素材，跳過 ${skipped} 個重複檔案`);
            }
            if (firstErrorMsg) {
                setImportError(firstErrorMsg);
            } else if (failedNames.length > 0) {
                const failedText = failedNames.length === 1 ? `「${failedNames[0]}」` : `${failedNames.length} 個檔案`;
                setImportError(`${failedText}匯入失敗，請重試`);
            }
        } catch (error) {
            if (!isAbandonedImportError(error)) throw error;
        } finally {
            if (stillMountedGeneration()) setImporting(false);
        }
    };

    // 雙擊“新增到時間線”會連續 dispatch 兩次，產生兩個同一素材的相鄰片段；用時間戳守衛攔截 1.5s 內的重複新增。
    const addToTimeline = (asset: ProjectAsset) => {
        const now = Date.now();
        if (lastAddKey.current === asset.id && now - lastAddAt.current < 1500) return;
        lastAddKey.current = asset.id;
        lastAddAt.current = now;
        const kind = asset.mediaType === "video" ? "video" : asset.mediaType === "audio" ? "audio" : asset.mediaType === "image" ? "image" : null;
        if (!kind) return;
        const trackId = trackIdForKind(kind, project);
        const startMs = trackEndMs(project, trackId);
        const clip = makeClipFromAsset(asset, {
            trackId,
            startMs,
            defaultDurationMs: kind === "image" ? 3_000 : 5_000,
        });
        if (!clip) return;
        dispatch({ op: "addClip", payload: { clip } });
        setAdded(asset.id);
        setTimeout(() => setAdded(null), 1200);
    };

    const uploadedAssets = assets.filter((a) => a.source === SOURCE_UPLOADED);
    // 畫布產物已自動同步為普通專案素材：併入「專案素材」，不再按來源單列分組。
    const projectAssets = assets.filter((a) => a.source !== SOURCE_UPLOADED);
    const groups: { id: "uploaded" | "project"; label: string; icon: typeof HardDrive; items: ProjectAsset[] }[] = [
        { id: "uploaded", label: "本地上傳", icon: HardDrive, items: uploadedAssets },
        { id: "project", label: "專案素材", icon: Boxes, items: projectAssets },
    ];
    const visibleGroups = groups.filter((g) => filter === "all" || g.id === filter);
    const totalCount = assets.length;
    const expandedAsset = assets.find((a) => a.id === expandedId) ?? null;

    return (
        <div
            className={`flex h-full min-h-0 flex-col bg-[var(--director-sequencer-surface)] ${dragOver ? "ring-2 ring-inset ring-[var(--director-accent)]" : ""}`}
            onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void importFiles(e.dataTransfer.files);
            }}
        >
            {/* 標題行：媒體庫 + 匯入按鈕 */}
            <div className="flex items-center gap-1.5 p-2 pb-1">
                <input
                    ref={inputRef}
                    type="file"
                    accept={MEDIA_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) void importFiles(e.target.files);
                        e.target.value = "";
                    }}
                />
                <span className="text-xs font-semibold text-[var(--director-dock-fg-strong)]">媒體庫</span>
                <span className="rounded-full bg-[var(--director-control-hover)] px-1.5 text-[9px] tabular-nums text-[var(--director-dock-fg)]/70">{totalCount}</span>
                <div className="flex-1" />
                <button
                    type="button"
                    disabled={importing}
                    onClick={() => inputRef.current?.click()}
                    className="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-[var(--director-sequencer-border)] px-2.5 text-[11px] font-medium text-[var(--director-dock-fg-strong)] transition-colors hover:border-[var(--director-accent)] hover:bg-[var(--director-control-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {importing ? <Loader2 className="size-3.5 animate-spin" /> : <FolderOpen className="size-3.5" />}
                    {importing ? "匯入中…" : "匯入媒體"}
                </button>
            </div>

            {/* 來源篩選：全部 / 專案素材 / 本地上傳 */}
            <div className="flex items-center gap-0.5 px-2 pb-1">
                {FILTER_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        aria-pressed={filter === tab.id}
                        onClick={() => setFilter(tab.id)}
                        className={`h-6 rounded-md px-2 text-[10px] transition-colors ${
                            filter === tab.id
                                ? "bg-[var(--director-dock-active-surface)] text-[var(--director-dock-fg-strong)]"
                                : "text-[var(--director-dock-fg)] hover:bg-[var(--director-control-hover)]"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {importError ? <p className="px-2 pb-1 text-[10px] text-[var(--director-danger)]">{importError}</p> : null}
            {importNote ? <p className="px-2 pb-1 text-[10px] text-[var(--director-success)]">{importNote}</p> : null}

            <div className="relative min-h-0 flex-1">
                <div className="director-scroll h-full overflow-y-auto p-1.5">
                {assets.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                        <p className="text-xs text-[var(--director-dock-fg)]/60">專案暫無資產</p>
                        <p className="max-w-[180px] text-[11px] leading-relaxed text-[var(--director-dock-fg)]/45">點選上方匯入媒體，或將檔案拖入此區域</p>
                    </div>
                ) : visibleGroups.every((g) => g.items.length === 0) ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                        <p className="text-xs text-[var(--director-dock-fg)]/60">
                            {filter === "uploaded" ? "暫無本地上傳的媒體" : filter === "project" ? "暫無專案素材" : "專案暫無資產"}
                        </p>
                        <p className="max-w-[180px] text-[11px] leading-relaxed text-[var(--director-dock-fg)]/45">點選上方匯入媒體，或將檔案拖入此區域</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        {visibleGroups.map((group) => {
                            if (group.items.length === 0) return null;
                            const open = openGroups[group.id];
                            return (
                                <div key={group.id} className="flex flex-col">
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setOpenGroups((s) => ({ ...s, [group.id]: !open }))}
                                        className="group flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:bg-[var(--director-control-hover)]"
                                    >
                                        <span
                                            className={`grid size-4 shrink-0 place-items-center rounded-[5px] transition-colors ${
                                                open ? "bg-[var(--director-accent)]/15 text-[var(--director-accent)]" : "bg-[var(--director-control-hover)] text-[var(--director-dock-fg)]/55 group-hover:text-[var(--director-dock-fg-strong)]"
                                            }`}
                                        >
                                            <ChevronRight className={`size-3 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`} />
                                        </span>
                                        <group.icon className={`size-3.5 shrink-0 transition-colors ${open ? "text-[var(--director-accent)]" : "text-[var(--director-dock-fg)]/60"}`} />
                                        <span className="truncate text-[11px] font-medium text-[var(--director-dock-fg-strong)]">{group.label}</span>
                                        <span className="ml-auto rounded-full bg-[var(--director-control-hover)] px-1.5 text-[9px] tabular-nums text-[var(--director-dock-fg)]/70">{group.items.length}</span>
                                    </button>
                                    {open ? (
                                        <ul className="flex flex-col">
                                            {group.items.map((asset) => {
                                                const expanded = expandedId === asset.id;
                                                return (
                                                    <li key={asset.id}>
                                                        <button
                                                            type="button"
                                                            aria-expanded={expanded}
                                                            onClick={() => setExpandedId(expanded ? null : asset.id)}
                                                            title={asset.title || asset.storageKey}
                                                            className={`group flex w-full items-center gap-2 rounded-md px-1 py-[3px] text-left transition-colors ${
                                                                added === asset.id ? "bg-[var(--director-accent)]/15" : "hover:bg-[var(--director-control-hover)]"
                                                            }`}
                                                        >
                                                            <AssetThumb asset={asset} />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[11px] text-[var(--director-dock-fg-strong)]">{asset.title || asset.storageKey}</span>
                                                                <span className="mt-0.5 flex items-center gap-1 text-[9px] text-[var(--director-dock-fg)]/60">
                                                                    <span className="uppercase">{asset.mediaType}</span>
                                                                    {asset.durationMs ? <span className="tabular-nums opacity-80">{formatDurationMs(asset.durationMs)}</span> : null}
                                                                </span>
                                                            </span>
                                                            <span
                                                                className={`grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors ${
                                                                    expanded ? "bg-[var(--director-accent)]/15 text-[var(--director-accent)]" : "text-[var(--director-dock-fg)]/40 group-hover:text-[var(--director-dock-fg)]/80"
                                                                }`}
                                                            >
                                                                <ChevronDown className={`size-3.5 transition-transform duration-150 ease-out ${expanded ? "rotate-180" : ""}`} />
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
                </div>
                {expandedAsset ? (
                    <AssetDetailSheet
                        asset={expandedAsset}
                        added={added === expandedAsset.id}
                        onClose={() => setExpandedId(null)}
                        onAdd={() => addToTimeline(expandedAsset)}
                    />
                ) : null}
            </div>
        </div>
    );
}

/** 從 Axios 錯誤中提取後端業務資訊（{ code, data, msg } 的 msg），無則返回 null。 */
function extractApiMessage(err: unknown): string | null {
    if (typeof err !== "object" || err === null) return null;
    const anyErr = err as { response?: { data?: { msg?: string } } };
    const msg = anyErr.response?.data?.msg;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
    return null;
}
