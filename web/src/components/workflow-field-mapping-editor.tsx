import { Button, Collapse, Input, InputNumber, Select, Tag } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useMemo, useState } from "react";

import { Switch } from "@/components/ui/base/switch";
import { ToolButton } from "@/components/ui/base/buttons";
import { ListFilter, ListPlus, Power, PowerOff } from "lucide-react";

import type { WorkflowFieldMapping } from "@/stores/use-config-store";
import { workflowFieldChoiceValues, workflowFieldConfigurationError, workflowFieldNumberBounds, workflowFieldPresetOptions } from "@/lib/model-capabilities";
import { EmptyState } from "@/components/ui/product/empty-state";

const sourceOptions = [
    { label: "保留工作流預設值", value: "" },
    { label: "任務提示詞", value: "prompt" },
    { label: "系統提示詞", value: "systemPrompt" },
    { label: "參考圖片", value: "referenceImage" },
    { label: "參考影片", value: "referenceVideo" },
    { label: "參考音訊", value: "referenceAudio" },
    { label: "蒙版", value: "mask" },
    { label: "畫面尺寸", value: "size" },
    { label: "畫面寬高比", value: "aspectRatio" },
    { label: "畫面寬度", value: "width" },
    { label: "畫面高度", value: "height" },
    { label: "生成數量", value: "count" },
    { label: "生成質量", value: "quality" },
    { label: "透明背景", value: "transparentBackground" },
    { label: "影片時長", value: "videoSeconds" },
    { label: "影片質量", value: "vquality" },
    { label: "影片生成音訊", value: "videoGenerateAudio" },
    { label: "影片水印", value: "videoWatermark" },
    { label: "音色", value: "audioVoice" },
    { label: "音訊格式", value: "audioFormat" },
    { label: "音訊語速", value: "audioSpeed" },
    { label: "音訊聲調", value: "audioPitch" },
    { label: "音訊音量", value: "audioVolume" },
    { label: "音訊指令", value: "audioInstructions" },
] as const;

const fieldTypeOptions = [
    { label: "文本", value: "TEXT" },
    { label: "數字", value: "NUMBER" },
    { label: "滑塊", value: "SLIDER" },
    { label: "開關", value: "BOOLEAN" },
    { label: "下拉", value: "SELECT" },
    { label: "圖片", value: "IMAGE" },
    { label: "影片", value: "VIDEO" },
    { label: "音訊", value: "AUDIO" },
] as const;

type WorkflowFieldMappingEditorProps = {
    fields: WorkflowFieldMapping[];
    onChange: (fields: WorkflowFieldMapping[]) => void;
    disabled?: boolean;
};

