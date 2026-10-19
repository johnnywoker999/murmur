import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Switch } from "@/components/ui/base/switch";
import { AlertTriangle, Box, Check, FileImage, Link2, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

import {
    createStyleProfileSnapshot,
    MAX_STYLE_ASSETS,
    styleAssetValidationMessage,
    type StyleAssetBinding,
    type StyleAssetKind,
    type StyleAssetStatus,
    type StyleProfileSnapshot,
} from "@/lib/canvas/style-profile";

const kindOptions: Array<{ value: StyleAssetKind; label: string }> = [
    { value: "lora", label: "LoRA" },
    { value: "template", label: "圖片模板" },
    { value: "reference", label: "參考圖組" },
    { value: "prompt", label: "提示詞模組" },
];

const statusOptions: Array<{ value: StyleAssetStatus; label: string }> = [
    { value: "draft", label: "待驗證" },
    { value: "validated", label: "已驗證" },
    { value: "unavailable", label: "不可用" },
];

const policyOptions: Array<{ value: NonNullable<StyleProfileSnapshot["executionPolicy"]>; label: string }> = [
    { value: "compatible-fallback", label: "相容降級" },
    { value: "strict-assets", label: "嚴格阻止" },
];

const emptyAsset = (): StyleAssetBinding => ({
    id: nanoid(),
    kind: "lora",
    provider: "liblib",
    title: "",
    enabled: false,
    weight: 0.8,
    status: "draft",
});

type StyleAssetBindingModalProps = {
    open: boolean;
    profile: StyleProfileSnapshot | null;
    onClose: () => void;
    onApply: (profile: StyleProfileSnapshot) => void;
};

export function StyleAssetBindingModal({ open, profile, onClose, onApply }: StyleAssetBindingModalProps) {
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(profile);
    const [editingId, setEditingId] = useState("");

    useEffect(() => {
        if (!open) return;
        setDraft(profile ? createStyleProfileSnapshot(profile) : null);
        setEditingId(profile?.assets[0]?.id || "");
    }, [open, profile]);

    const editing = useMemo(() => draft?.assets.find((asset) => asset.id === editingId), [draft, editingId]);
    const issues = useMemo(() => draft?.assets.map((asset) => ({ id: asset.id, message: styleAssetValidationMessage(asset) })).filter((issue) => issue.message) || [], [draft]);
    if (!draft) return null;

    const updateAsset = (patch: Partial<StyleAssetBinding>) => {
        setDraft((current) => current ? { ...current, assets: current.assets.map((asset) => asset.id === editingId ? { ...asset, ...patch } : asset) } : current);
    };
    const addAsset = () => {
        const asset = emptyAsset();
        setDraft((current) => current ? { ...current, assets: [...current.assets, asset] } : current);
        setEditingId(asset.id);
    };
    const deleteAsset = (id: string) => {
        setDraft((current) => current ? { ...current, assets: current.assets.filter((asset) => asset.id !== id) } : current);
        setEditingId((current) => current === id ? draft.assets.find((asset) => asset.id !== id)?.id || "" : current);
    };

    return (
        <AppModal
            rootClassName="style-asset-binding-modal"
            open={open}
            title={null}
            footer={null}
            centered
            width="min(980px, calc(100vw - 24px))"
            onCancel={onClose}
            flush
        >
            <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 pr-12 sm:items-center sm:px-5">
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">風格執行資產</h2>
                        <p className="mt-0.5 text-[var(--fs-label)] text-foreground/45">繫結模型資產、相容範圍、執行引數和許可快照</p>
                    </div>
                    <Button className="shrink-0" icon={<Plus className="size-3.5" />} disabled={draft.assets.length >= MAX_STYLE_ASSETS} title={draft.assets.length >= MAX_STYLE_ASSETS ? `最多繫結 ${MAX_STYLE_ASSETS} 個資產` : undefined} onClick={addAsset}>新增資產</Button>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-3">
                    <aside className="thin-scrollbar max-h-52 min-h-0 overflow-y-auto border-b border-border md:col-span-1 md:max-h-none md:border-b-0 md:border-r">
                        <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
                            <label className="flex items-center justify-between gap-3 text-xs">
                                <span className="min-w-0">
                                    <span className="block font-medium">執行策略</span>
                                    <span className="mt-0.5 block text-[var(--fs-tiny)] text-foreground/42">不相容、未驗證資產如何處理</span>
                                </span>
                                <Select<NonNullable<StyleProfileSnapshot["executionPolicy"]>>
                                    className="shrink-0"
                                    size="small"
                                    value={draft.executionPolicy || "compatible-fallback"}
                                    options={policyOptions}
                                    onChange={(executionPolicy) => setDraft({ ...draft, executionPolicy })}
                                />
                            </label>
                        </div>

                        {draft.assets.length ? (
                            <div className="divide-y divide-border">
                                {draft.assets.map((asset) => {
                                    const issue = styleAssetValidationMessage(asset);
                                    return (
                                        <button
                                            key={asset.id}
                                            type="button"
                                            className={`flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset ${editingId === asset.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                                            onClick={() => setEditingId(asset.id)}
                                        >
                                            <AssetKindIcon kind={asset.kind} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-medium">{asset.title || "未命名資產"}</span>
                                                <span className="mt-1 block truncate text-[var(--fs-tiny)] text-foreground/42">{assetKindLabel(asset.kind)} · {assetStatusLabel(asset.status)}</span>
                                            </span>
                                            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${issue ? "bg-red-500" : asset.enabled ? asset.status === "validated" ? "bg-emerald-500" : "bg-amber-500" : "bg-foreground/20"}`} />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyAssetList />
                        )}
                    </aside>

                    <main className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 md:col-span-2">
                        {editing ? (
                            <AssetEditor asset={editing} onChange={updateAsset} onDelete={() => deleteAsset(editing.id)} />
                        ) : (
                            <div className="grid min-h-72 place-items-center text-center">
                                <div><Plus className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs text-foreground/50">新增或選擇一個執行資產</p></div>
                            </div>
                        )}
                    </main>
                </div>

                <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-start gap-2 text-[var(--fs-tiny)] text-foreground/45">
                        {issues.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" /> : <Check className="mt-0.5 size-3.5 shrink-0" />}
                        <span className="min-w-0 leading-5">{issues.length ? `${issues.length} 個資產需要處理：${issues[0].message}` : `${draft.assets.length} 個資產，${draft.assets.filter((asset) => asset.enabled).length} 個已啟用`}</span>
                    </div>
                    <div className="flex shrink-0 justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button
                            type="primary"
                            icon={<Save className="size-3.5" />}
                            disabled={issues.length > 0}
                            onClick={() => onApply(createStyleProfileSnapshot({ ...draft, source: "user", revision: draft.revision + 1 }))}
                        >
                            應用配置
                        </Button>
                    </div>
                </footer>
            </div>
        </AppModal>
    );
}

function AssetEditor({ asset, onChange, onDelete }: { asset: StyleAssetBinding; onChange: (patch: Partial<StyleAssetBinding>) => void; onDelete: () => void }) {
    const validationMessage = styleAssetValidationMessage(asset);
    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                    <h3 className="text-sm font-semibold">資產配置</h3>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">已驗證且啟用的資產才會進入執行計劃</p>
                </div>
                <Button danger type="text" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>刪除</Button>
            </div>

            {validationMessage ? (
                <div className="flex gap-2 border-l-2 border-red-500 bg-red-500/5 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/65">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
                    <span>{validationMessage}</span>
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="資產型別">
                    <Select<StyleAssetKind> value={asset.kind} options={kindOptions} onChange={(kind) => onChange({ kind })} />
                </Field>
                <Field label="啟用狀態">
                    <div className="flex h-8 items-center justify-between border-b border-border">
                        <span className="text-xs text-foreground/55">參與生成執行計劃</span>
                        <Switch size="sm" checked={asset.enabled !== false} onChange={(enabled) => onChange({ enabled })} />
                    </div>
                </Field>
                <Field label="資產名稱">
                    <Input value={asset.title} placeholder="例如：東方玄幻武俠修仙" onChange={(event) => onChange({ title: event.target.value })} />
                </Field>
                <Field label="驗證狀態">
                    <Select<StyleAssetStatus> value={asset.status} options={statusOptions} onChange={(status) => onChange({ status })} />
                </Field>
                <Field label="來源平臺 / 介面卡">
                    <Input value={asset.provider} placeholder="liblib、comfyui 或自定義介面卡" onChange={(event) => onChange({ provider: event.target.value })} />
                </Field>
                <Field label="來源資產 ID">
                    <Input value={asset.sourceId} placeholder="模型 UUID 或模板 ID" onChange={(event) => onChange({ sourceId: event.target.value })} />
                </Field>
                <Field label="來源頁面 URL" className="sm:col-span-2">
                    <Input value={asset.sourceUrl} placeholder="記錄資產出處，不會自動向該地址傳送生成請求" onChange={(event) => onChange({ sourceUrl: event.target.value })} />
                </Field>
                <Field label="資產模型標識">
                    <Input value={asset.model} placeholder="例如 Liblib 模型名稱" onChange={(event) => onChange({ model: event.target.value })} />
                </Field>
                <Field label="模型版本">
                    <Input value={asset.version} placeholder="版本 UUID 或版本號" onChange={(event) => onChange({ version: event.target.value })} />
                </Field>
                <Field label="相容基礎模型" className="sm:col-span-2">
                    <Select<string[]> mode="tags" value={asset.baseModels || []} tokenSeparators={[","]} placeholder="填寫實際生成模型名，輸入後回車" onChange={(baseModels) => onChange({ baseModels })} />
                </Field>
            </div>

            {asset.kind === "lora" ? <LoraFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "reference" ? <ReferenceFields asset={asset} onChange={onChange} /> : null}
            {asset.kind === "prompt" || asset.kind === "template" ? <PromptFields asset={asset} onChange={onChange} /> : null}

            <GenerationParameterFields asset={asset} onChange={onChange} />
            <LicenseFields asset={asset} onChange={onChange} />

            {asset.enabled !== false && (asset.kind === "lora" || asset.kind === "reference") ? (
                <div className="flex gap-2 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-[var(--fs-label)] leading-5 text-foreground/60">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <span>當前通用生成協議尚未啟用{asset.kind === "lora" ? " LoRA" : "參考圖組自動注入"}介面卡。相容降級會繼續執行專案 Prompt；嚴格策略會在生成前阻止任務。</span>
                </div>
            ) : null}
        </div>
    );
}

function LoraFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="LoRA 權重">
                <InputNumber className="w-full" min={0} max={2} step={0.05} value={asset.weight} onChange={(weight) => onChange({ weight: weight ?? undefined })} />
            </Field>
            <Field label="觸發詞">
                <Select<string[]> mode="tags" value={asset.triggerWords || []} tokenSeparators={[","]} placeholder="輸入後回車" onChange={(triggerWords) => onChange({ triggerWords })} />
            </Field>
        </section>
    );
}

function ReferenceFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="grid gap-4 border-t border-border pt-4">
            <Field label="參考圖 URL">
                <Select<string[]> mode="tags" value={asset.referenceUrls || []} tokenSeparators={[","]} placeholder="輸入可訪問的參考圖地址後回車" onChange={(referenceUrls) => onChange({ referenceUrls })} />
            </Field>
            <Field label="專案資源 ID">
                <Select<string[]> mode="tags" value={asset.referenceResourceIds || []} tokenSeparators={[","]} placeholder="輸入已上傳的 resource ID 後回車" onChange={(referenceResourceIds) => onChange({ referenceResourceIds })} />
            </Field>
        </section>
    );
}

function PromptFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="border-t border-border pt-4">
            <Field label="提示詞模組">
                <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} value={asset.promptFragment} placeholder="只填寫該資產需要追加的穩定視覺要求" onChange={(event) => onChange({ promptFragment: event.target.value })} />
            </Field>
        </section>
    );
}

