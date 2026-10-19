import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Form, Input, Modal, Popconfirm, Tabs, type FormInstance } from "antd";
import { Box, Check, ChevronDown, Download, FileText, FolderOpen, FolderPlus, Image as ImageIcon, Link2, MoreHorizontal, MoveRight, Music2, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, UserRound, Video, VolumeX } from "lucide-react";

import { WorkspaceState } from "@/components/layout/workspace-state";
import { PaginationBar } from "@/components/layout/workspace-page";
import { AssetMediaPreview } from "@/components/asset-media-preview";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { AssetLibraryCard, AssetLibraryCardMedia } from "@/components/assets/asset-library-card";
import { shouldSuppressAssetViewError } from "@/components/assets/asset-view-session";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { assertUserScope, captureUserScope, userScopeMatches, type CapturedUserScope } from "@/lib/user-scope-guard";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CanvasFolderPreview } from "@/components/canvas/canvas-folder-preview";
import { CANVAS_FOLDER_THEME_OPTIONS, resolveCanvasFolderTheme } from "@/lib/canvas/canvas-folder-theme";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { CHARACTER_VOICE_FORMAT_LABEL, CHARACTER_VOICE_UPLOAD_ACCEPT, characterVoiceFormatName, characterVoiceTitleFromFileName, isSupportedCharacterVoiceFile } from "@/lib/character-voice-formats";
import { ASSET_CATEGORIES, defaultAssetCategoryForKind, normalizeAssetCategory } from "@/lib/asset-category";
import { ownedResourceIdFromMediaRef, resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { uploadMediaFile } from "@/services/file-storage";
import {
    bindProjectCharacterVoice,
    confirmProjectAssetCandidate,
    createProjectAssetFolder,
    createProjectAssetVersion,
    createProjectCharacter,
    deleteProjectAssetFolder,
    getProjectCharacter,
    linkProjectAsset,
    listProjectAssetCandidates,
    listProjectAssetFolders,
    listProjectAssetsPage,
    moveProjectAsset,
    replaceProjectCharacterRepresentations,
    unbindProjectCharacterVoice,
    unlinkProjectAsset,
    updateProjectAssetCategory,
    updateProjectAssetFolder,
    updateProjectCharacter,
    type ProjectAsset,
    type ProjectAssetFolder,
} from "@/services/api/projects";
import { hasRemoteUserDataSyncSession, saveRemoteUserDataNow } from "@/services/local-workspace-sync";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";
import { useAssetStore, type Asset, type AssetCategory, type AssetStatus, type EntityAsset, type ImageAsset } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasFolderStyle, type CanvasFolderTheme, type CanvasNodeData } from "@/types/canvas";
import { downloadOwnedOrBrowserMedia, reportOwnedMediaSave } from "@/services/desktop-media-save";
import { mediaFileExtension, sanitizeDownloadFileName } from "@/lib/canvas/canvas-media-download";

import { ProjectCharacterCard } from "./project-character-card";
import { linkSelectedProjectAssets } from "./project-asset-linking";
import { generateCharacterTurnaround } from "./project-character-media";
import { categoryLabels, categoryLabel, mediaLabel, StatusPill, formatTime, textValue, type ProjectDetailViewProps } from "./shared";

const categories = ["all", ...ASSET_CATEGORIES];
const ALL_FOLDERS = "__all_folders__";
const pickerCategoryLabels = { all: "全部素材", ...categoryLabels };
const characterFields = [
    ["role", "劇情定位與人物關係"], ["aliases", "別名"], ["appearance", "穩定外貌"], ["physique", "身高、體型與體態"],
    ["clothing", "預設服裝造型"], ["personality", "性格與表演基線"], ["props", "固定道具"],
    ["consistencyPrompt", "跨鏡頭一致性約束"], ["multiViewPrompt", "三檢視補充約束"],
    ["voiceLanguage", "語言與口音"], ["voiceAge", "聲音年齡感"], ["voiceTimbre", "音色氣質"],
] as const;

type CharacterForm = { name: string } & Record<(typeof characterFields)[number][0], string>;

