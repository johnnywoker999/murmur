import { ArrowRight, Plus, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router";
import type { CanvasLibrarySummary } from "@/services/api/workspace-data";
import { ProjectPreview } from "@/components/canvas/canvas-project-card";
import { beefTVCapabilityItems } from "./home-data";
function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "剛剛更新";
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date).replaceAll("/", "-");
}

export function HomeDashboard({ projects, loading, error, onRetry }: { projects: CanvasLibrarySummary[]; loading: boolean; error: boolean; onRetry: () => void }) {
    const navigate = useNavigate();
    return (
        <main className="beeftv-home" aria-label="MURMUR AI 首頁">
            <section className="beeftv-home-hero" aria-label="新建畫布">
                <span className="beeftv-home-dot-base" aria-hidden />
                <span className="beeftv-home-dot-flow" aria-hidden />
                <span className="beeftv-home-dot-flow beeftv-home-dot-flow-delay" aria-hidden />
                <button type="button" className="beeftv-home-create" onClick={() => navigate("/canvas?mode=new")}>
                    <span className="beeftv-home-create-icon"><Plus /></span>
                    <span className="beeftv-home-create-title">新建畫布創作</span>
                </button>
            </section>

            <nav className="beeftv-capabilities" aria-label="創作能力">
                {beefTVCapabilityItems.map(({ id, label, detail, to, icon: Icon, disabled }) => (
                    disabled ? (
                        <span key={id} className="beeftv-capability is-disabled" aria-disabled="true" title={`${label}：${detail}`}>
                            <span className="beeftv-capability-icon"><Icon /></span>
                            <strong>{label}</strong>
                        </span>
                    ) : (
                        <Link key={id} to={to} className="beeftv-capability" title={detail}>
                            <span className="beeftv-capability-icon"><Icon /></span>
                            <strong>{label}</strong>
                        </Link>
                    )
                ))}
            </nav>

            <section className="beeftv-home-section beeftv-recents">
                <header className="beeftv-section-heading"><h2>最近專案</h2><Link to="/project">檢視全部 <ArrowRight /></Link></header>
                {error ? (
                    <button className="beeftv-home-error" type="button" onClick={onRetry}><RefreshCw />畫布讀取失敗，點選重試</button>
                ) : (
                    <div className="beeftv-recent-grid">
                        {loading ? Array.from({ length: 4 }, (_, index) => <div className="beeftv-recent-card is-loading" key={index} />) : projects.length ? projects.map((project) => {
                            return <Link to={`/canvas/${project.id}`} className="beeftv-recent-card" key={project.id}>
                                <span className="beeftv-recent-preview"><ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} emptyVariant="libtv" /></span>
                                <span className="beeftv-recent-copy"><strong>{project.title || "未命名"}</strong><small>{formatDate(project.updatedAt)}</small></span>
                                <ArrowRight className="beeftv-recent-arrow" />
                            </Link>;
                        }) : <button type="button" className="beeftv-recent-card is-empty" onClick={() => navigate("/canvas?mode=new")}><span className="beeftv-recent-preview"><Plus /></span><span className="beeftv-recent-copy"><strong>建立第一個畫布</strong><small>讓靈感有一個開始的地方</small></span></button>}
                    </div>
                )}
            </section>
        </main>
    );
}
