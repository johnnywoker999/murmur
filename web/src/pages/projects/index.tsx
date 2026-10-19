import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { MediaPlaceholder } from "@/components/ui/product/media-placeholder";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Form, Input, Modal, Select } from "antd";
import { ArrowRight, Archive, BookOpenText, FileText, FolderKanban, Images, LayoutGrid, MoreHorizontal, Palette, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { CollectionGrid, PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { CanvasStylePickerModal, resolveCanvasStylePreset, resolveProjectCanvasStyle, type CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { resourceFileUrl } from "@/services/api/resources";
import { ModelPicker } from "@/components/model-picker";
import { createStyleProfileSnapshot, parseStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion, projectSummaryStage } from "@/lib/project-workbench";
import { settingsPath } from "@/lib/settings-navigation";
import { PromptTemplateOperation, parseGeneratedStory, promptTemplateTaskPlaceholder, shortDramaOutlineVariables } from "@/lib/prompts";
import { runBackendGenerationTask } from "@/services/api/generation-task";
import { createProject, deleteProject, duplicateProject, importProjectUnits, listProjectFolders, listProjects, moveProjectToFolder, updateProject, type ProjectSummary } from "@/services/api/projects";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";

import { sourceTypeLabel } from "./detail/shared";

type ProjectForm = { name: string; aspectRatio: string; sourceType: string };

export default function ProjectsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const [createForm] = Form.useForm<ProjectForm>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<"all" | "active" | "archived">("all");
    const [sort, setSort] = useState<"updated" | "progress" | "name">("updated");
    const [storyDraft, setStoryDraft] = useState("");
    const [createSource, setCreateSource] = useState<"blank" | "novel" | "text">("blank");
    const [selectedStyle, setSelectedStyle] = useState<CanvasStylePreset | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [generateModel, setGenerateModel] = useState("");
    const [generateChapterCount, setGenerateChapterCount] = useState("5");
    const [generateStructure, setGenerateStructure] = useState("單線推進");
    const [generateChapterLength, setGenerateChapterLength] = useState("中");
    const [generateWordCount, setGenerateWordCount] = useState("800");
    const [generatePerspective, setGeneratePerspective] = useState("第三人稱");
    const [generateTone, setGenerateTone] = useState("平穩敘事");
    const [generateCharacterScale, setGenerateCharacterScale] = useState("3-4 個");
    const [generating, setGenerating] = useState(false);
    const [generationStatus, setGenerationStatus] = useState("");
    const [generationPreview, setGenerationPreview] = useState("");
    const [renamingProject, setRenamingProject] = useState<ProjectSummary["project"] | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const foldersQuery = useQuery({ queryKey: ["project-folders"], queryFn: listProjectFolders });
    const createOpen = searchParams.get("create") === "1";
    const setCreateOpen = (open: boolean) => {
        const next = new URLSearchParams(searchParams);
        if (open) next.set("create", "1");
        else next.delete("create");
        setSearchParams(next, { replace: true });
    };
    const openCreate = (source: "blank" | "novel" | "text") => {
        setCreateSource(source);
        setCreateOpen(true);
    };
    useEffect(() => {
        if (!createOpen) return;
        createForm.setFieldsValue({
            name: storyDraft.trim().slice(0, 24) || "",
            sourceType: createSource,
            aspectRatio: "9:16",
        });
    }, [createForm, createOpen, createSource, storyDraft]);

    const generateStory = async () => {
        const story = storyDraft.trim();
        if (!story || generating) return;
        const textModel = generateModel || effectiveConfig.textModel;
        if (!textModel || !effectiveConfig.textModels.includes(textModel)) {
            if (!textModel) {
                modal.warning({
                    title: "需要先選擇文本模型",
                    content: "請在上方“AI 模型”中選擇一個已配置的文本模型，或先到設定中完成模型渠道配置。",
                    okText: "去設定",
                    cancelText: "取消",
                    onOk: () => navigate(settingsPath("models")),
                });
            } else {
                message.error(`模型 ${textModel} 未在文本模型列表中，請重新選擇`);
            }
            return;
        }
        setGenerating(true);
        setGenerationStatus("正在建立專案…");
        setGenerationPreview("");
        try {
            const project = await createUniqueProjectName(story, selectedStyle);
            setGenerationStatus("AI 正在生成故事大綱與章節…");
            const result = await runBackendGenerationTask({
                projectId: project.project.id,
                mode: "text",
                prompt: promptTemplateTaskPlaceholder("短劇大綱"),
                config: { ...effectiveConfig, model: textModel, imageModel: textModel, videoModel: textModel, textModel },
                metadata: {
                    source: "project-story-generator",
                    projectId: project.project.id,
                    promptTemplateOperation: PromptTemplateOperation.ShortDramaOutline,
                    promptTemplateVariables: shortDramaOutlineVariables({
                        story,
                        chapterCount: generateChapterCount,
                        structure: generateStructure,
                        wordCount: generateWordCount,
                        perspective: generatePerspective,
                        tone: generateTone,
                        characterScale: generateCharacterScale,
                        chapterLength: generateChapterLength,
                    }),
                },
                onTextDelta: setGenerationPreview,
            });
            const answer = result.text || "";
            const parsed = parseGeneratedStory(answer);
            if (!parsed.chapters.length) throw new Error("AI 沒有返回有效的章節內容，請重試");
            setGenerationStatus(`正在匯入 ${parsed.chapters.length} 個章節…`);
            await importProjectUnits(project.project.id, parsed.chapters.map((chapter: { title: string; content: string }) => ({ kind: "chapter", title: chapter.title, sourceText: chapter.content })));
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projects/${project.project.id}/overview`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 生成失敗，請重試");
        } finally {
            setGenerating(false);
            setGenerationStatus("");
            setGenerationPreview("");
        }
    };
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const query = useInfiniteQuery({
        // 分頁查詢和畫布頁的全量專案查詢不能共用快取形狀，否則兩個頁面會互相覆蓋快取資料。
        queryKey: ["projects", "paged"],
        queryFn: ({ pageParam }) => listProjects({ page: pageParam, pageSize: 50 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    });
    const mutation = useMutation({
        mutationFn: createProject,
        onSuccess: ({ project }) => {
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projects/${project.id}/overview`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "專案建立失敗"),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            message.success("專案已刪除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "專案刪除失敗"),
    });
    const archiveMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) => updateProject(id, { status }),
        onSuccess: (_, variables) => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            message.success(variables.status === "archived" ? "專案已歸檔" : "專案已恢復");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "專案狀態更新失敗"),
    });
    const renameMutation = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => updateProject(id, { name }),
        onSuccess: () => {
            setRenamingProject(null);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            message.success("專案已重新命名");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "專案重新命名失敗"),
    });
    const allProjects = useMemo(() => query.data?.pages.flatMap((page) => page.projects) || [], [query.data]);
    const rows = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return [...allProjects]
            .filter(({ project }) => status === "all" || project.status === status)
            .filter(({ project }) => !normalizedKeyword || `${project.name} ${project.description} ${project.stylePresetId} ${parseStyleProfile(project.styleProfileJson)?.title || resolveCanvasStylePreset(project.stylePresetId)?.title || ""}`.toLowerCase().includes(normalizedKeyword))
            .sort((left, right) => {
                if (sort === "name") return left.project.name.localeCompare(right.project.name, "zh-CN");
                if (sort === "progress") return projectSummaryCompletion(right) - projectSummaryCompletion(left);
                return right.project.updatedAt.localeCompare(left.project.updatedAt);
            });
    }, [allProjects, keyword, sort, status]);
    const totalProjectCount = query.data?.pages[0]?.total ?? allProjects.length;
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !query.hasNextPage || query.isError) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
            },
            { rootMargin: "600px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);
    const hasInitialError = query.isError && !query.data;
    return (
        <WorkspacePage className="library-page project-library-page" grid>
            <PageHeader title="短劇工作臺" description="你的故事、章節與鏡頭，都在這裡。" meta={<span className="app-projects-header-meta">{totalProjectCount} 個專案</span>} />
            <details className="story-launcher-panel" aria-label="開始一部新短劇">
                <summary className="story-launcher-head">
                    <div className="story-launcher-title">
                        <span className="story-launcher-mark"><Sparkles className="size-4" /></span>
                        <div>
                            <h2>開始一部新短劇</h2>
                            <p>一句話生成章節，也可以匯入小說或從空白開始</p>
                        </div>
                    </div>
                    <span className="story-launcher-expand"><Plus className="size-4" /><span>展開創作</span></span>
                </summary>
                <div className="story-launcher-main">
                    <Input.TextArea
                        className="story-launcher-input"
                        value={storyDraft}
                        onChange={(event) => setStoryDraft(event.target.value)}
                        placeholder="例如：一個失憶的快遞員，每天收到十年前寄出的信件……"
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        aria-label="一句話故事"
                    />
                    {selectedStyle ? <button type="button" className="story-launcher-style-chip" onClick={() => setStylePickerOpen(true)} title={selectedStyle.title}>
                        <img src={selectedStyle.imageUrl} alt="" />
                        <span>{selectedStyle.title}</span>
                    </button> : null}
                </div>
                    <div className="story-launcher-actions">
                        <Button icon={<FolderKanban />} onClick={() => openCreate("blank")}>空白專案</Button>
                        <Button icon={<FileText />} onClick={() => openCreate("novel")}>匯入小說</Button>
                        <Button icon={<Palette />} onClick={() => setStylePickerOpen(true)}>{selectedStyle ? "更換畫風" : "選畫風"}</Button>
                        <ModelPicker
                            config={effectiveConfig}
                            value={generateModel || effectiveConfig.textModel}
                            onChange={setGenerateModel}
                            capability="text"
                            variant="creation"
                            placeholder="選擇文本模型"


                            popoverClassName="agent-model-picker-popover"
                        />
                        <Button type="default" icon={<Sparkles className="size-3.5" />} disabled={!storyDraft.trim() || generating} loading={generating} onClick={() => void generateStory()}>AI 生成章節</Button>
                        <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => openCreate(createSource)}>開始創作</Button>
                    </div>
                <details className="story-launcher-options">
                    <summary>故事設定 · {generateChapterCount} 章 · {generatePerspective} · {generateTone}</summary>
                <div className="story-launcher-controls">
                    <label><span>章節數量</span><Select size="small" className="min-w-28" value={generateChapterCount} onChange={setGenerateChapterCount} options={[{ label: "3 章", value: "3" }, { label: "5 章", value: "5" }, { label: "8 章", value: "8" }, { label: "10 章", value: "10" }]} /></label>
                    <label><span>敘事結構</span><Select size="small" className="min-w-32" value={generateStructure} onChange={setGenerateStructure} options={[{ label: "單線推進", value: "單線推進" }, { label: "雙線並行", value: "雙線並行" }, { label: "群像多線", value: "群像多線" }, { label: "反轉巢狀", value: "反轉巢狀" }]} /></label>
                    <label><span>章節篇幅</span><Select size="small" className="min-w-28" value={generateChapterLength} onChange={setGenerateChapterLength} options={[{ label: "精煉", value: "短" }, { label: "均衡", value: "中" }, { label: "豐滿", value: "長" }]} /></label>
                    <label><span>單章字數</span><Select size="small" className="min-w-28" value={generateWordCount} onChange={setGenerateWordCount} options={[{ label: "500 字", value: "500" }, { label: "800 字", value: "800" }, { label: "1200 字", value: "1200" }, { label: "2000 字", value: "2000" }]} /></label>
                    <label><span>敘述視角</span><Select size="small" className="min-w-28" value={generatePerspective} onChange={setGeneratePerspective} options={[{ label: "第三人稱", value: "第三人稱" }, { label: "第一人稱", value: "第一人稱" }, { label: "多視角", value: "多視角" }]} /></label>
                    <label><span>故事基調</span><Select size="small" className="min-w-32" value={generateTone} onChange={setGenerateTone} options={[{ label: "平穩敘事", value: "平穩敘事" }, { label: "輕鬆喜劇", value: "輕鬆喜劇" }, { label: "緊張懸疑", value: "緊張懸疑" }, { label: "熱血成長", value: "熱血成長" }, { label: "甜寵治癒", value: "甜寵治癒" }]} /></label>
                    <label><span>角色規模</span><Select size="small" className="min-w-28" value={generateCharacterScale} onChange={setGenerateCharacterScale} options={[{ label: "2 個", value: "2 個" }, { label: "3-4 個", value: "3-4 個" }, { label: "5-6 個", value: "5-6 個" }]} /></label>
                </div>
                </details>
            </details>
            <CollectionToolbar active={Boolean(keyword || status !== "all" || sort !== "updated")} onReset={() => { setKeyword(""); setStatus("all"); setSort("updated"); }}>
                <Input allowClear className="app-list-search" prefix={<Search className="size-4 text-foreground/40" />} value={keyword} placeholder="搜尋專案、簡介或畫風" onChange={(event) => setKeyword(event.target.value)} />
                <Select className="w-32" value={status} onChange={setStatus} options={[{ label: "全部狀態", value: "all" }, { label: "進行中", value: "active" }, { label: "已歸檔", value: "archived" }]} />
                <Select className="w-32" value={sort} onChange={setSort} options={[{ label: "最近更新", value: "updated" }, { label: "章節進度", value: "progress" }, { label: "專案名稱", value: "name" }]} />
            </CollectionToolbar>

            {hasInitialError ? <WorkspaceErrorState description={query.error instanceof Error ? query.error.message : "專案列表載入失敗"} onRetry={() => void query.refetch()} /> : null}
            {query.isLoading ? <WorkspaceLoadingState label="正在整理專案" detail="讀取章節、畫布與資產進度" /> : null}
            {!query.isLoading && !hasInitialError && rows.length ? (
                <CollectionGrid className="library-grid project-library-grid">
                    {rows.map((row) => <ProjectRow key={row.project.id} row={row} folders={foldersQuery.data?.folders || []} onDelete={() => modal.confirm({ title: "刪除專案？", content: `專案章節、畫布關聯和素材歸屬將一併移除「${row.project.name}」，獨立畫布與素材庫原始素材會保留。此操作不可撤銷。`, okText: "刪除專案", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => deleteMutation.mutateAsync(row.project.id) })} onRename={() => { setRenameValue(row.project.name); setRenamingProject(row.project); }} onArchive={() => archiveMutation.mutate({ id: row.project.id, status: row.project.status === "archived" ? "active" : "archived" })} onDuplicate={async () => { await duplicateProject(row.project.id); await queryClient.invalidateQueries({ queryKey: ["projects"] }); message.success("專案副本已建立"); }} onMove={async (folderId) => { await moveProjectToFolder(row.project.id, folderId); await queryClient.invalidateQueries({ queryKey: ["projects"] }); message.success(folderId ? "專案已移動" : "專案已移出資料夾"); }} />)}
                </CollectionGrid>
            ) : null}
            {!query.isLoading && !hasInitialError ? <div ref={loadMoreRef} className="library-load-more" aria-live="polite">
                {query.isFetchingNextPage ? "正在載入更多專案…" : query.isError ? <button type="button" onClick={() => void query.fetchNextPage()}>載入更多失敗，點選重試</button> : query.hasNextPage ? "繼續下滑載入更多（每頁 50 條）" : allProjects.length ? `已載入全部 ${totalProjectCount} 個專案` : null}
            </div> : null}
            {!query.isLoading && !rows.length && !hasInitialError && (keyword || status !== "all") ? (
                <WorkspaceState
                    icon="projects"
                    title={keyword || status !== "all" ? "沒有匹配的專案" : "建立第一個故事專案"}
                    description={keyword || status !== "all" ? "調整搜尋詞或狀態篩選後再試。" : "專案會集中儲存章節、專案畫布、角色場景和製作進度。自由試圖可從畫布開始。"}
                    action={!keyword && status === "all" ? <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>建立專案</Button> : undefined}
                />
            ) : null}

            <Modal className="library-modal" title="建立短劇專案" open={createOpen} footer={null} destroyOnHidden onCancel={() => setCreateOpen(false)} width={560} styles={{ body: { paddingTop: 12 } }}>
                <Form<ProjectForm> form={createForm} layout="vertical" initialValues={{ aspectRatio: "9:16", sourceType: "blank" }} onFinish={(values) => mutation.mutate({ ...values, type: "short-drama", ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}) })}>
                    <div className="mb-4 grid grid-cols-3 gap-2">
                        <button type="button" className={createSource === "blank" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("blank"); createForm.setFieldValue("sourceType", "blank"); }}><FolderKanban className="size-4" /><span>空白開始</span></button>
                        <button type="button" className={createSource === "novel" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("novel"); createForm.setFieldValue("sourceType", "novel"); }}><FileText className="size-4" /><span>匯入小說</span></button>
                        <button type="button" className={createSource === "text" ? "app-story-source is-active" : "app-story-source"} onClick={() => { setCreateSource("text"); createForm.setFieldValue("sourceType", "text"); }}><BookOpenText className="size-4" /><span>貼上文本</span></button>
                    </div>
                    <Form.Item name="name" label="專案名稱" rules={[{ required: true, whitespace: true, message: "請輸入專案名稱" }]}><Input autoFocus placeholder="例如：長安夜行" /></Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="aspectRatio" label="預設畫幅"><Select options={[{ label: "9:16 豎屏", value: "9:16" }, { label: "16:9 橫屏", value: "16:9" }, { label: "1:1 方形", value: "1:1" }]} /></Form.Item>
                        <Form.Item name="sourceType" label="內容來源"><Select options={[{ label: "空白開始", value: "blank" }, { label: "匯入小說", value: "novel" }, { label: "貼上文本", value: "text" }]} /></Form.Item>
                    </div>
                    <Form.Item label="專案畫風"><button type="button" className="app-story-modal-style" onClick={() => setStylePickerOpen(true)}>{selectedStyle ? <><img src={selectedStyle.imageUrl} alt="" /><span>{selectedStyle.title}</span><em>更換</em></> : <><Palette className="size-4" /><span>選擇專案畫風（可選）</span></>}</button></Form.Item>
                    <p className="-mt-1 mb-5 text-xs leading-5 text-foreground/48">建立後先進入專案概覽。章節、畫風和參考資產可以逐步補充。</p>
                    <div className="flex justify-end gap-2"><Button onClick={() => setCreateOpen(false)}>取消</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>建立專案</Button></div>
                </Form>
            </Modal>
            <Modal className="library-modal" title="重新命名專案" open={Boolean(renamingProject)} okText="儲存" cancelText="取消" confirmLoading={renameMutation.isPending} onCancel={() => setRenamingProject(null)} onOk={() => { const name = renameValue.trim(); if (!renamingProject || !name) return; renameMutation.mutate({ id: renamingProject.id, name }); }}>
                <Input autoFocus value={renameValue} maxLength={80} placeholder="請輸入專案名稱" onChange={(event) => setRenameValue(event.target.value)} onPressEnter={() => { const name = renameValue.trim(); if (renamingProject && name) renameMutation.mutate({ id: renamingProject.id, name }); }} />
            </Modal>
            <CanvasStylePickerModal
                open={stylePickerOpen}
                value={selectedStyle?.id}
                onClose={() => setStylePickerOpen(false)}
                onSelect={(preset) => { setSelectedStyle(preset); setStylePickerOpen(false); }}
            />
            <Modal className="library-modal" title="AI 生成章節" open={generating} footer={null} closable={false} mask={{ closable: false }} keyboard={false} width={760}>
                <div className="app-story-generating">
                    <div className="app-story-generating-head">
                        <span className="app-story-generating-mark"><Sparkles className="size-4" /></span>
                        <div className="min-w-0">
                            <p>AI 正在創作</p>
                            <span className="block text-[var(--fs-tiny)] text-foreground/45">正在生成劇名、簡介與章節</span>
                        </div>
                        {generateModel || effectiveConfig.textModel ? <span className="app-story-generating-model">{modelDisplayName(effectiveConfig, generateModel || effectiveConfig.textModel)}</span> : null}
                    </div>
                    <div className="app-story-generating-progress" aria-hidden="true" />
                    <div className="app-story-generating-grid">
                        <div className="app-story-generating-story">
                            <span className="app-story-generating-caption">故事起點</span>
                            <p>{storyDraft.trim() || "等待故事輸入"}</p>
                            <span className="app-story-generating-meta">{generateChapterCount} 章 · 每章約 {generateWordCount} 字 · {generateStructure} · {generatePerspective}</span>
                            {selectedStyle ? <span className="app-story-generating-style"><img src={selectedStyle.imageUrl} alt="" /><span>{selectedStyle.title}</span></span> : null}
                        </div>
                        <ol className="app-story-generating-steps">
                            {generationSteps.map((step) => {
                                const state = generationStatus.startsWith(step.label) ? "is-active" : generationStepDone(step.label, generationStatus) ? "is-done" : "";
                                return <li key={step.label} className={state}><span className="app-story-generating-step-dot" /><span>{step.label}</span><em>{state === "is-active" ? "進行中" : state === "is-done" ? "完成" : "等待"}</em></li>;
                            })}
                        </ol>
                    </div>
                    <div className="app-story-generating-preview">
                        <div className="app-story-generating-preview-head"><span>即時草稿</span><span className="app-story-generating-live" /><em>{generationPreview ? "正在輸出" : "等待模型輸出"}</em></div>
                        <pre>{generationPreview}</pre>
                    </div>
                </div>
            </Modal>
        </WorkspacePage>
    );
}