export default function ProjectAssetsView({ detail, refreshProject }: ProjectDetailViewProps) {
    const { message, modal } = App.useApp();
    const localMode = isLocalWorkspaceMode();
    const personalAssets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updatePersonalAsset = useAssetStore((state) => state.updateAsset);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const [category, setCategory] = useState("all");
    const [folderId, setFolderId] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(40);
    const [candidatePage, setCandidatePage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const debouncedKeyword = useDebouncedValue(keyword.trim(), 250);
    const candidatePageSize = 24;
    const [folderEditor, setFolderEditor] = useState<{ folder?: ProjectAssetFolder; parentId: string } | null>(null);
    const [folderName, setFolderName] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [editorAsset, setEditorAsset] = useState<ProjectAsset | "new" | null>(null);
    const [imageAsset, setImageAsset] = useState<ProjectAsset | null>(null);
    const externalAssetSources = useExternalAssetSources(addOpen || Boolean(imageAsset));
    const [voiceAsset, setVoiceAsset] = useState<ProjectAsset | null>(null);
    const [previewAsset, setPreviewAsset] = useState<ProjectAsset | null>(null);
    const [voiceSample, setVoiceSample] = useState<{ resourceId: string; name: string; url: string; expectedScope?: CapturedUserScope } | null>(null);
    const [voicePickerOpen, setVoicePickerOpen] = useState(false);
    const [voiceInstructions, setVoiceInstructions] = useState("");
    const [form] = Form.useForm<CharacterForm>();
    const queryClient = useQueryClient();

    const assetsQuery = useQuery({
        queryKey: ["project", detail.project.id, "assets", page, pageSize, category, folderId, debouncedKeyword],
        queryFn: () => listProjectAssetsPage(detail.project.id, {
            page,
            pageSize,
            category: category === "all" ? undefined : category,
            folderId: folderId === ALL_FOLDERS ? undefined : folderId,
            query: debouncedKeyword || undefined,
        }),
        placeholderData: keepPreviousData,
    });
    const foldersQuery = useQuery({ queryKey: ["project", detail.project.id, "asset-folders"], queryFn: () => listProjectAssetFolders(detail.project.id) });
    // 左側分類計數不能依賴跟隨當前 tab 的候選查詢，否則"角色"的數字會隨所在 tab 的待確認數漂移；
    // 這裡獨立取"全部待確認"和"角色待確認"兩個總數，計數與當前所處分類解耦。
    const pendingCountQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", "pending-count"],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: 1, pageSize: 1, status: "pending_confirmation" }),
    });
    const characterPendingCountQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", "character-pending-count"],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: 1, pageSize: 1, category: "character", status: "pending_confirmation" }),
    });
    // 章節提取會產出角色、場景和道具三類候選；待確認列表必須跟隨當前分類，否則非角色候選永遠無法確認。
    const candidateCategory = category === "all" ? undefined : category;
    const candidateLabel = category === "all" ? "資產" : categoryLabel(category);
    const showPendingCandidates = folderId === ALL_FOLDERS;
    const candidatesQuery = useQuery({
        queryKey: ["project", detail.project.id, "asset-candidates", candidatePage, candidatePageSize, candidateCategory || "all", "pending_confirmation", debouncedKeyword],
        queryFn: () => listProjectAssetCandidates(detail.project.id, { page: candidatePage, pageSize: candidatePageSize, category: candidateCategory, status: "pending_confirmation", query: debouncedKeyword || undefined }),
    });
    const assets = assetsQuery.data?.assets || [];
    const assetFolders = foldersQuery.data?.folders || [];
    const pendingCandidates = candidatesQuery.data?.candidates || [];
    const categoryCountMap = assetsQuery.data?.categoryCounts || {};
    const folderCountMap = assetsQuery.data?.folderCounts || {};
    const totalAssetCount = Object.values(categoryCountMap).reduce((total, count) => total + count, 0);
    const characterAssetCount = categoryCountMap.character || 0;
    const mediaAssetCount = Math.max(0, totalAssetCount - characterAssetCount);

    useEffect(() => {
        if (!assetsQuery.data) return;
        const lastPage = Math.max(1, Math.ceil(assetsQuery.data.total / pageSize));
        if (page > lastPage) setPage(lastPage);
    }, [assetsQuery.data, page, pageSize]);
    useEffect(() => {
        if (!candidatesQuery.data) return;
        const lastPage = Math.max(1, Math.ceil(candidatesQuery.data.total / candidatePageSize));
        if (candidatePage > lastPage) setCandidatePage(lastPage);
    }, [candidatePage, candidatesQuery.data]);
    useEffect(() => {
        setPage(1);
        setCandidatePage(1);
    }, [debouncedKeyword]);

    const selectFolder = (nextFolderId: string) => {
        setFolderId(nextFolderId);
        setCategory("all");
        setPage(1);
    };
    const selectCategory = (nextCategory: string) => {
        setCategory(nextCategory);
        setFolderId(ALL_FOLDERS);
        setPage(1);
        // 待確認列表跟隨分類後，不同分類的候選數量不同，切分類必須回到第 1 頁。
        setCandidatePage(1);
    };

    const projectAssetIds = new Set(assets.map((asset) => asset.id));
    const availableAssets = personalAssets.filter((asset) => !projectAssetIds.has(asset.id));
    const imageAssets = personalAssets.filter((asset): asset is ImageAsset => asset.kind === "image");
    const availablePickerItems = useMemo<AssetLibraryPickerItem[]>(() => [
        ...availableAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            category: normalizeAssetCategory(asset.category, defaultAssetCategoryForKind(asset.kind)),
            kindLabel: mediaLabel(asset.kind),
            asset,
            description: asset.note,
            searchText: (asset.tags || []).join(" "),
        })),
        ...externalAssetSources.items,
    ], [availableAssets, externalAssetSources.items]);
    const imagePickerItems = useMemo<AssetLibraryPickerItem[]>(() => [
        ...imageAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            category: normalizeAssetCategory(asset.category, defaultAssetCategoryForKind(asset.kind)),
            kindLabel: "圖片",
            asset,
            searchText: (asset.tags || []).join(" "),
        })),
        ...externalAssetSources.items.filter((item) => item.external?.item.kind === "image"),
    ], [externalAssetSources.items, imageAssets]);
    const characterAssets = assets.filter((asset) => asset.category === "character" && asset.character);
    const currentFolder = assetFolders.find((folder) => folder.id === folderId);
    const childFolders = folderId === ALL_FOLDERS ? [] : assetFolders.filter((folder) => (folder.parentId || "") === folderId);
    const visibleAssets = assets;
    const folderPath = useMemo(() => projectAssetFolderPath(assetFolders, folderId), [assetFolders, folderId]);
    const folderMoveItems = useMemo(() => [
        { key: "", label: "素材庫 / 根目錄" },
        ...assetFolders.map((folder) => ({ key: folder.id, label: projectAssetFolderLabel(assetFolders, folder) })),
    ], [assetFolders]);
    const categoryCounts = categories.map((value) => ({
        value,
        count: value === "all"
            ? totalAssetCount + (pendingCountQuery.data?.total || 0)
            : (categoryCountMap[value] || 0) + (value === "character" ? characterPendingCountQuery.data?.total || 0 : 0),
    }));
    const audioPickerItems = useMemo<AssetLibraryPickerItem[]>(() => {
        const localItems = personalAssets.flatMap((asset) => {
            if (asset.kind !== "audio") return [];
            const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
            if (!resourceId) return [];
            return [{ id: asset.id, title: asset.title, category: "audio", kindLabel: `${characterVoiceFormatName(asset.data.mimeType)} 音訊`, asset, description: asset.note || "素材庫音訊", searchText: (asset.tags || []).join(" ") }];
        });
        const projectItems = assets.flatMap((asset) => {
            if (asset.mediaType !== "audio") return [];
            const resourceId = resourceIdFromStorageKey(asset.storageKey);
            if (!resourceId || localItems.some((item) => item.id === asset.id)) return [];
            return [{ id: asset.id, title: asset.title, category: "audio", kindLabel: "音訊素材", description: asset.previewText || "專案音訊素材", searchText: asset.title, disabledReason: undefined, folderId: asset.folderId, imageUrl: undefined }];
        });
        return [...localItems, ...projectItems];
    }, [assets, personalAssets]);
    const audioResourceByItemId = useMemo(() => new Map([
        ...personalAssets.flatMap((asset) => asset.kind === "audio" ? [[asset.id, resourceIdFromStorageKey(asset.data.storageKey)] as const] : []),
        ...assets.flatMap((asset) => asset.mediaType === "audio" ? [[asset.id, resourceIdFromStorageKey(asset.storageKey)] as const] : []),
    ].filter((entry): entry is readonly [string, string] => Boolean(entry[1]))), [assets, personalAssets]);
    const generatingAssets = useMutationState({
        filters: { mutationKey: ["project-character-turnaround", detail.project.id], status: "pending" },
        select: (mutation) => mutation.state.variables as ProjectAsset | undefined,
    });
    const generatingAssetIds = new Set(generatingAssets.map((asset) => asset?.id).filter((id): id is string => Boolean(id)));

    const done = (content: string) => { refreshProject(); message.success(content); };
    const failed = (fallback: string) => (error: unknown) => message.error(error instanceof Error ? error.message : fallback);
    const addMutation = useMutation({
        mutationFn: async ({ ids, nextFolderId, expectedScope }: { ids: string[]; nextFolderId?: string; expectedScope: CapturedUserScope }) => {
            assertUserScope(expectedScope);
            const result = await linkSelectedProjectAssets(ids, async (id) => {
                const pickerItem = availablePickerItems.find((item) => item.id === id);
                if (pickerItem?.external) {
                    const imported = await externalAssetSources.importExternalAsset(pickerItem.external, undefined, expectedScope);
                    const assetId = addAsset(imported);
                    return linkProjectAsset(detail.project.id, {
                        assetId,
                        category: normalizeAssetCategory(imported.category, defaultAssetCategoryForKind(imported.kind)),
                        folderId: nextFolderId,
                    }, undefined, expectedScope);
                }
                const selected = pickerItem?.asset || useAssetStore.getState().assets.find((asset) => asset.id === id);
                if (!selected) throw new Error("所選素材已不存在，請重新選擇");
                return linkProjectAsset(detail.project.id, {
                    assetId: selected.id,
                    category: normalizeAssetCategory(selected.category, defaultAssetCategoryForKind(selected.kind)),
                    folderId: nextFolderId,
                }, undefined, expectedScope);
            });
            return {
                assets: result.linked.map((item) => item.asset),
                failedCount: result.failedCount,
            };
        },
        onSuccess: ({ assets, failedCount }, variables) => {
            if (!userScopeMatches(variables.expectedScope)) return;
            assets.forEach((asset) => updatePersonalAsset(asset.id, { category: asset.category as AssetCategory, status: asset.status as AssetStatus, primaryVersionId: asset.primaryVersionId }));
            setAddOpen(false);
            refreshProject();
            if (failedCount) message.warning(`已引用 ${assets.length} 個素材，${failedCount} 個素材引用失敗`);
            else message.success(`已引用 ${assets.length} 個素材`);
        },
        onError: (error, variables) => {
            if (shouldSuppressAssetViewError(error, variables.expectedScope)) return;
            failed("資產引用失敗")(error);
        },
    });
    const versionMutation = useMutation({ mutationFn: (id: string) => createProjectAssetVersion(detail.project.id, id, {}), onSuccess: () => done("已建立新版本"), onError: failed("版本建立失敗") });
    const unlinkMutation = useMutation({ mutationFn: (id: string) => unlinkProjectAsset(detail.project.id, id), onSuccess: () => done("資產已移出專案"), onError: failed("資產移除失敗") });
    const categoryMutation = useMutation({ mutationFn: ({ id, next }: { id: string; next: AssetCategory }) => updateProjectAssetCategory(detail.project.id, id, next), onSuccess: ({ asset }) => { updatePersonalAsset(asset.id, { category: asset.category }); done("資產分類已更新"); }, onError: failed("資產分類更新失敗") });
    const moveMutation = useMutation({ mutationFn: ({ id, nextFolderId }: { id: string; nextFolderId: string }) => moveProjectAsset(detail.project.id, id, nextFolderId), onSuccess: () => done("資產已移動"), onError: failed("資產移動失敗") });
    const createFolderMutation = useMutation({
        mutationFn: ({ name, parentId }: { name: string; parentId: string }) => createProjectAssetFolder(detail.project.id, { name, parentId: parentId || undefined }),
        onSuccess: ({ folder }) => { setFolderEditor(null); setFolderName(""); setFolderId(folder.parentId || ""); done("資料夾已建立"); },
        onError: failed("資料夾建立失敗"),
    });
    const renameFolderMutation = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => updateProjectAssetFolder(detail.project.id, id, { name }),
        onSuccess: () => { setFolderEditor(null); setFolderName(""); done("資料夾已重新命名"); },
        onError: failed("資料夾重新命名失敗"),
    });
    const styleFolderMutation = useMutation({
        mutationFn: ({ id, style }: { id: string; style: CanvasFolderStyle }) => updateProjectAssetFolder(detail.project.id, id, { style }),
        onSuccess: () => done("資料夾樣式已更新"),
        onError: failed("資料夾樣式更新失敗"),
    });
    const themeFolderMutation = useMutation({
        mutationFn: ({ id, theme }: { id: string; theme: CanvasFolderTheme }) => updateProjectAssetFolder(detail.project.id, id, { theme }),
        onSuccess: () => done("資料夾主題已更新"),
        onError: failed("資料夾主題更新失敗"),
    });
    const moveFolderMutation = useMutation({
        mutationFn: ({ id, parentId }: { id: string; parentId: string }) => updateProjectAssetFolder(detail.project.id, id, { parentId }),
        onSuccess: () => done("資料夾已移動"),
        onError: failed("資料夾移動失敗"),
    });
    const deleteFolderMutation = useMutation({
        mutationFn: (id: string) => deleteProjectAssetFolder(detail.project.id, id),
        onSuccess: (_, deletedId) => { if (folderId === deletedId) setFolderId(""); done("資料夾已刪除"); },
        onError: failed("資料夾刪除失敗"),
    });
    const confirmMutation = useMutation({
        mutationFn: ({ candidateId, targetAssetId }: { candidateId: string; targetAssetId?: string }) => confirmProjectAssetCandidate(detail.project.id, candidateId, targetAssetId),
        onSuccess: ({ asset }, variables) => {
            if (asset.category === "character") syncPersonalCharacterProjection(asset);
            const label = asset.category === "character" ? "角色卡" : categoryLabel(asset.category);
            // 確認會改變候選、資產列表和左側計數三處資料，必須一併失效快取，否則計數與列表滯後。
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: ["project", detail.project.id, "asset-candidates"] }),
                queryClient.invalidateQueries({ queryKey: ["project", detail.project.id, "assets"] }),
            ]);
            done(variables.targetAssetId ? `候選資訊已歸併到${label}新版本` : `${label}已建立`);
        },
        onError: failed("資產確認失敗"),
    });
    const confirmingCandidateId = confirmMutation.isPending ? confirmMutation.variables?.candidateId || "" : "";
    const saveCharacter = useMutation({
        mutationFn: async (values: CharacterForm) => {
            const definition = characterDefinition(values);
            return editorAsset === "new" ? createProjectCharacter(detail.project.id, { name: values.name, definition }) : updateProjectCharacter(detail.project.id, editorAsset!.id, { name: values.name, definition });
        },
        onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setEditorAsset(null); done(editorAsset === "new" ? "角色卡已建立" : "角色設定已儲存並生成新版本"); },
        onError: failed("角色儲存失敗"),
    });
    const generateMutation = useMutation({
        mutationKey: ["project-character-turnaround", detail.project.id],
        mutationFn: async (asset: ProjectAsset) => {
            if (!asset.character) throw new Error("角色版本資訊不完整");
            const model = effectiveConfig.imageModel || effectiveConfig.model;
            const config = { ...effectiveConfig, model };
            if (!isAiConfigReady(config, model)) throw new Error("請先在設定中配置可用的圖片模型");
            const projectStyle = resolveProjectCanvasStyle(detail.project.stylePresetId, detail.project.styleProfileJson);
            await generateCharacterTurnaround({ projectId: detail.project.id, assetId: asset.id, versionId: asset.character.versionId, name: asset.title, definition: asset.character.definition, projectStyle, config });
            return getProjectCharacter(detail.project.id, asset.id);
        },
        onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); done("三檢視已生成並繫結到新角色版本"); },
        onError: failed("三檢視生成失敗"),
    });
    const bindImagesMutation = useMutation({
        mutationFn: async ({ selectedAssetId, expectedScope }: { selectedAssetId: string; expectedScope: CapturedUserScope }) => {
            assertUserScope(expectedScope);
            if (!imageAsset) throw new Error("未選擇角色");
            if (hasRemoteUserDataSyncSession()) await saveRemoteUserDataNow();
            assertUserScope(expectedScope);
            const latest = useAssetStore.getState().assets;
            const pickerItem = imagePickerItems.find((item) => item.id === selectedAssetId);
            const selected = latest.find((asset) => asset.id === selectedAssetId) || (pickerItem?.external ? await externalAssetSources.importExternalAsset(pickerItem.external, undefined, expectedScope) : undefined);
            if (selected?.kind !== "image") throw new Error("請選擇一張包含正面、側面和背面的三檢視設定圖");
            const resourceId = resourceIdFromStorageKey((selected as ImageAsset).data.storageKey);
            if (!resourceId) throw new Error(localMode ? "瀏覽器本地素材尚未寫入桌面資源目錄，請在 MURMUR AI APP 中完成繫結" : "所選圖片尚未同步到後端資源庫");
            return replaceProjectCharacterRepresentations(detail.project.id, imageAsset.id, [{ role: "turnaround_sheet", resourceId, metadata: { sourceAssetId: selected.id } }, { role: "primary", resourceId, metadata: { source: "turnaround_sheet", sourceAssetId: selected.id } }], expectedScope);
        },
        onSuccess: (result, variables) => {
            if (!userScopeMatches(variables.expectedScope)) return;
            syncPersonalCharacterProjection(result.asset);
            setImageAsset(null);
            done("三檢視已繫結到新角色版本");
        },
        onError: (error, variables) => {
            if (shouldSuppressAssetViewError(error, variables.expectedScope)) return;
            failed("三檢視繫結失敗")(error);
        },
    });
    const bindVoiceMutation = useMutation({
        mutationFn: (expectedScope: CapturedUserScope) => {
            if (!voiceAsset || !voiceSample) return Promise.reject(new Error("請選擇一份聲音素材"));
            assertUserScope(expectedScope);
            return bindProjectCharacterVoice(detail.project.id, voiceAsset.id, { sampleResourceId: voiceSample.resourceId, voiceName: voiceSample.name, instructions: voiceInstructions }, expectedScope);
        },
        onSuccess: (result, expectedScope) => {
            if (!userScopeMatches(expectedScope)) return;
            syncPersonalCharacterProjection(result.asset);
            setVoiceAsset(null);
            setVoiceSample(null);
            done("聲音素材已繫結到新角色版本");
        },
        onError: (error, expectedScope) => {
            if (shouldSuppressAssetViewError(error, expectedScope)) return;
            failed("聲音繫結失敗")(error);
        },
    });
    const unbindVoiceMutation = useMutation({ mutationFn: () => voiceAsset ? unbindProjectCharacterVoice(detail.project.id, voiceAsset.id) : Promise.reject(new Error("未選擇角色")), onSuccess: (result) => { syncPersonalCharacterProjection(result.asset); setVoiceAsset(null); done("聲音繫結已解除並生成新角色版本"); }, onError: failed("聲音解綁失敗") });

    const openCharacterEditor = (asset: ProjectAsset | "new") => {
        setEditorAsset(asset);
        const definition = asset === "new" ? {} : asset.character?.definition || {};
        form.setFieldsValue({ name: asset === "new" ? "" : asset.title, ...Object.fromEntries(characterFields.map(([key]) => [key, fieldValue(definition[key])])) } as CharacterForm);
    };
    const openImages = (asset: ProjectAsset) => setImageAsset(asset);
    const openVoice = (asset: ProjectAsset) => { const sampleResourceId = asset.character?.voice?.profile.sampleResourceId || ""; setVoiceAsset(asset); setVoiceSample(sampleResourceId ? { resourceId: sampleResourceId, name: asset.character?.voice?.profile.name || "當前聲音", url: resourceFileUrl(sampleResourceId) } : null); setVoiceInstructions(asset.character?.voice?.instructions || ""); };
    const openFolderEditor = (folder?: ProjectAssetFolder, parentId = folderId === ALL_FOLDERS ? "" : folderId) => {
        setFolderEditor({ folder, parentId: folder?.parentId || parentId });
        setFolderName(folder?.name || "");
    };
    const saveFolder = () => {
        const name = folderName.trim();
        if (!name) {
            message.warning("請輸入資料夾名稱");
            return;
        }
        if (folderEditor?.folder) renameFolderMutation.mutate({ id: folderEditor.folder.id, name });
        else if (folderEditor) createFolderMutation.mutate({ name, parentId: folderEditor.parentId });
    };
    const downloadPreviewAsset = (asset: ProjectAsset) => {
        const personal = personalAssets.find((item) => item.id === asset.id);
        if (personal && (personal.kind === "image" || personal.kind === "video" || personal.kind === "audio" || personal.kind === "model")) {
            const url = personal.kind === "image" ? personal.data.dataUrl : personal.data.url;
            const extension = personal.kind === "model" ? personal.data.fileName.split(".").pop() || "glb" : mediaFileExtension(personal.data.mimeType, url) || "bin";
            void reportOwnedMediaSave(message, downloadOwnedOrBrowserMedia({
                fileName: sanitizeDownloadFileName(`${asset.title || "素材"}.${extension}`),
                resourceId: ownedResourceIdFromMediaRef(personal.data.storageKey, url) || undefined,
                browserUrl: url,
            }));
            return;
        }
        const cover = asset.character?.representations.find((item) => item.role === "turnaround_sheet") || asset.character?.representations.find((item) => item.role === "primary") || asset.character?.representations[0];
        if (cover) {
            void reportOwnedMediaSave(message, downloadOwnedOrBrowserMedia({
                fileName: sanitizeDownloadFileName(`${asset.title || "角色"}.png`),
                resourceId: cover.resourceId,
                browserUrl: resourceFileUrl(cover.resourceId),
            }));
            return;
        }
        const remoteUrl = projectAssetRemoteUrl(asset);
        const projectResourceId = ownedResourceIdFromMediaRef(asset.storageKey, remoteUrl);
        if (projectResourceId || remoteUrl) {
            void reportOwnedMediaSave(message, downloadOwnedOrBrowserMedia({
                fileName: sanitizeDownloadFileName(`${asset.title || "素材"}.${projectAssetFileExtension(asset.mediaType)}`),
                resourceId: projectResourceId || undefined,
                browserUrl: remoteUrl,
            }));
            return;
        }
        message.warning("當前資產沒有可下載的媒體檔案");
    };
    return (
        <div>
            <header className="flex min-h-[72px] flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <h2 className="text-[var(--fs-heading-lg)] font-semibold leading-6">角色與資產</h2>
                            <span className="rounded bg-foreground/[.055] px-1.5 py-1 text-[var(--fs-tiny)] font-medium tabular-nums text-foreground/45">{totalAssetCount} 項已確認</span>
                        </div>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[var(--fs-label)] text-foreground/48">
                            <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" />{characterAssetCount} 個角色</span>
                            <span className="inline-flex items-center gap-1.5"><Box className="size-3.5" />{mediaAssetCount} 項媒體</span>
                            {(candidatesQuery.data?.total || 0) ? <span className="inline-flex items-center gap-1.5 text-foreground/55"><Sparkles className="size-3.5" />{candidatesQuery.data?.total || 0} 個待確認</span> : null}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 sm:pl-4">
                    <Button type="text" className="!h-9 !px-3" icon={<FolderPlus className="size-3.5" />} onClick={() => openFolderEditor()}>新建資料夾</Button>
                    <Button type="text" className="!h-9 !px-3" icon={<Link2 className="size-3.5" />} onClick={() => setAddOpen(true)}>引用素材</Button>
                    <Button type="primary" className="!h-9 !px-3.5" icon={<Plus className="size-3.5" />} onClick={() => openCharacterEditor("new")}>新建角色</Button>
                </div>
            </header>
            <div className="project-assets-layout mt-3 grid gap-3">
                <nav className="space-y-0.5 pr-2" aria-label="素材目錄與資產分類">
                    <div className="mb-1 flex h-8 items-center justify-between px-2 text-[var(--fs-tiny)] font-medium text-foreground/42"><span>素材目錄</span><button type="button" className="rounded p-1 hover:bg-surface-hover" aria-label="新建根目錄資料夾" onClick={() => openFolderEditor(undefined, "")}><FolderPlus className="size-3.5" /></button></div>
                    <button type="button" onClick={() => selectFolder("")} className={`flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${folderId === "" ? "bg-surface-active font-medium" : "text-foreground/55 hover:bg-surface-hover"}`}><FolderOpen className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">素材庫</span><span className="text-[var(--fs-tiny)] tabular-nums text-foreground/42">{folderCountMap[""] || 0}</span></button>
                    <ProjectAssetFolderTree folders={assetFolders} folderCounts={folderCountMap} selectedId={folderId} onSelect={selectFolder} />
                    <div className="my-2 h-px bg-foreground/[.08]" />
                    <div className="mb-1 h-8 px-2 text-[var(--fs-tiny)] font-medium leading-8 text-foreground/42">分類篩選</div>
                    {categoryCounts.map((item) => <button key={item.value} type="button" onClick={() => selectCategory(item.value)} className={`flex h-11 w-full items-center justify-between rounded-md px-2 text-left text-xs ${folderId === ALL_FOLDERS && category === item.value ? "bg-surface-active font-medium" : "text-foreground/55 hover:bg-surface-hover"}`}><span>{item.value === "all" ? "全部資產" : categoryLabels[item.value]}</span><span className="min-w-5 rounded bg-foreground/[.05] px-1 text-center text-[var(--fs-tiny)] tabular-nums">{item.count}</span></button>)}
                </nav>
                <div className="min-w-0">
                    <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1 text-xs text-foreground/48">
                            <button type="button" className="truncate rounded px-1.5 py-1 hover:bg-surface-hover" onClick={() => selectFolder("")}>素材庫</button>
                            {folderId === ALL_FOLDERS ? <><span>/</span><span className="font-medium text-foreground">全部資產</span></> : folderPath.map((folder) => <span key={folder.id} className="contents"><span>/</span><button type="button" className="truncate rounded px-1.5 py-1 font-medium text-foreground hover:bg-surface-hover" onClick={() => selectFolder(folder.id)}>{folder.name}</button></span>)}
                        </div>
                        <div className="flex items-center gap-2">
                            <Input allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} prefix={<Search className="size-3.5 text-foreground/35" />} placeholder="搜尋資產名稱" aria-label="搜尋專案資產" className="w-52" />
                            {folderId !== ALL_FOLDERS ? <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => openFolderEditor(undefined, folderId)}>新建子資料夾</Button> : null}
                        </div>
                    </div>
                    {childFolders.length ? <div className="project-asset-folder-grid mb-5">{childFolders.map((folder) => <ProjectAssetFolderCard key={folder.id} folder={folder} folders={assetFolders} assets={assets} folderCounts={folderCountMap} personalAssets={personalAssets} onOpen={() => selectFolder(folder.id)} onRename={() => openFolderEditor(folder)} onMove={(parentId) => moveFolderMutation.mutate({ id: folder.id, parentId })} onStyle={(style) => styleFolderMutation.mutate({ id: folder.id, style })} onTheme={(theme) => themeFolderMutation.mutate({ id: folder.id, theme })} onDelete={() => modal.confirm({ title: `刪除資料夾“${folder.name}”？`, content: "僅空資料夾可以刪除，素材和子資料夾不會被級聯刪除。", okText: "刪除", okButtonProps: { danger: true }, cancelText: "取消", onOk: () => deleteFolderMutation.mutateAsync(folder.id) })} deleting={(deleteFolderMutation.isPending && deleteFolderMutation.variables === folder.id) || (moveFolderMutation.isPending && moveFolderMutation.variables?.id === folder.id) || (styleFolderMutation.isPending && styleFolderMutation.variables?.id === folder.id) || (themeFolderMutation.isPending && themeFolderMutation.variables?.id === folder.id)} />)}</div> : null}
                    {showPendingCandidates && pendingCandidates.length ? (
                        <section className="mb-4" aria-label={`待確認${candidateLabel}`}>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-xs font-medium"><Sparkles className="size-3.5 text-foreground/50" />劇情識別出的{candidateLabel}</div>
                                <span className="text-[var(--fs-tiny)] tabular-nums text-foreground/42">剩餘 {candidatesQuery.data?.total || 0} 個待確認</span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {pendingCandidates.map((candidate) => {
                                    const confirming = confirmingCandidateId === candidate.id;
                                    const isCharacter = candidate.category === "character";
                                    return (
                                        <article key={candidate.id} className="flex min-h-28 items-center gap-3 rounded-lg bg-surface-active p-3">
                                            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-foreground/[.045] text-foreground/25">{isCharacter ? <UserRound className="size-5" /> : <Box className="size-5" />}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-semibold">{candidate.name}</div>
                                                <div className="mt-1 text-[var(--fs-tiny)] text-foreground/42">待確認{categoryLabel(candidate.category)} · 來自章節分析</div>
                                                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1">
                                                    <Button type="text" size="small" icon={<Check className="size-3.5" />} loading={confirming} disabled={Boolean(confirmingCandidateId) && !confirming} onClick={() => confirmMutation.mutate({ candidateId: candidate.id })}>{isCharacter ? "確認新角色" : "確認新增"}</Button>
                                                    {isCharacter && characterAssets.length ? <Dropdown trigger={["click"]} menu={{ items: characterAssets.map((asset) => ({ key: asset.id, label: asset.title })), onClick: ({ key }) => confirmMutation.mutate({ candidateId: candidate.id, targetAssetId: key }) }}><Button type="text" size="small" disabled={Boolean(confirmingCandidateId)}>歸併到角色<ChevronDown className="size-3" /></Button></Dropdown> : null}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                            <PaginationBar current={candidatePage} pageSize={candidatePageSize} total={candidatesQuery.data?.total || 0} itemLabel="項" pageSizeOptions={[candidatePageSize]} onChange={(nextPage) => setCandidatePage(nextPage)} />
                        </section>
                    ) : null}
                    <div className="mb-2 flex items-center justify-between text-xs text-foreground/45"><span>{currentFolder?.name || (folderId === ALL_FOLDERS ? (category === "all" ? "全部資產" : categoryLabel(category)) : "根目錄內容")}</span><span>{assetsQuery.data?.total || 0} 項已確認</span></div>
                    {assetsQuery.isLoading ? <WorkspaceState icon="assets" compact title="正在讀取資產" description="按當前目錄、分類和關鍵詞載入這一頁。" /> : visibleAssets.length ? <><div className="project-assets-grid assets-library-grid">{visibleAssets.map((asset) => asset.category === "character" ? <ProjectCharacterCard key={asset.id} asset={asset} folderItems={folderMoveItems} generating={generatingAssetIds.has(asset.id)} removing={(moveMutation.isPending && moveMutation.variables?.id === asset.id) || (unlinkMutation.isPending && unlinkMutation.variables === asset.id)} onOpen={() => setPreviewAsset(asset)} onEdit={() => openCharacterEditor(asset)} onGenerate={() => generateMutation.mutate(asset)} onBindImages={() => openImages(asset)} onBindVoice={() => openVoice(asset)} onMove={(nextFolderId) => moveMutation.mutate({ id: asset.id, nextFolderId })} onRemove={() => unlinkMutation.mutate(asset.id)} /> : <MediaAssetCard key={asset.id} asset={asset} personalAsset={personalAssets.find((item) => item.id === asset.id)} folderItems={folderMoveItems} onOpen={() => setPreviewAsset(asset)} onMove={(nextFolderId) => moveMutation.mutate({ id: asset.id, nextFolderId })} onCategoryChange={(next) => categoryMutation.mutate({ id: asset.id, next })} onVersion={() => versionMutation.mutate(asset.id)} onRemove={() => unlinkMutation.mutate(asset.id)} loading={(moveMutation.isPending && moveMutation.variables?.id === asset.id) || (categoryMutation.isPending && categoryMutation.variables?.id === asset.id) || (versionMutation.isPending && versionMutation.variables === asset.id) || (unlinkMutation.isPending && unlinkMutation.variables === asset.id)} />)}</div><PaginationBar current={page} pageSize={pageSize} total={assetsQuery.data?.total || 0} itemLabel="項" pageSizeOptions={[20, 40, 80]} onChange={(nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); }} /></> : childFolders.length || (showPendingCandidates && pendingCandidates.length) ? null : <WorkspaceState icon="assets" compact title={debouncedKeyword ? "沒有找到匹配資產" : "這個資料夾還沒有內容"} description={debouncedKeyword ? "換一個關鍵詞，或調整左側分類與目錄篩選。" : "可以新建子資料夾、引用個人素材，或把畫布產物歸檔到這裡。"} />}
                </div>
            </div>

            <AssetLibraryPickerModal
                open={addOpen}
                remoteLibrary
                mediaKinds={["image", "video", "audio", "text"]}
                items={availablePickerItems}
                categoryLabels={{ ...pickerCategoryLabels, ...externalAssetSources.categoryLabels }}
                folders={externalAssetSources.folders}
                footerNote={externalAssetSources.error || undefined}
                multiple
                title="素材庫"
                confirmLabel={(count) => `加入專案${count ? `（${count}）` : ""}`}
                emptyTitle="沒有可引用的素材"
                emptyDescription="本地素材已全部加入專案，或切換到外掛來源選擇外部素材。"
                onClose={() => setAddOpen(false)}
                onConfirm={async (ids, expectedScope) => {
                    await addMutation.mutateAsync({ ids, nextFolderId: folderId === ALL_FOLDERS ? undefined : folderId, expectedScope });
                }}
            />
            <ProjectAssetPreviewModal asset={previewAsset} personalAsset={previewAsset ? personalAssets.find((item) => item.id === previewAsset.id) : undefined} onClose={() => setPreviewAsset(null)} onDownload={() => previewAsset && downloadPreviewAsset(previewAsset)} onReplaceImage={() => { if (!previewAsset || previewAsset.category !== "character") return; setPreviewAsset(null); openImages(previewAsset); }} />
            <CharacterEditorModal open={Boolean(editorAsset)} editing={editorAsset !== "new"} form={form} loading={saveCharacter.isPending} onClose={() => setEditorAsset(null)} onSave={() => form.validateFields().then((values) => saveCharacter.mutate(values))} />
            <Modal className="workspace-modal workspace-modal-compact" title={folderEditor?.folder ? "重新命名資料夾" : "新建資料夾"} open={Boolean(folderEditor)} okText={folderEditor?.folder ? "儲存" : "建立"} cancelText="取消" okButtonProps={{ loading: createFolderMutation.isPending || renameFolderMutation.isPending }} onCancel={() => { setFolderEditor(null); setFolderName(""); }} onOk={saveFolder}>
                <div className="grid gap-2"><span className="text-[var(--fs-label)] text-foreground/48">位置：{folderEditor ? projectAssetFolderParentLabel(assetFolders, folderEditor.parentId) : ""}</span><Input autoFocus maxLength={60} value={folderName} placeholder="輸入資料夾名稱" onChange={(event) => setFolderName(event.target.value)} onPressEnter={saveFolder} /></div>
            </Modal>
            <AssetLibraryPickerModal
                open={Boolean(imageAsset)}
                remoteLibrary
                remoteKind="image"
                items={imagePickerItems}
                categoryLabels={{ ...pickerCategoryLabels, ...externalAssetSources.categoryLabels }}
                folders={externalAssetSources.folders}
                footerNote={externalAssetSources.error || undefined}
                multiple={false}
                eyebrow="繫結圖片"
                title={imageAsset?.title || "角色三檢視"}
                confirmLabel={() => "繫結並生成新版本"}
                emptyTitle="沒有可繫結的圖片"
                emptyDescription="需要一張包含正面、側面、背面的角色設定圖。"
                onClose={() => setImageAsset(null)}
                onConfirm={async (ids, expectedScope) => {
                    if (!ids[0]) throw new Error("請選擇一張三檢視設定圖");
                    await bindImagesMutation.mutateAsync({ selectedAssetId: ids[0], expectedScope });
                }}
            />
            <AssetLibraryPickerModal
                open={voicePickerOpen}
                remoteLibrary
                remoteKind="audio"
                items={audioPickerItems}
                categoryLabels={{ all: "全部音訊", audio: "聲音素材" }}
                initialCategory="audio"
                multiple={false}
                eyebrow="聲音素材"
                title="從素材庫選擇"
                confirmLabel={() => "使用這份聲音"}
                emptyTitle="素材庫還沒有可用音訊"
                emptyDescription="可以從底部上傳聲音素材，上傳後會自動選中。"
                upload={{ accept: CHARACTER_VOICE_UPLOAD_ACCEPT, description: `支援 ${CHARACTER_VOICE_FORMAT_LABEL}；上傳後儲存到素材庫`, onUpload: async (files, expectedScope) => {
                    assertUserScope(expectedScope);
                    const ids: string[] = [];
                    for (const file of Array.from(files)) {
                        if (!isSupportedCharacterVoiceFile(file)) throw new Error(`聲音素材支援 ${CHARACTER_VOICE_FORMAT_LABEL}`);
                        const uploaded = await uploadMediaFile(file, "character-voice", undefined, expectedScope);
                        assertUserScope(expectedScope);
                        const resourceId = resourceIdFromStorageKey(uploaded.storageKey);
                        if (!resourceId) throw new Error(localMode ? "瀏覽器本地聲音已儲存，但角色繫結需要 MURMUR AI APP 的本地資源目錄" : "聲音上傳未同步到服務端資源庫，請檢查後端連線");
                        ids.push(addAsset({ kind: "audio", title: characterVoiceTitleFromFileName(file.name), coverUrl: "", tags: ["角色聲音"], status: "confirmed", source: "角色卡", data: { url: uploaded.url, storageKey: uploaded.storageKey, durationMs: uploaded.durationMs, bytes: uploaded.bytes, mimeType: uploaded.mimeType || file.type || "application/octet-stream" } }));
                    }
                    return ids;
                } }}
                onClose={() => setVoicePickerOpen(false)}
                onConfirm={(ids, expectedScope) => {
                    assertUserScope(expectedScope);
                    const id = ids[0];
                    const resourceId = id ? audioResourceByItemId.get(id) : "";
                    if (!resourceId) throw new Error(localMode ? "瀏覽器本地聲音已儲存，但角色繫結需要 MURMUR AI APP 的本地資源目錄" : "所選聲音素材尚未同步到服務端資源庫");
                    const item = audioPickerItems.find((entry) => entry.id === id);
                    setVoiceSample({ resourceId, name: item?.title || "角色聲音", url: resourceFileUrl(resourceId), expectedScope });
                    setVoicePickerOpen(false);
                }}
            />
            <Modal className="workspace-modal workspace-modal-compact" title={`繫結聲音素材 · ${voiceAsset?.title || ""}`} open={Boolean(voiceAsset)} okText="繫結並生成新版本" cancelText="取消" okButtonProps={{ loading: bindVoiceMutation.isPending, disabled: !voiceSample }} onCancel={() => { setVoiceAsset(null); setVoiceSample(null); }} onOk={() => bindVoiceMutation.mutate(voiceSample?.expectedScope ?? captureUserScope())}>
                <div className="grid gap-3">
                    <div className="rounded-md border border-border/70 bg-foreground/[.025] p-3">
                        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[var(--fs-label)] text-foreground/48">當前聲音素材</div><div className="mt-1 truncate text-sm font-medium">{voiceSample?.name || "尚未選擇聲音素材"}</div></div><Button icon={<FolderOpen className="size-3.5" />} onClick={() => setVoicePickerOpen(true)}>選擇或上傳音訊</Button></div>
                        {voiceSample ? <audio className="mt-3 w-full" src={voiceSample.url} controls preload="metadata" /> : <div className="mt-2 text-[var(--fs-tiny)] text-foreground/42">從素材庫選擇已有音訊，或上傳 {CHARACTER_VOICE_FORMAT_LABEL} 格式的聲音樣本。</div>}
                    </div>
                    <Input.TextArea rows={3} value={voiceInstructions} placeholder="表演指令，例如：剋制、溫暖、語速稍慢" onChange={(event) => setVoiceInstructions(event.target.value)} />
                    {voiceAsset?.character && voiceAsset.character.voiceStatus !== "missing" ? <div className="flex items-center justify-between pt-1"><span className="text-[var(--fs-label)] text-foreground/45">當前繫結：{voiceAsset.character.voice?.profile.name || "聲音素材不可用"}</span><Popconfirm title="解除當前聲音繫結？" description="該操作會保留歷史版本，並建立一個未繫結聲音的新版本。" okText="解除" cancelText="取消" onConfirm={() => unbindVoiceMutation.mutate()}><Button type="text" danger size="small" loading={unbindVoiceMutation.isPending} icon={<VolumeX className="size-3.5" />}>解除聲音</Button></Popconfirm></div> : null}
                </div>
            </Modal>
        </div>
    );
}

function ProjectAssetFolderTree({ folders, folderCounts, selectedId, onSelect }: { folders: ProjectAssetFolder[]; folderCounts: Record<string, number>; selectedId: string; onSelect: (folderId: string) => void }) {
    const renderLevel = (parentId: string, depth: number, visited: ReadonlySet<string>): ReactNode => depth >= 8 ? null : folders
        .filter((folder) => (folder.parentId || "") === parentId)
        .map((folder) => {
            if (visited.has(folder.id)) return null;
            const count = folderCounts[folder.id] || 0;
            const nextVisited = new Set(visited).add(folder.id);
            return <div key={folder.id}><button type="button" onClick={() => onSelect(folder.id)} className={`flex h-9 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[var(--fs-label)] ${selectedId === folder.id ? "bg-surface-active font-medium" : "text-foreground/52 hover:bg-surface-hover"}`} style={{ paddingLeft: `calc(var(--space-2) + ${depth} * var(--space-3))` }}><FolderOpen className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{folder.name}</span><span className="text-[var(--fs-micro)] tabular-nums text-foreground/36">{count}</span></button>{renderLevel(folder.id, depth + 1, nextVisited)}</div>;
        });
    return <div>{renderLevel("", 0, new Set())}</div>;
}

function ProjectAssetFolderCard({ folder, folders, assets, folderCounts, personalAssets, onOpen, onRename, onMove, onStyle, onTheme, onDelete, deleting }: { folder: ProjectAssetFolder; folders: ProjectAssetFolder[]; assets: ProjectAsset[]; folderCounts: Record<string, number>; personalAssets: Asset[]; onOpen: () => void; onRename: () => void; onMove: (parentId: string) => void; onStyle: (style: CanvasFolderStyle) => void; onTheme: (theme: CanvasFolderTheme) => void; onDelete: () => void; deleting: boolean }) {
    const directAssets = assets.filter((asset) => (asset.folderId || "") === folder.id);
    const totalCount = projectAssetFolderDescendantAssetCount(folders, folderCounts, folder.id);
    const directCount = folderCounts[folder.id] || 0;
    const childFolderCount = folders.filter((item) => item.parentId === folder.id).length;
    const moveItems = projectAssetFolderMoveItems(folders, folder);
    const data: CanvasNodeData = {
        id: folder.id,
        type: CanvasNodeType.Frame,
        title: folder.name,
        position: { x: 0, y: 0 },
        width: 360,
        height: 280,
        metadata: {
            frame: { collapsed: true, expandedWidth: 760, expandedHeight: 520 },
            folder: { style: projectAssetFolderStyle(folder.style), theme: resolveCanvasFolderTheme(folder.theme), createdAt: folder.createdAt },
        },
    };
    const childNodes = directAssets.slice(0, 3).map((asset, index) => projectAssetCanvasPreviewNode(asset, personalAssets.find((item) => item.id === asset.id), index));
    return <article className="project-asset-folder-card" aria-label={`${folder.name} 資料夾，共 ${totalCount} 項`}>
        <button type="button" className="project-asset-folder-open" aria-label={`開啟資料夾 ${folder.name}`} onClick={onOpen} />
        <div className="project-asset-folder-visual"><CanvasFolderPreview data={data} childNodes={childNodes} active={false} isDropTarget={false} readOnly onToggleCollapsed={onOpen} onTitleChange={() => undefined} onStyleChange={() => undefined} onThemeChange={() => undefined} /></div>
        <div className="project-asset-folder-card-footer"><span>{directCount} 項內容{childFolderCount ? ` · ${childFolderCount} 個子資料夾` : ""}</span><Dropdown trigger={["click"]} menu={{ selectedKeys: [`style:${folder.style}`, `theme:${resolveCanvasFolderTheme(folder.theme)}`], items: [{ key: "rename", label: "重新命名", icon: <Pencil className="size-3.5" /> }, { key: "move", label: "移動到", icon: <MoveRight className="size-3.5" />, children: moveItems }, { key: "style", label: "切換樣式", children: [{ key: "style:glass", label: "流光玻璃" }, { key: "style:stacked", label: "內容陳列" }, { key: "style:midnight", label: "午夜封面" }, { key: "style:paper", label: "紙感收藏" }, { key: "style:cinema", label: "電影膠片" }, { key: "style:compact", label: "緊湊資料" }] }, { key: "theme", label: "切換主題", children: CANVAS_FOLDER_THEME_OPTIONS.map((item) => ({ key: `theme:${item.key}`, label: item.label })) }, { key: "delete", label: "刪除空資料夾", icon: <Trash2 className="size-3.5" />, danger: true }], onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); if (key === "rename") onRename(); else if (key.startsWith("move:")) onMove(key === "move:root" ? "" : key.slice(5)); else if (key.startsWith("style:")) onStyle(key.slice(6) as CanvasFolderStyle); else if (key.startsWith("theme:")) onTheme(key.slice(6) as CanvasFolderTheme); else if (key === "delete") onDelete(); } }}><button type="button" className="project-asset-folder-menu" disabled={deleting} aria-label={`${folder.name} 資料夾操作`} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></button></Dropdown></div>
    </article>;
}

