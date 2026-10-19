import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Film, Layers3, PackageCheck } from "lucide-react";
import { Link } from "react-router";

import { ASSET_CATEGORIES } from "@/lib/asset-category";
import { listProjectAssetsPage, type ProjectDetail } from "@/services/api/projects";

import { assetCategoryLabel, formatDuration, MetricCard, StageHeading } from "./workflow-shared";

export function StoryStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const unit = detail.units.find((item) => item.id === unitId)!;
    return <section className="mx-auto max-w-5xl"><StageHeading eyebrow="01 / 劇情與章節" title={unit.title} description="章節原文是資產拆分、分鏡版本和生成提示的唯一來源。" /><div className="mt-6 rounded-xl border border-border/70 bg-surface p-5"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-foreground/55">章節原文</span><Link to={`/projects/${projectId}/chapters/${unit.id}`}><Button size="small">編輯章節</Button></Link></div><div className="max-h-[60vh] whitespace-pre-wrap text-sm leading-7 text-foreground/78">{unit.sourceText || "當前章節還沒有正文。請先在劇情章節中上傳小說或新增內容。"}</div></div></section>;
}

export function AssetsStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const candidates = detail.assetCandidates.filter((item) => !item.unitId || item.unitId === unitId);
    const assetCountsQuery = useQuery({ queryKey: ["project", projectId, "assets", "workflow-counts"], queryFn: () => listProjectAssetsPage(projectId, { page: 1, pageSize: 1 }) });
    const confirmedCounts = assetCountsQuery.data?.categoryCounts || {};
    return <section className="mx-auto max-w-6xl"><StageHeading eyebrow="02 / 資產拆分" title="確認鏡頭真正會使用的資產" description="角色、場景、道具、素材與其他資產先建立穩定版本，鏡頭再繫結具體版本。" /><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{ASSET_CATEGORIES.map((category) => { const confirmed = confirmedCounts[category] || 0; const pending = candidates.filter((item) => item.category === category && item.status === "pending_confirmation").length; return <div key={category} className="border-t border-border/70 py-4"><div className="text-xs font-medium text-foreground/55">{assetCategoryLabel(category)}</div><div className="mt-3 text-2xl font-semibold">{assetCountsQuery.isLoading ? "—" : confirmed}</div><div className="mt-1 text-[var(--fs-micro)] text-foreground/42">已確認 · {pending} 待處理</div></div>; })}</div><div className="mt-5 flex items-center justify-between border-y border-border/70 py-5"><div><h3 className="text-sm font-semibold">資產庫承擔版本確認與設定維護</h3><p className="mt-1 text-xs text-foreground/48">確認後可直接在分鏡工作臺左欄繫結到鏡頭。</p></div><Link to={`/projects/${projectId}/assets`}><Button type="primary">開啟資產庫</Button></Link></div></section>;
}

export function DeliveryStage({ detail, unitId }: { detail: ProjectDetail; unitId: string }) {
    const shots = detail.shots.filter((item) => item.unitId === unitId);
    const readyVideos = shots.filter((shot) =>
        detail.shotArtifacts.some((item) => item.shotId === shot.id && item.type === "video" && item.selected && item.status === "ready"),
    );
    const stale = detail.shotArtifacts.filter((item) => item.unitId === unitId && item.status === "stale").length;

    return (
        <section className="mx-auto max-w-5xl">
            <StageHeading
                eyebrow="06 / 交付與打包"
                title="交付前質量門禁"
                description="所有鏡頭影片就緒、過期產物清零後，再打包成片與生產資料。"
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MetricCard icon={<Film className="size-5" />} label="影片已就緒" value={`${readyVideos.length} / ${shots.length}`} />
                <MetricCard
                    icon={<Clock3 className="size-5" />}
                    label="總時長"
                    value={formatDuration(shots.reduce((total, item) => total + item.durationMs, 0))}
                />
                <MetricCard icon={<Layers3 className="size-5" />} label="過期產物" value={String(stale)} />
            </div>
            <div className="mt-5 border-y border-border/70 py-5">
                <div className="flex items-start gap-3">
                    <PackageCheck className="mt-0.5 size-5 text-[var(--workspace-accent)]" />
                    <div>
                        <h3 className="text-sm font-semibold">計劃交付內容</h3>
                        <p className="mt-1 text-xs leading-5 text-foreground/48">
                            成片 MP4、字幕 SRT、分鏡 JSON/CSV、資產清單和生成引數 ZIP。
                        </p>
                    </div>
                </div>
                <p className="mt-5 text-xs leading-5 text-foreground/48">
                    當前版本只提供交付前檢查，不提供交付包生成入口；待後端打包任務、產物儲存和下載許可權具備後再開放匯出。
                </p>
            </div>
        </section>
    );
}
