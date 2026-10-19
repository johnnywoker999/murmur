import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Dropdown, Input, Select } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";

import { Boxes, Check, Clapperboard, Heart, Library, LoaderCircle, Megaphone, MoreHorizontal, Palette, Plus, Puzzle, Search, ShoppingBag, Sparkles, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceState } from "@/components/layout/workspace-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fallbackSkillCategories, formatSkillCount, groupSkills, skillCategoryLabel } from "@/pages/skills/skill-catalog";
import { SkillDetailModal } from "@/pages/skills/skill-detail-drawer";
import { SkillEditorDrawer } from "@/pages/skills/skill-editor-drawer";
import { SkillInstallModal } from "@/pages/skills/skill-install-modal";
import { addSkill, deleteSkill, getSkill, likeSkill, listSkills, removeSkill, syncSkill, unlikeSkill, type Skill, type SkillCategory, type SkillScope, type SkillSort } from "@/services/api/skills";

const scopeOptions = [
    { label: "技能廣場", value: "public", icon: Sparkles },
    { label: "我的技能", value: "mine", icon: Library },
    { label: "我建立的", value: "created", icon: UserRound },
    { label: "我的收藏", value: "favorites", icon: Heart },
];

/* 分類圖示對映：畫廊卡片頂部的圖示塊，未知分類回退 Boxes。 */
const categoryIcons: Record<string, LucideIcon> = {
    drama: Clapperboard,
    ecommerce: ShoppingBag,
    creative: Palette,
    social: Megaphone,
    others: Puzzle,
};
const categoryIconOf = (value: string) => categoryIcons[value] ?? Boxes;

const sortOptions: { label: string; value: SkillSort }[] = [
    { label: "最多加入", value: "popular" },
    { label: "最新發布", value: "new" },
    { label: "最近更新", value: "updated" },
];

