import { useId, useState } from "react";
import { Button, Input } from "antd";
import { Check, Plus } from "lucide-react";
import { Switch } from "@/components/ui/base/switch";
import "./image-size-picker.css";
import type { ImageCapabilityConfig } from "@/lib/model-capabilities";
import { IMAGE_RATIOS, IMAGE_RESOLUTIONS, imagePresetForRatio, imageResolutionUsesQuality, imageSizeConfigWithPresets, imageSizePresets, imageTierAvailable } from "@/lib/image-size-presets";
import type { ImageResolutionTier } from "@/lib/image-resolution-tiers";

export function ImageSizePresetsEditor({ profile, disabled, onChange }: { profile: ImageCapabilityConfig; disabled?: boolean; onChange: (size: ImageCapabilityConfig["size"]) => void }) {
    const presets = imageSizePresets(profile);
    const id = useId();
    const [drafts, setDrafts] = useState<Partial<Record<ImageResolutionTier, string>>>({});
    const [errors, setErrors] = useState<Partial<Record<ImageResolutionTier, string>>>({});
    const toggleTier = (tier: ImageResolutionTier, ratios: string[], enabled: boolean) => {
        if (disabled) return;
        update(tier, enabled ? ratios : []);
    };
    const update = (tier: ImageResolutionTier, ratios: string[]) => {
        if (disabled) return false;
        try {
            const next = [
                ...new Map(
                    ratios.map((ratio) => {
                        const normalized = imagePresetForRatio(tier, ratio);
                        const preset = presets.find((preset) => preset.tier === tier && preset.ratio === normalized.ratio) || normalized;
                        return [preset.ratio, preset] as const;
                    }),
                ).values(),
            ];
            onChange(imageSizeConfigWithPresets(profile, [...presets.filter((preset) => preset.tier !== tier), ...next]));
            setErrors((current) => ({ ...current, [tier]: "" }));
            return true;
        } catch (reason) {
            setErrors((current) => ({ ...current, [tier]: reason instanceof Error ? reason.message : "比例格式無效" }));
            return false;
        }
    };
    const addRatio = (tier: ImageResolutionTier) => {
        const ratios = (drafts[tier] || "")
            .split(/[,，\n]/)
            .map((value) => value.trim())
            .filter(Boolean);
        if (!ratios.length) return;
        if (update(tier, [...presets.filter((preset) => preset.tier === tier).map((preset) => preset.ratio), ...ratios])) {
            setDrafts((current) => ({ ...current, [tier]: "" }));
        }
    };
    return (
        <div className="image-size-presets-editor">
            <p className="image-size-editor-intro">點選支援的比例，再次點選可移除。尺寸自動換算，已有精確尺寸保持不變。</p>
            {IMAGE_RESOLUTIONS.map((tier) => {
                const items = presets.filter((preset) => preset.tier === tier);
                const ratios = [...new Set([...IMAGE_RATIOS, ...items.map((item) => item.ratio)])];
                return (
                    <section key={tier} className="image-size-preset-group" aria-labelledby={`${id}-${tier}-title`}>
                        <header className="image-size-preset-heading">
                            <div className="image-size-preset-heading-label">
                                <strong id={`${id}-${tier}-title`}>{tier.toUpperCase()}</strong>
                                <span>{items.length ? `${items.length} 個比例` : "未啟用"}</span>
                                <Switch size="sm" checked={items.length === ratios.length} disabled={disabled} aria-label={`啟用 ${tier.toUpperCase()} 規格`} onChange={(enabled) => toggleTier(tier, ratios, enabled)} />
                            </div>
                        </header>
                        <div className="image-size-preset-body">
                            {imageResolutionUsesQuality(profile) && !imageTierAvailable(profile, tier) ? <p className="image-size-hint">需先配置此檔位對應的質量值，使用者端才會開放。</p> : null}
                            <div className="image-size-preset-options" role="group" aria-label={`${tier.toUpperCase()} 支援的寬高比`}>
                                {ratios.map((ratio) => {
                                    const selected = items.find((item) => item.ratio === ratio);
                                    const dimensions = selected || imagePresetForRatio(tier, ratio);
                                    return (
                                        <button
                                            key={ratio}
                                            type="button"
                                            disabled={disabled}
                                            aria-pressed={Boolean(selected)}
                                            aria-label={`${tier.toUpperCase()} ${ratio}`}
                                            className="image-size-preset-option"
                                            title={`${ratio} · ${dimensions.width} × ${dimensions.height} px${selected ? " · 點選移除" : " · 點選新增"}`}
                                            onClick={() => update(tier, selected ? items.filter((item) => item.ratio !== ratio).map((item) => item.ratio) : [...items.map((item) => item.ratio), ratio])}
                                        >
                                            <span className="image-size-preset-option-label">
                                                <span>{ratio}</span>
                                                {selected ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                                            </span>
                                            <small>
                                                {dimensions.width} × {dimensions.height}
                                            </small>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="image-size-preset-add">
                                <Input
                                    aria-label={`${tier.toUpperCase()} 自定義比例`}
                                    aria-invalid={Boolean(errors[tier])}
                                    aria-describedby={errors[tier] ? `${id}-${tier}-error` : undefined}
                                    disabled={disabled}
                                    placeholder="其他比例，如 17:11"
                                    value={drafts[tier] || ""}
                                    onChange={(event) => {
                                        setDrafts((current) => ({ ...current, [tier]: event.target.value }));
                                        setErrors((current) => ({ ...current, [tier]: "" }));
                                    }}
                                    onPressEnter={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        addRatio(tier);
                                    }}
                                />
                                <Button disabled={disabled || !drafts[tier]?.trim()} icon={<Plus size={14} />} onClick={() => addRatio(tier)} aria-label={`新增 ${tier.toUpperCase()} 比例`}>
                                    新增
                                </Button>
                            </div>
                            {errors[tier] ? (
                                <p id={`${id}-${tier}-error`} role="alert" className="image-size-error">
                                    {errors[tier]}
                                </p>
                            ) : null}
                        </div>
                    </section>
                );
            })}
            <div className="image-size-defaults">
                <div className="image-size-defaults-heading">
                    <strong>預設輸出</strong>
                    <span>使用者選擇模型時的初始尺寸</span>
                </div>
                <div className="image-size-default-options" role="group" aria-label="預設輸出">
                    {profile.size.values.map((value) => {
                        const preset = presets.find((item) => (profile.size.parameter === "aspect_ratio" ? item.ratio === value : item.size === value));
                        const label = value === "auto" ? "自動" : preset && profile.size.parameter === "size" ? `${preset.tier.toUpperCase()} · ${preset.ratio}` : value;
                        return (
                            <button key={value} type="button" disabled={disabled} aria-pressed={profile.size.default === value} title={value} aria-label={`預設輸出 ${label} ${value}`} onClick={() => onChange({ ...profile.size, default: value })}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
