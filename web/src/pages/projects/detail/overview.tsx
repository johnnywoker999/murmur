import { ArrowRight, BookOpenText, CheckCircle2, CircleAlert, Clapperboard, Clock3, Film, PackageCheck, PlaySquare, Scissors, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { WorkspaceState } from "@/components/layout/workspace-state";
import type { ProjectStageCell, ProjectWorkbenchAction } from "@/lib/project-workbench";
import type { ProjectOverview, ProjectOverviewMetrics } from "@/services/api/projects";

import { formatTime, type ProjectDetailViewProps } from "./shared";

export default function ProjectOverviewView({ detail, overview }: ProjectDetailViewProps & { overview: ProjectOverview }) {
    const { project } = detail;
    const metrics = overview.metrics;
    const completedUnits = metrics.completedUnitCount;
    const attentionCount = metrics.pendingCandidateCount + metrics.staleArtifactCount;
    const completion = metrics.unitCount ? Math.round((completedUnits / metrics.unitCount) * 100) : 0;
    const firstUnitId = detail.units.slice().sort((left, right) => left.position - right.position)[0]?.id || overview.units[0]?.unit.id;
    const workflowHref = (targetStage: string) => firstUnitId ? `/projects/${project.id}/workflow/${firstUnitId}/${targetStage}` : `/projects/${project.id}/chapters`;
    const stage = overviewStage(metrics);
    const actions = overviewActions(project.id, metrics, firstUnitId).slice(0, 3);
    const primaryAction = actions[0];
    const secondaryActions = actions.slice(1);
    const unitStages = overview.units.map((item) => ({
        unit: item.unit,
        content: stageCell(item.unit.wordCount > 0, item.unit.wordCount > 0 ? `${formatCompactCount(item.unit.wordCount)} 字` : "待補充"),
        assets: stageCell(item.candidateCount === 0 && item.shotCount > 0, item.candidateCount ? `${item.candidateCount} 待確認` : item.shotCount ? "已確認" : "待拆分", item.candidateCount > 0),
        storyboard: stageCell(item.shotCount > 0, item.shotCount ? `${item.shotCount} 鏡` : "待生成"),
        canvas: stageCell(item.canvasCount > 0, item.canvasCount ? `${item.canvasCount} 張` : "未關聯"),
    }));
    const productionSteps = [
        { id: "story", icon: BookOpenText, label: "劇情章節", description: "匯入或編寫正文，確認每章敘事目標", metric: `${metrics.unitCount} 章 · ${formatCompactCount(metrics.totalWordCount)} 字`, href: `/projects/${project.id}/chapters`, complete: metrics.unitCount > 0 },
        { id: "assets", icon: UsersRound, label: "角色與資產", description: "確認角色、場景、道具和專案畫風", metric: `${metrics.assetCount} 項資產`, href: `/projects/${project.id}/assets`, complete: metrics.assetCount > 0 },
        { id: "storyboard", icon: Clapperboard, label: "分鏡指令碼與畫面", description: "拆分鏡頭並確認構圖、對白和時長", metric: `${metrics.shotCount} 鏡 · ${metrics.readyStoryboardCount} 張圖`, href: workflowHref("storyboard"), complete: metrics.shotCount > 0 },
        { id: "previz", icon: PlaySquare, label: "動作預演", description: "檢查表演節拍、運鏡和連續性", metric: `${metrics.readyPrevizCount}/${metrics.shotCount || 0} 鏡`, href: workflowHref("previz"), complete: metrics.shotCount > 0 && metrics.readyPrevizCount === metrics.shotCount },
        { id: "video", icon: Film, label: "鏡頭影片", description: "逐鏡生成、篩選版本並鎖定成片", metric: `${metrics.readyVideoCount}/${metrics.shotCount || 0} 鏡`, href: workflowHref("video"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
        { id: "editor", icon: Scissors, label: "剪輯成片", description: "在時間線中編排鏡頭、新增字幕並輸出成片", metric: metrics.renderSucceededCount > 0 ? `已輸出 ${metrics.renderSucceededCount} 個成片` : metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount ? "可以開始剪輯" : `還差 ${Math.max(0, metrics.shotCount - metrics.readyVideoCount)} 鏡`, href: `/projects/${project.id}/editor`, complete: metrics.renderSucceededCount > 0 },
        { id: "delivery", icon: PackageCheck, label: "交付與打包", description: "檢查缺失鏡頭並整理最終產物", metric: metrics.readyVideoCount && metrics.readyVideoCount === metrics.shotCount ? "可以交付" : `還差 ${Math.max(0, metrics.shotCount - metrics.readyVideoCount)} 鏡`, href: workflowHref("delivery"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
    ];
    const gaps = [
        metrics.unitCount === 0 ? "還沒有劇情章節" : metrics.unitsWithoutText ? `${metrics.unitsWithoutText} 章還沒有正文` : "章節正文已就緒",
        metrics.pendingCandidateCount ? `${metrics.pendingCandidateCount} 項資產等待確認` : metrics.assetCount ? "專案資產已建立" : "還沒有角色與資產",
        metrics.shotCount ? metrics.readyVideoCount === metrics.shotCount ? "所有鏡頭影片已生成" : `${metrics.shotCount - metrics.readyVideoCount} 個鏡頭尚未生成影片` : "還沒有分鏡鏡頭",
    ];

    return (
        <div className="space-y-8">
            <section className="project-overview-focus">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_308px]">
                    <div className="project-overview-primary">
                        <div className="project-overview-eyebrow">
                            <span>當前任務</span>
                            <span className="project-overview-eyebrow-divider" aria-hidden>/</span>
                            <span className="project-overview-eyebrow-stage">{stage.label}</span>
                            {attentionCount ? <span className="project-overview-eyebrow-badge">{attentionCount} 項待處理</span> : null}
                        </div>
                        <h2 className="project-overview-title">{primaryAction.title}</h2>
                        <p className="project-overview-description">{primaryAction.description}</p>
                        <div className="project-overview-cta">
                            {/* 主按鈕走 --btn-solid-* 配對色：原先是 bg-[--workspace-accent] + text-white，
                                而暗色下該 accent 是 #f5f5f5，等於白底白字。 */}
                            <Link to={primaryAction.href} className="project-overview-cta-primary">
                                <span className="truncate">{primaryAction.actionLabel}</span><ArrowRight className="size-4 shrink-0" />
                            </Link>
                            {secondaryActions[0] ? <Link to={secondaryActions[0].href} className="project-overview-cta-secondary">繼續下一步<ArrowRight className="size-3.5" /></Link> : null}
                        </div>
                    </div>

                    <aside className="project-overview-status" aria-label="專案進度">
                        <div className="project-overview-progress">
                            <div className="project-overview-progress-head">
                                <span className="project-overview-status-label">章節進度</span>
                                <span className="project-overview-progress-percent">{completion}%</span>
                            </div>
                            <div className="project-overview-progress-count">{completedUnits}<span>/ {metrics.unitCount}</span></div>
                            <div className="project-overview-progress-track" aria-label={`章節完成度 ${completion}%`}><div style={{ width: `${completion}%` }} /></div>
                        </div>
                        <dl className="project-overview-facts">
                            <ProjectFact label="當前階段" value={stage.label} />
                            <ProjectFact label="分鏡鏡頭" value={`${metrics.shotCount} 個`} />
                            <ProjectFact label="專案畫布" value={`${metrics.canvasCount} 張`} />
                            <ProjectFact label="需要處理" value={`${attentionCount} 項`} attention={attentionCount > 0} />
                        </dl>
                        {secondaryActions.length ? (
                            <div className="project-overview-next">
                                <span className="project-overview-status-label">隨後處理</span>
                                <div className="mt-2 space-y-0.5">{secondaryActions.map((action) => <SecondaryAction key={action.id} action={action} />)}</div>
                            </div>
                        ) : null}
                    </aside>
                </div>
            </section>

            <section className="project-standard-flow">
                <div className="project-standard-flow-head"><div><span>標準製作流程</span><h2>從章節到可交付鏡頭</h2><p>先確認故事與資產，再逐鏡完成畫面、動作和影片。每個步驟都可直接進入對應工作區。</p></div><Link to={primaryAction.href}>繼續當前任務<ArrowRight /></Link></div>
                <div className="project-standard-flow-track">
                    {productionSteps.map((step, index) => { const Icon = step.icon; return <Link key={step.id} to={step.href} className={step.complete ? "is-complete" : ""}><span className="project-standard-flow-index">{step.complete ? <CheckCircle2 /> : index + 1}</span><span className="project-standard-flow-icon"><Icon /></span><strong>{step.label}</strong><p>{step.description}</p><em>{step.metric}</em><ArrowRight className="project-standard-flow-arrow" /></Link>; })}
                </div>
                <div className="project-standard-flow-footer"><div><strong>當前製作檢查</strong>{gaps.map((gap, index) => <span key={gap}><i className={index === 2 && metrics.readyVideoCount !== metrics.shotCount ? "is-attention" : ""} />{gap}</span>)}</div><div><strong>快速入口</strong><Link to={`/projects/${project.id}/chapters`}>整理章節</Link><Link to={`/projects/${project.id}/assets`}>確認資產</Link><Link to={workflowHref("video")}>繼續鏡頭製作</Link></div></div>
            </section>

            <section>
                <div className="project-pipeline-head">
                    <div className="min-w-0">
                        <h2 className="project-pipeline-title">章節進度</h2>
                        <p className="project-pipeline-hint">從內容確認到專案畫布，每章只顯示當前真實狀態。</p>
                    </div>
                    <Link to={`/projects/${project.id}/chapters`} className="project-pipeline-more">檢視全部章節<ArrowRight className="size-3.5" /></Link>
                </div>

                {unitStages.length ? (
                    <div className="project-pipeline-surface">
                        {unitStages.map((item) => (
                            <Link key={item.unit.id} to={`/projects/${project.id}/chapters/${item.unit.id}`} className="project-pipeline-row group">
                                <span className="project-pipeline-chapter">
                                    <span className="project-pipeline-index">{String(item.unit.position + 1).padStart(2, "0")}</span>
                                    <span className="min-w-0"><span className="project-pipeline-chapter-title">{item.unit.title}</span><span className="project-pipeline-chapter-time">更新於 {formatTime(item.unit.updatedAt)}</span></span>
                                </span>
                                <StagePipeline content={item.content} assets={item.assets} storyboard={item.storyboard} canvas={item.canvas} />
                                <ArrowRight className="project-pipeline-arrow size-4" />
                            </Link>
                        ))}
                    </div>
                ) : <div className="project-pipeline-surface p-2"><WorkspaceState icon="projects" compact title="還沒有劇情章節" description="新增章節後，這裡會顯示內容、資產、分鏡和畫布的製作進度。" /></div>}
            </section>
        </div>
    );
}

function formatCompactCount(value: number) {
    return value >= 10_000 ? `${Math.round(value / 1_000) / 10} 萬` : value.toLocaleString("zh-CN");
}

function ProjectFact({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
    return <div className="min-w-0"><dt>{label}</dt><dd className={attention ? "is-attention" : ""}>{value}</dd></div>;
}

function SecondaryAction({ action }: { action: ProjectWorkbenchAction }) {
    const Icon = action.tone === "danger" ? CircleAlert : action.tone === "attention" ? Clock3 : CheckCircle2;
    return <Link to={action.href} className="project-overview-next-item group"><Icon className={`size-3.5 shrink-0 ${action.tone === "danger" ? "text-foreground/80" : action.tone === "attention" ? "text-foreground/60" : "text-foreground/30"}`} /><span className="min-w-0 flex-1 truncate">{action.title}</span><ArrowRight className="size-3 shrink-0 text-foreground/25 transition group-hover:text-foreground/55" /></Link>;
}

function StagePipeline({ content, assets, storyboard, canvas }: { content: ProjectStageCell; assets: ProjectStageCell; storyboard: ProjectStageCell; canvas: ProjectStageCell }) {
    const stages = [{ label: "內容", cell: content }, { label: "資產", cell: assets }, { label: "分鏡", cell: storyboard }, { label: "畫布", cell: canvas }];
    return (
        <span className="project-pipeline-stages">
            {stages.map(({ label, cell }) => <StageStep key={label} label={label} cell={cell} />)}
        </span>
    );
}

function StageStep({ label, cell }: { label: string; cell: ProjectStageCell }) {
    return (
        <span className={`project-pipeline-stage is-${cell.state}`}>
            <span className="project-pipeline-stage-label">{label}</span>
            <span className="project-pipeline-stage-track" />
            <span className="project-pipeline-stage-value">{cell.label}</span>
        </span>
    );
}

function overviewStage(metrics: ProjectOverviewMetrics) {
    if (!metrics.unitCount) return { label: "準備故事", detail: "新增或匯入劇情章節" };
    if (metrics.pendingCandidateCount) return { label: "資產確認", detail: `${metrics.pendingCandidateCount} 項待確認` };
    if (!metrics.shotCount || metrics.unitsWithoutShots) return { label: "分鏡準備", detail: `${metrics.unitsWithoutShots || metrics.unitCount} 章待生成分鏡` };
    if (metrics.readyVideoCount < metrics.shotCount) return { label: "鏡頭製作", detail: `${metrics.readyVideoCount}/${metrics.shotCount} 鏡影片就緒` };
    return { label: "檢查交付", detail: "鏡頭影片已準備完成" };
}

function overviewActions(projectId: string, metrics: ProjectOverviewMetrics, firstUnitId?: string): ProjectWorkbenchAction[] {
    const projectRoot = `/projects/${projectId}`;
    const workflowHref = firstUnitId ? `${projectRoot}/workflow/${firstUnitId}/video` : `${projectRoot}/chapters`;
    if (!metrics.unitCount) {
        return [{ id: "add-story", title: "新增第一個劇情章節", description: "匯入小說、貼上文本，或從空白章節開始。", href: `${projectRoot}/chapters`, actionLabel: "新增章節", tone: "default" }];
    }
    const actions: ProjectWorkbenchAction[] = [];
    if (metrics.unitsWithoutText) {
        actions.push({ id: "complete-story", title: `補充 ${metrics.unitsWithoutText} 章正文`, description: "先完善章節內容，後續角色識別與分鏡拆分才能獲得穩定輸入。", href: `${projectRoot}/chapters`, actionLabel: "整理章節", tone: "attention" });
    }
    if (metrics.pendingCandidateCount) {
        actions.push({ id: "confirm-assets", title: `確認 ${metrics.pendingCandidateCount} 個資產候選`, description: "確認角色、場景與道具後，鏡頭可以穩定引用專案資產。", href: `${projectRoot}/assets`, actionLabel: "去確認", tone: "attention" });
    }
    if (!metrics.shotCount || metrics.unitsWithoutShots) {
        actions.push({ id: "create-storyboards", title: `為 ${metrics.unitsWithoutShots || metrics.unitCount} 章建立分鏡`, description: "按章節生成鏡頭草稿，再逐鏡調整畫面、對白和時長。", href: firstUnitId ? `${projectRoot}/chapters/${firstUnitId}` : `${projectRoot}/chapters`, actionLabel: "建立分鏡", tone: "default" });
    }
    if (metrics.shotCount && metrics.readyVideoCount < metrics.shotCount) {
        actions.push({ id: "continue-video", title: `繼續製作 ${metrics.shotCount - metrics.readyVideoCount} 個鏡頭影片`, description: "檢查鏡頭提示詞與參考資產，逐鏡生成並選擇最終版本。", href: workflowHref, actionLabel: "繼續製作", tone: metrics.staleArtifactCount ? "attention" : "default" });
    }
    if (!metrics.canvasCount) {
        actions.push({ id: "create-canvas", title: "建立第一張專案畫布", description: "把章節、分鏡和參考資產放進同一個製作空間。", href: `${projectRoot}/canvases`, actionLabel: "檢視畫布", tone: "default" });
    }
    if (!actions.length) {
        actions.push({ id: "review-delivery", title: "檢查鏡頭並準備交付", description: "所有鏡頭影片已就緒，可檢查版本、連續性和缺失項。", href: workflowHref, actionLabel: "檢查交付", tone: "default" });
    }
    return actions;
}

function stageCell(complete: boolean, label: string, attention = false): ProjectStageCell {
    return { label, state: attention ? "attention" : complete ? "completed" : "idle" };
}
