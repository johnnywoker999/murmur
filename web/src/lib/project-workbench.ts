import type { ProjectDetail, ProjectSummary, ProjectUnit } from "@/services/api/projects";

export type ProjectActionTone = "default" | "attention" | "danger";

export type ProjectWorkbenchAction = {
    id: string;
    title: string;
    description: string;
    href: string;
    actionLabel: string;
    tone: ProjectActionTone;
};

export type ProjectContinueTarget = {
    href: string;
    title: string;
    context: string;
    updatedAt: string;
};

export type ProjectStageCell = {
    label: string;
    state: "idle" | "active" | "attention" | "completed";
};

export type ProjectUnitStage = {
    unit: ProjectUnit;
    content: ProjectStageCell;
    assets: ProjectStageCell;
    storyboard: ProjectStageCell;
    canvas: ProjectStageCell;
};

export function projectSummaryCompletion(summary: ProjectSummary) {
    return summary.unitCount ? Math.round((summary.completedUnitCount / summary.unitCount) * 100) : 0;
}

export function projectSummaryStage(summary: ProjectSummary) {
    if (summary.project.status === "archived") return { label: "已歸檔", detail: "可在專案設定中恢復" };
    if (!summary.unitCount) return { label: "準備故事", detail: "還沒有劇情章節" };
    if (summary.completedUnitCount === summary.unitCount) return { label: "章節已完成", detail: "可繼續檢查鏡頭與交付結果" };
    if (!summary.canvasCount) return { label: "組織章節", detail: "下一步可建立專案畫布" };
    if (!summary.assetCount) return { label: "準備資產", detail: "補充角色、場景或畫風" };
    return { label: "製作中", detail: `${summary.completedUnitCount}/${summary.unitCount} 章已完成` };
}

export function projectDetailStage(detail: ProjectDetail) {
    if (detail.project.status === "archived") return { label: "已歸檔", detail: "恢復專案後可繼續製作" };
    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed").length;
    if (failedSteps) return { label: "需要處理", detail: `${failedSteps} 個流程步驟失敗` };
    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation").length;
    if (pendingCandidates) return { label: "資產確認", detail: `${pendingCandidates} 個候選待確認` };
    if (!detail.units.length) return { label: "準備故事", detail: "新增或匯入劇情章節" };
    if (!detail.shots.length) return { label: "分鏡準備", detail: "選擇章節生成鏡頭" };
    const runningSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "running" || step.status === "review").length;
    if (runningSteps) return { label: "製作中", detail: `${runningSteps} 個流程步驟正在推進` };
    const completedUnits = detail.units.filter((unit) => unit.status === "completed").length;
    if (completedUnits === detail.units.length) return { label: "檢查交付", detail: "章節已完成，可檢查鏡頭與結果" };
    return { label: "鏡頭製作", detail: `${detail.shots.length} 個鏡頭已建立` };
}

export function projectAttentionCount(detail: ProjectDetail) {
    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation").length;
    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed").length;
    return pendingCandidates + failedSteps;
}

export function projectContinueTarget(detail: ProjectDetail): ProjectContinueTarget {
    const latestCanvas = [...detail.canvases].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const latestUnit = [...detail.units].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (latestCanvas && (!latestUnit || latestCanvas.updatedAt >= latestUnit.updatedAt)) {
        return {
            href: `/canvas/${latestCanvas.id}`,
            title: latestCanvas.title,
            context: "繼續編輯專案畫布",
            updatedAt: latestCanvas.updatedAt,
        };
    }
    if (latestUnit) {
        return {
            href: `/projects/${detail.project.id}/chapters/${latestUnit.id}`,
            title: latestUnit.title,
            context: "繼續處理劇情章節",
            updatedAt: latestUnit.updatedAt,
        };
    }
    return {
        href: `/projects/${detail.project.id}/chapters`,
        title: detail.project.name,
        context: "從劇情章節開始",
        updatedAt: detail.project.updatedAt,
    };
}

