import { lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App } from "antd";
import { ArrowLeft, Plus } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";

import { getProjectCore, getProjectOverview, getProjectUnitWorkspace, linkCanvasUnit, listProjectUnits } from "@/services/api/projects";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import type { ProjectDetail } from "@/services/api/projects";

import { WorkflowChapterNavigator } from "./detail/workflow-chapter-navigator";
import { createLocalCanvasProject } from "@/services/local-workspace-repository";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";

const ProjectAssetsView = lazy(() => import("./detail/assets"));
const ProjectCanvasesView = lazy(() => import("./detail/canvases"));
const ProjectChaptersView = lazy(() => import("./detail/chapters"));
const ProjectOverviewView = lazy(() => import("./detail/overview"));
const ProjectSettingsView = lazy(() => import("./detail/settings"));
const ProjectWorkflowView = lazy(() => import("./detail/workflow"));
const ProjectEditorView = lazy(() => import("./detail/editor"));

type DetailView = "overview" | "chapters" | "workflow" | "canvases" | "editor" | "assets" | "settings";

const views: Array<{ key: DetailView; label: string }> = [
    { key: "overview", label: "製作概覽" },
    { key: "chapters", label: "劇情章節" },
    { key: "workflow", label: "分鏡製作" },
    { key: "canvases", label: "專案畫布" },
    { key: "editor", label: "剪輯成片" },
    { key: "assets", label: "角色與資產" },
    { key: "settings", label: "專案設定" },
];

