import { App, Button, Form, Input } from "antd";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { Minus, Plus, Save, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";

import { fallbackSkillCategories } from "@/pages/skills/skill-catalog";
import { generateSkillDraft } from "@/lib/canvas/skill-drafting";
import { navigateToSettings } from "@/lib/settings-navigation";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { createSkill, updateSkill, type Skill, type SkillMutationInput, type SkillShowcaseMedia } from "@/services/api/skills";

type SkillFormValues = Omit<SkillMutationInput, "isPrivate"> & { is_public: boolean };

export function SkillEditorDrawer({ open, skill, onClose, onSaved }: { open: boolean; skill: Skill | null; onClose: () => void; onSaved: (skill: Skill) => void }) {
    const { message, modal } = App.useApp();
    const [form] = Form.useForm<SkillFormValues>();
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftIdea, setDraftIdea] = useState("");
    const [drafting, setDrafting] = useState(false);
    const effectiveConfig = useEffectiveConfig();
    const isPackageSkill = Boolean(skill && skill.sourceType !== "markdown" && skill.sourceType !== "builtin" && skill.sourceType !== "");

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue({
            skillName: skill?.skillName || "",
            description: skill?.description || "",
            instruction: skill?.instruction || "",
            tag: skill?.tag || "creative",
            is_public: skill ? !skill.isPrivate : true,
            markdownUrl: skill?.markdownUrl || skill?.sourceUrl || "",
            showcaseMedia: skill?.showcaseMedia || [],
            extraInfo: skill?.extraInfo || "",
        });
        setDirty(false);
    }, [form, open, skill]);

    const requestClose = () => {
        if (!dirty) {
            onClose();
            return;
        }
        modal.confirm({ title: "放棄未儲存的修改？", content: "當前填寫內容不會保留。", okText: "放棄修改", okButtonProps: { danger: true }, cancelText: "繼續編輯", onOk: onClose });
    };

    const submit = async (values: SkillFormValues) => {
        setSaving(true);
        try {
            const input: SkillMutationInput = {
                skillName: values.skillName,
                description: values.description,
                instruction: values.instruction || "",
                tag: values.tag,
                isPrivate: !values.is_public,
                markdownUrl: values.markdownUrl || "",
                showcaseMedia: (values.showcaseMedia || []).map((item) => ({ ...item, showcaseUri: item.showcaseUri || "" })),
                extraInfo: values.extraInfo || "",
            };
            const result = skill ? await updateSkill(skill.skillId, input) : await createSkill(input);
            setDirty(false);
            message.success(skill ? "技能已更新" : "技能已建立");
            onSaved(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能儲存失敗");
        } finally {
            setSaving(false);
        }
    };

    const draftFromIdea = async () => {
        const idea = draftIdea.trim();
        if (!idea) {
            message.warning("請先描述你想沉澱的技能");
            return;
        }
        if (!useConfigStore.getState().isAiConfigReady(effectiveConfig, effectiveConfig.model)) {
            message.info("尚未配置可用的文本模型，請先到設定頁配置");
            navigateToSettings({ section: "models", continueCreation: true });
            return;
        }
        setDrafting(true);
        try {
            const draft = await generateSkillDraft(idea, effectiveConfig);
            form.setFieldsValue({
                skillName: draft.skillName || "",
                description: draft.description || "",
                instruction: draft.instruction || "",
                ...(draft.tag ? { tag: draft.tag } : {}),
            });
            setDirty(true);
            message.success("草稿已生成，請檢查並調整後儲存");
        } catch (error) {
            message.error(error instanceof Error ? `起草失敗：${error.message}` : "起草失敗");
        } finally {
            setDrafting(false);
        }
    };

    return (
        <AppDrawer className="library-drawer" open={open} size={720} mask={{ closable: !dirty }} title={skill ? "編輯技能" : "建立技能"} onClose={requestClose} extra={<Button type="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => form.submit()}>儲存技能</Button>}>
            {!isPackageSkill ? <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <Wand2 className="size-4" />
                    AI 起草
                    <span className="font-normal text-foreground/45">描述想法，一鍵生成名稱、簡介與指令草稿（可再編輯）</span>
                </div>
                <Input.TextArea
                    value={draftIdea}
                    onChange={(event) => setDraftIdea(event.target.value)}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    maxLength={2000}
                    showCount
                    disabled={drafting}
                    placeholder="例如：我要一個豎屏短劇分鏡技能——輸入劇本段落，輸出按景別排列的分鏡表，每個鏡頭包含畫面、臺詞、時長與轉場…"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground/45">將使用你的文本模型生成一次草稿</span>
                    <Button type="primary" loading={drafting} disabled={!draftIdea.trim()} icon={<Wand2 className="size-4" />} onClick={() => void draftFromIdea()}>生成草稿</Button>
                </div>
            </div> : <div className="mb-4 rounded-xl border bg-foreground/[.02] p-3 text-sm leading-6 text-foreground/58">這是多檔案技能包。這裡僅編輯名稱、簡介、分類和展示資訊；技能正文請更新 ZIP，或在 GitHub 倉庫修改後執行同步。</div>}
            <Form form={form} layout="vertical" requiredMark="optional" onFinish={submit} onValuesChange={() => setDirty(true)}>
                <div className="grid gap-x-4 sm:grid-cols-2">
                    <Form.Item name="skillName" label="技能名稱" rules={[{ required: true, message: "請填寫技能名稱" }, { max: 80, message: "最多 80 個字元" }]}>
                        <Input maxLength={80} showCount placeholder="例如：短劇導演分鏡" autoComplete="off" />
                    </Form.Item>
                    <Form.Item name="tag" label="技能分類" rules={[{ required: true, message: "請選擇技能分類" }]}>
                        <Select options={fallbackSkillCategories.map(({ value, label }) => ({ value, label }))} />
                    </Form.Item>
                </div>

                <Form.Item name="description" label="技能簡介" rules={[{ required: true, message: "請填寫技能簡介" }, { max: 500, message: "最多 500 個字元" }]}>
                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount placeholder="說明適用場景、輸入條件和最終產出" />
                </Form.Item>

                {!isPackageSkill ? <Form.Item name="instruction" label="技能指令" rules={[{ required: true, message: "請填寫技能指令" }, { max: 100000, message: "最多 100000 個字元" }]} extra="單檔案技能會作為 SKILL.md 安裝，Agent 按任務需要讀取。">
                    <Input.TextArea className="font-mono text-xs leading-5" autoSize={{ minRows: 14, maxRows: 28 }} maxLength={100000} showCount placeholder="使用 Markdown 編寫角色、約束、流程、檢查清單和輸出格式" />
                </Form.Item> : null}

                <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <Form.Item name="markdownUrl" label={isPackageSkill ? "來源地址" : "Markdown 地址"} rules={[{ type: "url", message: "請輸入有效的 HTTP(S) 連結" }]}>
                        <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/SKILL.md" />
                    </Form.Item>
                    <Form.Item name="is_public" label="公開狀態" valuePropName="checked" extra="公開後其他使用者可以加入使用。">
                        <Switch checkedChildren="公開" unCheckedChildren="私有" />
                    </Form.Item>
                </div>

                <Form.List name="showcaseMedia">
                    {(fields, { add, remove }) => (
                        <section aria-labelledby="skill-media-title">
                            <div className="mb-3 flex items-center justify-between">
                                <div><h3 id="skill-media-title" className="text-sm font-medium">展示媒體</h3><p className="mt-1 text-xs text-foreground/50">可選，最多 8 個公開圖片或影片連結。</p></div>
                                <Button disabled={fields.length >= 8} icon={<Plus className="size-4" />} onClick={() => add(emptyMedia())}>新增媒體</Button>
                            </div>
                            <div className="space-y-2">
                                {fields.map((field) => (
                                    <div key={field.key} className="grid grid-cols-[112px_minmax(0,1fr)_36px] gap-2">
                                        <Form.Item {...field} name={[field.name, "type"]} className="mb-0" rules={[{ required: true, message: "選擇型別" }]}>
                                            <Select options={[{ value: "image", label: "圖片" }, { value: "video", label: "影片" }]} />
                                        </Form.Item>
                                        <Form.Item {...field} name={[field.name, "showcaseUrl"]} className="mb-0" rules={[{ required: true, message: "請填寫媒體連結" }, { type: "url", message: "連結格式無效" }]}>
                                            <Input type="url" inputMode="url" spellCheck={false} placeholder="https://example.com/media" />
                                        </Form.Item>
                                        <Button aria-label="移除媒體" title="移除媒體" icon={<Minus className="size-4" />} onClick={() => remove(field.name)} />
                                        <Form.Item {...field} name={[field.name, "showcaseUri"]} hidden><Input /></Form.Item>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </Form.List>

                <Form.Item name="extraInfo" label="補充資訊" className="mt-5" rules={[{ max: 2000, message: "最多 2000 個字元" }]}>
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} showCount placeholder="版本說明、依賴工具或使用注意事項" />
                </Form.Item>
            </Form>
        </AppDrawer>
    );
}

function emptyMedia(): SkillShowcaseMedia {
    return { type: "image", showcaseUri: "", showcaseUrl: "" };
}