async function createUniqueProjectName(story: string, selectedStyle: CanvasStylePreset | null) {
    const base = story.trim().slice(0, 24);
    const buildInput = (name: string) => ({
        name,
        type: "short-drama" as const,
        aspectRatio: "9:16",
        sourceType: "blank",
        description: story.trim(),
        ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}),
    });
    let attempt = 0;
    for (;;) {
        try {
            return await createProject(buildInput(attempt === 0 ? base : `${base}（${attempt + 1}）`));
        } catch (error) {
            const message = error instanceof Error ? error.message : "";
            const uniqueConflict = message.includes("UNIQUE") || message.includes("projects.user_id") || message.includes("projects.name");
            if (!uniqueConflict || attempt >= 5) throw error;
            attempt += 1;
        }
    }
}

const generationSteps = [
    { label: "正在建立專案" },
    { label: "AI 正在生成故事大綱與章節" },
    { label: "正在匯入章節" },
];

function generationStepDone(label: string, status: string) {
    if (label === "正在建立專案") return status.startsWith("AI 正在生成") || status.startsWith("正在匯入");
    if (label === "AI 正在生成故事大綱與章節") return status.startsWith("正在匯入");
    return false;
}

function ProjectRow({ row, folders, onDelete, onRename, onArchive, onDuplicate, onMove }: { row: ProjectSummary; folders: { id: string; name: string }[]; onDelete: () => void; onRename: () => void; onArchive: () => void; onDuplicate: () => Promise<void>; onMove: (folderId: string) => Promise<void> }) {
    const navigate = useNavigate();
    const completion = projectSummaryCompletion(row);
    const stage = projectSummaryStage(row);
    const projectStyle = resolveProjectCanvasStyle(row.project.stylePresetId, row.project.styleProfileJson);
    const styleTitle = projectStyle?.title || parseStyleProfile(row.project.styleProfileJson)?.title || resolveCanvasStylePreset(row.project.stylePresetId)?.title || (row.project.stylePresetId ? "自定義畫風" : "未設定畫風");
    const coverUrl = row.project.coverResourceId ? resourceFileUrl(row.project.coverResourceId) : projectStyle?.imageUrl;
    return (
        <Link to={`/projects/${row.project.id}/overview`} className="product-collection-card library-card project-library-card group">
            <span className="project-library-cover">
                {coverUrl ? <CachedResourceImage className="project-library-cover-art" src={coverUrl} alt="" fallback={<MediaPlaceholder failed />} /> : <MediaPlaceholder label="故事由此開始" />}
                <span className="project-library-cover-scrim" />
                <span className="project-library-cover-ratio">{row.project.aspectRatio}</span>
                <span className="project-library-cover-stage">{stage.label}</span>
                <span className="project-collection-delete" onClick={(event) => event.preventDefault()}><Dropdown trigger={["click"]} placement="bottomRight" overlayClassName="project-library-menu" menu={{ items: [{ key: "open", label: "開啟", onClick: () => navigate(`/projects/${row.project.id}/overview`) }, { key: "rename", icon: <Pencil className="size-3.5" />, label: "重新命名", onClick: onRename }, { key: "cover", label: "修改封面", onClick: () => navigate(`/projects/${row.project.id}/settings`) }, { key: "duplicate", label: "建立副本", onClick: () => void onDuplicate() }, { key: "move", label: "移動至資料夾", children: [{ key: "root", label: "全部專案", onClick: () => void onMove("") }, ...folders.map((folder) => ({ key: folder.id, label: folder.name, onClick: () => void onMove(folder.id) }))] }, { key: "archive", icon: <Archive className="size-3.5" />, label: row.project.status === "archived" ? "恢復專案" : "歸檔專案", onClick: onArchive }, { type: "divider" }, { key: "delete", danger: true, label: "刪除專案", onClick: onDelete }] }}><button type="button" className="project-library-more" aria-label={`${row.project.name} 更多操作`} onClick={(event) => event.preventDefault()}><MoreHorizontal className="size-4" /></button></Dropdown></span>
            </span>
            <span className="project-library-body">
                <span className="project-library-heading"><strong title={row.project.name}>{row.project.name}</strong>{row.project.status === "archived" ? <em>已歸檔</em> : null}<ArrowRight className="project-library-arrow size-4" /></span>
                <span className="project-library-date">{row.project.updatedAt.slice(0, 10)}</span>
                <span className="project-library-subtitle">{styleTitle} · {sourceTypeLabel(row.project.sourceType)}</span>
                <span className="project-library-progress"><span><span>{row.completedUnitCount}/{row.unitCount} 章</span><span>{completion}%</span></span><i><b style={{ width: `${completion}%` }} /></i></span>
                <span className="project-library-stats"><ProjectCount icon={<BookOpenText className="size-3.5" />} label="章節" value={row.unitCount} /><ProjectCount icon={<LayoutGrid className="size-3.5" />} label="畫布" value={row.canvasCount} /><ProjectCount icon={<Images className="size-3.5" />} label="資產" value={row.assetCount} /></span>
            </span>
        </Link>
    );
}

function ProjectCount({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
    return <span className="inline-flex items-center gap-1.5" title={`${value} ${label}`}><span className="text-foreground/32">{icon}</span><strong className="font-medium tabular-nums text-foreground/65">{value}</strong><span>{label}</span></span>;
}
