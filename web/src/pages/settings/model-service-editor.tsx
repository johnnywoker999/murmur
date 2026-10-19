import { Fragment, useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Segmented, Select, Spin } from "antd";
import { ArrowLeft, Check, ChevronDown, KeyRound, Search, Settings2, ShieldCheck } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { ModelLogo } from "@/components/model-logo";
import { ChannelHeadersEditor, validateChannelHeaders } from "@/components/channel-headers-editor";
import { fetchChannelModels, type ChannelModelFetchResult } from "@/services/api/image-models";
import { fetchPluginProviderCatalog } from "@/services/api/plugin-catalog";
import { mergeFetchedChannelModelProfiles, type ChannelModelCatalogItem } from "@/lib/channel-model-catalog";
import { CAPABILITY_LABELS, MODEL_SERVICE_PRESETS, modelCatalogRequestURL, serviceConnectionError, serviceModelProfile, servicePresetFor, type ModelServicePresetId } from "@/lib/model-service-presets";
import type { ModelProtocolDefinition } from "@/lib/model-protocols";
import { seedancePortraitLabel } from "@/lib/seedance-portrait";
import { createModelChannel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ChannelModelSettings } from "./channel-model-settings";
import { currentModelConnectionReceipt, useModelConnectionTests } from "@/stores/use-model-connection-tests";
import "./model-service-editor.css";
import { getTransportFailureKind } from "@/services/api/request";

