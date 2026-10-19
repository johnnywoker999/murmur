import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Button, Input, Segmented, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Braces, Image, Layers3, Save, Sparkles } from "lucide-react";

import { StyleAssetBindingModal } from "@/components/canvas/style-asset-binding-modal";
import { createStyleProfileSnapshot, styleProfileValidationMessage, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";

type EditorSection = "identity" | "prompt" | "execution";

type StyleProfileEditorModalProps = {
    open: boolean;
    initialProfile: StyleProfileSnapshot | null;
    saving?: boolean;
    onClose: () => void;
    onSave: (profile: StyleProfileSnapshot, applyToProject: boolean) => void;
};

export function StyleProfileEditorModal({ open, initialProfile, saving = false, onClose, onSave }: StyleProfileEditorModalProps) {
    const { message, modal } = App.useApp();
    const [section, setSection] = useState<EditorSection>("identity");
    const [draft, setDraft] = useState<StyleProfileSnapshot | null>(initialProfile);
    const [baseline, setBaseline] = useState("");
    const [assetsOpen, setAssetsOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const next = initialProfile ? createStyleProfileSnapshot(initialProfile) : null;
        setDraft(next);
        setBaseline(next ? JSON.stringify(next) : "");
        setSection("identity");
        setAssetsOpen(false);
    }, [initialProfile, open]);

    const validationMessage = useMemo(() => draft ? styleProfileValidationMessage(draft) : "風格草稿不存在", [draft]);
    if (!draft) return null;

    const update = (patch: Partial<StyleProfileSnapshot>) => setDraft((current) => current ? { ...current, ...patch } : current);
    const requestClose = () => {
        if (JSON.stringify(draft) === baseline) {
            onClose();
            return;
        }
        modal.confirm({ title: "放棄未儲存的風格修改？", content: "名稱、Prompt、封面和執行配置中的改動都會丟失。", okText: "放棄修改", cancelText: "繼續編輯", okButtonProps: { danger: true }, onOk: onClose });
    };
    const submit = (applyToProject: boolean) => {
        if (validationMessage) {
            message.error(validationMessage);
            return;
        }
        onSave(createStyleProfileSnapshot({ ...draft, source: "user" }), applyToProject);
    };

    return (
        <>
            <AppModal
                rootClassName="style-profile-editor-modal"
                open={open}
                title={null}
                footer={null}
                centered
                width="min(1120px, calc(100vw - 24px))"
                onCancel={requestClose}
                flush
            >
                <div className="flex max-h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
                    <header className="flex min-h-16 items-center border-b border-border px-4 pr-12 sm:px-5 sm:pr-14">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-foreground/5"><Sparkles className="size-3.5" /></span>
                                <div>
                                    <h2 className="text-sm font-semibold">風格編輯器</h2>
                                    <p className="mt-0.5 truncate text-[var(--fs-tiny)] text-foreground/45">{draft.title || "未命名風格"} · 我的風格</p>
                                </div>
                            </div>
                        </div>
                    </header>

                    <nav className="style-profile-editor-tabs grid shrink-0 grid-cols-3 border-b border-border px-2 sm:flex sm:px-4" role="tablist" aria-label="風格編輯器分割槽">
                        <EditorTab id="style-profile-tab-identity" panelId="style-profile-panel-identity" active={section === "identity"} icon={<Image className="size-3.5" />} label="基本資訊" onClick={() => setSection("identity")} />
                        <EditorTab id="style-profile-tab-prompt" panelId="style-profile-panel-prompt" active={section === "prompt"} icon={<Braces className="size-3.5" />} label="Prompt 規則" onClick={() => setSection("prompt")} />
                        <EditorTab id="style-profile-tab-execution" panelId="style-profile-panel-execution" active={section === "execution"} icon={<Layers3 className="size-3.5" />} label="執行配置" onClick={() => setSection("execution")} />
                    </nav>

                    <div className="style-profile-editor-workspace grid min-h-0 flex-1 lg:grid-cols-3">
                        <StylePreview profile={draft} />
                        <main id={`style-profile-panel-${section}`} className="thin-scrollbar min-h-0 overflow-y-auto p-4 sm:p-5 lg:col-span-2" role="tabpanel" aria-labelledby={`style-profile-tab-${section}`}>
                            {section === "identity" ? <IdentityFields profile={draft} onChange={update} /> : null}
                            {section === "prompt" ? <PromptFields profile={draft} onChange={update} /> : null}
                            {section === "execution" ? <ExecutionFields profile={draft} onChange={update} onEditAssets={() => setAssetsOpen(true)} /> : null}
                        </main>
                    </div>

                    <footer className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className={`text-[var(--fs-tiny)] ${validationMessage ? "text-red-500" : "text-foreground/45"}`}>{validationMessage || "儲存後進入“我的風格”；應用時會把當前版本複製為專案快照"}</p>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            <Button onClick={requestClose}>取消</Button>
                            <Button icon={<Save className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(false)}>儲存到我的風格</Button>
                            <Button type="primary" icon={<Sparkles className="size-3.5" />} disabled={Boolean(validationMessage)} loading={saving} onClick={() => submit(true)}>儲存並應用</Button>
                        </div>
                    </footer>
                </div>
            </AppModal>
            <StyleAssetBindingModal
                open={assetsOpen}
                profile={draft}
                onClose={() => setAssetsOpen(false)}
                onApply={(profile) => {
                    setDraft(profile);
                    setAssetsOpen(false);
                }}
            />
        </>
    );
}