function GenerationParameterFields({ asset, onChange }: AssetFieldProps) {
    const parameters = asset.parameters || {};
    const updateParameters = (patch: NonNullable<StyleAssetBinding["parameters"]>) => onChange({ parameters: { ...parameters, ...patch } });
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">建議生成引數</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Sampler"><Input value={parameters.sampler} placeholder="可選" onChange={(event) => updateParameters({ sampler: event.target.value })} /></Field>
                <Field label="Steps"><InputNumber className="w-full" min={1} max={200} value={parameters.steps} onChange={(steps) => updateParameters({ steps: steps ?? undefined })} /></Field>
                <Field label="CFG"><InputNumber className="w-full" min={0} max={50} step={0.5} value={parameters.cfg} onChange={(cfg) => updateParameters({ cfg: cfg ?? undefined })} /></Field>
                <Field label="推薦尺寸"><Input value={parameters.size} placeholder="例如 1024x1536" onChange={(event) => updateParameters({ size: event.target.value })} /></Field>
            </div>
        </section>
    );
}

function LicenseFields({ asset, onChange }: AssetFieldProps) {
    return (
        <section className="border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold">許可快照</h4>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="商業使用">
                    <Select
                        value={asset.license?.commercial === true ? "yes" : asset.license?.commercial === false ? "no" : "unknown"}
                        options={[{ value: "unknown", label: "尚未確認" }, { value: "yes", label: "允許商用" }, { value: "no", label: "不可商用" }]}
                        onChange={(value: "unknown" | "yes" | "no") => onChange({ license: { ...asset.license, commercial: value === "unknown" ? undefined : value === "yes" } })}
                    />
                </Field>
                <Field label="許可來源"><Input value={asset.license?.source} placeholder="許可頁面或協議版本" onChange={(event) => onChange({ license: { ...asset.license, source: event.target.value } })} /></Field>
                <Field label="許可說明" className="sm:col-span-2"><Input value={asset.license?.note} placeholder="記錄會員限制、署名或轉售限制" onChange={(event) => onChange({ license: { ...asset.license, note: event.target.value } })} /></Field>
            </div>
        </section>
    );
}

