import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Input, Modal } from "antd";
import { Select } from "@/components/ui/base/select";
import { Archive, Check, Eye, FolderOpen, Image as ImageIcon, Palette, Pencil, Save, ShieldAlert, Trash2 } from "lucide-react";

import { shouldSuppressAssetViewError } from "@/components/assets/asset-view-session";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { CanvasStyleDetailModal, CanvasStylePickerModal, resolveProjectCanvasStyle, type CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { createStyleProfileSnapshot, parseStyleProfile, resolveStyleExecutionPlan, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { assertUserScope, captureUserScope, type CapturedUserScope } from "@/lib/user-scope-guard";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { listProjectAssetsPage, updateProject } from "@/services/api/projects";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelDisplayName, resolveModelRequestConfig, useEffectiveConfig } from "@/stores/use-config-store";

import { projectSettingsSessionKey, shouldApplyProjectSettingsMutation, useProjectSettingsGeneration } from "./project-settings-session";
import type { ProjectDetailViewProps } from "./shared";

export default function ProjectSettingsView(props: ProjectDetailViewProps) {
    const generation = useProjectSettingsGeneration();
    return <ProjectSettingsSession key={projectSettingsSessionKey(props.detail.project.id, generation)} {...props} />;
}

function ProjectSettingsSession({ detail, refreshProject }: ProjectDetailViewProps) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const { project } = detail;
    const [entryScope] = useState(() => captureUserScope());
    const [mountedProjectId] = useState(project.id);
    const mountedRef = useRef(true);
    const liveProjectIdRef = useRef(project.id);
    liveProjectIdRef.current = project.id;
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);
    const personalAssets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description || "");
    const [aspectRatio, setAspectRatio] = useState(project.aspectRatio);
    const [sourceType, setSourceType] = useState(project.sourceType);
    const [stylePresetId, setStylePresetId] = useState(project.stylePresetId || "");
    const [styleProfileJson, setStyleProfileJson] = useState(project.styleProfileJson || "");
    const [defaultImageModel, setDefaultImageModel] = useState(project.defaultImageModel || "");
    const [defaultVideoModel, setDefaultVideoModel] = useState(project.defaultVideoModel || "");
    const [styleDetail, setStyleDetail] = useState<CanvasStylePreset | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [styleEditorRequested, setStyleEditorRequested] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [coverPickerOpen, setCoverPickerOpen] = useState(false);
    const [coverPage, setCoverPage] = useState(1);
    const [coverPageSize, setCoverPageSize] = useState(40);
    const coverAssetsQuery = useQuery({
        queryKey: ["project", project.id, "assets", "cover-picker", coverPage, coverPageSize],
        queryFn: () => listProjectAssetsPage(project.id, { page: coverPage, pageSize: coverPageSize, mediaType: "image" }),
        enabled: coverPickerOpen,
    });
    const projectCoverAssets = coverAssetsQuery.data?.assets || [];
    useEffect(() => { setName(project.name); setDescription(project.description || ""); setAspectRatio(project.aspectRatio); setSourceType(project.sourceType); setStylePresetId(project.stylePresetId || ""); setStyleProfileJson(project.styleProfileJson || ""); setDefaultImageModel(project.defaultImageModel || ""); setDefaultVideoModel(project.defaultVideoModel || ""); }, [project]);
    const dirty = useMemo(() => name.trim() !== project.name || description !== (project.description || "") || aspectRatio !== project.aspectRatio || sourceType !== project.sourceType || stylePresetId !== (project.stylePresetId || "") || styleProfileJson !== (project.styleProfileJson || "") || defaultImageModel !== (project.defaultImageModel || "") || defaultVideoModel !== (project.defaultVideoModel || ""), [aspectRatio, defaultImageModel, defaultVideoModel, description, name, project, sourceType, stylePresetId, styleProfileJson]);
    const selectedStyle = useMemo(() => resolveProjectCanvasStyle(stylePresetId, styleProfileJson), [stylePresetId, styleProfileJson]);
    const styleProfile = useMemo(() => parseStyleProfile(styleProfileJson) || selectedStyle?.profile || (selectedStyle ? createStyleProfileSnapshot(selectedStyle) : null), [selectedStyle, styleProfileJson]);
    const enabledStyleAssets = styleProfile?.assets.filter((asset) => asset.enabled !== false) || [];
    const styleExecutionPlans = useMemo(() => {
        if (!styleProfile) return null;
        const imageConfig = resolveModelRequestConfig(effectiveConfig, effectiveConfig.imageModel || effectiveConfig.model);
        const videoConfig = resolveModelRequestConfig(effectiveConfig, effectiveConfig.videoModel || effectiveConfig.model);
        return {
            image: resolveStyleExecutionPlan(styleProfile, { mode: "image", model: imageConfig.model, interfaceType: imageConfig.interfaceType || imageConfig.apiFormat }),
            video: resolveStyleExecutionPlan(styleProfile, { mode: "video", model: videoConfig.model, interfaceType: videoConfig.interfaceType || videoConfig.apiFormat }),
        };
    }, [effectiveConfig, styleProfile]);
    const coverPickerItems = useMemo<AssetLibraryPickerItem[]>(() => {
        const result: AssetLibraryPickerItem[] = [];
        const seenResourceIds = new Set<string>();
        for (const asset of personalAssets) {
            if (asset.kind !== "image") continue;
            const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
            if (!resourceId || seenResourceIds.has(resourceId)) continue;
            seenResourceIds.add(resourceId);
            result.push({ id: asset.id, title: asset.title, category: "image", kindLabel: "圖片", asset, description: asset.note || "個人素材庫", searchText: (asset.tags || []).join(" ") });
        }
        for (const asset of projectCoverAssets) {
            if (asset.mediaType !== "image") continue;
            const resourceId = resourceIdFromStorageKey(asset.storageKey);
            if (!resourceId || seenResourceIds.has(resourceId)) continue;
            seenResourceIds.add(resourceId);
            result.push({ id: `project:${asset.id}`, title: asset.title, category: "image", kindLabel: "專案圖片", imageUrl: resourceFileUrl(resourceId), description: "專案素材庫", searchText: asset.title });
        }
        if (project.coverResourceId && !seenResourceIds.has(project.coverResourceId)) {
            result.unshift({ id: `current:${project.coverResourceId}`, title: "當前專案主圖", category: "image", kindLabel: "當前主圖", imageUrl: resourceFileUrl(project.coverResourceId) });
        }
        return result;
    }, [personalAssets, project.coverResourceId, projectCoverAssets]);
    const coverResourceByItemId = useMemo(() => new Map(coverPickerItems.flatMap((item) => {
        if (item.id.startsWith("current:")) return [[item.id, item.id.slice("current:".length)] as const];
        if (item.id.startsWith("project:")) {
            const asset = projectCoverAssets.find((entry) => `project:${entry.id}` === item.id);
            const resourceId = resourceIdFromStorageKey(asset?.storageKey);
            return resourceId ? [[item.id, resourceId] as const] : [];
        }
        const asset = personalAssets.find((entry) => entry.id === item.id);
        const resourceId = asset?.kind === "image" ? resourceIdFromStorageKey(asset.data.storageKey) : "";
        return resourceId ? [[item.id, resourceId] as const] : [];
    })), [coverPickerItems, personalAssets, projectCoverAssets]);
    const coverResourceByItemIdRef = useRef(new Map<string, string>());
    useEffect(() => {
        for (const [itemId, resourceId] of coverResourceByItemId) coverResourceByItemIdRef.current.set(itemId, resourceId);
    }, [coverResourceByItemId]);
    const currentCoverItemId = coverPickerItems.find((item) => coverResourceByItemId.get(item.id) === project.coverResourceId)?.id;
    const canApplySettings = (expectedScope: CapturedUserScope, projectId: string, error?: unknown) => shouldApplyProjectSettingsMutation({
        entryScope: expectedScope,
        mountedProjectId: projectId,
        liveProjectId: liveProjectIdRef.current,
        mounted: mountedRef.current && projectId === mountedProjectId,
        error,
    });
    const saveMutation = useMutation({
        mutationFn: (input: { expectedScope: CapturedUserScope; projectId: string; payload: Parameters<typeof updateProject>[1] }) => {
            assertUserScope(input.expectedScope);
            return updateProject(input.projectId, input.payload, input.expectedScope);
        },
        onSuccess: (_data, input) => {
            if (!canApplySettings(input.expectedScope, input.projectId)) return;
            refreshProject();
            message.success("專案設定已儲存");
        },
        onError: (error, input) => {
            if (!canApplySettings(input.expectedScope, input.projectId, error)) return;
            message.error(error instanceof Error ? error.message : "專案設定儲存失敗");
        },
    });
    const archiveMutation = useMutation({
        mutationFn: (input: { expectedScope: CapturedUserScope; projectId: string; status: string; successMessage: string }) => {
            assertUserScope(input.expectedScope);
            return updateProject(input.projectId, { status: input.status }, input.expectedScope);
        },
        onSuccess: (_data, input) => {
            if (!canApplySettings(input.expectedScope, input.projectId)) return;
            setArchiveOpen(false);
            refreshProject();
            message.success(input.successMessage);
        },
        onError: (error, input) => {
            if (!canApplySettings(input.expectedScope, input.projectId, error)) return;
            message.error(error instanceof Error ? error.message : "專案狀態更新失敗");
        },
    });
    const coverMutation = useMutation({
        mutationFn: ({ coverResourceId, expectedScope, projectId }: { coverResourceId: string; expectedScope: CapturedUserScope; projectId: string }) => {
            assertUserScope(expectedScope);
            return updateProject(projectId, { coverResourceId }, expectedScope);
        },
        onSuccess: (_, { coverResourceId, expectedScope, projectId }) => {
            if (!canApplySettings(expectedScope, projectId)) return;
            setCoverPickerOpen(false);
            refreshProject();
            message.success(coverResourceId ? "專案主圖已更新" : "專案主圖已移除");
        },
        onError: (error, variables) => {
            if (!canApplySettings(variables.expectedScope, variables.projectId, error) || shouldSuppressAssetViewError(error, variables.expectedScope)) return;
            message.error(error instanceof Error ? error.message : "專案主圖更新失敗");
        },
    });

    return (
        <div>
            <header className="flex items-end justify-between gap-3 pb-3"><div><h2 className="text-lg font-semibold">專案設定</h2><p className="mt-1 text-xs text-foreground/48">基礎資訊、專案畫風與歸檔管理</p></div><Button type={dirty ? "primary" : "default"} icon={dirty ? <Save className="size-3.5" /> : <Check className="size-3.5" />} disabled={!dirty || !name.trim()} loading={saveMutation.isPending} onClick={() => saveMutation.mutate({ expectedScope: entryScope, projectId: mountedProjectId, payload: { name: name.trim(), description, aspectRatio, sourceType, stylePresetId, styleProfileJson, defaultImageModel, defaultVideoModel } })}>{dirty ? "儲存設定" : "已儲存"}</Button></header>

            <section className="py-5">
                <h3 className="mb-3 text-sm font-semibold">基礎設定</h3>
                <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="專案名稱" className="xl:col-span-2"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
                    <Field label="預設畫幅"><Select className="w-full" value={aspectRatio} options={[{ label: "9:16 · 豎屏短劇", value: "9:16" }, { label: "16:9 · 橫屏", value: "16:9" }, { label: "1:1 · 方形", value: "1:1" }]} onChange={setAspectRatio} /></Field>
                    <Field label="內容來源"><Select className="w-full" value={sourceType} options={[{ label: "空白開始", value: "blank" }, { label: "匯入小說", value: "novel" }, { label: "貼上文本", value: "text" }]} onChange={setSourceType} /></Field>
                    <Field label="專案簡介" className="md:col-span-2 xl:col-span-4"><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="一句話說明專案目標" /></Field>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3"><h3 className="text-sm font-semibold">預設生成模型</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">分鏡圖、動作預演與鏡頭影片優先使用專案預設；未設定或模型不可用時跟隨工作臺全域性預設。</p></div>
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="預設生圖模型">
                        <div className="flex items-center gap-2">
                            <ModelPicker config={effectiveConfig} value={defaultImageModel} capability="image" onChange={setDefaultImageModel} fullWidth placeholder={`跟隨全域性 · ${modelDisplayName(effectiveConfig, effectiveConfig.imageModel) || "未配置"}`} />
                            {defaultImageModel ? <Button type="text" size="small" onClick={() => setDefaultImageModel("")}>跟隨全域性</Button> : null}
                        </div>
                    </Field>
                    <Field label="預設影片模型">
                        <div className="flex items-center gap-2">
                            <ModelPicker config={effectiveConfig} value={defaultVideoModel} capability="video" onChange={setDefaultVideoModel} fullWidth placeholder={`跟隨全域性 · ${modelDisplayName(effectiveConfig, effectiveConfig.videoModel) || "未配置"}`} />
                            {defaultVideoModel ? <Button type="text" size="small" onClick={() => setDefaultVideoModel("")}>跟隨全域性</Button> : null}
                        </div>
                    </Field>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">專案主圖</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">專案列表優先展示這張圖片；未設定時使用專案畫風示意圖</p></div><span className="text-[var(--fs-label)] text-foreground/40">建議使用與專案畫幅一致的圖片</span></div>
                <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-surface-active p-3 sm:flex-row sm:items-center">
                    {project.coverResourceId ? <img src={resourceFileUrl(project.coverResourceId)} alt={`${project.name}專案主圖`} className="aspect-video w-full shrink-0 rounded-md bg-foreground/5 object-cover sm:w-52" /> : <span className="grid aspect-video w-full shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground/30 sm:w-52"><ImageIcon className="size-6" /></span>}
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{project.coverResourceId ? "已設定專案主圖" : "尚未設定專案主圖"}</div><p className="mt-1 text-xs leading-5 text-foreground/48">從個人素材庫或專案素材庫選擇，也可以在選擇視窗中上傳一張新圖片。</p></div>
                    <div className="flex shrink-0 gap-2"><Button icon={<FolderOpen className="size-3.5" />} onClick={() => { setCoverPage(1); setCoverPickerOpen(true); }}>{project.coverResourceId ? "替換主圖" : "設定主圖"}</Button>{project.coverResourceId ? <Button danger type="text" icon={<Trash2 className="size-3.5" />} loading={coverMutation.isPending} onClick={() => coverMutation.mutate({ coverResourceId: "", expectedScope: entryScope, projectId: mountedProjectId })}>移除</Button> : null}</div>
                </div>
            </section>

            <section className="border-t border-border/70 py-5">
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">專案畫風</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">專案儲存當前版本快照；修改“我的風格”不會自動改寫歷史專案</p></div>{styleProfile ? <span className="text-[var(--fs-label)] text-foreground/52">{styleProfile.source === "user" ? "來自我的風格" : styleProfile.source === "external" ? "外部匯入" : "系統預設"}</span> : <span className="text-[var(--fs-label)] text-foreground/40">未設定</span>}</div>
                <div className="flex flex-col gap-3 rounded-lg bg-surface-active p-3 lg:flex-row lg:items-center">
                    {selectedStyle ? <img src={selectedStyle.imageUrl} width="160" height="90" alt={`${selectedStyle.title}畫風示意`} className="aspect-video w-40 shrink-0 rounded-md object-cover" /> : <span className="grid aspect-video w-40 shrink-0 place-items-center rounded-md bg-foreground/5 text-foreground/35"><Palette className="size-5" /></span>}
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{styleProfile?.title || selectedStyle?.title || "尚未設定專案畫風"}</div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-foreground/48">{styleProfile?.description || selectedStyle?.description || "從系統風格開始，或建立可自由編輯的專案視覺規範。"}</p>
                        {styleProfile ? <div className="mt-2 flex flex-wrap gap-1">{styleProfile.tags.map((tag) => <span key={tag} className="rounded bg-foreground/10 px-1.5 py-0.5 text-[var(--fs-tiny)] text-foreground/55">{tag}</span>)}</div> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2"><Button icon={<Eye className="size-3.5" />} disabled={!selectedStyle} onClick={() => setStyleDetail(selectedStyle || null)}>檢視規範</Button><Button icon={<Pencil className="size-3.5" />} disabled={!styleProfile} onClick={() => { setStyleEditorRequested(true); setStylePickerOpen(true); }}>編輯畫風</Button><Button icon={<Palette className="size-3.5" />} onClick={() => { setStyleEditorRequested(false); setStylePickerOpen(true); }}>{selectedStyle ? "更換畫風" : "選擇畫風"}</Button></div>
                </div>
                {styleProfile ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5"><StyleMetric label="執行策略" value={styleProfile.executionPolicy === "strict-assets" ? "嚴格校驗" : "相容降級"} /><StyleMetric label="繫結資產" value={`${styleProfile.assets.length} 個`} /><StyleMetric label="已啟用" value={`${enabledStyleAssets.length} 個`} /><StyleMetric label="圖片執行" value={styleExecutionStatusLabel(styleExecutionPlans?.image.status)} /><StyleMetric label="影片執行" value={styleExecutionStatusLabel(styleExecutionPlans?.video.status)} /></div> : null}
                {styleExecutionPlans && (styleExecutionPlans.image.warnings.length || styleExecutionPlans.video.warnings.length) ? <div className="mt-2 grid gap-1 rounded-md bg-amber-500/5 px-3 py-2 text-[var(--fs-label)] leading-5 text-amber-600 dark:text-amber-400">{styleExecutionPlans.image.warnings.length ? <p>圖片：{styleExecutionPlans.image.warnings.join("；")}</p> : null}{styleExecutionPlans.video.warnings.length ? <p>影片：{styleExecutionPlans.video.warnings.join("；")}</p> : null}</div> : null}
            </section>

            <section className="py-4">
                <div className="flex flex-col gap-3 rounded-lg bg-red-500/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded bg-red-500/10 text-red-500"><Archive className="size-3.5" /></span><div className="min-w-0"><h3 className="text-sm font-medium">{project.status === "archived" ? "恢復專案" : "歸檔專案"}</h3><p className="mt-0.5 text-[var(--fs-label)] text-foreground/48">{project.status === "archived" ? "恢復後可繼續建立章節、畫布和生成任務" : "保留全部章節、畫布和資產，停止專案內新建與生成"}</p></div></div>
                    <Button size="small" danger={project.status !== "archived"} icon={project.status === "archived" ? <Check className="size-3.5" /> : <ShieldAlert className="size-3.5" />} onClick={() => setArchiveOpen(true)}>{project.status === "archived" ? "恢復專案" : "歸檔專案"}</Button>
                </div>
            </section>

            <Modal className="workspace-modal workspace-modal-compact" title={project.status === "archived" ? "恢復專案" : "歸檔專案"} open={archiveOpen} okText={project.status === "archived" ? "確認恢復" : "確認歸檔"} cancelText="取消" okButtonProps={{ danger: project.status !== "archived", loading: archiveMutation.isPending }} onCancel={() => setArchiveOpen(false)} onOk={() => { const currentStatus = project.status; archiveMutation.mutate({ expectedScope: entryScope, projectId: mountedProjectId, status: currentStatus === "archived" ? "active" : "archived", successMessage: currentStatus === "archived" ? "專案已恢復" : "專案已歸檔" }); }} styles={{ body: { paddingTop: 12 } }}><p className="m-0 text-sm leading-6 text-foreground/65">{project.status === "archived" ? "恢復後專案會重新進入可編輯狀態。" : "歸檔不會刪除章節、畫布或資產，畫布檔案仍可在創作畫布中開啟。"}</p></Modal>
            <AssetLibraryPickerModal
                open={coverPickerOpen}
                items={coverPickerItems}
                mediaKinds={["image"]}
                categoryLabels={{ all: "全部圖片", image: "圖片" }}
                initialCategory="image"
                initialSelectedIds={currentCoverItemId ? [currentCoverItemId] : []}
                multiple={false}
                eyebrow="專案設定"
                title="選擇專案主圖"
                confirmLabel={() => "設為專案主圖"}
                emptyTitle="素材庫還沒有圖片"
                emptyDescription="可以從底部上傳一張新圖片，上傳後會自動選中。"
                loading={coverAssetsQuery.isLoading}
                pagination={{ current: coverPage, pageSize: coverPageSize, total: coverAssetsQuery.data?.total || 0, onChange: (nextPage, nextPageSize) => { setCoverPage(nextPageSize !== coverPageSize ? 1 : nextPage); setCoverPageSize(nextPageSize); } }}
                upload={{ accept: "image/png,image/jpeg,image/webp,image/avif", description: "支援 PNG、JPG、WebP、AVIF", onUpload: async (files, expectedScope) => {
                    assertUserScope(expectedScope);
                    const file = Array.from(files)[0];
                    if (!file?.type.startsWith("image/")) throw new Error("請選擇圖片檔案");
                    const uploaded = await uploadImage(file, undefined, expectedScope);
                    assertUserScope(expectedScope);
                    const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                    if (!resourceId) throw new Error("圖片上傳未同步到服務端資源庫，請檢查後端連線");
                    const id = addAsset({ kind: "image", title: file.name.replace(/\.[^.]+$/, "") || "專案主圖", coverUrl: uploaded.url, tags: ["專案主圖"], status: "confirmed", source: "專案設定", data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType } });
                    return [id];
                } }}
                onClose={() => setCoverPickerOpen(false)}
                onConfirm={async (ids, expectedScope) => {
                    assertUserScope(expectedScope);
                    const id = ids[0];
                    let resourceId = coverResourceByItemIdRef.current.get(id);
                    if (!resourceId) {
                        const asset = useAssetStore.getState().assets.find((entry) => entry.id === id);
                        resourceId = asset?.kind === "image" ? resourceIdFromStorageKey(asset.data.storageKey) : "";
                    }
                    if (!resourceId) throw new Error("所選圖片尚未同步到服務端資源庫");
                    await coverMutation.mutateAsync({ coverResourceId: resourceId, expectedScope, projectId: mountedProjectId });
                }}
            />
            <CanvasStylePickerModal open={stylePickerOpen} value={stylePresetId} currentProfile={styleProfile} startInEditor={styleEditorRequested} onClose={() => { setStylePickerOpen(false); setStyleEditorRequested(false); }} onSelect={(preset) => { applyStyle(preset); setStylePickerOpen(false); setStyleEditorRequested(false); }} />
            <CanvasStyleDetailModal open={Boolean(styleDetail)} preset={styleDetail} selected={styleDetail?.id === stylePresetId} onClose={() => setStyleDetail(null)} onSelect={(preset) => { applyStyle(preset); setStyleDetail(null); }} />
        </div>
    );

    function applyStyle(preset: CanvasStylePreset) {
        setStylePresetId(preset.id);
        setStyleProfileJson(serializeStyleProfile(preset.profile || createStyleProfileSnapshot(preset)));
    }
}

function StyleMetric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-md bg-surface-active px-3 py-2"><span className="block text-[var(--fs-tiny)] text-foreground/40">{label}</span><span className="mt-0.5 block truncate font-medium text-foreground/65">{value}</span></div>;
}

function styleExecutionStatusLabel(status?: "ready" | "degraded" | "blocked") {
    return status === "blocked" ? "不可執行" : status === "degraded" ? "降級執行" : "完整執行";
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-1.5 text-xs ${className}`}><span className="font-medium text-foreground/62">{label}</span>{children}</label>;
}
