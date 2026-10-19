import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { createWorkspaceRouter } from "@/lib/app-routing";
import { FullScreenLoader, WorkspaceRouteLoader } from "@/components/ui/aceternity/full-screen-loader";
import { loadAgentsPage, loadAssetsPage, loadCanvasPage, loadCanvasProjectPage, loadCreatePage, loadHomePage, loadProjectDetailPage } from "@/lib/workspace-route-modules";
import { CanvasRefreshShell } from "@/pages/canvas/canvas-refresh-shell";
import RouteErrorPage from "@/pages/route-error";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";

const AgentsPage = lazy(loadAgentsPage);
const AssetsPage = lazy(loadAssetsPage);
const HomePage = lazy(loadHomePage);
const CanvasPage = lazy(loadCanvasPage);
const CanvasProjectPage = lazy(loadCanvasProjectPage);
const CreatePage = lazy(loadCreatePage);
const NotFound = lazy(() => import("@/pages/not-found"));
const PluginsPage = lazy(() => import("@/pages/plugins"));
const EagleLibraryPage = lazy(() => import("@/pages/plugins/eagle"));
const ProjectDetailPage = lazy(loadProjectDetailPage);
const SettingsPage = lazy(() => import("@/pages/settings"));
const TestVoiceRecording = lazy(() => import("@/pages/test-voice-recording"));
const UserLayout = lazy(() => import("@/layouts/user-layout"));
const RequireFeature = lazy(() => import("@/components/workspace/require-feature").then((module) => ({ default: module.RequireFeature })));

function deferred(element: ReactNode) {
    return <Suspense fallback={<WorkspaceRouteLoader />}>{element}</Suspense>;
}

function fullScreenDeferred(element: ReactNode) {
    return <Suspense fallback={<FullScreenLoader label="正在開啟創作空間" detail="準備當前頁面" />}>{element}</Suspense>;
}

function WorkspaceLayout() {
    const { pathname } = useLocation();
    const isCanvasProjectRoute = pathname.startsWith("/canvas/");
    const fallback = isCanvasProjectRoute ? <CanvasRefreshShell /> : <FullScreenLoader label="正在開啟創作空間" detail="準備當前頁面" />;
    return <Suspense fallback={fallback}><UserLayout><Outlet /></UserLayout></Suspense>;
}

function LocalAwareProjectRoute() {
    const { projectId } = useParams();
    const localMode = isLocalWorkspaceMode();
    if (localMode && projectId) return <Navigate to={`/canvas/${projectId}`} replace />;
    return deferred(<ProjectDetailPage />);
}

function LegacyProjectAliasRoute() {
    const { projectId, "*": rest } = useParams();
    return <Navigate to={`/projects/${projectId}${rest ? `/${rest}` : ""}`} replace />;
}

/**
 * DEV 專用實驗室路由。
 *
 * lazy(() => import(...)) 寫在函式體內，而不是模組頂層常量：
 * 生產構建時 import.meta.env.DEV 被替換為 false，本函式隨之不可達，
 * 搖樹會連同其中的動態 import 一起刪除，實驗室程式碼不進入生產依賴圖。
 * 若把 lazy 提到模組頂層，動態 import 會被靜態分析成真實 chunk 並打進 dist。
 */
function devRoutes() {
    const FolderPreviewLab = lazy(() => import("@/pages/dev/folder-preview-lab"));
    const DirectorReproLab = lazy(() => import("@/pages/dev/director-repro-lab"));
    const AssistantPanelLab = lazy(() => import("@/pages/dev/assistant-panel-lab"));
    return [
        { path: "/dev/folders", element: fullScreenDeferred(<FolderPreviewLab />), errorElement: <RouteErrorPage /> },
        { path: "/dev/director-repro", element: fullScreenDeferred(<DirectorReproLab />), errorElement: <RouteErrorPage /> },
        { path: "/dev/assistant-panel", element: fullScreenDeferred(<AssistantPanelLab />), errorElement: <RouteErrorPage /> },
    ];
}

export const router = createWorkspaceRouter([
    ...(import.meta.env.DEV ? devRoutes() : []),
    {
        element: <WorkspaceLayout />,
        errorElement: <RouteErrorPage />,
        children: [
            { path: "/", element: deferred(<HomePage />) },
            { path: "/create", element: deferred(<CreatePage />) },
            {
                path: "/tasks",
                // 任務頁暫不開放，保留路由以避免舊連結進入半成品介面。
                element: <Navigate to="/" replace />,
            },
            { path: "/assets", element: deferred(<AssetsPage />) },
            { path: "/skills", element: <Navigate to="/" replace /> },
            { path: "/skill", element: <Navigate to="/" replace /> },
            { path: "/skills/reference", element: <Navigate to="/" replace /> },
            {
                path: "/plugins",
                element: <RequireFeature feature="pluginCenterEnabled">{deferred(<PluginsPage />)}</RequireFeature>,
            },
            {
                path: "/plugins/eagle",
                element: <RequireFeature feature="pluginCenterEnabled">{deferred(<EagleLibraryPage />)}</RequireFeature>,
            },
            { path: "/settings", element: deferred(<SettingsPage />) },
            { path: "/agents", element: deferred(<AgentsPage />) },
            { path: "/test-voice-recording", element: deferred(<TestVoiceRecording />) },
            {
                path: "/projects",
                element: deferred(<CanvasPage />),
            },
            // LibTV 使用單數 `/project` 作為專案庫入口；直接渲染本地專案庫，
            // 保留原始 URL，避免畫素復刻時出現一次重定向造成的佈局/載入閃爍。
            {
                path: "/project",
                element: deferred(<CanvasPage />),
            },
            {
                path: "/projects/:projectId",
                element: <LocalAwareProjectRoute />,
            },
            { path: "/project/:projectId", element: <LegacyProjectAliasRoute /> },
            { path: "/project/:projectId/*", element: <LegacyProjectAliasRoute /> },
            {
                path: "/projects/:projectId/:view",
                element: <LocalAwareProjectRoute />,
            },
            {
                path: "/projects/:projectId/chapters/:chapterId",
                element: <LocalAwareProjectRoute />,
            },
            {
                path: "/projects/:projectId/workflow/:unitId/:stage",
                element: <LocalAwareProjectRoute />,
            },
            { path: "/canvas", element: deferred(<CanvasPage />) },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
        ],
    },
    { path: "*", element: fullScreenDeferred(<NotFound />) },
]);