// 專案概覽必須把真實阻塞轉成動作；沒有事實依據時只提示通用的製作下一步。
export function projectNextActions(detail: ProjectDetail, limit = 4): ProjectWorkbenchAction[] {
    const actions: ProjectWorkbenchAction[] = [];
    const projectRoot = `/projects/${detail.project.id}`;
    if (detail.project.status === "archived") {
        return [{
            id: "restore-project",
            title: "專案已歸檔",
            description: "恢復後才能建立畫布和提交生成任務。",
            href: `${projectRoot}/settings`,
            actionLabel: "前往恢復",
            tone: "attention",
        }];
    }

    const failedSteps = detail.workflows.flatMap((workflow) => workflow.steps).filter((step) => step.status === "failed");
    if (failedSteps.length) {
        actions.push({
            id: "failed-steps",
            title: `處理 ${failedSteps.length} 個失敗步驟`,
            description: failedSteps[0].error?.trim() || "檢視失敗原因和輸入後，僅重試受影響的任務。",
            href: "/tasks?status=failed",
            actionLabel: "檢視失敗任務",
            tone: "danger",
        });
    }

    const pendingCandidates = detail.assetCandidates.filter((candidate) => candidate.status === "pending_confirmation");
    if (pendingCandidates.length) {
        const categories = new Set(pendingCandidates.map((candidate) => candidate.category));
        actions.push({
            id: "pending-assets",
            title: `確認 ${pendingCandidates.length} 個資產候選`,
            description: `${categories.size} 類角色、場景或製作資產需要確認後才能穩定複用。`,
            href: `${projectRoot}/assets`,
            actionLabel: "去確認",
            tone: "attention",
        });
    }

    if (!detail.units.length) {
        actions.push({
            id: "add-story",
            title: "新增第一個劇情章節",
            description: "匯入小說、貼上文本，或從空白章節開始。",
            href: `${projectRoot}/chapters`,
            actionLabel: "新增章節",
            tone: "default",
        });
    } else {
        const firstDraft = [...detail.units].sort(byPosition).find((unit) => unit.status === "draft");
        if (firstDraft) {
            actions.push({
                id: `review-unit-${firstDraft.id}`,
                title: `確認第 ${firstDraft.position + 1} 章內容`,
                description: firstDraft.title,
                href: `${projectRoot}/chapters/${firstDraft.id}`,
                actionLabel: "繼續處理",
                tone: "default",
            });
        }

        const unitsWithShots = new Set(detail.shots.map((shot) => shot.unitId).filter(Boolean));
        const firstUnitWithoutShots = [...detail.units].sort(byPosition).find((unit) => unit.status !== "draft" && !unitsWithShots.has(unit.id));
        if (firstUnitWithoutShots) {
            actions.push({
                id: `storyboard-unit-${firstUnitWithoutShots.id}`,
                title: `為第 ${firstUnitWithoutShots.position + 1} 章建立分鏡`,
                description: `${firstUnitWithoutShots.title}還沒有鏡頭，可先生成分鏡草稿再逐項調整。`,
                href: `${projectRoot}/chapters/${firstUnitWithoutShots.id}`,
                actionLabel: "建立分鏡",
                tone: "default",
            });
        }
    }

    if (!detail.canvases.length && detail.units.length) {
        actions.push({
            id: "create-canvas",
            title: "建立第一張專案畫布",
            description: "把章節、分鏡和參考資產放進同一個製作空間。",
            href: `${projectRoot}/canvases`,
            actionLabel: "檢視專案畫布",
            tone: "default",
        });
    }

    if (!actions.length) {
        const target = projectContinueTarget(detail);
        actions.push({
            id: "continue-project",
            title: "繼續最近的製作內容",
            description: `${target.context}：${target.title}`,
            href: target.href,
            actionLabel: "繼續創作",
            tone: "default",
        });
    }
    return actions.slice(0, limit);
}

export function projectUnitStages(detail: ProjectDetail, limit = 8): ProjectUnitStage[] {
    const sortedUnits = [...detail.units].sort(byPosition).slice(0, limit);
    return sortedUnits.map((unit) => {
        const candidates = detail.assetCandidates.filter((candidate) => candidate.unitId === unit.id);
        const pendingCandidates = candidates.filter((candidate) => candidate.status === "pending_confirmation").length;
        const confirmedCandidates = candidates.filter((candidate) => candidate.status === "confirmed").length;
        const shots = detail.shots.filter((shot) => shot.unitId === unit.id);
        const canvasCount = new Set(detail.canvasUnitLinks.filter((link) => link.unitId === unit.id).map((link) => link.canvasId)).size;
        return {
            unit,
            content: contentStage(unit),
            assets: pendingCandidates
                ? { label: `${pendingCandidates} 待確認`, state: "attention" }
                : confirmedCandidates
                  ? { label: `${confirmedCandidates} 已確認`, state: "completed" }
                  : { label: "未識別", state: "idle" },
            storyboard: shots.length
                ? { label: `${shots.length} 鏡頭`, state: shots.every((shot) => shot.status === "completed") ? "completed" : "active" }
                : { label: "未開始", state: "idle" },
            canvas: canvasCount
                ? { label: `${canvasCount} 張`, state: "active" }
                : { label: "未關聯", state: "idle" },
        };
    });
}

function contentStage(unit: ProjectUnit): ProjectStageCell {
    if (unit.status === "completed") return { label: "已完成", state: "completed" };
    if (unit.status === "ready") return { label: "待制作", state: "active" };
    return { label: "草稿", state: "attention" };
}

function byPosition(left: ProjectUnit, right: ProjectUnit) {
    return left.position - right.position;
}