function projectAssetCanvasPreviewNode(asset: ProjectAsset, personalAsset: Asset | undefined, index: number): CanvasNodeData {
    const type = asset.mediaType === "image" || asset.category === "character" ? CanvasNodeType.Image : asset.mediaType === "video" ? CanvasNodeType.Video : asset.mediaType === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
    const characterCover = asset.character?.representations.find((item) => item.role === "turnaround_sheet") || asset.character?.representations.find((item) => item.role === "primary") || asset.character?.representations[0];
    const content = characterCover
        ? resourceFileUrl(characterCover.resourceId)
        : personalAsset?.kind === "image"
            ? personalAsset.data.dataUrl || personalAsset.coverUrl
            : personalAsset?.kind === "video" || personalAsset?.kind === "audio"
                ? personalAsset.data.url
                    : personalAsset?.kind === "text"
                        ? personalAsset.data.content
                    : projectAssetRemoteUrl(asset) || asset.previewText || "";
    return { id: asset.id, type, title: asset.title, position: { x: index * 24, y: index * 18 }, width: 240, height: 160, metadata: { content, assetId: asset.id } };
}

function projectAssetFolderStyle(style?: string): CanvasFolderStyle {
    return style === "glass" || style === "stacked" || style === "midnight" || style === "paper" || style === "cinema" || style === "compact" ? style : "glass";
}