export function WorkflowFieldMappingEditor({ fields, onChange, disabled = false }: WorkflowFieldMappingEditorProps) {
    const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
    const enabledCount = useMemo(() => fields.filter((field) => field.enabled !== false).length, [fields]);
    const controllableFields = useMemo(() => fields.filter((field) => field.safeToOverride !== false), [fields]);
    const enabledControllableCount = useMemo(() => controllableFields.filter((field) => field.enabled !== false).length, [controllableFields]);
    const visibleFields = useMemo(() => fields.flatMap((field, index) => (showOnlyEnabled && field.enabled === false ? [] : [{ field, index }])), [fields, showOnlyEnabled]);
    const updateField = (index: number, patch: Partial<WorkflowFieldMapping>) => {
        onChange(fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)));
    };
    const updateAllFields = (enabled: boolean) => {
        onChange(fields.map((field) => (field.safeToOverride === false ? field : { ...field, enabled })));
    };

    if (!fields.length) {
        return <EmptyState size="compact" description="尚未發現可配置欄位，請先拉取工作流引數" />;
    }

    return (
        <div className="workflow-field-mapping-editor space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-foreground/60">
                    共 {fields.length} 個欄位，已開啟 {enabledCount} 個。欄位調整會立即儲存到當前工作流。
                </p>
                <div className="flex flex-wrap items-center gap-1">
                    <Button type="text" size="small" icon={<Power className="size-3.5" />} disabled={disabled || enabledControllableCount === controllableFields.length} onClick={() => updateAllFields(true)}>
                        開啟全部
                    </Button>
                    <Button type="text" size="small" danger icon={<PowerOff className="size-3.5" />} disabled={disabled || enabledControllableCount === 0} onClick={() => updateAllFields(false)}>
                        關閉全部
                    </Button>
                    <ToolButton size="sm" icon={<ListFilter />} active={showOnlyEnabled} label={showOnlyEnabled ? "顯示全部" : "僅顯示已開啟"} onClick={() => setShowOnlyEnabled((current) => !current)} />
                </div>
            </div>
            <Collapse
                size="small"
                items={visibleFields.map(({ field, index }) => {
                    const source = String(field.source || "");
                    const sourceLabel = sourceOptions.find((item) => item.value === source)?.label || source || "保留工作流預設值";
                    const enabled = field.enabled !== false;
                    const fieldType = workflowEditorFieldType(field);
                    const numeric = fieldType === "NUMBER" || fieldType === "SLIDER";
                    const choices = workflowFieldChoiceValues(field);
                    const presetOptions = workflowFieldPresetOptions(field);
                    const safeToOverride = field.safeToOverride !== false;
                    const fieldDisabled = disabled || !enabled || !safeToOverride;
                    const configurationError = workflowFieldConfigurationError(field);
                    const roleLabel = field.role === "prompt" ? "提示詞" : field.role === "media" ? "素材" : field.role === "internal" ? "內部引數" : "業務引數";
                    return {
                        key: field.id || `${field.nodeId}::${field.fieldName}::${index}`,
                        label: (
                            <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium">{field.label || field.fieldName}</span>
                                <Tooltip title={`${field.nodeId}.${field.fieldName}`}>
                                    <span className="truncate text-xs text-foreground/50">
                                        {field.nodeId}.{field.fieldName}
                                    </span>
                                </Tooltip>
                                <Tag className="ml-auto shrink-0">{sourceLabel}</Tag>
                                <Tag color={safeToOverride ? undefined : "error"} className="shrink-0">
                                    {safeToOverride ? roleLabel : "禁止覆蓋"}
                                </Tag>
                            </div>
                        ),
                        extra: (
                            <span onClick={(event) => event.stopPropagation()}>
                                <Switch size="sm" checked={enabled} disabled={disabled || !safeToOverride} aria-label={`啟用欄位 ${field.label || field.fieldName}`} onChange={(checked) => updateField(index, { enabled: checked })} />
                            </span>
                        ),
                        children: (
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    顯示名稱
                                    <Input value={field.label || ""} disabled={fieldDisabled} placeholder={field.fieldName} onChange={(event) => updateField(index, { label: event.target.value })} />
                                </label>
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    引數型別
                                    <Select value={fieldType} disabled={fieldDisabled} options={fieldTypeOptions.map((item) => ({ ...item }))} onChange={(value) => updateField(index, { fieldType: value })} />
                                </label>
                                <label className="grid gap-1 text-xs text-foreground/60">
                                    輸入來源
                                    <Select showSearch value={source} disabled={fieldDisabled} options={sourceOptions.map((item) => ({ ...item }))} optionFilterProp="label" onChange={(value) => updateField(index, sourcePatch(field, value))} />
                                </label>
                                {fieldType === "SELECT" || choices.length || presetOptions.length ? (
                                    <label className="grid gap-1 text-xs text-foreground/60 md:col-span-2 lg:col-span-3">
                                        <span className="flex items-center justify-between gap-2">
                                            <span>下拉選項（每行一個）</span>
                                            {presetOptions.length ? (
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<ListPlus className="size-3.5" />}
                                                    disabled={fieldDisabled}
                                                    onClick={() => updateField(index, { fieldType: "SELECT", options: presetOptions, optionsSource: "preset" })}
                                                >
                                                    常用模板
                                                </Button>
                                            ) : null}
                                        </span>
                                        <Input.TextArea
                                            autoSize={{ minRows: 2, maxRows: 6 }}
                                            value={choices.map(workflowOptionText).join("\n")}
                                            disabled={fieldDisabled}
                                            placeholder={"1:1\n16:9\n9:16"}
                                            onChange={(event) => updateField(index, { options: parseWorkflowOptions(event.target.value), optionsSource: "manual" })}
                                        />
                                    </label>
                                ) : null}
                                {numeric ? (
                                    <>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            最小值
                                            <InputNumber className="w-full" value={numberOrUndefined(field.min)} max={numberOrUndefined(field.max)} disabled={fieldDisabled} onChange={(value) => updateField(index, { min: value ?? undefined })} />
                                        </label>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            最大值
                                            <InputNumber className="w-full" value={numberOrUndefined(field.max)} min={numberOrUndefined(field.min)} disabled={fieldDisabled} onChange={(value) => updateField(index, { max: value ?? undefined })} />
                                        </label>
                                        <label className="grid gap-1 text-xs text-foreground/60">
                                            步長
                                            <InputNumber className="w-full" min={0.000001} value={numberOrUndefined(field.step)} disabled={fieldDisabled} onChange={(value) => updateField(index, { step: value ?? undefined })} />
                                        </label>
                                        {configurationError ? <div className="text-xs text-error md:col-span-2 lg:col-span-3">{configurationError}</div> : null}
                                    </>
                                ) : null}
                                {sourceUsesIndex(source) ? (
                                    <label className="grid gap-1 text-xs text-foreground/60">
                                        {source === "referenceImage" ? "圖片槽位" : source === "referenceVideo" ? "影片槽位" : "音訊槽位"}
                                        <InputNumber
                                            className="w-full"
                                            min={1}
                                            precision={0}
                                            value={source === "referenceImage" ? Math.max(1, Number(field.imageOrder) || 1) : Math.max(1, (Number(field.sourceIndex) || 0) + 1)}
                                            disabled={fieldDisabled}
                                            onChange={(value) => updateField(index, source === "referenceImage" ? { imageOrder: Number(value) || 1 } : { sourceIndex: Math.max(0, (Number(value) || 1) - 1) })}
                                        />
                                    </label>
                                ) : null}
                                <label className="flex items-center justify-between gap-3 text-xs text-foreground/60">
                                    缺失時阻止生成
                                    <Switch checked={field.required === true} disabled={fieldDisabled || !source} onChange={(required) => updateField(index, { required })} />
                                </label>
                                {fieldType === "NUMBER" ? (
                                    <label className="flex items-center justify-between gap-3 text-xs text-foreground/60">
                                        每次隨機數字
                                        <Switch checked={field.randomEnabled === true} disabled={fieldDisabled || Boolean(source)} onChange={(randomEnabled) => updateField(index, { randomEnabled })} />
                                    </label>
                                ) : null}
                                {!source ? (
                                    <label className="grid gap-1 text-xs text-foreground/60 md:col-span-2 lg:col-span-3">
                                        工作流預設值
                                        <DefaultValueInput field={field} disabled={fieldDisabled || field.randomEnabled === true} onChange={(fieldValue) => updateField(index, { fieldValue })} />
                                    </label>
                                ) : null}
                            </div>
                        ),
                    };
                })}
            />
            {showOnlyEnabled && !visibleFields.length ? <EmptyState size="compact" description="暫無已開啟欄位" /> : null}
        </div>
    );
}