export function ModelServiceEditor({ initial, onClose, onSave }: { initial?: ModelChannel; onClose: () => void; onSave: (channel: ModelChannel) => Promise<void> }) {
    const [draft, setDraft] = useState<ModelChannel>(() => initial ? structuredClone(initial) : { ...createModelChannel(), name: "", baseUrl: "" });
    const [presetId, setPresetId] = useState<ModelServicePresetId>(() => initial ? servicePresetFor(initial) : "compatible");
    const [step, setStep] = useState(initial ? 1 : 0);
    const [advanced, setAdvanced] = useState(false);
    const [catalog, setCatalog] = useState<ChannelModelCatalogItem[]>(() => (initial?.models || []).map((id) => ({ id })));
    const [catalogRead, setCatalogRead] = useState(false);
    const [protocols, setProtocols] = useState<ModelProtocolDefinition[]>([]);
    const [protocolLoading, setProtocolLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const catalogRequest = useRef<AbortController | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");
    const [manualName, setManualName] = useState("");
    const [manualCapability, setManualCapability] = useState<ModelCapability>("text");
    const [editingCapabilities, setEditingCapabilities] = useState(false);
    const alive = useRef(true);
    const receipts = useModelConnectionTests((state) => state.receipts);

    useEffect(() => {
        alive.current = true;
        void fetchPluginProviderCatalog("user.custom-channel")
            .then((items) => { if (alive.current) setProtocols(items); })
            .catch(() => { if (alive.current) setError("無法讀取模型能力，請關閉後重試"); })
            .finally(() => { if (alive.current) setProtocolLoading(false); });
        return () => { alive.current = false; catalogRequest.current?.abort(); };
    }, []);

    const patch = (value: Partial<ModelChannel>) => {
        setDraft((current) => ({ ...current, ...value }));
        setError("");
        setCatalogRead(false);
    };
    const choosePreset = (id: ModelServicePresetId) => {
        const preset = MODEL_SERVICE_PRESETS.find((item) => item.id === id)!;
        setPresetId(id);
        setDraft({ ...createModelChannel({ id: draft.id, apiFormat: preset.apiFormat }), name: id === "compatible" ? "" : preset.name, baseUrl: preset.baseUrl });
        setCatalog([]);
        setCatalogRead(false);
        setAdvanced(false);
        setError("");
        setNotice("");
    };
    const validateConnection = (requireCredential = true) => {
        const problem = serviceConnectionError(draft, { protocols, requireCredential }) || validateChannelHeaders(draft.headers);
        if (problem) setError(problem);
        return !problem;
    };
    const applyCatalog = (result: ChannelModelFetchResult) => {
        const byId = new Map(catalog.map((item) => [item.id, item]));
        for (const item of result.catalog) byId.set(item.id, item);
        for (const id of result.models) if (!byId.has(id)) byId.set(id, { id });
        const next = [...byId.values()];
        const profiles = next.map((item) => serviceModelProfile(draft, item, protocols));
        // Catalog refresh enriches new entries; explicitly configured profiles win.
        const enriched = mergeFetchedChannelModelProfiles({ ...draft, modelProfiles: [] }, result.catalog);
        const existing = new Set(draft.modelProfiles?.map((item) => item.model));
        setDraft((current) => ({ ...current, modelProfiles: profiles.map((profile) => {
            const metadata = enriched.find((item) => item.model === profile.model);
            return existing.has(profile.model) || !metadata?.capabilityConfig ? profile : { ...profile, capabilityConfig: metadata.capabilityConfig };
        }) }));
        setCatalog(next);
        setCatalogRead(true);
        setNotice(result.models.length ? `已讀取 ${result.models.length} 個模型，勾選你要使用的模型。` : "服務未返回模型，可以手動新增模型 ID。");
        setStep(1);
    };
    const fetchModels = async () => {
        if (!validateConnection()) return;
        catalogRequest.current?.abort();
        const request = new AbortController();
        catalogRequest.current = request;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await fetchChannelModels(draft, true, request.signal);
            if (alive.current && !request.signal.aborted) applyCatalog(result);
        } catch (failure) {
            if (alive.current && !request.signal.aborted) {
                setError(getTransportFailureKind(failure) === "timeout" ? "讀取模型目錄超時，請檢查地址和網路後重試" : failure instanceof Error ? failure.message : "讀取模型失敗");
                setNotice("部分服務不提供模型目錄，你仍可手動新增模型 ID。");
            }
        } finally { if (alive.current) setBusy(false); }
    };
    const toggleModel = (id: string, enabled: boolean) => {
        const item = catalog.find((candidate) => candidate.id === id) || { id };
        const profile = serviceModelProfile(draft, item, protocols);
        setDraft((current) => ({ ...current, models: enabled ? [...new Set([...current.models, id])] : current.models.filter((model) => model !== id), modelProfiles: [...(current.modelProfiles || []).filter((p) => p.model !== id), profile] }));
        if (enabled && !profile.protocol) {
            setNotice("請在高階模型設定中，按服務商檔案選擇請求協議。影片介面的地址和格式可能不同。");
            setEditingCapabilities(true);
        }
        setError("");
    };
    const addManual = () => {
        const id = manualName.trim();
        if (!id) return;
        if (draft.models.includes(id)) { setError("這個模型已在列表中"); return; }
        const profile = serviceModelProfile(draft, { id }, protocols, manualCapability);
        if (!profile.protocol) {
            setNotice("請在高階模型設定中，為這個模型選擇服務商要求的請求協議。");
            setEditingCapabilities(true);
        }
        setCatalog((current) => current.some((item) => item.id === id) ? current : [...current, { id, modelType: manualCapability }]);
        setDraft((current) => ({ ...current, models: [...current.models, id], modelProfiles: [...(current.modelProfiles || []).filter((p) => p.model !== id), profile] }));
        setManualName("");
        setError("");
    };
    const save = async () => {
        if (!validateConnection()) { setStep(0); return; }
        if (!draft.models.length) { setError("請至少選擇或新增一個模型"); return; }
        const profiles = draft.models.map((id) => serviceModelProfile(draft, catalog.find((item) => item.id === id) || { id }, protocols));
        const missing = profiles.find((profile) => !profile.protocol);
        if (missing) { setError(`${missing.model} 還需要選擇請求協議，請開啟高階模型設定`); setEditingCapabilities(true); return; }
        setBusy(true);
        setSaving(true);
        setError("");
        try {
            await onSave({ ...draft, name: draft.name.trim() || "我的模型服務", baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""), apiKey: draft.apiKey.trim(), modelProfiles: profiles });
            onClose();
        } catch (failure) { setError(failure instanceof Error ? failure.message : "儲存失敗，請重試"); }
        finally { if (alive.current) { setBusy(false); setSaving(false); } }
    };
    const visibleModels = catalog.filter((item) => {
        const profile = serviceModelProfile(draft, item, protocols);
        return `${item.id} ${seedancePortraitLabel(item.id) || item.displayName || ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || profile.capability === filter);
    });
    const selectedPreset = MODEL_SERVICE_PRESETS.find((item) => item.id === presetId)!;

    return <AppModal open centered width={1000} flush footer={null} title={null} closable={!saving} keyboard={!saving} mask={{ closable: false }} onCancel={() => { catalogRequest.current?.abort(); onClose(); }} rootClassName="model-service-modal">
        <div className="model-service-header">
            <h2>{initial ? `管理 ${initial.name}` : "連線你的模型服務"}</h2>
            <ol className="model-service-steps" aria-label="接入步驟">
                <li aria-current={step === 0 ? "step" : undefined}><span>{step > 0 ? <Check size={13} /> : "1"}</span>連線服務</li>
                <li aria-current={step === 1 ? "step" : undefined}><span>2</span>選擇模型</li>
            </ol>
        </div>
        <div className="model-service-body" aria-busy={busy} inert={busy}>
            {step === 0 ? <div className="model-service-connection">
                <aside className="model-service-providers" aria-label="選擇服務商">
                    <p className="model-service-label">選擇服務商</p>
                    {MODEL_SERVICE_PRESETS.map((preset) => <button key={preset.id} type="button" disabled={busy || Boolean(initial)} aria-pressed={presetId === preset.id} className="model-service-provider" onClick={() => choosePreset(preset.id)}>
                        <ModelLogo icon={preset.icon} size={24} />
                        <span><strong>{preset.name}</strong><small>{preset.subtitle}</small></span>
                        {presetId === preset.id && <Check size={15} />}
                    </button>)}
                    <div className="model-service-note"><ShieldCheck size={16} /><p>金鑰儲存在這臺裝置上。<br />生成費用由服務商結算。</p></div>
                </aside>
                <Form layout="vertical" requiredMark={false} className="model-service-fields" disabled={busy} onFinish={() => void fetchModels()}>
                    <div className="model-service-form-title"><ModelLogo icon={selectedPreset.icon} size={28} /><div><h3>{selectedPreset.name}</h3>{presetId === "compatible" && <p>使用者可以自行新增第三方模型服務，但是 MURMUR AI 無法確保所有第三方模型服務的相容性</p>}</div></div>
                    <Form.Item label="連線名稱"><Input aria-label="連線名稱" placeholder="例如：我的創作賬號" value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></Form.Item>
                    <Form.Item label="API Key" help="選擇無鑑權協議（例如 Ollama）後可以留空。讀取模型目錄仍需要金鑰。"><Input.Password prefix={<KeyRound size={15} />} aria-label="API Key" autoComplete="new-password" placeholder="貼上你的 API Key" value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} /></Form.Item>
                    <Form.Item label="服務地址"><Input aria-label="服務地址" inputMode="url" placeholder="https://api.example.com/v1" value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} /></Form.Item>
                    {modelCatalogRequestURL(draft) && <div className="model-service-url"><span>模型目錄地址</span><code>{modelCatalogRequestURL(draft).split("/").map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>)}</code></div>}
                    <button type="button" className="model-service-advanced" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><Settings2 size={15} />進階設定<ChevronDown size={14} /></button>
                    {advanced && <div className="model-service-advanced-fields">
                        <Form.Item label="素材服務地址（可選）" help="公網素材域名使用 HTTPS。本機、區域網或 CGNAT 可填寫 HTTP，並可帶埠。留空時只接受與 API 同主機的素材。"><Input aria-label="素材服務地址" inputMode="url" placeholder="https://assets.example.com" value={draft.referenceAssetOrigin || ""} onChange={(event) => patch({ referenceAssetOrigin: event.target.value })} /></Form.Item>
                        <Form.Item label="目錄介面格式"><Select aria-label="目錄介面格式" value={draft.apiFormat} options={[{ value: "openai", label: "OpenAI 相容" }, { value: "gemini", label: "Gemini 原生" }]} onChange={(apiFormat) => patch({ apiFormat })} /></Form.Item>
                        <Form.Item label="Secret Key（按需填寫）"><Input.Password aria-label="Secret Key" autoComplete="new-password" value={draft.secretKey} onChange={(event) => patch({ secretKey: event.target.value })} /></Form.Item>
                        <ChannelHeadersEditor value={draft.headers} onChange={(headers) => patch({ headers })} />
                    </div>}
                </Form>
            </div> : <div className="model-service-models">
                <div className="model-service-catalog-header"><div><h3>選擇你要使用的模型</h3><p>{draft.name || "我的模型服務"} · {catalogRead ? "目錄已讀取" : "支援手動新增模型"}</p></div><Button icon={<Search size={14} />} loading={busy} disabled={protocolLoading} onClick={() => void fetchModels()}>讀取模型</Button></div>
                <Input aria-label="搜尋模型" prefix={<Search size={16} />} placeholder="搜尋模型名稱" value={query} onChange={(event) => setQuery(event.target.value)} allowClear />
                <div className="model-service-filter"><Segmented value={filter} onChange={(value) => setFilter(String(value))} options={[{ label: "全部", value: "all" }, ...Object.entries(CAPABILITY_LABELS).map(([value, label]) => ({ value, label }))]} /><span>已選 {draft.models.length} 個</span></div>
                <div className="model-service-catalog">
                    {protocolLoading ? <Spin /> : visibleModels.length ? visibleModels.map((item) => {
                        const profile = serviceModelProfile(draft, item, protocols);
                        const receipt = currentModelConnectionReceipt(receipts, draft, item.id);
                        const displayName = seedancePortraitLabel(item.id) || item.displayName || item.id;
                        return <label key={item.id} className="model-service-model"><Checkbox disabled={busy} checked={draft.models.includes(item.id)} onChange={(event) => toggleModel(item.id, event.target.checked)} /><span><strong>{displayName}</strong>{displayName !== item.id && <small>{item.id}</small>}</span><span className="model-service-kind">{CAPABILITY_LABELS[profile.capability]}</span><small title={receipt?.detail}>{receipt ? receipt.success ? "測試通過" : "測試失敗" : "未測試"}</small></label>;
                    }) : <div className="model-service-empty"><Search size={23} /><strong>{query ? "沒有找到匹配的模型" : "新增你的第一個模型"}</strong><p>{query ? "換個關鍵詞，或在下方手動新增。" : "讀取服務商的模型目錄，或填寫準確的模型 ID。"}</p></div>}
                </div>
                <div className="model-service-manual"><Input aria-label="模型 ID" placeholder="手動輸入模型 ID" value={manualName} disabled={busy} onChange={(event) => setManualName(event.target.value)} onPressEnter={addManual} /><Select aria-label="模型型別" value={manualCapability} disabled={busy} onChange={setManualCapability} options={Object.entries(CAPABILITY_LABELS).map(([value, label]) => ({ value, label }))} /><Button disabled={busy || protocolLoading || !manualName.trim()} onClick={addManual}>新增</Button></div>
                {draft.models.length > 0 && <><button type="button" className="model-service-advanced" aria-expanded={editingCapabilities} onClick={() => setEditingCapabilities(!editingCapabilities)}><Settings2 size={15} />高階模型設定與測試<ChevronDown size={14} /></button>{editingCapabilities && <ChannelModelSettings draft channel={draft} onChange={(modelProfiles) => setDraft((current) => ({ ...current, modelProfiles }))} />}</>}
            </div>}
            {(error || notice) && <div className="model-service-feedback">{error && <Alert type="error" showIcon title={error} />}{notice && <Alert type="info" showIcon title={notice} />}</div>}
        </div>
        <div className="model-service-footer">{step === 1 && <span>儲存後，可在創作頁選擇這些模型</span>}<div>
            {step === 0 ? <><Button disabled={busy} onClick={() => { if (validateConnection(false)) { setNotice(""); setStep(1); } }}>手動新增模型</Button><Button type="primary" loading={busy} disabled={protocolLoading} onClick={() => void fetchModels()}>讀取模型</Button></> : <><Button disabled={busy} icon={<ArrowLeft size={15} />} onClick={() => { setStep(0); setError(""); }}>連線資訊</Button><Button type="primary" loading={busy} disabled={!draft.models.length || protocolLoading} icon={<Check size={15} />} onClick={() => void save()}>儲存並使用</Button></>}
        </div></div>
    </AppModal>;
}