function projectAssetRemoteUrl(asset: ProjectAsset) {
    const resourceId = resourceIdFromStorageKey(asset.storageKey);
    return resourceId ? resourceFileUrl(resourceId) : "";
}

function projectAssetFileExtension(mediaType: string) {
    if (mediaType === "image") return "png";
    if (mediaType === "video") return "mp4";
    if (mediaType === "audio") return "mp3";
    if (mediaType === "model") return "glb";
    return "txt";
}

function projectAssetFolderPath(folders: ProjectAssetFolder[], folderId: string) {
    if (!folderId || folderId === ALL_FOLDERS) return [];
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const result: ProjectAssetFolder[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        result.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return result;
}

function projectAssetFolderLabel(folders: ProjectAssetFolder[], folder: ProjectAssetFolder) {
    return projectAssetFolderPath(folders, folder.id).map((item) => item.name).join(" / ");
}

function projectAssetFolderParentLabel(folders: ProjectAssetFolder[], parentId: string) {
    const path = parentId ? projectAssetFolderPath(folders, parentId).map((item) => item.name) : [];
    return ["素材庫", ...path].join(" / ");
}

function projectAssetFolderMoveItems(folders: ProjectAssetFolder[], movingFolder: ProjectAssetFolder) {
    const blocked = new Set([movingFolder.id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const folder of folders) {
            if (!folder.parentId || blocked.has(folder.id) || !blocked.has(folder.parentId)) continue;
            blocked.add(folder.id);
            changed = true;
        }
    }
    return [
        { key: "move:root", label: "素材庫 / 根目錄", disabled: !movingFolder.parentId },
        ...folders.filter((folder) => !blocked.has(folder.id)).map((folder) => ({ key: `move:${folder.id}`, label: projectAssetFolderLabel(folders, folder), disabled: movingFolder.parentId === folder.id })),
    ];
}

function projectAssetFolderDescendantAssetCount(folders: ProjectAssetFolder[], folderCounts: Record<string, number>, folderId: string) {
    const descendantIds = new Set([folderId]);
    let added = true;
    while (added) {
        added = false;
        for (const folder of folders) {
            if (!folder.parentId || descendantIds.has(folder.id) || !descendantIds.has(folder.parentId)) continue;
            descendantIds.add(folder.id);
            added = true;
        }
    }
    return Array.from(descendantIds).reduce((total, id) => total + (folderCounts[id] || 0), 0);
}

function CharacterEditorModal({ open, editing, form, loading, onClose, onSave }: { open: boolean; editing: boolean; form: FormInstance<CharacterForm>; loading: boolean; onClose: () => void; onSave: () => void }) {
    const field = (key: CharacterFormKey) => characterFields.find(([name]) => name === key)!;
    const textArea = (key: CharacterFormKey, rows = 3) => <Form.Item name={key} label={field(key)[1]}><Input.TextArea rows={rows} placeholder={key === "appearance" ? "先描述使用者能看到的穩定特徵…" : undefined} /></Form.Item>;
    const input = (key: CharacterFormKey) => <Form.Item name={key} label={field(key)[1]}><Input /></Form.Item>;
    return <Modal className="workspace-modal workspace-modal-wide library-modal" title={null} open={open} forceRender okText={editing ? "儲存角色設定" : "建立角色卡"} cancelText="取消" okButtonProps={{ loading }} onCancel={onClose} onOk={onSave} styles={{ body: { paddingTop: 0 } }}>
        <div className="mb-1 pb-4"><div className="text-[var(--fs-label)] font-medium text-foreground/52">角色設定</div><h2 className="mt-1 text-xl font-semibold">{editing ? "調整角色設定" : "建立一張角色卡"}</h2></div>
        <Form form={form} layout="vertical" requiredMark={false} className="pt-2"><Form.Item name="name" label="角色名稱" rules={[{ required: true, message: "請輸入角色名稱" }]}><Input size="large" placeholder="例如：林默" /></Form.Item><Tabs items={[{ key: "identity", label: "身份與外觀", forceRender: true, children: <div className="grid gap-x-5 sm:grid-cols-2">{input("role")}{input("aliases")}{textArea("appearance", 4)}{input("physique")}{input("clothing")}{input("props")}{textArea("consistencyPrompt", 4)}{textArea("multiViewPrompt", 3)}</div> }, { key: "performance", label: "表演與聲音", forceRender: true, children: <div className="grid gap-x-5 sm:grid-cols-2">{textArea("personality", 4)}{input("voiceLanguage")}{input("voiceAge")}{input("voiceTimbre")}</div> }]} /></Form>
    </Modal>;
}

type CharacterFormKey = (typeof characterFields)[number][0];

function MediaAssetCard({ asset, personalAsset, folderItems, onOpen, onMove, onCategoryChange, onVersion, onRemove, loading }: { asset: ProjectAsset; personalAsset?: Asset; folderItems: Array<{ key: string; label: string }>; onOpen: () => void; onMove: (folderId: string) => void; onCategoryChange: (category: AssetCategory) => void; onVersion: () => void; onRemove: () => void; loading: boolean }) {
    return <AssetLibraryCard className="project-asset-library-card"><AssetLibraryCardMedia className="relative aspect-[4/3] overflow-hidden bg-foreground/[.05]"><button type="button" className="project-asset-media-button" onClick={onOpen} aria-label={`檢視資產：${asset.title}`}><ProjectAssetMedia asset={asset} personalAsset={personalAsset} /><div className="absolute inset-x-2 top-2 flex items-center justify-between"><StatusPill status={asset.status} /><span className="rounded bg-black/50 px-1.5 py-0.5 text-[var(--fs-micro)] text-white">{mediaLabel(asset.mediaType)}</span></div></button></AssetLibraryCardMedia><div className="p-2.5"><button type="button" className="project-asset-title-button" onClick={onOpen}><span className="min-w-0 truncate text-xs font-medium">{asset.title}</span><span className="shrink-0 text-[var(--fs-micro)] text-foreground/38">{formatTime(asset.updatedAt)}</span></button><div className="mt-1 flex items-center gap-1.5 text-[var(--fs-tiny)] text-foreground/42"><Dropdown trigger={["click"]} menu={{ selectedKeys: [asset.category], items: Object.entries(categoryLabels).filter(([value]) => value !== "character").map(([value, label]) => ({ key: value, label })), onClick: ({ key }) => onCategoryChange(normalizeAssetCategory(key)) }}><button type="button" disabled={loading} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[var(--fs-tiny)] text-foreground/50 hover:bg-surface-hover"><span>{categoryLabel(asset.category)}</span><ChevronDown className="size-3" /></button></Dropdown><span>·</span><span>v{Math.max(1, asset.versionCount)}</span><Link2 className="ml-auto size-3.5 shrink-0 text-foreground/42" /></div><div className="mt-2 flex items-center justify-between gap-2 pt-1"><span className="text-[var(--fs-micro)] text-foreground/38">{mediaLabel(asset.mediaType)}</span><div className="flex items-center"><Dropdown trigger={["click"]} menu={{ selectedKeys: [asset.folderId || ""], items: folderItems, onClick: ({ key }) => onMove(key) }}><Button type="text" size="small" icon={<MoveRight className="size-3.5" />} loading={loading} aria-label={`移動 ${asset.title}`} /></Dropdown><Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onVersion} aria-label={`為 ${asset.title} 建立版本`} /><Popconfirm title="移出專案資產？" okText="移出" cancelText="取消" onConfirm={onRemove}><Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} loading={loading} aria-label={`移出 ${asset.title}`} /></Popconfirm></div></div></div></AssetLibraryCard>;
}

function ProjectAssetMedia({ asset, personalAsset }: { asset: ProjectAsset; personalAsset?: Asset }) {
    if (personalAsset) return <AssetMediaPreview asset={personalAsset} alt={asset.title} className="h-full w-full bg-black object-cover" fallback={<div className="grid h-full place-items-center text-foreground/25"><MediaIcon kind={asset.mediaType} /></div>} />;
    const remoteUrl = projectAssetRemoteUrl(asset);
    if (asset.mediaType === "image" && remoteUrl) return <img src={remoteUrl} alt={asset.title} className="h-full w-full bg-black object-cover" />;
    if (asset.mediaType === "video" && remoteUrl) return <video src={remoteUrl} muted preload="metadata" className="h-full w-full bg-black object-cover" />;
    if (asset.mediaType === "text" && asset.previewText) return <p className="line-clamp-6 h-full overflow-hidden p-4 text-left text-xs leading-5 text-foreground/62">{asset.previewText}</p>;
    return <div className="grid h-full place-items-center text-foreground/25"><MediaIcon kind={asset.mediaType} /></div>;
}

function ProjectAssetPreviewModal({ asset, personalAsset, onClose, onDownload, onReplaceImage }: { asset: ProjectAsset | null; personalAsset?: Asset; onClose: () => void; onDownload: () => void; onReplaceImage: () => void }) {
    const characterCover = asset?.character?.representations.find((item) => item.role === "turnaround_sheet") || asset?.character?.representations.find((item) => item.role === "primary") || asset?.character?.representations[0];
    const remoteUrl = asset ? projectAssetRemoteUrl(asset) : "";
    const canDownload = Boolean(personalAsset && ["image", "video", "audio", "model"].includes(personalAsset.kind)) || Boolean(characterCover) || Boolean(remoteUrl);
    const previewKind = personalAsset?.kind || asset?.mediaType;
    const previewClass = asset?.category === "character" ? "is-character" : previewKind === "video" ? "is-video" : previewKind === "audio" ? "is-audio" : previewKind === "text" ? "is-text" : "is-image";
    return (
        <Modal className="workspace-modal workspace-modal-wide library-modal project-asset-preview-modal" title={asset?.category === "character" ? "角色卡預覽" : "資產預覽"} open={Boolean(asset)} onCancel={onClose} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>關閉</Button>{asset?.category === "character" ? <Button onClick={onReplaceImage}>替換圖片</Button> : null}{canDownload ? <Button type="primary" icon={<Download className="size-3.5" />} onClick={onDownload}>下載</Button> : null}</div>}>
            {asset ? <div className="project-asset-preview-layout">
                <div className={`project-asset-preview-stage ${previewClass}`}>
                    {asset.category === "character" ? characterCover ? <CachedResourceImage storageKey={`resource:${characterCover.resourceId}`} src={resourceFileUrl(characterCover.resourceId)} alt={asset.title} className="project-asset-preview-media" fallback={<div className="grid min-h-48 place-items-center text-foreground/35"><UserRound className="size-12" /></div>} /> : <div className="grid min-h-48 place-items-center text-foreground/35"><UserRound className="size-12" /></div> : personalAsset?.kind === "video" ? <video src={personalAsset.data.url} controls className="project-asset-preview-media" /> : personalAsset?.kind === "audio" ? <audio src={personalAsset.data.url} controls className="project-asset-preview-audio" /> : personalAsset?.kind === "image" ? <AssetMediaPreview asset={personalAsset} alt={asset.title} className="project-asset-preview-media" /> : personalAsset?.kind === "text" ? <p className="project-asset-preview-text">{personalAsset.data.content}</p> : asset.mediaType === "video" && remoteUrl ? <video src={remoteUrl} controls className="project-asset-preview-media" /> : asset.mediaType === "audio" && remoteUrl ? <audio src={remoteUrl} controls className="project-asset-preview-audio" /> : asset.mediaType === "image" && remoteUrl ? <img src={remoteUrl} alt={asset.title} className="project-asset-preview-media" /> : asset.mediaType === "text" && asset.previewText ? <p className="project-asset-preview-text">{asset.previewText}</p> : <div className="grid min-h-48 place-items-center text-foreground/35"><MediaIcon kind={asset.mediaType} /></div>}
                </div>
                <aside className="project-asset-preview-details">
                    <div className="project-asset-preview-eyebrow">{asset.category === "character" ? "角色卡" : mediaLabel(asset.mediaType)}</div>
                    <h3 className="project-asset-preview-title">{asset.title}</h3>
                    <p className="project-asset-preview-meta">更新於 {formatTime(asset.updatedAt)}</p>
                    {asset.character ? <div className="project-asset-preview-sections"><section><span>劇情定位</span><p>{textValue(asset.character.definition.role) || "未填寫"}</p></section><section><span>外觀設定</span><p>{textValue(asset.character.definition.appearance) || textValue(asset.character.definition.consistencyPrompt) || "未填寫"}</p></section><div className="project-asset-preview-status">形象：{asset.character.visualStatus === "ready" ? "已繫結" : "待完善"} · 聲音：{asset.character.voiceStatus === "ready" ? "已繫結" : "未繫結"}</div></div> : <div className="project-asset-preview-facts"><span>版本 <strong>v{Math.max(1, asset.versionCount)}</strong></span><span>{asset.usages.length} 處引用</span></div>}
                </aside>
            </div> : null}
        </Modal>
    );
}

