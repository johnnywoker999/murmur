import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { Alert, App, Button, Drawer, Form, Input, Modal, Select, Typography } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { Bug, LayoutGrid, List, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { MediaPreview } from "@/components/media-preview";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { GenerationFailureNotice } from "@/components/generation/generation-failure-notice";
import { explainGenerationError } from "@/lib/generation-error";
import { seedanceTaskRetryWarning } from "@/lib/seedance-channel-warning";
import { portraitTaskRetryError } from "@/lib/seedance-portrait";
import { formatTaskKind, operationOptions, statusLabel } from "@/lib/generation-task-display";
import { buildVideoOperationPrompt } from "@/lib/prompts";
import { backendProviderConfig, logicalModelIDForConfig } from "@/services/api/generation-task";

import { createGenerationTask, formatTaskLog, listGenerationTasks, listTaskLogs, queryFailedVideoProviderTask, queryGenerationTask, retryGenerationTask, type CreateTaskInput, type GenerationTask, type TaskLog } from "@/services/api/task-center";
import { syncGenerationTaskToCanvasStore } from "@/lib/canvas/canvas-generation-task-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { resolveModelRequestConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { listProjects, type ProjectSummary } from "@/services/api/projects";
import { TaskGridCard } from "./task-grid-card";
import { TaskGroupHeader, type TaskGroup } from "./task-group-header";
import { TaskListRow } from "./task-list-row";
import { formatModelName, getTaskCanvasContext, isTaskFailed, providerCancelStatusLabel, taskMediaKind, taskRetryBlocked } from "./task-shared";
import { TaskStatusFilterBar, type TaskStatusFilter } from "./task-status-filter";
import { localTaskHistoryFromProjects } from "@/lib/local-task-history";
import { workspaceCapabilities } from "@/services/workspace-mode";
import { discoverBackendTasks, mergeTaskHistory } from "./task-discovery";

type TaskKindFilter = "all" | "text" | "image" | "video";
type TaskViewMode = "list" | "grid";

function preferenceKeys() {
    const userId = useUserStore.getState().user?.id ?? "anon";
    return { view: `task-center-view.${userId}`, group: `task-center-group.${userId}` };
}

function readTaskPreference(key: string, fallback: string): string {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch (error) {
        console.warn("讀取任務中心偏好失敗", error);
        return fallback;
    }
}

function writeTaskPreference(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn("儲存任務中心偏好失敗", error);
    }
}

function taskStatusFilter(value: string | null): TaskStatusFilter {
    return value === "failed" || value === "active" || value === "succeeded" ? value : "all";
}

