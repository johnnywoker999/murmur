import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { App, Button, Input, Modal, Select, Typography } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { AudioLines, CalendarDays, CheckCircle2, Clock3, ExternalLink, Film, FolderOpen, Image as ImageIcon, MessageSquareText, PlugZap, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { EmptyState } from "@/components/ui/product/empty-state";
import { PageHeader } from "@/components/layout/workspace-page";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import "@/lib/plugins/builtin";
import { EAGLE_PLUGIN_ID } from "@/lib/plugins/builtin/eagle";
import { PROMPT_OPTIMIZER_PLUGIN_ID } from "@/lib/plugins/builtin/prompt-optimizer";
import { RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { isOfficialApplicationPluginId } from "@/lib/plugins/official-applications";
import type { PluginManifest, PluginManifestV2, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import { getEagleLibrary, type EagleFolder } from "@/services/api/eagle";
import { fetchPlugins, setUserPluginEnabled, type BackendPlugin, type PluginState } from "@/services/api/plugins";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useUserStore } from "@/stores/use-user-store";
import { isLocalRuntimeMode } from "@/lib/runtime-mode";
import { workspaceCapabilities } from "@/services/workspace-mode";

import { PluginDetailsModal } from "./plugin-documentation-modals";
import "./plugins.css";

const categoryLabels: Record<string, string> = {
    provider: "模型渠道",
    "canvas-node": "畫布節點",
    workflow: "工作流",
    transform: "媒體轉換",
    "asset-source": "素材來源",
    "ai-capability": "AI 能力",
    "usage-observer": "用量觀察",
    agent: "智慧體",
    "import-export": "匯入匯出",
};

const surfaceLabels: Record<string, string> = {
    node: "畫布節點",
    fullscreen: "全屏工作臺",
    hybrid: "混合接入",
    "asset-source": "素材庫",
};

const permissionLabels: Record<string, string> = {
    "canvas.read": "讀取畫布",
    "canvas.write": "修改畫布",
    "asset.read": "讀取素材",
    "asset.search": "搜尋素材",
    "asset.import": "匯入素材",
    "asset.upload": "上傳素材",
    "generation.run": "呼叫生成",
    "ai.text": "呼叫已配置的文本/視覺理解模型",
    "media.read": "讀取輸入媒體",
    "external.open": "開啟外部詳情",
};

const pluginDateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" });

const protocolSectionMeta = [
    { key: "text", label: "文本協議", description: "對話、推理與流式響應", icon: MessageSquareText },
    { key: "image", label: "圖片協議", description: "生成、編輯與參考圖", icon: ImageIcon },
    { key: "video", label: "影片協議", description: "建立任務、輪詢與媒體結果", icon: Film },
    { key: "audio", label: "音訊協議", description: "語音與非同步音訊任務", icon: AudioLines },
] as const;

export default function PluginsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const localRuntime = isLocalRuntimeMode() || workspaceCapabilities().local;
    const visibleProtocolSectionMeta = protocolSectionMeta;
    const installations = usePluginStore((state) => state.installations);
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);
    const setEnabled = usePluginStore((state) => state.setEnabled);
    const setRuntimeStatuses = usePluginStore((state) => state.setRuntimeStatuses);
    const setPluginStates = usePluginStore((state) => state.setPluginStates);
    const pluginStates = usePluginStore((state) => state.pluginStates);
    const updateConfig = usePluginStore((state) => state.updateConfig);
    const builtinPlugins = useMemo(() => listRegisteredPlugins(), []);
    const [backendPlugins, setBackendPlugins] = useState<BackendPlugin[]>([]);
    const [backendPluginsLoading, setBackendPluginsLoading] = useState(false);
    const [settingsPluginId, setSettingsPluginId] = useState<string | null>(null);
    const [detailsPluginId, setDetailsPluginId] = useState<string | null>(null);
    const [detailsRestoreFocus, setDetailsRestoreFocus] = useState(false);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
    const [trustFilter, setTrustFilter] = useState<"all" | "trusted">("all");
    const [eagleBaseUrl, setEagleBaseUrl] = useState("http://localhost:41595");
    const [eagleAutoUploadGenerated, setEagleAutoUploadGenerated] = useState(true);
    const [eagleGeneratedFolderId, setEagleGeneratedFolderId] = useState("");
    const [eagleFolders, setEagleFolders] = useState<EagleFolder[]>([]);
    const [eagleFoldersLoading, setEagleFoldersLoading] = useState(false);
    const [eagleFoldersError, setEagleFoldersError] = useState("");

    useEffect(() => {
        for (const plugin of builtinPlugins) ensurePlugin(plugin.manifest);
    }, [builtinPlugins, ensurePlugin]);

    const reloadBackendPlugins = async () => {
        if (localRuntime) {
            setBackendPlugins([]);
            setPluginStates({});
            return;
        }
        setBackendPluginsLoading(true);
        try {
            const result = await fetchPlugins();
            setBackendPlugins(result.plugins);
            setPluginStates(result.states);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "讀取外掛中心失敗");
            setBackendPlugins([]);
        } finally {
            setBackendPluginsLoading(false);
        }
    };

    useEffect(() => {
        void reloadBackendPlugins();
    }, [localRuntime, user?.id]);

    const remotePlugins = useMemo(() => backendPlugins.map(toRegisteredPlugin), [backendPlugins]);
    const registeredPlugins = useMemo(() => {
        const byId = new Map(builtinPlugins.map((plugin) => [plugin.manifest.id, plugin]));
        for (const plugin of remotePlugins) byId.set(plugin.manifest.id, plugin);
        return [...byId.values()];
    }, [builtinPlugins, remotePlugins]);
    const backendPluginById = useMemo(() => new Map(backendPlugins.map((plugin) => [plugin.manifest.id, plugin])), [backendPlugins]);

    const eagle = installations.find((item) => item.manifest.id === EAGLE_PLUGIN_ID);

    useEffect(() => {
        const configured = eagle?.config.baseUrl;
        if (typeof configured === "string" && configured.trim()) setEagleBaseUrl(configured);
        const autoUpload = eagle?.config.autoUploadGenerated;
        setEagleAutoUploadGenerated(autoUpload !== false && autoUpload !== "false");
        const folderId = eagle?.config.generatedFolderId;
        setEagleGeneratedFolderId(typeof folderId === "string" ? folderId : "");
    }, [eagle?.config.baseUrl, eagle?.config.autoUploadGenerated, eagle?.config.generatedFolderId]);

    const filteredPlugins = useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase();
        return registeredPlugins.filter((plugin) => {
            const state = pluginStates[plugin.manifest.id];
            const isApplicationPlugin = backendPluginById.get(plugin.manifest.id)?.management.kind === "application" || isOfficialApplicationPluginId(plugin.manifest.id);
            if (user?.role !== "admin" && !features.systemPluginsVisibleToUsers && !isApplicationPlugin) return false;
            const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
            const enabled = state?.effectiveEnabled ?? Boolean(installation?.enabled);
            const manifest = plugin.manifest;
            if (localRuntime && manifest.id === RUNNINGHUB_PLUGIN_ID) return false;
            const contributionKinds = contributionKindsFor(manifest);
            const searchableText = [manifest.name, manifest.description, manifest.author, manifest.id, ...contributionKinds.map((kind) => categoryLabels[kind] || kind)].filter(Boolean).join(" ").toLocaleLowerCase();
            if (normalizedSearch && !searchableText.includes(normalizedSearch)) return false;
            if (categoryFilter !== "all" && !pluginMatchesCategory(manifest, categoryFilter)) return false;
            if (trustFilter === "trusted" && !manifest.trusted) return false;
            if (statusFilter === "enabled" && !enabled) return false;
            if (statusFilter === "disabled" && enabled) return false;
            return true;
        });
    }, [backendPluginById, categoryFilter, features.systemPluginsVisibleToUsers, installations, localRuntime, pluginStates, registeredPlugins, search, statusFilter, trustFilter, user?.role]);

    const pluginSections = useMemo(
        () =>
            [
                ...visibleProtocolSectionMeta.map((section) => ({ ...section, plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, section.key)) })),
                { key: "other", label: "應用外掛", description: "畫布、素材與工作流擴充套件", icon: PlugZap, plugins: filteredPlugins.filter((plugin) => pluginMatchesCategory(plugin.manifest, "other")) },
            ].filter((section) => categoryFilter === "all" || section.key === categoryFilter),
        [categoryFilter, filteredPlugins, visibleProtocolSectionMeta],
    );

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const selectCategory = (key: string) => {
        setCategoryFilter(key);
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
    };

    const categoryCounts = useMemo(() => {
        const visiblePlugins = registeredPlugins.filter((plugin) => {
            if (localRuntime && plugin.manifest.id === RUNNINGHUB_PLUGIN_ID) return false;
            return user?.role === "admin" || features.systemPluginsVisibleToUsers || isOfficialApplicationPluginId(plugin.manifest.id);
        });
        const counts: Record<string, number> = { all: visiblePlugins.length, text: 0, image: 0, video: 0, audio: 0, other: 0 };
        for (const plugin of visiblePlugins) {
            for (const section of visibleProtocolSectionMeta) {
                if (pluginMatchesCategory(plugin.manifest, section.key)) counts[section.key] += 1;
            }
            if (pluginMatchesCategory(plugin.manifest, "other")) counts.other += 1;
        }
        return counts;
    }, [features.systemPluginsVisibleToUsers, localRuntime, registeredPlugins, user?.role, visibleProtocolSectionMeta]);

    const settingsPlugin = settingsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === settingsPluginId) : undefined;
    const settingsInstallation = settingsPlugin ? installations.find((item) => item.manifest.id === settingsPlugin.manifest.id) : undefined;
    const settingsEnabled = settingsPlugin ? (pluginStates[settingsPlugin.manifest.id]?.effectiveEnabled ?? Boolean(settingsInstallation?.enabled)) : false;
    const detailsPlugin = detailsPluginId ? registeredPlugins.find((plugin) => plugin.manifest.id === detailsPluginId) : undefined;

    const hasPluginConfiguration = (plugin: RegisteredPlugin) => Boolean(plugin.manifest.configuration?.fields?.length);
    const canConfigurePlugin = (plugin: RegisteredPlugin) => localRuntime ? hasPluginConfiguration(plugin) : Boolean(pluginStates[plugin.manifest.id]?.canConfigure) && (hasPluginConfiguration(plugin) || plugin.manifest.id === RUNNINGHUB_PLUGIN_ID);

    const isPluginEnabled = (plugin: RegisteredPlugin, installation = installations.find((item) => item.manifest.id === plugin.manifest.id)) => pluginStates[plugin.manifest.id]?.effectiveEnabled ?? Boolean(installation?.enabled);

    const togglePlugin = async (plugin: RegisteredPlugin, enabled: boolean) => {
        try {
            if (localRuntime) {
                setEnabled(plugin.manifest.id, enabled);
                message.success(`${plugin.manifest.name}${enabled ? "已啟用" : "已停用"}`);
                return;
            }
            const next = await setUserPluginEnabled(plugin.manifest.id, enabled);
            setEnabled(plugin.manifest.id, enabled);
            setPluginStates({ ...usePluginStore.getState().pluginStates, [next.pluginId]: next });
            if (next.pluginId === RUNNINGHUB_PLUGIN_ID) {
                setRuntimeStatuses({ ...usePluginStore.getState().runtimeStatuses, [next.pluginId]: next.effectiveEnabled ? "enabled" : "disabled" });
            }
            message.success(`${plugin.manifest.name}${enabled ? "已啟用" : "已停用"}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新外掛狀態失敗");
        }
    };

    const loadEagleFolders = async (url = eagleBaseUrl) => {
        setEagleFoldersLoading(true);
        setEagleFoldersError("");
        try {
            const result = await getEagleLibrary(url.trim().replace(/\/$/, ""));
            setEagleFolders(result.library.folders || []);
        } catch (reason) {
            setEagleFoldersError(reason instanceof Error ? reason.message : "讀取 Eagle 資料夾失敗");
            setEagleFolders([]);
        } finally {
            setEagleFoldersLoading(false);
        }
    };

    const saveEagleConfig = () => {
        const baseUrl = eagleBaseUrl.trim().replace(/\/$/, "");
        if (!/^https?:\/\//i.test(baseUrl)) {
            message.error("Eagle 地址必須以 http:// 或 https:// 開頭");
            return;
        }
        updateConfig(EAGLE_PLUGIN_ID, { baseUrl, autoUploadGenerated: eagleAutoUploadGenerated, generatedFolderId: eagleGeneratedFolderId });
        message.success("Eagle 外掛配置已儲存");
    };

    return (
        <main className="app-workspace-page plugins-page flex h-full min-h-0 flex-col text-foreground">
            <div ref={scrollContainerRef} className="app-workspace-scroll min-h-0 flex-1 overflow-y-auto">
                <div className="plugins-page-layout">
                    <aside className="plugins-sidebar" aria-label="外掛分類">
                        <div className="plugins-sidebar-heading">
                            <PageHeader title="外掛中心" description="連線模型、素材與工作流，拓展你的創作工具。" />
                        </div>
                        <nav className="plugins-sidebar-nav">
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "all" ? " is-active" : ""}`} aria-current={categoryFilter === "all" ? "page" : undefined} onClick={() => selectCategory("all")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    全部外掛
                                </span>
                                <span>{categoryCounts.all}</span>
                            </button>
                            {visibleProtocolSectionMeta.map((section) => {
                                const SectionIcon = section.icon;
                                return (
                                    <button
                                        key={section.key}
                                        type="button"
                                        className={`plugins-sidebar-item${categoryFilter === section.key ? " is-active" : ""}`}
                                        aria-current={categoryFilter === section.key ? "page" : undefined}
                                        onClick={() => selectCategory(section.key)}
                                    >
                                        <span className="plugins-sidebar-item-label">
                                            <SectionIcon className="size-4" />
                                            {section.label}
                                        </span>
                                        <span>{categoryCounts[section.key] || 0}</span>
                                    </button>
                                );
                            })}
                            <button type="button" className={`plugins-sidebar-item${categoryFilter === "other" ? " is-active" : ""}`} aria-current={categoryFilter === "other" ? "page" : undefined} onClick={() => selectCategory("other")}>
                                <span className="plugins-sidebar-item-label">
                                    <PlugZap className="size-4" />
                                    應用外掛
                                </span>
                                <span>{categoryCounts.other}</span>
                            </button>
                        </nav>
                    </aside>
                    <div className="plugins-page-content">
                        <CollectionToolbar label="外掛篩選" trailing={<div className="plugins-toolbar-actions">
                                <Button icon={<RefreshCw className="size-4" />} loading={backendPluginsLoading} onClick={() => void reloadBackendPlugins()}>
                                    重新整理外掛
                                </Button>
                            </div>}>
                            <Input
                                className="plugins-search"
                                prefix={<Search className="size-4 text-foreground/38" aria-hidden="true" />}
                                value={search}
                                allowClear
                                placeholder="搜尋外掛名稱、描述或作者"
                                onChange={(event) => setSearch(event.target.value)}
                            />
                            <Select
                                className="plugins-filter"
                                value={statusFilter}
                                options={[
                                    { value: "all", label: "全部狀態" },
                                    { value: "enabled", label: "已啟用" },
                                    { value: "disabled", label: "已停用" },
                                ]}
                                onChange={(value) => setStatusFilter(value as "all" | "enabled" | "disabled")}
                                aria-label="按狀態篩選"
                            />
                            <Select
                                className="plugins-filter"
                                value={trustFilter}
                                options={[
                                    { value: "all", label: "全部來源" },
                                    { value: "trusted", label: "可信外掛" },
                                ]}
                                onChange={(value) => setTrustFilter(value as "all" | "trusted")}
                                aria-label="按來源篩選"
                            />
                        </CollectionToolbar>

                        {filteredPlugins.length ? (
                            <div className="plugins-sections">
                                {pluginSections.map((section) => {
                                    const SectionIcon = section.icon;
                                    return (
                                        <section
                                            key={section.key}
                                            id={`plugin-section-${section.key}`}
                                            className="plugin-section"
                                            data-category={section.key === "image" ? "creative" : section.key === "video" ? "drama" : section.key === "audio" ? "social" : undefined}
                                        >
                                            <header className="plugin-section-heading">
                                                <span className="plugin-section-icon">
                                                    <SectionIcon className="size-4" />
                                                </span>
                                                <div>
                                                    <h2>{section.label}</h2>
                                                    <p>{section.description}</p>
                                                </div>
                                                <span className="plugin-section-count">{section.plugins.length}</span>
                                            </header>
                                            {section.plugins.length ? (
                                                <div className="plugins-grid">
                                                    {section.plugins.map((plugin) => {
                                                        const installation = installations.find((item) => item.manifest.id === plugin.manifest.id);
                                                        const remote = backendPluginById.get(plugin.manifest.id);
                                                        const enabled = isPluginEnabled(plugin, installation);
                                                        const trusted = Boolean(plugin.manifest.trusted);
                                                        const state = pluginStates[plugin.manifest.id];
                                                        const sourceLabel = pluginSourceLabel(plugin, state);
                                                        const canConfigure = canConfigurePlugin(plugin);
                                                        const canToggle = localRuntime ? true : Boolean(state?.canToggle);
                                                        return (
                                                            <section key={plugin.manifest.id} className={`product-collection-card plugin-card library-card-surface${trusted ? " is-trusted" : ""}`}>
                                                                <button
                                                                    type="button"
                                                                    className="plugin-card-main"
                                                                    aria-label={`檢視${plugin.manifest.name}檔案`}
                                                                    onClick={(event) => {
                                                                        const openedByKeyboard = event.detail === 0;
                                                                        setDetailsRestoreFocus(openedByKeyboard);
                                                                        setDetailsPluginId(plugin.manifest.id);
                                                                        if (!openedByKeyboard) event.currentTarget.blur();
                                                                    }}
                                                                >
                                                                    <div className="plugin-card-heading">
                                                                        <span className={`plugin-icon-tile${trusted ? " is-trusted" : ""}`} aria-hidden="true">
                                                                            <SectionIcon className="size-5" />
                                                                        </span>
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="plugin-card-title-row">
                                                                                <h3>{plugin.manifest.name}</h3>
                                                                                <span className="plugin-version">v{plugin.manifest.version}</span>
                                                                            </div>
                                                                            <div className="plugin-card-labels">
                                                                                <span className={`plugin-source-label${sourceLabel === "系統外掛" ? " is-system" : ""}`}>{sourceLabel}</span>
                                                                                {trusted ? (
                                                                                    <span className="plugin-trust-label">
                                                                                        <ShieldCheck className="size-3.5" />
                                                                                        可信外掛
                                                                                    </span>
                                                                                ) : null}
                                                                                <span className="plugin-category-label">
                                                                                    {contributionKindsFor(plugin.manifest)
                                                                                        .map((kind) => categoryLabels[kind] ?? kind)
                                                                                        .join(" · ")}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <p className="plugin-card-description">{plugin.manifest.description}</p>

                                                                    <div className="plugin-card-meta">
                                                                        <span>
                                                                            <CalendarDays className="size-3.5" />
                                                                            釋出 {formatPluginDate(plugin.manifest.publishedAt)}
                                                                        </span>
                                                                        <span>
                                                                            <Clock3 className="size-3.5" />
                                                                            更新 {formatPluginDate(plugin.manifest.updatedAt)}
                                                                        </span>
                                                                    </div>

                                                                    <div className="plugin-card-tags">
                                                                        {(plugin.manifest.surfaces || []).map((surface) => (
                                                                            <span key={surface}>{surfaceLabels[surface] ?? surface}</span>
                                                                        ))}
                                                                        {providerCapabilitiesFor(plugin.manifest).map((capability) => (
                                                                            <span key={capability}>{capabilityLabel(capability)}</span>
                                                                        ))}
                                                                        {plugin.manifest.contributes.providers?.some((provider) => provider.poll) ? <span>非同步輪詢</span> : null}
                                                                        <span>{plugin.manifest.permissions.length} 項能力</span>
                                                                    </div>
                                                                </button>

                                                                <div className="plugin-card-actions">
                                                                    <span role="status" className={`settings-channel-status ${enabled ? "is-ready" : ""}`}>
                                                                        <i aria-hidden="true" />
                                                                        {!state?.platformAvailable && state?.blockedReason ? state.blockedReason : enabled ? "已啟用" : "已停用"}
                                                                    </span>
                                                                    <Switch
                                                                        className="plugin-state-switch"
                                                                        disabled={!canToggle}
                                                                        checked={enabled}
                                                                        aria-label={`${plugin.manifest.name}，當前${enabled ? "已啟用，點選停用" : "已停用，點選啟用"}`}
                                                                        title={state?.blockedReason}
                                                                        onChange={(checked) => void togglePlugin(plugin, checked)}
                                                                    />
                                                                    {canConfigure ? (
                                                                        <Button
                                                                            className="plugin-settings-button"
                                                                            icon={<Settings2 className="size-4" />}
                                                                            aria-expanded={settingsPluginId === plugin.manifest.id}
                                                                            aria-haspopup="dialog"
                                                                            onClick={() => setSettingsPluginId(plugin.manifest.id)}
                                                                        >
                                                                            設定
                                                                        </Button>
                                                                    ) : null}
                                                                </div>

                                                                {installation?.lastError || remote?.error ? (
                                                                    <Typography.Text type="danger" className="plugin-error" role="alert">
                                                                        {installation?.lastError || remote?.error}
                                                                    </Typography.Text>
                                                                ) : null}
                                                            </section>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="plugin-section-empty-hint">
                                                    <span>暫無該型別的外掛</span>
                                                </div>
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                className="min-h-[260px] rounded-[var(--plugins-card-radius)] bg-foreground/[0.03]"
                                icon={SlidersHorizontal}
                                title="沒有匹配的外掛"
                                description="試試清空搜尋詞，或放寬篩選條件。"
                                action={
                                    <Button
                                        onClick={() => {
                                            setSearch("");
                                            setCategoryFilter("all");
                                            setStatusFilter("all");
                                            setTrustFilter("all");
                                        }}
                                    >
                                        清除篩選
                                    </Button>
                                }
                            />
                        )}

                        <Modal
                            className="workspace-modal workspace-modal-wide plugin-settings-modal"
                            title={settingsPlugin ? `${settingsPlugin.manifest.name} 設定` : null}
                            open={Boolean(settingsPlugin)}
                            centered
                            footer={null}
                            destroyOnHidden
                            onCancel={() => setSettingsPluginId(null)}
                            styles={{ body: { maxHeight: "min(72vh, 760px)", overflowY: "auto", overscrollBehavior: "contain" } }}
                        >
                            {settingsPlugin ? (
                                <div className="plugin-settings-panel plugin-settings-modal-panel">
                                    <div className="plugin-settings-heading">
                                        <div>
                                            <p>只展示這個外掛實際支援的配置項。</p>
                                        </div>
                                        {settingsPlugin.manifest.trusted ? (
                                            <span className="plugin-trust-label">
                                                <ShieldCheck className="size-3.5" />
                                                可信外掛
                                            </span>
                                        ) : (
                                            <span className="plugin-category-label">第三方外掛</span>
                                        )}
                                    </div>

                                    {settingsPlugin.manifest.id === EAGLE_PLUGIN_ID ? (
                                        <>
                                            <div className="plugin-settings-fields">
                                                <div className="min-w-0">
                                                    <label htmlFor="eagle-base-url">Eagle 本地 API 地址</label>
                                                    <Input id="eagle-base-url" aria-label="Eagle 本地 API 地址" value={eagleBaseUrl} onChange={(event) => setEagleBaseUrl(event.target.value)} placeholder="http://localhost:41595" />
                                                    <p>Eagle 必須在本機執行；{brandName}通過外掛直接讀取和寫入 Eagle 原始檔案。</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-auto-upload-generated">自動歸檔生成結果</label>
                                                        <Switch id="eagle-auto-upload-generated" checked={eagleAutoUploadGenerated} onChange={setEagleAutoUploadGenerated} aria-label="自動歸檔生成結果到 Eagle" />
                                                    </div>
                                                    <p>圖片、影片和音訊生成成功後，自動寫入 Eagle；{brandName}本地素材仍會保留。</p>
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="plugin-setting-label-row">
                                                        <label htmlFor="eagle-generated-folder">生成結果寫入資料夾</label>
                                                        <Button type="link" size="small" loading={eagleFoldersLoading} onClick={() => void loadEagleFolders()}>
                                                            讀取資料夾
                                                        </Button>
                                                    </div>
                                                    <Select
                                                        id="eagle-generated-folder"
                                                        aria-label="生成結果寫入資料夾"
                                                        showSearch
                                                        allowClear
                                                        value={eagleGeneratedFolderId || undefined}
                                                        placeholder="Eagle 根目錄"
                                                        optionFilterProp="label"
                                                        options={[{ value: "__root__", label: "Eagle 根目錄" }, ...eagleFolderOptions(eagleFolders)]}
                                                        onChange={(value) => setEagleGeneratedFolderId(value === "__root__" || !value ? "" : value)}
                                                    />
                                                    <p>{eagleFoldersError || "預設寫入 Eagle 根目錄；選擇資料夾後按 Eagle 原始目錄歸檔。"}</p>
                                                </div>
                                            </div>
                                            <div className="plugin-settings-actions">
                                                <Button type="primary" icon={<CheckCircle2 className="size-4" />} onClick={saveEagleConfig}>
                                                    儲存配置
                                                </Button>
                                                <Button icon={<FolderOpen className="size-4" />} disabled={!settingsEnabled} onClick={() => navigate("/plugins/eagle")}>
                                                    開啟 Eagle 素材庫
                                                </Button>
                                                <Button icon={<ExternalLink className="size-4" />} href="https://api.eagle.cool/" target="_blank">
                                                    檢視 API
                                                </Button>
                                            </div>
                                        </>
                                    ) : settingsPlugin.manifest.id === PROMPT_OPTIMIZER_PLUGIN_ID ? (
                                        <div className="rounded-[var(--r-md)] border border-border/60 bg-muted/25 px-3 py-3 text-[var(--fs-body)] leading-6 text-foreground/70">
                                            <p>在創作頁或圖片、影片節點的提示詞編輯器中使用“最佳化”按鈕，即可讓當前文本模型整理提示詞。</p>
                                            <p className="mt-2 text-[var(--fs-micro)] text-foreground/50">外掛不會自動覆蓋原提示詞，只有點選“採用”後才會回填到當前輸入框。</p>
                                        </div>
                                    ) : settingsPlugin.manifest.id === RUNNINGHUB_PLUGIN_ID ? (
                                        <div className="plugin-settings-empty">
                                            <p>RunningHub 的 API Key、Workflow / App 和欄位對映在宿主設定頁維護。</p>
                                            <Button
                                                type="primary"
                                                icon={<ExternalLink className="size-4" />}
                                                onClick={() => {
                                                    setSettingsPluginId(null);
                                                    navigate("/settings?section=runninghub");
                                                }}
                                            >
                                                開啟工作流設定
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="plugin-settings-empty">
                                            {`貢獻能力：${
                                                contributionKindsFor(settingsPlugin.manifest)
                                                    .map((kind) => categoryLabels[kind] || kind)
                                                    .join("、") || "未宣告"
                                            }。當前接入位置和許可權會根據外掛清單自動生效。`}
                                        </div>
                                    )}

                                    <div className="plugin-permissions">
                                        <div>
                                            <span>接入位置</span>
                                            {(settingsPlugin.manifest.surfaces || []).map((surface) => surfaceLabels[surface] ?? surface).join("、") || "由貢獻點決定"}
                                        </div>
                                        <div>
                                            <span>外掛能力</span>
                                            {settingsPlugin.manifest.permissions.map((permission) => permissionLabels[permission] ?? permission).join("、")}
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </Modal>
                        <PluginDetailsModal plugin={detailsPlugin} restoreFocus={detailsRestoreFocus} onClose={() => setDetailsPluginId(null)} />
                    </div>
                </div>
            </div>
        </main>
    );
}

function formatPluginDate(value?: string) {
    if (!value) return "未記錄";
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? pluginDateFormatter.format(timestamp) : "未記錄";
}

function toRegisteredPlugin(plugin: BackendPlugin): RegisteredPlugin {
    return { manifest: plugin.manifest, source: plugin.source };
}

function pluginSourceLabel(plugin: RegisteredPlugin, state?: PluginState) {
    if (plugin.source === "uploaded") return "自定義外掛";
    if (plugin.source === "system") return "系統外掛";
    if (state?.canToggle || isOfficialApplicationPluginId(plugin.manifest.id)) return "官方外掛";
    return "系統外掛";
}

function contributionKindsFor(manifest: PluginManifest | PluginManifestV2): string[] {
    const contributions = manifest.contributes;
    const kinds: string[] = [];
    if (contributions.providers?.length) kinds.push("provider");
    if (contributions.workflows?.length) kinds.push("workflow");
    if (contributions.canvasNodes?.length) kinds.push("canvas-node");
    if (contributions.transforms?.length) kinds.push("transform");
    if (contributions.assetSources?.length) kinds.push("asset-source");
    if (contributions.aiCapabilities?.length) kinds.push("ai-capability");
    if (contributions.usageObservers?.length) kinds.push("usage-observer");
    if (contributions.agents?.length) kinds.push("agent");
    if (contributions.importExport?.length) kinds.push("import-export");
    return kinds;
}

function providerCapabilitiesFor(manifest: PluginManifest | PluginManifestV2) {
    return [...new Set((manifest.contributes.providers || []).flatMap((provider) => provider.capabilities))];
}

function pluginMatchesCategory(manifest: PluginManifest | PluginManifestV2, category: string) {
    const providerCapabilities = providerCapabilitiesFor(manifest);
    if (category === "other") return providerCapabilities.length === 0;
    return providerCapabilities.includes(category as "text" | "image" | "video" | "audio");
}

function capabilityLabel(value: string) {
    return ({ text: "文本", image: "圖片", video: "影片", audio: "音訊" } as Record<string, string>)[value] || value;
}

function eagleFolderOptions(folders: EagleFolder[]) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const pathFor = (folder: EagleFolder) => {
        const path: string[] = [];
        const seen = new Set<string>();
        let current: EagleFolder | undefined = folder;
        while (current && !seen.has(current.id)) {
            seen.add(current.id);
            path.unshift(current.name);
            current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        return path.join(" / ");
    };
    return folders.map((folder) => ({ value: folder.id, label: pathFor(folder) })).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}