function DefaultValueInput({ field, disabled, onChange }: { field: WorkflowFieldMapping; disabled: boolean; onChange: (value: unknown) => void }) {
    const fieldType = String(field.fieldType || "").toUpperCase();
    const value = field.fieldValue ?? field.value ?? field.default;
    const bounds = workflowFieldNumberBounds(field);
    const choices = workflowFieldChoiceValues(field);
    if (fieldType === "BOOLEAN" || typeof value === "boolean") {
        return (
            <Select
                value={Boolean(value)}
                disabled={disabled}
                options={[
                    { label: "true", value: true },
                    { label: "false", value: false },
                ]}
                onChange={onChange}
            />
        );
    }
    if (choices.length) {
        return <Select showSearch value={value} disabled={disabled} options={choices.map((option) => ({ label: workflowOptionText(option), value: workflowOptionValue(option) }))} onChange={onChange} />;
    }
    if (fieldType === "NUMBER" || typeof value === "number" || bounds.min !== undefined || bounds.max !== undefined || bounds.step !== undefined) {
        return <InputNumber className="w-full" value={numberOrUndefined(value)} disabled={disabled} min={bounds.min} max={bounds.max} step={bounds.step} onChange={onChange} />;
    }
    return <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={displayValue(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

function sourcePatch(field: WorkflowFieldMapping, source: string): Partial<WorkflowFieldMapping> {
    if (source === "referenceImage") return { source, bindPrompt: false, sourceAutomatic: false, imageOrder: Math.max(1, Number(field.imageOrder) || 1), sourceIndex: undefined };
    if (source === "referenceVideo" || source === "referenceAudio") return { source, bindPrompt: false, sourceAutomatic: false, sourceIndex: Math.max(0, Number(field.sourceIndex) || 0), imageOrder: undefined };
    return { source, bindPrompt: false, sourceAutomatic: false, sourceIndex: undefined, imageOrder: undefined, required: source ? field.required : false };
}

function sourceUsesIndex(source: string) {
    return source === "referenceImage" || source === "referenceVideo" || source === "referenceAudio";
}

function workflowEditorFieldType(field: WorkflowFieldMapping) {
    const configured = String(field.fieldType || "")
        .trim()
        .toUpperCase();
    if (["FLOAT", "INT", "INTEGER"].includes(configured)) return "NUMBER";
    if (fieldTypeOptions.some((item) => item.value === configured)) return configured;
    const value = field.fieldValue ?? field.value ?? field.default;
    if (typeof value === "boolean") return "BOOLEAN";
    if (typeof value === "number") return "NUMBER";
    return "TEXT";
}

function parseWorkflowOptions(value: string) {
    return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function workflowOptionValue(value: unknown): string | number {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const option = value as Record<string, unknown>;
        for (const key of ["value", "id", "key", "name", "label"]) {
            if (option[key] !== undefined && option[key] !== null) return typeof option[key] === "number" ? option[key] : String(option[key]);
        }
    }
    return typeof value === "number" ? value : String(value ?? "");
}

function workflowOptionText(value: unknown) {
    return String(workflowOptionValue(value));
}

function numberOrUndefined(value: unknown) {
    if (value === undefined || value === null || String(value).trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function displayValue(value: unknown) {
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