export default function TasksPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const projects = useCanvasStore((state) => state.projects);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const capabilities = workspaceCapabilities();
    const localMode = capabilities.local;
    const [form] = Form.useForm<CreateTaskInput & { operation: string }>();
    const { view: viewPreferenceKey, group: groupPreferenceKey } = preferenceKeys();
    const [domainProjects, setDomainProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [actingId, setActingId] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const statusFilter = taskStatusFilter(searchParams.get("status"));
    const setStatusFilter = (value: TaskStatusFilter) => {
        const next = new URLSearchParams(searchParams);
        next.set("status", value);
        setSearchParams(next, { replace: true });
    };
    const [keyword, setKeyword] = useState("");
    const [projectFilter, setProjectFilter] = useState("all");
    const [kindFilter, setKindFilter] = useState<TaskKindFilter>("all");
    const [modelFilter, setModelFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [viewMode, setViewMode] = useState<TaskViewMode>(() => (readTaskPreference(viewPreferenceKey, "list") === "grid" ? "grid" : "list"));
    const [groupEnabled, setGroupEnabled] = useState<boolean>(() => readTaskPreference(groupPreferenceKey, "0") === "1");
    const [retryingGroup, setRetryingGroup] = useState("");
    const [detailTask, setDetailTask] = useState<GenerationTask | null>(null);
    const detailRequestRef = useRef(0);
    useEffect(() => () => { detailRequestRef.current += 1; }, []);
    const [detailLoading, setDetailLoading] = useState(false);
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [detailIncomplete, setDetailIncomplete] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ url: string; kind: "image" | "video"; title: string } | null>(null);
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [tasksIncomplete, setTasksIncomplete] = useState(false);
    const backendTasksRef = useRef<GenerationTask[]>([]);
    const syncedCanvasTaskIdsRef = useRef(new Set<string>());
    const tasksRef = useRef<GenerationTask[]>([]);
    const canvasById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const domainProjectNameById = useMemo(() => new Map(domainProjects.map((item) => [item.project.id, item.project.name])), [domainProjects]);
    const projectOptions = useMemo(() => projects.map((project) => {
        const projectName = project.projectId ? domainProjectNameById.get(project.projectId) : "";
        return { label: projectName ? `${project.title || "未命名畫布"} · ${projectName}` : project.title || "未命名畫布", value: project.id };
    }), [domainProjectNameById, projects]);
    const modelOptions = useMemo(() => Array.from(new Set(tasks.map((task) => formatModelName(effectiveConfig, task)).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")), [effectiveConfig, tasks]);
    const filteredTasks = useMemo(() => tasks.filter((task) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return task.status === "queued" || task.status === "running";
        if (statusFilter === "failed") return task.status === "failed" || task.status === "cancelled";
        if (statusFilter === "succeeded") return task.status === "succeeded";
        return false;
    }).filter((task) => {
        if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
        if (kindFilter !== "all" && taskMediaKind(task) !== kindFilter) return false;
        if (modelFilter !== "all" && formatModelName(effectiveConfig, task) !== modelFilter) return false;
        const query = keyword.trim().toLowerCase();
        const context = getTaskCanvasContext(task, canvasById, domainProjectNameById);
        return !query || `${task.prompt} ${task.model || ""} ${formatTaskKind(task)} ${context.canvasName} ${context.projectName}`.toLowerCase().includes(query);
    }), [canvasById, domainProjectNameById, effectiveConfig, keyword, kindFilter, modelFilter, projectFilter, statusFilter, tasks]);
    const visibleTasks = useMemo(() => filteredTasks.slice((page - 1) * pageSize, page * pageSize), [filteredTasks, page, pageSize]);
    const taskStats = useMemo(() => {
        let today = 0;
        let active = 0;
        let succeeded = 0;
        let failed = 0;
        const now = new Date();
        for (const task of tasks) {
            if (task.createdAt) {
                const created = new Date(task.createdAt);
                if (!Number.isNaN(created.getTime()) && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate()) today += 1;
            }
            if (task.status === "queued" || task.status === "running") active += 1;
            else if (task.status === "succeeded") succeeded += 1;
            else if (task.status === "failed" || task.status === "cancelled") failed += 1;
        }
        return { total: tasks.length, today, active, succeeded, failed };
    }, [tasks]);
    const groupingActive = viewMode === "list" && groupEnabled;
    const visibleTaskGroups = useMemo(
        () => (groupingActive ? groupTasksByCanvas(filteredTasks, canvasById, domainProjectNameById) : []),
        [canvasById, domainProjectNameById, filteredTasks, groupingActive],
    );

    const changeViewMode = (mode: TaskViewMode) => {
        setViewMode(mode);
        writeTaskPreference(viewPreferenceKey, mode);
    };

    const changeGroupEnabled = (enabled: boolean) => {
        setGroupEnabled(enabled);
        writeTaskPreference(groupPreferenceKey, enabled ? "1" : "0");
    };

    const retryGroupTasks = async (key: string, items: GenerationTask[]) => {
        const retryable = items.filter((task) => isTaskFailed(task) && !taskRetryBlocked(task));
        if (!retryable.length) return;
        setRetryingGroup(key);
        try {
            for (const task of retryable) {
                await runAction(task.id);
            }
        } finally {
            setRetryingGroup("");
        }
    };

    const renderTaskRow = (task: GenerationTask) => (
        <TaskListRow
            key={task.id}
            task={task}
            canvasById={canvasById}
            projectNameById={domainProjectNameById}
            effectiveConfig={effectiveConfig}
            actingId={actingId}
            onOpen={() => void openTaskDetail(task)}
            onRetry={() => void runAction(task.id)}
            onPreview={() => task.previewUrl && setMediaPreview({ url: task.previewUrl, kind: task.previewKind === "video" ? "video" : "image", title: task.prompt || formatTaskKind(task) })}
        />
    );

    const renderTaskGridCard = (task: GenerationTask) => (
        <TaskGridCard
            key={task.id}
            task={task}
            actingId={actingId}
            onOpen={() => void openTaskDetail(task)}
            onRetry={() => void runAction(task.id)}
        />
    );

    useEffect(() => {
        if (localMode) {
            setDomainProjects([]);
            return;
        }
        if (!shortDramaEnabled) {
            setDomainProjects([]);
            return;
        }
        let cancelled = false;
        void listProjects()
            .then((result) => {
                if (!cancelled) setDomainProjects(result.projects);
            })
            .catch((error) => {
                if (cancelled) return;
                // 領域專案只是任務頁的輔助篩選資料；讀取失敗不能阻斷任務列表，但必須清空舊快照並留下可檢索的診斷。
                setDomainProjects([]);
                console.warn("載入任務關聯專案失敗，已停用本次專案篩選", error);
            });
        return () => {
            cancelled = true;
        };
    }, [localMode, shortDramaEnabled]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
        if (page > maxPage) setPage(maxPage);
    }, [filteredTasks.length, page, pageSize]);

    const syncCompletedCanvasTasks = useCallback(async (items: GenerationTask[]) => {
        const pendingTaskIds = new Set(
            useCanvasStore
                .getState()
                .projects.flatMap((project) => project.nodes)
                .filter((node) => node.metadata?.taskId && (node.metadata.status !== "success" || !node.metadata.content))
                .map((node) => node.metadata!.taskId!),
        );
        const candidates = items.filter((task) => task.status === "succeeded" && pendingTaskIds.has(task.id) && task.projectId && task.type.startsWith("canvas_") && !syncedCanvasTaskIdsRef.current.has(task.id));
        await Promise.all(
            candidates.map(async (task) => {
                syncedCanvasTaskIdsRef.current.add(task.id);
                try {
                    const detail = task.resultJson ? task : await queryGenerationTask(task.id);
                    await syncGenerationTaskToCanvasStore(detail);
                } catch {
                    syncedCanvasTaskIdsRef.current.delete(task.id);
                }
            }),
        );
    }, []);

    const loadTasks = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const result = await discoverBackendTasks(listGenerationTasks, backendTasksRef.current);
            backendTasksRef.current = result.tasks;
            const next = mergeTaskHistory(localMode ? localTaskHistoryFromProjects(useCanvasStore.getState().projects) : [], result.tasks);
            setTasks(next);
            setTasksIncomplete(result.incomplete);
            if (!result.incomplete) void syncCompletedCanvasTasks(result.tasks);
            return next;
        } catch (error) {
            setTasksIncomplete(true);
            if (showLoading) message.error(error instanceof Error ? error.message : "任務載入失敗");
            return undefined;
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [localMode, message, syncCompletedCanvasTasks]);

    const openTaskDetail = useCallback(
        async (task: GenerationTask) => {
            const request = ++detailRequestRef.current;
            setDetailTask(task);
            setTaskLogs([]);
            setDetailIncomplete(false);
            if (task.id.startsWith("local:")) {
                setDetailLoading(false);
                setLogsLoading(false);
                return;
            }
            setDetailLoading(true);
            setLogsLoading(true);
            try {
                const [detail, logs] = await Promise.allSettled([queryGenerationTask(task.id), listTaskLogs(task.id)]);
                if (request !== detailRequestRef.current) return;
                if (detail.status === "fulfilled") setDetailTask(detail.value);
                if (logs.status === "fulfilled") setTaskLogs(logs.value);
                setDetailIncomplete(detail.status === "rejected" || logs.status === "rejected");
            } finally {
                if (request === detailRequestRef.current) {
                    setDetailLoading(false);
                    setLogsLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        const poll = async (initial = false) => {
            const next = await loadTasks(initial);
            if (stopped) return;
            const items = next || tasksRef.current;
            const hasActiveTasks = items.some((task) => task.status === "queued" || task.status === "running");
            timer = window.setTimeout(() => void poll(false), document.hidden ? 60_000 : hasActiveTasks ? 10_000 : 60_000);
        };
        const handleVisibility = () => {
            if (document.hidden) return;
            window.clearTimeout(timer);
            void poll(false);
        };
        void poll(true);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [loadTasks]);

    const runAction = async (id: string) => {
        if (localMode) {
            message.info("本地歷史記錄不能在任務中心重試，請回到對應畫布重新生成");
            return;
        }
        const currentTask = tasksRef.current.find((task) => task.id === id);
        if (currentTask && taskRetryBlocked(currentTask)) {
            message.warning("請先檢視失敗原因，不要立即重新提交");
            return;
        }
        setActingId(id);
        try {
            // List summaries intentionally omit inputJson. Read the sanitized
            // detail before any paid retry rather than treating absent input as consent.
            const detail = await queryGenerationTask(id);
            if (taskRetryBlocked(detail)) {
                message.warning("請先檢視失敗原因，不要立即重新提交");
                return;
            }
            const portraitError = portraitTaskRetryError(detail.inputJson, detail.model);
            if (portraitError) throw new Error(portraitError);
            const warning = seedanceTaskRetryWarning(detail.inputJson, detail.model);
            if (warning && !(await new Promise<boolean>((resolve) => {
                modal.confirm({ ...warning, centered: true, onOk: () => resolve(true), onCancel: () => resolve(false), afterClose: () => resolve(false) });
            }))) return;
            const next = await retryGenerationTask(id);
            setTasks((items) => items.map((item) => (item.id === id ? next : item)));
            setDetailTask((current) => (current?.id === id ? { ...current, ...next } : current));
            setStatusFilter("active");
            setPage(1);
            message.success("任務已重新入隊");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失敗");
        } finally {
            setActingId("");
        }
    };

    const queryProviderTask = async (task: GenerationTask) => {
        const request = detailRequestRef.current;
        setActingId(task.id);
        try {
            const result = await queryFailedVideoProviderTask(task.id);
            if (!result.recovered) {
                const logs = await listTaskLogs(task.id);
                if (request === detailRequestRef.current) {
                    setTaskLogs(logs);
                    message.info("原任務仍在處理中，請稍後再取回結果");
                }
                return;
            }
            if (request === detailRequestRef.current) setDetailTask(result.task);
            setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...result.task } : item)));
            await syncGenerationTaskToCanvasStore(result.task);
            const logs = await listTaskLogs(task.id).catch(() => undefined);
            if (logs && request === detailRequestRef.current) setTaskLogs(logs);
            if (!localMode) window.dispatchEvent(new CustomEvent("wallet:updated"));
            void loadTasks(false);
            if (request === detailRequestRef.current) message.success("影片已取回，未重新生成");
        } catch (error) {
            if (request === detailRequestRef.current) message.error(error instanceof Error ? error.message : "查詢上游任務失敗");
        } finally {
            setActingId("");
        }
    };

    const submitTask = async () => {
        if (localMode) {
            setCreateOpen(false);
            navigate("/create");
            return;
        }
        const values = await form.validateFields();
        setCreating(true);
        try {
            {
                const videoModel = values.model?.trim() || effectiveConfig.videoModel || effectiveConfig.model;
                if (values.operation !== "compare_versions" && !isAiConfigReady(effectiveConfig, videoModel)) {
                    message.error("請先在設定裡配置可用的影片模型、Base URL 和 API Key");
                    return;
                }
                const requestConfig = resolveModelRequestConfig(effectiveConfig, videoModel);
                const task = await createGenerationTask({
                    projectId: values.projectId,
                    type: `video_${values.operation}`,
                    operation: values.operation,
                    prompt: values.prompt,
                    provider: values.operation === "compare_versions" ? "internal-agent" : "openai-compatible",
                    model: values.operation === "compare_versions" ? "version-router" : requestConfig.model,
					...(values.operation !== "compare_versions" && logicalModelIDForConfig(requestConfig) ? { logicalModelId: logicalModelIDForConfig(requestConfig) } : {}),
                    input: {
                        source: "tasks-page",
                        mode: values.operation === "compare_versions" ? "workflow" : "video",
                        prompt: buildVideoOperationPrompt(values.operation, values.prompt, operationOptions.find((item) => item.value === values.operation)?.label || "其他影片操作"),
                        config: values.operation === "compare_versions" ? undefined : backendProviderConfig(requestConfig),
                        metadata: { videoEditOperation: values.operation },
                    },
                });
                setTasks((items) => [task, ...items]);
            }
            setStatusFilter("active");
            setPage(1);
            setCreateOpen(false);
            form.resetFields();
            message.success("任務已建立");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任務建立失敗");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <WorkspacePage grid className="library-page task-library-page">
                <div className="studio-band">
                    <PageHeader
                        title="創作歷史"
                        description="檢視文本、圖片和影片生成任務，跟蹤進度並處理失敗任務。"
                        meta={<span className="app-projects-header-meta">{taskStats.total} 個任務</span>}
                        actions={
                            <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => localMode ? navigate("/create") : setCreateOpen(true)}>
                                {localMode ? "開始創作" : "新建任務"}
                            </Button>
                        }
                    />
                    <CollectionToolbar
                        active={Boolean(keyword || projectFilter !== "all" || kindFilter !== "all" || modelFilter !== "all" || statusFilter !== "all")}
                        onReset={() => { setKeyword(""); setProjectFilter("all"); setKindFilter("all"); setModelFilter("all"); setStatusFilter("all"); setPage(1); }}
                        trailing={(
                            <div className="flex flex-wrap items-center gap-2.5">
                                {viewMode === "list" ? (
                                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground/55">
                                        <Switch size="sm" checked={groupEnabled} onChange={changeGroupEnabled} />
                                        <span>按畫布分組</span>
                                    </label>
                                ) : null}
                                <div className="task-view-switch">
                                    <SegmentedControl<TaskViewMode>
                                        ariaLabel="任務檢視"
                                        size="sm"
                                        value={viewMode}
                                        options={[
                                            { value: "list", icon: <List className="size-3.5" />, title: "列表檢視" },
                                            { value: "grid", icon: <LayoutGrid className="size-3.5" />, title: "網格檢視" },
                                        ]}
                                        onChange={changeViewMode}
                                    />
                                </div>
                            </div>
                        )}
                    >
                        <TaskStatusFilterBar stats={taskStats} value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(1); }} />
                        <Input id="task-search" name="taskSearch" allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder="搜尋任務、模型或畫布" onChange={(event) => { setKeyword(event.target.value); setPage(1); }} />
                        <Select className="w-full sm:w-48" value={projectFilter} onChange={(value) => { setProjectFilter(value); setPage(1); }} options={[{ label: "全部畫布", value: "all" }, ...projectOptions]} />
                        <Select className="w-full sm:w-32" value={kindFilter} onChange={(value) => { setKindFilter(value as TaskKindFilter); setPage(1); }} options={[{ label: "全部型別", value: "all" }, { label: "文本", value: "text" }, { label: "圖片", value: "image" }, { label: "影片", value: "video" }]} />
                        <Select className="w-full sm:w-44" value={modelFilter} onChange={(value) => { setModelFilter(value); setPage(1); }} options={[{ label: "全部模型", value: "all" }, ...modelOptions.map((model) => ({ label: model, value: model }))]} />
                    </CollectionToolbar>
                </div>

                <div className="collection-content task-collection-content">
                    <Typography.Paragraph type="secondary">顯示最近 100 條任務、最多 100 條進行中任務及當前畫布歷史。</Typography.Paragraph>
                    {tasksIncomplete ? <Alert type="warning" showIcon title="任務狀態未完整同步" description="部分任務查詢失敗。當前顯示的任務數量與狀態可能不完整，請重新整理重試。" /> : null}
                    {loading && !tasks.length ? <div className="library-loading-grid" aria-label="正在載入任務">{Array.from({ length: 8 }, (_, index) => <div key={index} className="library-skeleton" />)}</div> : null}
                    {!loading || tasks.length ? (
                        visibleTasks.length ? (
                            viewMode === "grid" ? (
                                <div className="task-grid-view">
                                    {visibleTasks.map(renderTaskGridCard)}
                                </div>
                            ) : groupingActive ? (
                                <div className="task-group-list">
                                    {visibleTaskGroups.map((group) => (
                                        <section key={group.key} className="task-group">
                                            <TaskGroupHeader group={group} retrying={retryingGroup === group.key} onRetryFailed={() => void retryGroupTasks(group.key, group.tasks)} />
                                            <div className="task-record-list">
                                                {group.tasks.map(renderTaskRow)}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : (
                                <div className="task-record-list">{visibleTasks.map(renderTaskRow)}</div>
                            )
                        ) : (
                            <WorkspaceState
                                compact
                                title={tasksIncomplete ? "暫時無法確認任務狀態" : taskEmptyState(statusFilter).title}
                                description={tasksIncomplete ? "任務查詢失敗，暫時沒有可顯示的記錄。請重新整理重試。" : taskEmptyState(statusFilter).description}
                                action={<Button className="library-primary-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => localMode ? navigate("/create") : setCreateOpen(true)}>{localMode ? "開始創作" : "新建任務"}</Button>}
                            />
                        )
                    ) : null}
                    {!groupingActive ? <PaginationBar current={page} pageSize={pageSize} total={filteredTasks.length} pageSizeOptions={[20, 50, 100]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} /> : null}
                </div>
            </WorkspacePage>
            <Modal className="library-modal" title="新建非同步生成任務" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={submitTask} confirmLoading={creating} okText="建立任務">
                <Form form={form} layout="vertical" initialValues={{ operation: "text_to_video" }}>
                    <Form.Item name="operation" label="任務型別" rules={[{ required: true, message: "請選擇任務型別" }]}>
                        <Select options={operationOptions} />
                    </Form.Item>
                    <Form.Item name="prompt" label="創作指令" rules={[{ required: true, message: "請輸入創作指令" }]}>
                        <Input.TextArea rows={5} placeholder="描述短劇、MV、TVC 或要執行的影片編輯操作" />
                    </Form.Item>
                    <Form.Item name="projectId" label="繫結畫布">
                        <Select allowClear showSearch optionFilterProp="label" options={projectOptions} placeholder={projectOptions.length ? "可選，選擇要繫結的畫布" : "暫無本地畫布"} />
                    </Form.Item>
                    <Form.Item name="model" label="目標模型">
                        <Input placeholder="可選，例如 seedance、kling、wan、nano-banana" />
                    </Form.Item>
                </Form>
            </Modal>
            <Drawer className="library-drawer" title="任務詳情" open={Boolean(detailTask)} onClose={() => { detailRequestRef.current += 1; setDetailTask(null); }} size="large" destroyOnHidden>
                {detailTask ? (
                    <div className="space-y-5">
                        {detailIncomplete ? <Alert type="warning" showIcon title="部分詳情或日誌讀取失敗" description="保留已讀取的記錄，當前狀態可能未更新。請關閉詳情後重新開啟重試。" /> : null}
                        <div className="task-detail-facts grid text-sm sm:grid-cols-2">
                            <InfoItem label="狀態" value={statusLabel[detailTask.status]} />
                            <InfoItem label="畫布名稱" value={getTaskCanvasContext(detailTask, canvasById, domainProjectNameById).canvasName} />
                            <InfoItem label="任務型別" value={formatTaskKind(detailTask)} />
                            <InfoItem label="模型" value={formatModelName(effectiveConfig, detailTask)} />
                            <InfoItem label="嘗試次數" value={`第 ${detailTask.attempts || 1} 次`} />
                            <InfoItem label="建立時間" value={formatDate(detailTask.createdAt)} />
                            <InfoItem label="開始時間" value={formatDate(detailTask.startedAt)} />
                            <InfoItem label="完成時間" value={formatDate(detailTask.completedAt)} />
                            <InfoItem label="耗時" value={formatTaskDuration(detailTask)} />
                            {detailTask.providerCancelStatus ? <InfoItem label="上游取消" value={providerCancelStatusLabel(detailTask)} /> : null}
                            {detailTask.providerCancelRequestedAt ? <InfoItem label="請求取消時間" value={formatDate(detailTask.providerCancelRequestedAt)} /> : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            {canQueryProviderTask(detailTask) ? <Button icon={<RefreshCw className="size-4" />} loading={actingId === detailTask.id} onClick={() => void queryProviderTask(detailTask)}>取回結果</Button> : null}
                            {isTaskFailed(detailTask) ? <Button icon={<Bug className="size-4" />} onClick={() => navigate(`/settings?section=diagnostics&taskId=${encodeURIComponent(detailTask.id)}${detailTask.projectId ? `&projectId=${encodeURIComponent(detailTask.projectId)}` : ""}`)}>匯出診斷包</Button> : null}
                        </div>
                        {detailTask.error || isTaskFailed(detailTask) ? (
                            <GenerationFailureNotice
                                explanation={explainGenerationError({ code: detailTask.errorCode, message: detailTask.error }, { taskId: detailTask.id, providerRequestId: detailTask.providerRequestId, model: detailTask.model, createdAt: detailTask.createdAt, stage: detailTask.stage })}
                                context={{ taskId: detailTask.id, providerRequestId: detailTask.providerRequestId, model: detailTask.model, createdAt: detailTask.createdAt, stage: detailTask.stage, failureDiagnostics: detailTask.failureDiagnostics, completedAt: detailTask.completedAt, updatedAt: detailTask.updatedAt }}
                            />
                        ) : null}
                        <TaskResultMedia value={detailTask.resultJson} taskType={detailTask.type} />
                        <DetailBlock title="提示詞" value={detailLoading ? "詳情載入中..." : detailTask.prompt || "無"} tall />
                        <TaskParameters inputJson={detailLoading ? undefined : detailTask.inputJson} />
                        <DetailBlock title="結果" value={detailLoading ? "詳情載入中..." : formatTaskJson(detailTask.resultJson)} />
                        <div>
                            <Typography.Text strong>日誌</Typography.Text>
                            <div className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                                {logsLoading ? "日誌載入中..." : taskLogs.length ? taskLogs.map((log) => `[${new Date(log.createdAt).toLocaleString()}] ${log.level.toUpperCase()} ${formatTaskLog(log)}`).join("\n\n") : detailIncomplete ? "日誌未完整讀取" : "暫無日誌"}
                            </div>
                        </div>
                    </div>
                ) : null}
            </Drawer>
            <Modal
                title={<span className="block truncate pr-8">{mediaPreview?.title || "生成結果預覽"}</span>}
                open={Boolean(mediaPreview)}
                onCancel={() => setMediaPreview(null)}
                footer={null}
                centered
                width="min(1040px, calc(100vw - 32px))"
                destroyOnHidden
                className="library-modal task-media-preview-modal"
            >
                {mediaPreview ? (
                    <MediaPreview
                        src={mediaPreview.url}
                        kind={mediaPreview.kind}
                        alt={mediaPreview.title}
                        controls={mediaPreview.kind === "video"}
                        className="max-h-[76vh] w-full bg-black object-contain"
                        fallbackClassName="task-media-preview-unavailable"
                    />
                ) : null}
            </Modal>
        </>
    );
}

function canQueryProviderTask(task: GenerationTask) {
    return task.status === "failed" && (task.type.startsWith("canvas_video") || task.type.startsWith("video_")) && Boolean(task.providerRequestId);
}

function TaskResultMedia({ value, taskType }: { value?: string; taskType: string }) {
    const urls = resultMediaUrls(value);
    if (!urls.length) return null;
    return (
        <div>
            <Typography.Text strong>生成結果</Typography.Text>
            <div className="mt-2 grid max-h-[360px] grid-cols-2 gap-2 overflow-auto rounded-lg bg-stone-950 p-2 md:grid-cols-3">
                {urls.map((url, index) => {
                    const isVideo = isVideoResult(url, taskType);
                    return (
                        <MediaPreview
                            key={`${url}-${index}`}
                            src={url}
                            kind={isVideo ? "video" : "image"}
                            alt={`生成結果 ${index + 1}`}
                            controls={isVideo}
                            className={isVideo ? "task-result-media is-video" : "task-result-media"}
                            fallbackClassName={isVideo ? "task-result-media is-video" : "task-result-media"}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function resultMediaUrls(value?: string) {
    if (!value) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        parsed = value;
    }
    const urls: string[] = [];
    const visit = (item: unknown, key = "") => {
        if (typeof item === "string") {
            const isInlineMedia = /^(data:image\/|data:video\/)/.test(item);
            const isMediaPath = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)(?:$|\?)/i.test(item);
            const isNamedMediaUrl = /^(https?:|blob:)/.test(item) && /(url|image|video|result|output|media)/i.test(key);
            if ((isInlineMedia || isMediaPath || isNamedMediaUrl) && !urls.includes(item)) urls.push(item);
            return;
        }
        if (Array.isArray(item)) return item.forEach((value) => visit(value, key));
        if (item && typeof item === "object") Object.entries(item).forEach(([field, value]) => visit(value, field));
    };
    visit(parsed);
    return urls.slice(0, 12);
}

function isVideoResult(value: string, taskType: string) {
    return value.startsWith("data:video/") || /\.(mp4|webm|mov)(?:$|\?)/i.test(value) || taskType.includes("video");
}

function groupTasksByCanvas(tasks: GenerationTask[], canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>): TaskGroup[] {
    const groups: TaskGroup[] = [];
    const byKey = new Map<string, TaskGroup>();
    for (const task of tasks) {
        const context = getTaskCanvasContext(task, canvasById, projectNameById);
        const key = `${context.projectName}\u0000${context.canvasName}`;
        let group = byKey.get(key);
        if (!group) {
            group = { key, title: context.canvasName, projectName: context.projectName, tasks: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.tasks.push(task);
    }
    return groups;
}

function taskEmptyState(status: TaskStatusFilter) {
    if (status === "all") return { title: "還沒有任務", description: "新提交的生成會在這裡顯示狀態和即時進度。" };
    if (status === "active") return { title: "沒有執行中的任務", description: "新提交的生成會在這裡顯示排隊狀態和即時進度。" };
    if (status === "succeeded") return { title: "還沒有已完成任務", description: "生成成功後，結果預覽和執行記錄會保留在這裡。" };
    return { title: "沒有失敗或取消的任務", description: "失敗或取消的生成會出現在這裡，並提供原因和可用操作。" };
}

function formatDate(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatTaskDuration(task: GenerationTask) {
    if (!task.createdAt) return "-";
    const start = new Date(task.startedAt || task.createdAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : task.status === "queued" || task.status === "running" ? Date.now() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}分 ${seconds}秒` : `${seconds}秒`;
}

function InfoItem({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
    return (
        <div className="task-detail-fact min-w-0 px-3 py-2.5">
            <Typography.Text type="secondary" className="block text-xs">
                {label}
            </Typography.Text>
            <Typography.Text className={`block text-sm ${wrap ? "whitespace-pre-wrap break-words" : "truncate"}`} title={value}>
                {value}
            </Typography.Text>
        </div>
    );
}

function DetailBlock({ title, value, tall = false }: { title: string; value: string; tall?: boolean }) {
    return (
        <div>
            <Typography.Text strong>{title}</Typography.Text>
            <pre className={`mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100 ${tall ? "h-40 whitespace-pre-wrap break-words" : "max-h-60"}`}>{value}</pre>
        </div>
    );
}

function TaskParameters({ inputJson }: { inputJson?: string }) {
    const fields = taskParameterFields(inputJson);
    return (
        <div>
            <Typography.Text strong>引數</Typography.Text>
            {fields.length ? (
                <div className="task-detail-facts mt-2 grid text-sm sm:grid-cols-2">
                    {fields.map((field) => <InfoItem key={field.label} label={field.label} value={field.value} wrap />)}
                </div>
            ) : (
                <div className="mt-2 rounded-md bg-foreground/[.04] px-3 py-3 text-sm text-foreground/50">暫無引數記錄</div>
            )}
        </div>
    );
}

function taskParameterFields(inputJson?: string) {
    const input = parseTaskInput(inputJson);
    if (!input) return [];
    const config = asRecord(input.config);
    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => {
        const text = formatParameterValue(value);
        if (text) fields.push({ label, value: text });
    };

    add("模式", input.mode);
    add("尺寸 / 比例", config.size);
    add("解析度", config.vquality || config.quality);
    add("時長", config.videoSeconds === undefined ? undefined : `${config.videoSeconds} 秒`);
    add("生成數量", config.count);
    add("生成聲音", booleanParameter(config.videoGenerateAudio));
    add("水印", booleanParameter(config.videoWatermark));
    add("音色", config.audioVoice);
    add("音訊格式", config.audioFormat);
    add("音訊速度", config.audioSpeed);

    add("參考圖片", formatReferenceList(input.referenceImages, "圖片"));
    add("參考影片", formatReferenceList(input.referenceVideos, "影片"));
    add("參考音訊", formatReferenceList(input.referenceAudios, "音訊"));
    add("遮罩圖片", formatReferenceList(input.mask ? [input.mask] : [], "遮罩"));
    return fields;
}

function parseTaskInput(value?: string): Record<string, unknown> | null {
    if (!value) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return asRecord(parsed);
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatParameterValue(value: unknown) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function booleanParameter(value: unknown) {
    if (value === true || value === "true") return "是";
    if (value === false || value === "false") return "否";
    return undefined;
}

function formatReferenceList(value: unknown, kind: string) {
    if (!Array.isArray(value) || !value.length) return "無";
    return value.map((item, index) => {
        const reference = asRecord(item);
        const name = typeof reference.name === "string" && reference.name.trim() && !/^https?:|^data:|^blob:/i.test(reference.name) ? reference.name.trim() : `${kind}${index + 1}`;
        const dimensions = typeof reference.width === "number" && typeof reference.height === "number" ? `${reference.width}×${reference.height}` : "";
        const duration = typeof reference.durationMs === "number" && reference.durationMs > 0 ? `${Math.round(reference.durationMs / 100) / 10}s` : "";
        const details = [dimensions, duration].filter(Boolean).join("，");
        return details ? `${name}（${details}）` : name;
    }).join("、");
}

function formatTaskJson(value?: string) {
    if (!value) return "無";
    try {
        return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
        return value;
    }
}