export default function ProjectDetailPage() {
    const { projectId = "", view, chapterId, unitId, stage } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const activeView: DetailView = unitId || view === "workflow" ? "workflow" : chapterId ? "chapters" : views.some((item) => item.key === view) ? view as DetailView : "overview";
    const coreQuery = useQuery({
        queryKey: ["project", projectId, "core"],
        queryFn: () => getProjectCore(projectId),
        enabled: Boolean(projectId),
        refetchOnMount: "always",
    });
    const unitsQuery = useQuery({ queryKey: ["project", projectId, "units"], queryFn: () => listProjectUnits(projectId), enabled: Boolean(projectId) });
    const units = unitsQuery.data?.units || [];
    const firstUnitId = units.slice().sort((left, right) => left.position - right.position)[0]?.id || "";
    const requestedUnitId = chapterId || unitId || "";
    const activeUnitId = units.some((unit) => unit.id === requestedUnitId) ? requestedUnitId : firstUnitId;
    const overviewQuery = useQuery({ queryKey: ["project", projectId, "overview"], queryFn: () => getProjectOverview(projectId), enabled: Boolean(projectId) && activeView === "overview" });
    const workspaceQuery = useQuery({
        queryKey: ["project", projectId, "unit-workspace", activeUnitId],
        queryFn: () => getProjectUnitWorkspace(projectId, activeUnitId),
        enabled: Boolean(projectId && activeUnitId) && (activeView === "chapters" || activeView === "workflow"),
        refetchInterval: (query) => (query.state.data?.tasks || []).some((task) => task.clientContext?.shotId && (task.status === "queued" || task.status === "running")) ? 2_000 : false,
    });
    const project = coreQuery.data?.project;
    const workspace = workspaceQuery.data;
    const detail: ProjectDetail | undefined = project ? {
        project,
        units: workspace?.unit ? units.map((unit) => unit.id === workspace.unit.id ? workspace.unit : unit) : units,
        canvases: [],
        canvasUnitLinks: [],
        unitCanvasCounts: unitsQuery.data?.canvasCounts || {},
        assets: workspace?.assets || [],
        assetFolders: [],
        workflows: workspace?.workflows || [],
        shots: workspace?.shots || [],
        shotRevisions: workspace?.shotRevisions || [],
        shotArtifacts: workspace?.shotArtifacts || [],
        shotReferences: workspace?.shotReferences || [],
        assetCandidates: workspace?.assetCandidates || [],
        tasks: workspace?.tasks || [],
    } : undefined;
    const refreshProject = () => { void queryClient.invalidateQueries({ queryKey: ["project", projectId] }); void queryClient.invalidateQueries({ queryKey: ["projects"] }); };
    const createCanvas = async () => {
        if (detail?.project.status === "archived") { message.warning("專案已歸檔，請先在專案設定中恢復"); return; }
        const activeChapterId = chapterId || sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
        const unit = activeView === "chapters"
            ? detail?.units.find((item) => item.id === activeChapterId) || detail?.units.slice().sort((left, right) => left.position - right.position)[0]
            : undefined;
        const shots = unit ? detail?.shots.filter((shot) => shot.unitId === unit.id) || [] : [];
        try {
            const [{ createCanvasProjectWithRemoteSync }, storyboard] = await Promise.all([
                import("@/services/local-workspace-sync"),
                unit && shots.length ? import("@/lib/canvas/project-chapter-storyboard") : Promise.resolve(null),
            ]);
            const seed = unit && shots.length ? storyboard?.upsertProjectChapterStoryboard([], [], { unit, shots }) : undefined;
            const initialContent = seed ? { nodes: seed.nodes, connections: seed.connections } : undefined;
            const title = unit ? `${unit.title} · ${shots.length ? "分鏡畫布" : "畫布"}` : `${detail?.project.name || "專案"} · 新畫布`;
            // 本地 MURMUR AI 專案庫不建立雲端專案關聯；章節/專案 API 仍可供
            // 顯式 hosted build 使用，但預設建立路徑只寫入本地畫布儲存。
            // Use the central workspace capability boundary so a local
            // session remains local even when the build also supports hosted
            // mode or is still finishing session hydration.
            if (isLocalWorkspaceMode()) {
                const { id } = await createLocalCanvasProject(title, projectId, initialContent);
                message.success(unit && shots.length ? `已建立本地章節畫布並匯入 ${shots.length} 個分鏡` : "本地畫布已建立");
                navigate(`/canvas/${id}`);
                return;
            }
            const { id, syncError } = await createCanvasProjectWithRemoteSync(title, projectId, initialContent);
            if (syncError) {
                message.warning(syncError instanceof Error ? `畫布已儲存在本地，專案關聯稍後重試：${syncError.message}` : "畫布已儲存在本地，專案關聯稍後重試");
                navigate(`/canvas/${id}`);
                return;
            }
            if (unit) {
                try {
                    await linkCanvasUnit(projectId, { canvasId: id, unitId: unit.id, role: "storyboard" });
                } catch (error) {
                    refreshProject();
                    message.error(error instanceof Error ? `畫布已建立，但章節關聯失敗：${error.message}` : "畫布已建立，但章節關聯失敗");
                    return;
                }
            }
            refreshProject();
            message.success(unit && shots.length ? `已建立章節畫布並匯入 ${shots.length} 個分鏡` : unit ? "章節畫布已建立並關聯" : "專案畫布已建立");
            navigate(`/canvas/${id}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "畫布建立失敗");
        }
    };
    const chapterHref = detail ? projectChapterHref(detail.units, projectId, chapterId) : `/projects/${projectId}/chapters`;
    const workflowHref = detail ? projectWorkflowHref(detail.units, projectId, unitId, stage) : `/projects/${projectId}/workflow`;
    if (coreQuery.isLoading || unitsQuery.isLoading) return <WorkspacePage><WorkspaceLoadingState label="正在開啟專案工作臺" detail="讀取專案與章節索引" /></WorkspacePage>;
    if (coreQuery.isError || unitsQuery.isError || !detail) return <WorkspacePage><WorkspaceErrorState title="專案不可用" description="專案不存在、已被刪除，或當前賬號沒有訪問許可權。" actionLabel="返回專案中心" onRetry={() => navigate("/projects")} /></WorkspacePage>;
    if (!chapterId && !unitId && (!view || !views.some((item) => item.key === view))) return <Navigate to={`/projects/${projectId}/overview`} replace />;
    if (chapterId && !units.some((unit) => unit.id === chapterId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/chapters/${firstUnitId}` : `/projects/${projectId}/chapters`} replace />;
    if (unitId && !units.some((unit) => unit.id === unitId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/workflow/${firstUnitId}/${stage || "video"}` : `/projects/${projectId}/workflow`} replace />;
    if (activeView === "workflow" && !unitId && detail.units.length) return <Navigate to={`/projects/${projectId}/workflow/${detail.units.slice().sort((left, right) => left.position - right.position)[0].id}/video`} replace />;
    return (
        <WorkspacePage className="project-workbench-page !overflow-hidden" fluid>
            <div className="flex h-full min-h-0 flex-col">
                <ProjectWorkspaceHeader
                    detail={detail}
                    projectId={projectId}
                    activeView={activeView}
                    unitId={unitId}
                    stage={stage}
                    chapterHref={chapterHref}
                    workflowHref={workflowHref}
                    onCreateCanvas={createCanvas}
                />
                {detail.project.status === "archived" ? <Alert type="warning" showIcon banner message="專案已歸檔，恢復後才能建立畫布和生成任務" className="!border-x-0 !border-t-0" /> : null}
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className={activeView === "chapters" || activeView === "workflow" || activeView === "editor" ? "min-h-0 flex-1" : "thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 lg:py-7"}>
                        <Suspense fallback={<WorkspaceLoadingState label="正在準備當前專案檢視" detail="只加載當前使用的工作區模組" />}>
                            <div className={activeView === "overview" ? "w-full" : activeView === "chapters" || activeView === "workflow" || activeView === "editor" ? "h-full w-full" : "w-full"}>
                                {activeView === "overview" ? overviewQuery.isLoading ? <WorkspaceLoadingState label="正在統計製作進度" detail="只讀取聚合資料，不載入全部鏡頭歷史" /> : overviewQuery.data ? <ProjectOverviewView detail={detail} overview={overviewQuery.data} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : <WorkspaceErrorState title="製作概覽讀取失敗" description="請稍後重試。" onRetry={() => void overviewQuery.refetch()} /> : null}
                                {activeView === "chapters" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label="正在讀取當前章節" detail="正文與製作資料按章節載入" /> : workspaceQuery.isError ? <WorkspaceErrorState title="章節讀取失敗" description="當前章節可能已被刪除，或服務暫時不可用。" onRetry={() => void workspaceQuery.refetch()} /> : <ProjectChaptersView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "workflow" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label="正在讀取當前章節分鏡" detail="僅載入本章鏡頭、版本和產物" /> : workspaceQuery.isError ? <WorkspaceErrorState title="分鏡工作區讀取失敗" description="當前章節製作資料暫時不可用。" onRetry={() => void workspaceQuery.refetch()} /> : <ProjectWorkflowView detail={detail} projectId={projectId} unitId={unitId || ""} stage={stage || "video"} /> : null}
                                {activeView === "canvases" ? <ProjectCanvasesView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "assets" ? <ProjectAssetsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "settings" ? <ProjectSettingsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "editor" ? <ProjectEditorView detail={detail} /> : null}
                            </div>
                        </Suspense>
                    </div>
                </main>
            </div>
        </WorkspacePage>
    );
}

function ProjectWorkspaceHeader({ detail, projectId, activeView, unitId, stage, chapterHref, workflowHref, onCreateCanvas }: { detail: ProjectDetail; projectId: string; activeView: DetailView; unitId?: string; stage?: string; chapterHref: string; workflowHref: string; onCreateCanvas: () => void }) {
    const archived = detail.project.status === "archived";
    const createCanvasLabel = activeView === "chapters" && detail.units.length ? "新建當前章節畫布" : "新建專案畫布";
    return (
        <header className="project-workspace-header">
            <div className="project-workspace-identity">
                <Link to="/projects" className="project-workspace-back" aria-label="返回專案列表">
                    <ArrowLeft />
                    <span className="sr-only">返回</span>
                </Link>
                <div className="project-workspace-title">
                    <h1 title={detail.project.name}>{detail.project.name}</h1>
                    <span className={`project-workspace-status ${archived ? "is-archived" : "is-active"}`}>{archived ? "已歸檔" : "進行中"}</span>
                </div>
            </div>
            <nav className="project-workspace-tabs" aria-label="專案導航">
                {views.map((item) => {
                    const active = item.key === activeView;
                    const href = item.key === "chapters" ? chapterHref : item.key === "workflow" ? workflowHref : `/projects/${projectId}/${item.key}`;
                    return (
                        <Link
                            key={item.key}
                            to={href}
                            aria-current={active ? "page" : undefined}
                            className={`project-workspace-tab ${active ? "is-active" : ""}`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="project-workspace-actions">
                {activeView === "workflow" ? (
                    <WorkflowChapterNavigator projectId={projectId} units={detail.units} unitId={unitId} stage={stage} />
                ) : (
                    <button type="button" onClick={onCreateCanvas} className="project-workspace-create" aria-label={createCanvasLabel} title={createCanvasLabel}>
                        <Plus />
                        <span>新建畫布</span>
                    </button>
                )}
            </div>
        </header>
    );
}

function projectWorkflowHref(units: Array<{ id: string; position: number }>, projectId: string, routeUnitId?: string, routeStage?: string) {
    const targetId = [routeUnitId, sessionStorage.getItem(`project-active-chapter:${projectId}`) || ""].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/workflow/${targetId}/${routeStage || "video"}` : `/projects/${projectId}/workflow`;
}

function projectChapterHref(units: Array<{ id: string; position: number }>, projectId: string, routeChapterId?: string) {
    const rememberedId = sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
    const targetId = [routeChapterId, rememberedId].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/chapters/${targetId}` : `/projects/${projectId}/chapters`;
}