type AssetFieldProps = {
    asset: StyleAssetBinding;
    onChange: (patch: Partial<StyleAssetBinding>) => void;
};

function AssetKindIcon({ kind }: { kind: StyleAssetKind }) {
    return (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded bg-foreground/5 text-foreground/55">
            {kind === "lora" ? <SlidersHorizontal className="size-3.5" /> : kind === "reference" ? <FileImage className="size-3.5" /> : kind === "template" ? <Box className="size-3.5" /> : <Link2 className="size-3.5" />}
        </span>
    );
}

function EmptyAssetList() {
    return (
        <div className="grid min-h-52 place-items-center px-6 text-center">
            <div><Box className="mx-auto size-5 text-foreground/25" /><p className="mt-2 text-xs font-medium">尚未繫結執行資產</p><p className="mt-1 text-[var(--fs-tiny)] leading-5 text-foreground/42">當前畫風只通過專案 Prompt 執行</p></div>
        </div>
    );
}

function assetKindLabel(kind: StyleAssetKind) {
    return kindOptions.find((item) => item.value === kind)?.label || kind;
}

function assetStatusLabel(status: StyleAssetStatus) {
    return statusOptions.find((item) => item.value === status)?.label || status;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-1.5 text-xs ${className}`}><span className="font-medium text-foreground/60">{label}</span>{children}</label>;
}
