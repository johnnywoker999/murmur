import { App, Button, Dropdown, Popover } from "antd";
import { CheckCircle2, CloudCheck, CloudOff, LoaderCircle, RefreshCw } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { readAllCanvasSyncDrafts, readCanvasSyncDrafts, type CanvasSyncDraft } from "@/services/canvas-sync-drafts";
import { getActiveUserScope } from "@/lib/user-scope";
import { acceptExternalCanvasRevision, pendingExternalCanvasRevision } from "@/services/local-workspace-repository";
import { canvasExternalRevisionVersion, subscribeCanvasExternalRevision, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { canvasSyncProgressKey, useSyncProgressStore } from "@/stores/use-sync-progress-store";
import { workspaceCapabilities } from "@/services/workspace-mode";

export function CanvasSyncStatus({ projectId, onLoadLatest, onOpenVersions }: { projectId: string; onLoadLatest: () => Promise<void>; onOpenVersions?: () => void }) {
    const { message } = App.useApp();
    const progress = useSyncProgressStore((state) => state.syncingProjects[canvasSyncProgressKey(projectId)]);
    const localOnly = workspaceCapabilities().local;
    const [busy, setBusy] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    // 外部改動被本地編輯擋住時必須在頂欄一直看得見：它以前藏在側邊面板裡，
    // 面板關著的時候使用者根本不知道畫布已經在別處變了。
    const externalRevision = useSyncExternalStore(subscribeCanvasExternalRevision, canvasExternalRevisionVersion);
    const externalConflict = pendingExternalCanvasRevision(projectId);
    const [adopting, setAdopting] = useState(false);
    const phase = progress?.phase;
    const conflict = phase === "conflict";
    const failed = phase === "error" || conflict || !phase;
    const saving = phase === "pending" || phase === "saving" || phase === "uploading";
    const label = localOnly ? "已儲存在本地" : conflict ? "版本衝突 · 未同步" : !phase ? "尚未同步" : failed ? "雲端未儲存" : saving ? "正在儲存" : "已儲存";
    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await operation();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失敗，請重試");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {externalConflict ? (
                <Button
                    size="small"
                    type="text"
                    data-canvas-external-revision={externalRevision}
                    className="canvas-sync-external-notice"
                    loading={adopting}
                    aria-label="畫布已在別處更新，使用最新版本"
                    icon={<RefreshCw className="size-3.5" />}
                    onClick={() => {
                        setAdopting(true);
                        void acceptExternalCanvasRevision(projectId)
                            .catch(() => message.error("載入最新版本失敗，請重試"))
                            .finally(() => setAdopting(false));
                    }}
                >
                    <span className="canvas-sync-status-label text-xs">畫布已在別處更新 · 使用最新版本</span>
                </Button>
            ) : null}
            <Popover
                trigger="click"
                placement="bottom"
                open={statusOpen}
                onOpenChange={setStatusOpen}
                content={
                    <div className="max-w-80 space-y-3" data-canvas-no-zoom>
                        <p role="status" className="text-sm">
                            {localOnly ? "畫布已儲存在本機。" : progress?.message || (phase === "done" ? "畫布已同步到雲端" : "尚未確認雲端儲存，請保留本地內容")}
                        </p>
                        {!localOnly && conflict ? <p className="text-xs text-muted-foreground">此畫布的自動提交已暫停。載入最新版前會保留本地草稿，可下載後從畫佈列表匯入為副本。</p> : null}
                        <div className="flex flex-wrap gap-2">
                            {!localOnly ? <Button size="small" loading={busy} onClick={() => void run(onLoadLatest)}>載入雲端最新版本</Button> : null}
                            <Button
                                size="small"
                                disabled={busy}
                                onClick={() =>
                                    void run(async () => {
                                        const project = useCanvasStore.getState().openProject(projectId);
                                        if (project) {
                                            const result = await exportCanvasProjects([project], `${project.title}-本地草稿`);
                                            if (result === "cancelled") return;
                                        }
                                    })
                                }
                            >
                                下載當前內容
                            </Button>
                            {onOpenVersions ? (
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setStatusOpen(false);
                                        onOpenVersions();
                                    }}
                                >
                                    版本記錄{progress?.draftCount ? ` · ${progress.draftCount} 份草稿` : ""}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                }
            >
                <Button
                    type="text"
                    size="small"
                    danger={!localOnly && failed}
                    aria-label={`畫布儲存狀態：${label}`}
                    icon={localOnly ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : saving ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" /> : failed ? <CloudOff className="size-3.5" /> : <CloudCheck className="size-3.5" />}
                >
                    <span className="canvas-sync-status-label text-xs">{label}</span>
                </Button>
            </Popover>
        </>
    );
}

export function CanvasSyncDraftMenu({ projectId }: { projectId?: string }) {
    const { message } = App.useApp();
    const [drafts, setDrafts] = useState<CanvasSyncDraft[]>([]);
    const [draftScope, setDraftScope] = useState("");
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    return (
        <Dropdown
            trigger={["click"]}
            onOpenChange={(open) => {
                if (!open) return;
                const scope = getActiveUserScope();
                setDraftScope(scope);
                setDrafts([]);
                setLoading(true);
                void (projectId ? readCanvasSyncDrafts(projectId, scope) : readAllCanvasSyncDrafts(scope))
                    .then((items) => {
                        if (getActiveUserScope() === scope) setDrafts(items.reverse());
                    })
                    .catch(() => message.error("讀取本地草稿失敗"))
                    .finally(() => setLoading(false));
            }}
            menu={{
                items: drafts.length
                    ? drafts.map((draft) => ({
                          key: draft.id,
                          label: `${draft.project.title} · ${new Date(draft.savedAt).toLocaleString()}`,
                          onClick: () => {
                              if (getActiveUserScope() !== draftScope) {
                                  setDrafts([]);
                                  message.error("賬號已切換，請重新開啟本地草稿");
                                  return;
                              }
                              setExporting(true);
                              void exportCanvasProjects([draft.project], `${draft.project.title}-本地草稿`, { includeLocalDrawings: false })
                                  .then((result) => {
                                      if (result === "saved") message.success("草稿已下載，可從畫佈列表匯入為新畫布");
                                  })
                                  .catch(() => message.error("草稿下載失敗，請重試"))
                                  .finally(() => setExporting(false));
                          },
                      }))
                    : [{ key: "empty", label: loading ? "正在讀取草稿…" : "暫無本地草稿", disabled: true }],
            }}
        >
            <Button size={projectId ? "small" : "middle"} loading={exporting}>
                本地草稿
            </Button>
        </Dropdown>
    );
}
