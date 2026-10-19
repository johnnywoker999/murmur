import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { listGenerationTasks, type GenerationTask } from "@/services/api/task-center";

export function shouldEnableCanvasActiveTaskQuery(enabled: boolean, projectId: string) {
    return enabled && Boolean(projectId);
}

export function useCanvasActiveTasks(projectId: string, enabled: boolean) {
    const query = useQuery<GenerationTask[]>({
        queryKey: ["canvas-active-tasks", projectId],
        // Agent 的持久化執行仍復用任務佇列生命週期，但不應佔據畫布右上角的“生成任務”浮層。
        // 保留這頁中的全部生成任務，面板支援滾動，數量與實際任務一致。
        queryFn: () => listGenerationTasks(30, { projectId, activeOnly: true }).then((tasks) => tasks.filter((task) => !isRetiredAgentTask(task))),
        enabled: shouldEnableCanvasActiveTaskQuery(enabled, projectId),
        refetchInterval: (current) => (current.state.data?.length ? 2_000 : 10_000),
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        const handleTaskChanged = (event: Event) => {
            const task = (event as CustomEvent<{ task?: GenerationTask }>).detail?.task;
            if (task?.projectId === projectId) void query.refetch();
        };
        window.addEventListener("canvas:task-created", handleTaskChanged);
        window.addEventListener("canvas:task-cancelled", handleTaskChanged);
        window.addEventListener("canvas:task-updated", handleTaskChanged);
        return () => {
            window.removeEventListener("canvas:task-created", handleTaskChanged);
            window.removeEventListener("canvas:task-cancelled", handleTaskChanged);
            window.removeEventListener("canvas:task-updated", handleTaskChanged);
        };
    }, [projectId, query.refetch]);

    return {
        tasks: query.data || [],
        loading: query.isLoading,
        refreshing: query.isFetching,
        refetch: query.refetch,
    };
}

// 舊內建 Agent 已退場；歷史庫裡的 Agent 任務不再屬於畫布活動任務。
function isRetiredAgentTask(task: GenerationTask) {
    return task.operation?.startsWith("cloud_agent") === true;
}