function StylePreview({ profile }: { profile: StyleProfileSnapshot }) {
    return (
        <aside className="style-profile-editor-preview thin-scrollbar min-h-0 overflow-y-auto border-b border-border bg-foreground/5 lg:border-b-0 lg:border-r">
            <div className="relative aspect-video overflow-hidden border-b border-border bg-foreground/5">
                {profile.coverUrl ? <img src={profile.coverUrl} alt={`${profile.title || "未命名風格"}封面`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-foreground/25"><Image className="size-7" /></div>}
                <span className="absolute bottom-3 left-3 rounded bg-background/85 px-2 py-1 text-[var(--fs-tiny)] font-medium backdrop-blur">我的風格</span>
            </div>
            <div className="p-4 sm:p-5">
                <h3 className="text-base font-semibold">{profile.title || "未命名風格"}</h3>
                <p className="mt-1.5 text-xs leading-5 text-foreground/48">{profile.description || "填寫簡介，讓風格庫中更容易判斷它適合什麼專案。"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.tags.length ? profile.tags.map((tag) => <span key={tag} className="rounded bg-foreground/10 px-2 py-1 text-[var(--fs-tiny)] text-foreground/58">{tag}</span>) : <span className="text-[var(--fs-tiny)] text-foreground/35">暫無標籤</span>}
                </div>
                <dl className="mt-5 grid grid-cols-2 border-y border-border py-3 text-[var(--fs-tiny)]">
                    <Metric label="Prompt" value={`${profile.prompt.length} 字`} />
                    <Metric label="負面約束" value={`${profile.negativePrompt?.length || 0} 字`} />
                    <Metric label="執行資產" value={`${profile.assets.length} 個`} />
                    <Metric label="策略" value={profile.executionPolicy === "strict-assets" ? "嚴格阻止" : "相容降級"} />
                </dl>
            </div>
        </aside>
    );
}

function IdentityFields({ profile, onChange }: EditorFieldsProps) {
    const selection = profile.selection || {};
    const setSelection = (key: string, value: string) => onChange({ selection: { ...selection, [key]: value } });
    return (
        <div className="space-y-5">
            <SectionHeading title="風格身份" description="名稱、封面和標籤會出現在“我的風格”中" />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="風格名稱" className="sm:col-span-2"><Input maxLength={80} showCount value={profile.title} placeholder="例如：東方誌怪 · 工筆暗彩" onChange={(event) => onChange({ title: event.target.value })} /></Field>
                <Field label="風格簡介" className="sm:col-span-2"><Input.TextArea maxLength={500} showCount autoSize={{ minRows: 3, maxRows: 6 }} value={profile.description} placeholder="說明適用題材、畫面氣質和核心辨識度" onChange={(event) => onChange({ description: event.target.value })} /></Field>
                <Field label="封面圖 URL" className="sm:col-span-2"><Input value={profile.coverUrl} placeholder="可填寫專案資源 URL 或可訪問的圖片地址" onChange={(event) => onChange({ coverUrl: event.target.value })} /></Field>
                <Field label="標籤" className="sm:col-span-2"><Select mode="tags" maxCount={20} tokenSeparators={[",", "，"]} value={profile.tags} placeholder="輸入題材、媒介、色彩或質感後回車" onChange={(tags) => onChange({ tags })} /></Field>
            </div>
            <SectionHeading title="輔助標註" description="這些欄位用於檢索和理解，不會限制你自由編寫 Prompt" />
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="題材世界"><Input value={selection.world || ""} placeholder="仙俠、都市、懸疑……" onChange={(event) => setSelection("world", event.target.value)} /></Field>
                <Field label="視覺媒介"><Input value={selection.medium || ""} placeholder="真人實拍、二維、水墨……" onChange={(event) => setSelection("medium", event.target.value)} /></Field>
                <Field label="敘事氣質"><Input value={selection.tone || ""} placeholder="史詩、剋制、輕喜劇……" onChange={(event) => setSelection("tone", event.target.value)} /></Field>
                <Field label="角色造型"><Input value={selection.character || ""} placeholder="寫實、半寫實、風格化……" onChange={(event) => setSelection("character", event.target.value)} /></Field>
            </div>
        </div>
    );
}

function PromptFields({ profile, onChange }: EditorFieldsProps) {
    return (
        <div className="space-y-5">
            <SectionHeading title="完整風格 Prompt" description="直接定義專案長期穩定的美術系統；這裡沒有固定組合限制" />
            <Field label="正向 Prompt">
                <Input.TextArea value={profile.prompt} autoSize={{ minRows: 16, maxRows: 28 }} placeholder="填寫視覺媒介、角色設計、色彩、材質、建築世界觀、影像基線和一致性規則……" onChange={(event) => onChange({ prompt: event.target.value })} />
            </Field>
            <Field label="推薦負面 Prompt">
                <Input.TextArea value={profile.negativePrompt} autoSize={{ minRows: 6, maxRows: 14 }} placeholder="填寫需要全專案避免的媒介漂移、人物錯誤、材質錯誤、文字水印等" onChange={(event) => onChange({ negativePrompt: event.target.value })} />
            </Field>
        </div>
    );
}

function ExecutionFields({ profile, onChange, onEditAssets }: EditorFieldsProps & { onEditAssets: () => void }) {
    const enabled = profile.assets.filter((asset) => asset.enabled !== false);
    return (
        <div className="space-y-5">
            <SectionHeading title="生成執行" description="控制模型資產不相容時是繼續使用 Prompt，還是阻止任務" />
            <Field label="執行策略">
                <Segmented
                    block
                    value={profile.executionPolicy || "compatible-fallback"}
                    options={[{ value: "compatible-fallback", label: "相容降級" }, { value: "strict-assets", label: "嚴格阻止" }]}
                    onChange={(executionPolicy) => onChange({ executionPolicy: executionPolicy as StyleProfileSnapshot["executionPolicy"] })}
                />
            </Field>
            <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h4 className="text-sm font-medium">執行資產</h4>
                    <p className="mt-1 text-[var(--fs-label)] text-foreground/45">{profile.assets.length} 個已繫結，{enabled.length} 個已啟用</p>
                </div>
                <Button icon={<Layers3 className="size-3.5" />} onClick={onEditAssets}>配置 LoRA、模板與參考圖</Button>
            </div>
            {profile.assets.length ? <div className="divide-y divide-border border-b border-border">{profile.assets.map((asset) => <div key={asset.id} className="flex items-center gap-3 py-3 text-xs"><span className={`size-1.5 shrink-0 rounded-full ${asset.enabled !== false && asset.status === "validated" ? "bg-emerald-500" : asset.status === "unavailable" ? "bg-red-500" : "bg-amber-500"}`} /><span className="min-w-0 flex-1 truncate font-medium">{asset.title}</span><span className="shrink-0 text-foreground/40">{asset.kind.toUpperCase()} · {asset.status === "validated" ? "已驗證" : asset.status === "unavailable" ? "不可用" : "待驗證"}</span></div>)}</div> : <div className="grid min-h-36 place-items-center border-b border-border text-center text-xs text-foreground/38">尚未繫結執行資產，當前風格將只通過 Prompt 執行</div>}
            <p className="text-[var(--fs-tiny)] leading-5 text-foreground/42">LoRA 與參考圖已支援繫結、驗證和相容判斷；具體生成渠道沒有原生介面卡時，相容策略會降級到 Prompt，嚴格策略會阻止生成。</p>
        </div>
    );
}

type EditorFieldsProps = { profile: StyleProfileSnapshot; onChange: (patch: Partial<StyleProfileSnapshot>) => void };

function SectionHeading({ title, description }: { title: string; description: string }) {
    return <div className="border-b border-border pb-3"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[var(--fs-label)] text-foreground/45">{description}</p></div>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
    return <label className={`grid gap-1.5 text-xs ${className}`}><span className="font-medium text-foreground/62">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 py-1"><dt className="text-foreground/38">{label}</dt><dd className="mt-0.5 truncate font-medium text-foreground/65">{value}</dd></div>;
}

function EditorTab({ id, panelId, active, icon, label, onClick }: { id: string; panelId: string; active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            id={id}
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            className={`style-profile-editor-tab relative flex h-11 min-w-0 items-center justify-center gap-2 px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset sm:justify-start ${active ? "is-active text-foreground" : "text-foreground/45 hover:text-foreground/75"}`}
            onClick={onClick}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
}