export default function SkillsPage() {
    const { message, modal } = App.useApp();
    const [scope, setScope] = useState<SkillScope>("public");
    const [sort, setSort] = useState<SkillSort>("popular");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 250);
    const [tag, setTag] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [skills, setSkills] = useState<Skill[]>([]);
    const [categories, setCategories] = useState<SkillCategory[]>(fallbackSkillCategories);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<SkillScope, number>>>({});
    const tabsRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        const tabs = tabsRef.current;
        const indicator = indicatorRef.current;
        const active = tabs?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
        if (!tabs || !indicator || !active) return;
        indicator.style.left = `${active.offsetLeft}px`;
        indicator.style.width = `${active.offsetWidth}px`;
    }, [scope, counts]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [mutatingID, setMutatingID] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [installOpen, setInstallOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

    const reload = useCallback(() => setReloadKey((value) => value + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        listSkills({ page, pageSize, scope, sort, search: debouncedSearch || undefined, tag: tag === "all" ? undefined : tag })
            .then((result) => {
                if (cancelled) return;
                setSkills(result.skills);
                setTotal(result.totalCount);
                setCounts((prev) => ({ ...prev, [scope]: result.totalCount }));
                if (result.categories.length) setCategories(result.categories);
            })
            .catch((error) => {
                if (cancelled) return;
                setSkills([]);
                setTotal(0);
                setLoadError(error instanceof Error ? error.message : "技能載入失敗");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [debouncedSearch, page, pageSize, reloadKey, scope, sort, tag]);

    const groupedSkills = useMemo(() => groupSkills(skills, categories), [categories, skills]);
    const filtersActive = Boolean(search || tag !== "all" || sort !== "popular");
    const resetFilters = useCallback(() => { setSearch(""); setTag("all"); setSort("popular"); setPage(1); }, []);

    const openSkill = async (skill: Skill) => {
        setActiveSkill(skill);
        setDetailLoading(true);
        try {
            const result = await getSkill(skill.skillId);
            setActiveSkill(result.skill);
            patchSkill(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能詳情載入失敗");
            setActiveSkill(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const openEditor = async (skill?: Skill) => {
        if (!skill) {
            setEditingSkill(null);
            setEditorOpen(true);
            return;
        }
        try {
            const result = skill.instruction ? { skill } : await getSkill(skill.skillId);
            setActiveSkill(null);
            setEditingSkill(result.skill);
            setEditorOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能讀取失敗");
        }
    };

    const patchSkill = (next: Skill) => {
        setSkills((items) => items.map((item) => item.skillId === next.skillId ? { ...item, ...next, instruction: next.instruction || item.instruction } : item));
        setActiveSkill((current) => current?.skillId === next.skillId ? { ...current, ...next, instruction: next.instruction || current.instruction } : current);
    };

    const toggleAdded = async (skill: Skill) => {
        if (skill.isOwner) return;
        setMutatingID(skill.skillId);
        try {
            const result = skill.isAdded ? await removeSkill(skill.skillId) : await addSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isAdded ? "已加入我的技能" : "已從我的技能移除");
            if (scope === "mine" && !result.skill.isAdded) reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能狀態更新失敗");
        } finally {
            setMutatingID("");
        }
    };

    const toggleLiked = async (skill: Skill) => {
        setMutatingID(skill.skillId);
        try {
            const result = skill.isLike ? await unlikeSkill(skill.skillId) : await likeSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.isLike ? "已收藏" : "已取消收藏");
            if (scope === "favorites" && !result.skill.isLike) reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收藏狀態更新失敗");
        } finally {
            setMutatingID("");
        }
    };

    const synchronizeSkill = async (skill: Skill) => {
        setMutatingID(skill.skillId);
        try {
            const result = await syncSkill(skill.skillId);
            patchSkill(result.skill);
            message.success(result.skill.versionId === skill.versionId ? "已是最新版本" : "已同步最新版本");
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "GitHub 技能同步失敗");
        } finally {
            setMutatingID("");
        }
    };

    const confirmDelete = (skill: Skill) => {
        modal.confirm({
            title: `刪除“${skill.skillName}”？`,
            content: "刪除後，其他使用者將無法繼續使用該技能，已有加入和收藏關係也會一併移除。",
            okText: "刪除技能",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                try {
                    await deleteSkill(skill.skillId);
                    setActiveSkill(null);
                    message.success("技能已刪除");
                    reload();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "技能刪除失敗");
                    throw error;
                }
            },
        });
    };

    return (
        <>
            <WorkspacePage className="library-page skills-library-page" grid>
                <PageHeader title="技能庫" description="把提示詞、角色設定和創作方法，變成隨時可用的能力。" actions={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>安裝技能</Button>} />

                <div className="skills-browse-bar">
                <div className="skills-navigation">
                    <div className="skills-tabs" ref={tabsRef} role="tablist" aria-label="技能庫範圍" onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault();
                        const current = scopeOptions.findIndex((option) => option.value === scope);
                        const next = event.key === "Home" ? 0 : event.key === "End" ? scopeOptions.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + scopeOptions.length) % scopeOptions.length;
                        setScope(scopeOptions[next].value as SkillScope);
                        setPage(1);
                        tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                    }}>
                        <span className="skills-tabs-indicator" ref={indicatorRef} aria-hidden="true" />
                        {scopeOptions.map((option) => {
                            const Icon = option.icon;
                            const active = scope === option.value;
                            const count = counts[option.value as SkillScope];
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="tab"
                                    tabIndex={active ? 0 : -1}
                                    aria-selected={active}
                                    className={`skills-tab${active ? " is-active" : ""}`}
                                    onClick={() => { setScope(option.value as SkillScope); setPage(1); }}
                                >
                                    <Icon className="size-4" />
                                    <span>{option.label}</span>
                                    {count !== undefined ? <span className="skills-tab-count">{count}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <CollectionToolbar active={filtersActive} onReset={resetFilters}>
                        <Input className="min-w-0 sm:!w-56" prefix={<Search className="size-4 text-foreground/38" />} value={search} allowClear placeholder="搜尋技能或作者" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                        <Select aria-label="技能分類" className="w-28" value={tag} options={[{ value: "all", label: "全部分類" }, ...categories]} onChange={(value) => { setTag(value); setPage(1); }} />
                        <Select aria-label="技能排序" className="w-24" value={sort} options={sortOptions} onChange={(value) => { setSort(value); setPage(1); }} />
                </CollectionToolbar>
                </div>

                {loading && !skills.length ? <SkillSkeleton /> : loadError ? <WorkspaceErrorState compact description={loadError} onRetry={reload} /> : groupedSkills.length ? (
                    <div key={`${scope}-${page}`} className="skills-scope-panel">
                        {groupedSkills.map((group) => {
                            const GroupIcon = categoryIconOf(group.value);
                            return (
                                <section key={group.value} data-category={group.value} aria-labelledby={`skill-category-${group.value}`}>
                                    <div className="skill-section-heading">
                                        <h2 id={`skill-category-${group.value}`} className="flex items-center gap-2 text-base font-semibold text-foreground/75">
                                            <span className="skill-group-icon"><GroupIcon /></span>
                                            {group.label}
                                        </h2>
                                        <span className="text-[var(--fs-label)] text-foreground/32">{group.skills.length} 個</span>
                                    </div>
                                    <div className="library-grid skill-library-grid">
                                        {group.skills.map((skill, index) => <SkillCard key={skill.skillId} skill={skill} categories={categories} loading={mutatingID === skill.skillId} style={{ animationDelay: `${Math.min(index, 5) * 30}ms` }} onOpen={() => void openSkill(skill)} onAdd={() => void toggleAdded(skill)} onLike={() => void toggleLiked(skill)} onEdit={() => void openEditor(skill)} onDelete={() => confirmDelete(skill)} />)}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                ) : (
                    <WorkspaceState
                        compact
                        className="min-h-[188px]"
                        icon="skills"
                        title={filtersActive ? "沒有找到匹配技能" : scope === "created" ? "還沒有建立技能" : scope === "public" ? "技能廣場還是空的" : "這裡還沒有技能"}
                        description={filtersActive ? "換個關鍵詞或分類試試。" : scope === "favorites" ? "收藏的公開技能會顯示在這裡。" : scope === "mine" ? "從技能廣場加入後會顯示在這裡。" : "建立並公開第一個技能，其他使用者就能直接加入使用。"}
                        action={filtersActive
                            ? <Button onClick={() => { setSearch(""); setTag("all"); setSort("popular"); setPage(1); }}>清除篩選</Button>
                            : (scope === "created" || scope === "public")
                              ? <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setInstallOpen(true)}>安裝技能</Button>
                              : undefined}
                    />
                )}

                <PaginationBar current={page} pageSize={pageSize} total={total} pageSizeOptions={[20, 40, 80]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} />
            </WorkspacePage>

            <SkillDetailModal skill={activeSkill} loading={detailLoading} mutating={Boolean(activeSkill && mutatingID === activeSkill.skillId)} categories={categories} onClose={() => setActiveSkill(null)} onAdd={(skill) => void toggleAdded(skill)} onLike={(skill) => void toggleLiked(skill)} onEdit={(skill) => void openEditor(skill)} onSync={(skill) => void synchronizeSkill(skill)} />
            <SkillInstallModal open={installOpen} onClose={() => setInstallOpen(false)} onInstalled={(skill) => { setInstallOpen(false); setActiveSkill(skill); reload(); }} onManualCreate={() => { setInstallOpen(false); void openEditor(); }} />
            <SkillEditorDrawer open={editorOpen} skill={editingSkill} onClose={() => setEditorOpen(false)} onSaved={(skill) => { setEditorOpen(false); setEditingSkill(null); setActiveSkill(skill); reload(); }} />
        </>
    );
}

function SkillCard({ skill, categories, loading, style, onOpen, onAdd, onLike, onEdit, onDelete }: { skill: Skill; categories: SkillCategory[]; loading: boolean; style?: CSSProperties; onOpen: () => void; onAdd: () => void; onLike: () => void; onEdit: () => void; onDelete: () => void }) {
    const CategoryIcon = categoryIconOf(skill.tag);
    return (
        <article style={style} className={`product-collection-card library-card library-card-surface skill-library-card group${skill.isAdded ? " is-added" : ""}`}>
            <div className="skill-card-top">
                <span className="library-icon-tile skill-card-icon" aria-hidden="true"><CategoryIcon /></span>
                <button type="button" className="skill-card-title-button" onClick={onOpen}>
                    <h3>{skill.skillName}</h3>
                </button>
                {skill.isOwner ? (
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "edit", label: "編輯技能" },
                                { key: "delete", label: "刪除技能", danger: true },
                            ],
                            onClick: ({ key }) => key === "edit" ? onEdit() : onDelete(),
                        }}
                    >
                        <button type="button" aria-label="技能操作" className="skill-card-more">
                            <MoreHorizontal className="size-4" />
                        </button>
                    </Dropdown>
                ) : null}
            </div>
            <button type="button" className="skill-card-description" onClick={onOpen}>
                <p>{skill.description || "暫無技能簡介"}</p>
            </button>
            <div className="skill-card-footer">
                <button type="button" disabled={loading} className="skill-card-like" aria-label={skill.isLike ? "取消收藏" : "收藏"} onClick={onLike}>
                    <Heart className={`size-3.5 ${skill.isLike ? "fill-current text-rose-500" : ""}`} />
                    <span>{formatSkillCount(skill.likeCount)}</span>
                </button>
                <span className="skill-card-author">{skill.effectiveUser.name || "未知使用者"}</span>
                <span className="skill-card-tag">{skillCategoryLabel(skill.tag, categories)}</span>
                {skill.isPrivate ? <span className="skill-card-flag">僅自己</span> : null}
            </div>
            {/* 加入是這個頁面的主行為，給它完整的按鈕 + 文案 + 已加入人數，不再藏在角落的加號裡。 */}
            {skill.isOwner
                ? <div className="skill-card-action"><span className="skill-card-owner-flag">我建立的</span><span className="skill-card-added-count">{formatSkillCount(skill.addedCount)} 人已加入</span></div>
                : (
                    <div className="skill-card-action">
                        <Button loading={loading} aria-pressed={skill.isAdded} icon={skill.isAdded ? <Check /> : <Plus />} onClick={onAdd}>
                            {skill.isAdded ? "已加入" : "加入技能庫"}
                        </Button>
                        <Tooltip title={`${formatSkillCount(skill.addedCount)} 人已加入`}><span className="skill-card-added-count">{formatSkillCount(skill.addedCount)}</span></Tooltip>
                    </div>
                )}
        </article>
    );
}

function SkillSkeleton() {
    return <div className="library-grid skill-library-grid py-6">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[260px] animate-pulse rounded-[var(--r-xl)] bg-foreground/[.035]" />)}</div>;
}
