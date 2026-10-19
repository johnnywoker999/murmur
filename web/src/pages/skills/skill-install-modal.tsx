import { App, Button, Form, Input, Modal, Upload, type UploadFile } from "antd";
import { Select } from "@/components/ui/base/select";
import { Switch } from "@/components/ui/base/switch";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { FileArchive, FileText, GitBranch, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { fallbackSkillCategories } from "@/pages/skills/skill-catalog";
import { isLocalRuntimeMode } from "@/lib/runtime-mode";
import { installGitHubSkill, installSkillUpload, type Skill } from "@/services/api/skills";

type InstallMode = "markdown" | "zip" | "github";

type InstallFormValues = {
    name?: string;
    description?: string;
    tag: string;
    is_public: boolean;
    url?: string;
    ref?: string;
    subdir?: string;
    autoUpdate: boolean;
};

const modeOptions = [
    { value: "markdown", label: <span className="inline-flex items-center gap-1.5"><FileText className="size-3.5" />Markdown</span> },
    { value: "zip", label: <span className="inline-flex items-center gap-1.5"><FileArchive className="size-3.5" />ZIP 技能包</span> },
    { value: "github", label: <span className="inline-flex items-center gap-1.5"><GitBranch className="size-3.5" />GitHub</span> },
];

export function SkillInstallModal({ open, onClose, onInstalled, onManualCreate }: { open: boolean; onClose: () => void; onInstalled: (skill: Skill) => void; onManualCreate?: () => void }) {
    const { message } = App.useApp();
    const [form] = Form.useForm<InstallFormValues>();
    const [mode, setMode] = useState<InstallMode>("markdown");
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [installing, setInstalling] = useState(false);
    const localRuntime = isLocalRuntimeMode();
    const availableModeOptions = localRuntime ? modeOptions.filter((option) => option.value !== "github") : modeOptions;

    useEffect(() => {
        if (!open) return;
        setMode("markdown");
        setFileList([]);
        form.setFieldsValue({ tag: "creative", is_public: !localRuntime, autoUpdate: true, name: "", description: "", url: "", ref: "", subdir: "" });
    }, [form, open, localRuntime]);

    const install = async () => {
        const values = await form.validateFields();
        const file = fileList[0]?.originFileObj;
        if (mode !== "github" && !file) {
            message.warning(`請選擇一個 ${mode === "zip" ? "ZIP 技能包" : "Markdown 檔案"}`);
            return;
        }
        setInstalling(true);
        try {
            const result = mode === "github"
                ? await installGitHubSkill({
                    url: values.url || "",
                    ref: values.ref || undefined,
                    subdir: values.subdir || undefined,
                    tag: values.tag,
                    isPrivate: localRuntime || !values.is_public,
                    autoUpdate: values.autoUpdate,
                })
                : await installSkillUpload({
                    file: file as File,
                    sourceType: mode,
                    name: values.name || undefined,
                    description: values.description || undefined,
                    tag: values.tag,
                    isPrivate: localRuntime || !values.is_public,
                });
            message.success("技能已安裝");
            onInstalled(result.skill);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "技能安裝失敗");
        } finally {
            setInstalling(false);
        }
    };

    return (
        <Modal
            className="skill-install-modal"
            open={open}
            width={680}
            destroyOnHidden
            mask={{ closable: !installing }}
            title="安裝技能"
            onCancel={onClose}
            footer={(
                <div className="flex items-center justify-between gap-3">
                    {onManualCreate ? <Button type="text" onClick={onManualCreate}>從空白建立單檔案技能</Button> : <span />}
                    <div className="flex gap-2"><Button onClick={onClose}>取消</Button><Button type="primary" loading={installing} onClick={() => void install()}>安裝技能</Button></div>
                </div>
            )}
        >
            <p className="mb-4 text-sm leading-6 text-foreground/55">支援標準 <code>SKILL.md</code> 或包含多層目錄的 ZIP 技能包。名稱和簡介會優先從技能入口自動讀取。</p>
            <SegmentedControl className="skill-install-mode" block options={availableModeOptions} value={mode} onChange={(value) => { setMode(value as InstallMode); setFileList([]); }} />

            <Form form={form} layout="vertical" requiredMark="optional" className="skill-install-form">
                {mode === "github" ? (
                    <>
                        <Form.Item name="url" label="GitHub 地址" rules={[{ required: true, message: "請填寫 GitHub 倉庫地址" }, { type: "url", message: "請輸入有效連結" }]}>
                            <Input type="url" inputMode="url" spellCheck={false} prefix={<GitBranch className="size-4 text-foreground/35" />} placeholder="https://github.com/owner/repository" />
                        </Form.Item>
                        <div className="grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="ref" label="分支或標籤" extra="留空時使用預設分支"><Input spellCheck={false} placeholder="main" /></Form.Item>
                            <Form.Item name="subdir" label="技能子目錄" extra="倉庫僅含一個技能時可留空"><Input spellCheck={false} placeholder="skills/ai-director" /></Form.Item>
                        </div>
                    </>
                ) : (
                    <>
                        <Upload.Dragger
                            accept={mode === "zip" ? ".zip,application/zip" : ".md,.markdown,text/markdown"}
                            maxCount={1}
                            fileList={fileList}
                            beforeUpload={(file) => {
                                if (file.size > 20 * 1024 * 1024) {
                                    message.error("技能檔案不能超過 20MB");
                                    return Upload.LIST_IGNORE;
                                }
                                return false;
                            }}
                            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
                            onRemove={() => { setFileList([]); return true; }}
                        >
                            <UploadCloud className="mx-auto mb-3 size-8 text-foreground/38" />
                            <div className="text-sm font-medium">拖入或選擇 {mode === "zip" ? "ZIP 技能包" : "Markdown 檔案"}</div>
                            <div className="mt-1 text-xs text-foreground/45">{mode === "zip" ? "根目錄或唯一子目錄中必須包含 SKILL.md" : "普通 .md 會作為技能入口 SKILL.md 安裝"}</div>
                        </Upload.Dragger>
                        <div className="mt-4 grid gap-x-3 sm:grid-cols-2">
                            <Form.Item name="name" label="覆蓋名稱" extra="可選，留空時自動讀取"><Input maxLength={80} autoComplete="off" /></Form.Item>
                            <Form.Item name="description" label="覆蓋簡介" extra="可選，留空時自動讀取"><Input maxLength={500} autoComplete="off" /></Form.Item>
                        </div>
                    </>
                )}

                <div className="grid gap-x-3 sm:grid-cols-2">
                    <Form.Item name="tag" label="技能分類" rules={[{ required: true, message: "請選擇技能分類" }]}>
                        <Select options={fallbackSkillCategories} />
                    </Form.Item>
                    <Form.Item hidden={localRuntime} name="is_public" label="公開狀態" valuePropName="checked" extra="公開後其他使用者可以加入使用。">
                        <Switch checkedChildren="公開" unCheckedChildren="私有" />
                    </Form.Item>
                </div>
                {mode === "github" ? <Form.Item name="autoUpdate" label="自動同步" valuePropName="checked" extra="後臺每 6 小時檢查一次提交版本，並記錄最近檢查與同步時間。"><Switch checkedChildren="開啟" unCheckedChildren="關閉" /></Form.Item> : null}
            </Form>
        </Modal>
    );
}
