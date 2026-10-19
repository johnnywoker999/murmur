import { App, Button, Input, Skeleton, Tabs } from "antd";
import { DesktopUpdateSaveInProgressError, registerDesktopUpdatePreparation } from "@/services/desktop-update-preparation";
import { Select } from "@/components/ui/base/select";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { StatusBadge } from "@/components/ui/base/badges";
import { Callout } from "@/components/ui/product/callout";
import { EmptyState } from "@/components/ui/product/empty-state";
import { RotateCcw, Save, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptCodeEditor } from "@/components/prompt/prompt-code-editor";
import {
    listUserPromptPreferences,
    resetUserPromptCustomization,
    updateUserPromptCustomization,
    type UserPromptCustomization,
    type UserPromptPreference,
} from "@/services/api/prompt-preferences";

type CustomizationMode = UserPromptCustomization["mode"];

const modeOptions = [
    { label: "跟隨平臺", value: "inherit" },
    { label: "追加要求", value: "append" },
    { label: "高階改寫", value: "rewrite" },
];

export function PromptPreferencesPane() {
    const { message, modal } = App.useApp();
    const [preferences, setPreferences] = useState<UserPromptPreference[]>([]);
    const [selectedOperation, setSelectedOperation] = useState("");
    const [mode, setMode] = useState<CustomizationMode>("inherit");
    const [appendContent, setAppendContent] = useState("");
    const [rewriteContent, setRewriteContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const pendingWrites = useRef(0);
    const dirtyRef = useRef(false);
    const [loadError, setLoadError] = useState("");
    const requestIdRef = useRef(0);

    const reload = async (preferredOperation?: string) => {
        const reqId = ++requestIdRef.current;
        setLoading(true);
        setLoadError("");
        try {
            const result = await listUserPromptPreferences();
            if (reqId !== requestIdRef.current) return;
            setPreferences(result.preferences);
            setSelectedOperation((current) => preferredOperation || current || result.preferences[0]?.definition.operation || "");
        } catch (error) {
            if (reqId !== requestIdRef.current) return;
            const msg = error instanceof Error ? error.message : "讀取提示詞偏好失敗";
            setLoadError(msg);
            message.error(msg);
        } finally {
            if (reqId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => { void reload(); }, []);

    const selected = useMemo(() => preferences.find((item) => item.definition.operation === selectedOperation), [preferences, selectedOperation]);
    const savedMode = selected?.customization?.mode || "inherit";
    const savedAppendContent = savedMode === "append" ? selected?.customization?.content || "" : "";
    const savedRewriteContent = savedMode === "rewrite" ? selected?.customization?.content || "" : selected?.template?.content || "";
    const activeContent = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
    const savedActiveContent = savedMode === "append" ? savedAppendContent : savedMode === "rewrite" ? savedRewriteContent : "";
    const dirty = mode !== savedMode || activeContent !== savedActiveContent;
    dirtyRef.current = dirty;

    useEffect(() => registerDesktopUpdatePreparation(() => {
        if (pendingWrites.current > 0) throw new DesktopUpdateSaveInProgressError();
        if (dirtyRef.current) throw new Error("請先儲存或放棄提示詞設定中的改動。");
    }, () => pendingWrites.current > 0), []);

    const restoreDraft = (preference = selected) => {
        const customization = preference?.customization;
        setMode(customization?.mode || "inherit");
        setAppendContent(customization?.mode === "append" ? customization.content : "");
        setRewriteContent(customization?.mode === "rewrite" ? customization.content : preference?.template?.content || "");
    };

    useEffect(() => { restoreDraft(selected); }, [selected]);

    useEffect(() => {
        if (!dirty) return undefined;
        const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", preventUnload);
        return () => {
            window.removeEventListener("beforeunload", preventUnload);
        };
    }, [dirty]);

    const selectOperation = (operation: string) => {
        if (operation === selectedOperation) return;
        if (!dirty) {
            setSelectedOperation(operation);
            return;
        }
        modal.confirm({
            title: "切換模板並放棄修改？",
            content: "當前模板還有未儲存內容。切換後這些修改將丟失。",
            okText: "放棄並切換",
            cancelText: "繼續編輯",
            okButtonProps: { danger: true },
            onOk: () => setSelectedOperation(operation),
        });
    };

    const save = async () => {
        if (!selected) return;
        const content = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
        if (mode !== "inherit" && !content.trim()) {
            message.warning("請填寫個人提示詞內容");
            return;
        }
        pendingWrites.current += 1;
        setSaving(true);
        try {
            await updateUserPromptCustomization(selected.definition.operation, { mode, content });
            await reload(selected.definition.operation);
            message.success("提示詞偏好已儲存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "儲存提示詞偏好失敗");
        } finally {
            pendingWrites.current -= 1;
            setSaving(pendingWrites.current > 0);
        }
    };

    const reset = () => {
        if (!selected) return;
        modal.confirm({
            title: "恢復平臺模板？",
            content: `將刪除“${selected.definition.label}”的個人定製，後續自動跟隨平臺版本。`,
            okText: "恢復平臺模板",
            cancelText: "取消",
            onOk: async () => {
                pendingWrites.current += 1;
                setSaving(true);
                try {
                    await resetUserPromptCustomization(selected.definition.operation);
                    await reload(selected.definition.operation);
                    message.success("已恢復平臺模板");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "恢復平臺模板失敗");
                } finally {
                    pendingWrites.current -= 1;
                    setSaving(pendingWrites.current > 0);
                }
            },
        });
    };

    if (loading && preferences.length === 0) return <Skeleton active paragraph={{ rows: 10 }} />;
    if (loadError && preferences.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Callout tone="error" title="載入提示詞偏好失敗">{loadError}</Callout>
                <Button icon={<RotateCcw className="size-4" />} onClick={() => void reload()}>重試</Button>
            </div>
        );
    }
    if (!selected) return <EmptyState title="暫無可配置的提示詞模板" />;

    const templateContent = selected.template?.content || "當前沒有啟用的平臺模板";
    const previewCreative = mode === "inherit" ? templateContent : mode === "append" ? `${templateContent}\n\n【使用者個性化創作要求】\n${appendContent}` : rewriteContent;
    const outputLabel = selected.definition.outputType === "json" ? selected.definition.schemaKey || "JSON" : "文本";

    return (
        <div className="flex min-h-full flex-col">
            <header className="shrink-0 pb-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex-1">
                         <label className="mb-2 block text-xs font-medium text-foreground/55">提示詞模板</label>
                        <Select
                             ariaLabel="提示詞模板"
                            className="w-full max-w-md"
                            value={selectedOperation}
                            onChange={selectOperation}
                            options={preferences.map((item) => ({
                                value: item.definition.operation,
                                label: `${item.definition.category} · ${item.definition.label}${item.customization && item.customization.mode !== "inherit" ? " · 已定製" : ""}`,
                            }))}
                        />
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button icon={<Undo2 className="size-4" />} disabled={!dirty || saving} onClick={() => restoreDraft()}>撤銷修改</Button>
                        <Button icon={<RotateCcw className="size-4" />} disabled={!selected.customization || saving} onClick={reset}>恢復平臺</Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>儲存更改</Button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold">{selected.definition.label}</h2>
                            <StatusBadge variant="filled" tone="neutral" label={`平臺 v${selected.template?.version || "--"}`} />
                            <StatusBadge variant="filled" tone="neutral" label={outputLabel} />
                            {dirty ? <StatusBadge variant="filled" tone="warning" label="未儲存" /> : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-foreground/55">{selected.definition.description}</p>
                    </div>
<SegmentedControl value={mode} options={modeOptions} onChange={(value) => setMode(value as CustomizationMode)} />
                </div>
            </header>

            {selected.outdated ? <Callout className="mt-4" tone="warning" title="平臺模板已更新">當前高階改寫基於舊版本。可以保留現有改寫，或恢復平臺後再基於新版本調整。</Callout> : null}

            <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-3">
                <section className="flex min-h-0 flex-col lg:col-span-2">
                    <div className="mb-3 shrink-0">
                        <h3 className="text-sm font-semibold">{mode === "inherit" ? "當前平臺模板" : mode === "append" ? "追加個人要求" : "改寫創作策略"}</h3>
                        <p className="mt-1 text-xs leading-5 text-foreground/50">
                            {mode === "inherit" ? "平臺升級後自動使用新版本。" : mode === "append" ? "內容追加在平臺策略之後，仍會自動繼承平臺升級。" : "只替換創作策略；動態專案資料和輸出契約仍由服務端強制注入。"}
                        </p>
                    </div>
                    {mode === "append" ? (
                        <Input.TextArea
                            className="min-h-96 resize-none"
                            value={appendContent}
                            maxLength={12000}
                            showCount
                            placeholder="例如：仙俠專案採用明亮、宏大、高畫質的休閒劇質感；避免陰森恐怖色調，人物表演自然、輕鬆。"
                            onChange={(event) => setAppendContent(event.target.value)}
                        />
                    ) : (
                        <div className="min-h-96 flex-1 overflow-hidden rounded-md bg-surface-active">
                            <PromptCodeEditor
                                value={mode === "inherit" ? templateContent : rewriteContent}
                                readOnly={mode === "inherit"}
                                ariaLabel={mode === "inherit" ? "平臺提示詞模板" : "個人提示詞改寫"}
                                onChange={mode === "rewrite" ? setRewriteContent : undefined}
                            />
                        </div>
                    )}
                </section>

                <aside className="min-h-0 pt-4 lg:pl-6 lg:pt-0">
                    <Tabs
                        size="small"
                        items={[
                            {
                                key: "baseline",
                                label: "平臺基線",
                                children: <pre className="thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-foreground/65">{templateContent}</pre>,
                            },
                            {
                                key: "contract",
                                label: "輸出契約",
                                children: <div><div className="mb-3 flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4" />服務端只讀</div><pre className="thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-foreground/65">{selected.definition.outputContract}</pre></div>,
                            },
                            {
                                key: "preview",
                                label: "最終結構",
                                children: <div className="space-y-5 text-xs leading-6"><section><div className="mb-2 font-medium text-foreground/80">創作策略</div><pre className="thin-scrollbar max-h-64 overflow-auto whitespace-pre-wrap text-foreground/65">{previewCreative || "尚未填寫"}</pre></section><section><div className="mb-2 font-medium text-foreground/80">執行時強制追加</div><p className="text-foreground/55">當前劇情、專案畫風、當前角色版本、畫布資產與受保護輸出契約。</p></section></div>,
                            },
                        ]}
                    />
                </aside>
            </div>
        </div>
    );
}
