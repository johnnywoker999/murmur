import { App, Button, Popconfirm, Select } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Link2, Unlink, X } from "lucide-react";

import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import { PaginationBar } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { linkCanvasUnit, listProjectCanvases, unlinkCanvasProject, unlinkCanvasUnit } from "@/services/api/projects";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";

import { type ProjectDetailViewProps } from "./shared";

export default function ProjectCanvasesView({ detail, refreshProject }: ProjectDetailViewProps) {
    const { message } = App.useApp();
    const [linkingCanvasId, setLinkingCanvasId] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(40);
    const localCanvases = useCanvasStore((state) => state.projects);
    const canvasesQuery = useQuery({
        queryKey: ["project", detail.project.id, "canvases", page, pageSize],
        queryFn: () => listProjectCanvases(detail.project.id, page, pageSize),
    });
    useEffect(() => {
        if (!canvasesQuery.data) return;
        const lastPage = Math.max(1, Math.ceil(canvasesQuery.data.total / pageSize));
        if (page > lastPage) setPage(lastPage);
    }, [canvasesQuery.data, page, pageSize]);
    const linkMutation = useMutation({
        mutationFn: ({ canvasId, unitId }: { canvasId: string; unitId: string }) => linkCanvasUnit(detail.project.id, { canvasId, unitId, role: "storyboard" }),
        onSuccess: () => { setLinkingCanvasId(""); refreshProject(); message.success("畫布已關聯章節"); },
        onError: (error) => message.error(error instanceof Error ? error.message : "畫布關聯失敗"),
    });
    const unlinkUnitMutation = useMutation({
        mutationFn: ({ canvasId, unitId }: { canvasId: string; unitId: string }) => unlinkCanvasUnit(detail.project.id, canvasId, unitId),
        onSuccess: () => { refreshProject(); message.success("已解除章節關聯"); },
        onError: (error) => message.error(error instanceof Error ? error.message : "解除章節關聯失敗"),
    });
    const unlinkProjectMutation = useMutation({
        mutationFn: (canvasId: string) => unlinkCanvasProject(detail.project.id, canvasId),
        onSuccess: (_, canvasId) => {
            // 服務端解除後立即同步本地畫布歸屬，避免後續自動儲存把舊關係重新寫回。
            useCanvasStore.getState().updateProject(canvasId, { projectId: undefined });
            refreshProject();
            message.success("已解除專案關係，畫布檔案仍保留在創作畫布中");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "解除專案關係失敗"),
    });
    const canvasUnitLinks = canvasesQuery.data?.canvasUnitLinks || [];
    const linksByCanvas = useMemo(() => canvasUnitLinks.reduce<Record<string, typeof canvasUnitLinks>>((result, link) => { (result[link.canvasId] ||= []).push(link); return result; }, {}), [canvasUnitLinks]);
    const canvases = useMemo(() => (canvasesQuery.data?.canvases || []).map((canvas) => {
        const local = localCanvases.find((item) => item.id === canvas.id && item.projectId === detail.project.id);
        if (!local || Date.parse(local.updatedAt) < Date.parse(canvas.updatedAt)) return canvas;
        return { ...canvas, title: local.title, updatedAt: local.updatedAt };
    }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [canvasesQuery.data?.canvases, detail.project.id, localCanvases]);

    return (
        <div>
            {canvasesQuery.isLoading ? <WorkspaceState icon="canvas" title="正在讀取專案畫布" description="按頁載入畫布摘要與章節關聯。" /> : canvases.length ? (
                <>
                <div className="project-library-grid library-grid">
                    {canvases.map((canvas) => {
                        const links = linksByCanvas[canvas.id] || [];
                        const linkedUnits = links.map((link) => detail.units.find((unit) => unit.id === link.unitId)).filter(Boolean);
                        const unlinkedUnits = detail.units.filter((unit) => !links.some((link) => link.unitId === unit.id));
                        const project = toCanvasProject(canvas, detail.project.id, localCanvases.find((item) => item.id === canvas.id));
                        return (
                            <CanvasProjectCard
                                key={canvas.id}
                                project={project}
                                projectName={detail.project.name}
                                readOnly
                                footer={
                                    <div className="border-t border-border/60 pt-2.5">
                                        <div className="flex items-center justify-between"><span className="text-[var(--fs-tiny)] font-medium text-foreground/48">關聯章節</span><span className="text-[var(--fs-micro)] tabular-nums text-foreground/38">{linkedUnits.length} 個</span></div>
                                        <div className="mt-1.5 flex min-h-6 max-h-12 flex-wrap gap-1 overflow-y-auto">
                                            {linkedUnits.length ? linkedUnits.map((unit) => (
                                                <span key={unit!.id} className="inline-flex h-5 max-w-full items-center gap-1 rounded bg-[var(--workspace-accent-soft)] pl-1.5 pr-0.5 text-[var(--fs-micro)] text-[var(--workspace-accent)]"><span className="truncate">{String(unit!.position + 1).padStart(2, "0")} · {unit!.title}</span><Tooltip title="解除章節關聯"><button type="button" className="grid size-4 shrink-0 place-items-center rounded hover:bg-surface-hover" aria-label={`解除${unit!.title}關聯`} onClick={() => unlinkUnitMutation.mutate({ canvasId: canvas.id, unitId: unit!.id })}><X className="size-3" /></button></Tooltip></span>
                                            )) : <span className="py-0.5 text-[var(--fs-tiny)] text-foreground/38">尚未關聯章節</span>}
                                        </div>
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <Select size="small" className="min-w-0 flex-1" placeholder={unlinkedUnits.length ? "關聯更多章節" : "全部章節已關聯"} disabled={!unlinkedUnits.length} options={unlinkedUnits.map((unit) => ({ label: `${String(unit.position + 1).padStart(2, "0")} · ${unit.title}`, value: unit.id }))} onChange={(unitId) => { setLinkingCanvasId(canvas.id); linkMutation.mutate({ canvasId: canvas.id, unitId }); }} loading={linkMutation.isPending && linkingCanvasId === canvas.id} suffixIcon={<Link2 className="size-3.5" />} />
                                            <Popconfirm title="解除畫布與專案的關係？" description="畫布檔案不會刪除，之後仍可在“畫布”中開啟。" okText="解除關係" cancelText="取消" okButtonProps={{ danger: true, loading: unlinkProjectMutation.isPending }} onConfirm={() => unlinkProjectMutation.mutate(canvas.id)}>
                                                <Tooltip title="解除專案關係"><Button size="small" type="text" danger icon={<Unlink className="size-3.5" />} aria-label="解除專案關係" /></Tooltip>
                                            </Popconfirm>
                                        </div>
                                    </div>
                                }
                            />
                        );
                    })}
                </div>
                <PaginationBar current={page} pageSize={pageSize} total={canvasesQuery.data?.total || 0} itemLabel="張" pageSizeOptions={[20, 40, 80]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} />
                </>
            ) : <WorkspaceState icon="canvas" title="還沒有專案畫布" description="使用右上角的新建畫布開始創作。" />}
        </div>
    );
}

function toCanvasProject(canvas: { id: string; title: string; createdAt: string; updatedAt: string }, projectId: string, local?: CanvasProject): CanvasProject {
    if (local) return { ...local, title: canvas.title || local.title, updatedAt: canvas.updatedAt || local.updatedAt };
    return {
        id: canvas.id,
        projectId,
        title: canvas.title,
        createdAt: canvas.createdAt,
        updatedAt: canvas.updatedAt,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "dots",
        showImageInfo: true,
        viewport: { x: 0, y: 0, k: 1 },
        directorScenes: [],
    };
}