function characterDefinition(values: CharacterForm) {
    const definition: Record<string, unknown> = Object.fromEntries(characterFields.map(([key]) => [key, values[key]?.trim() || (key === "aliases" ? [] : "")]));
    definition.aliases = values.aliases?.split(/[，,]/).map((item) => item.trim()).filter(Boolean) || [];
    return definition;
}

function fieldValue(value: unknown) { return Array.isArray(value) ? value.join("，") : typeof value === "string" ? value : ""; }
function syncPersonalCharacterProjection(asset: ProjectAsset) {
    if (!asset.character) return;
    const current = useAssetStore.getState().assets;
    const existing = current.find((item) => item.id === asset.id);
    const cover = asset.character.representations.find((item) => item.role === "turnaround_sheet") || asset.character.representations.find((item) => item.role === "primary") || asset.character.representations.find((item) => item.role === "front");
    const projected: EntityAsset = {
        id: asset.id,
        kind: "entity",
        title: asset.title,
        coverUrl: cover ? resourceFileUrl(cover.resourceId) : existing?.coverUrl || "",
        tags: existing?.tags || [],
        category: "character",
        status: asset.status as AssetStatus,
        primaryVersionId: asset.primaryVersionId,
        source: existing?.source || "project-character",
        createdAt: existing?.createdAt || asset.updatedAt,
        updatedAt: asset.updatedAt,
        data: { definition: asset.character.definition },
    };
    useAssetStore.getState().replaceAssets([projected, ...current.filter((item) => item.id !== asset.id)]);
}
function MediaIcon({ kind }: { kind: string }) { if (kind === "image") return <ImageIcon className="size-10" />; if (kind === "video") return <Video className="size-10" />; if (kind === "audio") return <Music2 className="size-10" />; if (kind === "model") return <Box className="size-10" />; return <FileText className="size-10" />; }
