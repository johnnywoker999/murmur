import { Modal, Upload } from "antd";
import { CloudUpload, FileText, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

import type { RegisteredPlugin } from "@/lib/plugins/plugin-types";

import pluginDevelopmentGuideMarkdown from "./plugin-development-guide.md?raw";
import { getPluginDocumentation } from "./plugin-documentation";
import { PluginMarkdown } from "./plugin-markdown";
import "./plugins.css";

type UploadPluginModalProps = {
    open: boolean;
    onClose: () => void;
    onUpload: (file: File) => void;
};

export function UploadPluginModal({ open, onClose, onUpload }: UploadPluginModalProps) {
    const [isDraggingPlugin, setIsDraggingPlugin] = useState(false);
    const dragDepth = useRef(0);

    const handlePluginDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current += 1;
        setIsDraggingPlugin(true);
    };

    const handlePluginDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsDraggingPlugin(false);
        }
    };

    const handlePluginDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDraggingPlugin(false);
    };

    return (
        <Modal
            className="workspace-modal workspace-modal-wide plugin-upload-modal"
            title="上傳外掛"
            open={open}
            centered
            footer={null}
            destroyOnHidden
            onCancel={onClose}
            styles={{ body: { maxHeight: "min(82vh, 900px)", overflowY: "auto", overscrollBehavior: "contain" } }}
        >
            <div className="plugin-upload-layout">
                <section className="plugin-upload-guide">
                    <PluginMarkdown source={pluginDevelopmentGuideMarkdown} />
                </section>
                <aside className="plugin-upload-panel">
                    <div className="plugin-upload-panel-heading">
                        <span className="plugin-upload-panel-icon"><CloudUpload className="size-5" /></span>
                        <div>
                            <h2>安裝外掛包</h2>
                            <p>選擇統一站點外掛包，安裝後會立即進入外掛中心。</p>
                        </div>
                    </div>
                    <div
                        className={`plugin-upload-dropzone-shell${isDraggingPlugin ? " is-dragging" : ""}`}
                        onDragEnter={handlePluginDragEnter}
                        onDragLeave={handlePluginDragLeave}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handlePluginDrop}
                    >
                        <Upload.Dragger
                            className="plugin-upload-dropzone"
                            accept=".beeftv-plugin,application/zip"
                            maxCount={1}
                            showUploadList={false}
                            beforeUpload={(file) => {
                                onUpload(file);
                                return false;
                            }}
                        >
                            <CloudUpload className="plugin-upload-dropzone-icon" />
                            <p className="ant-upload-text">{isDraggingPlugin ? "釋放檔案以上傳外掛" : "點選選擇外掛檔案，也可拖拽到此處"}</p>
                            <p className="ant-upload-hint">支援 .beeftv-plugin 包 · 大小不超過 48 MiB</p>
                        </Upload.Dragger>
                    </div>
                    <div className="plugin-upload-notice">
                        <ShieldCheck className="size-4" />
                        <span>上傳前請確認外掛來源可信。Web 入口只能進入宣告的隔離執行時，不會獲得主頁面許可權；金鑰也不會從清單讀取。</span>
                    </div>
                </aside>
            </div>
        </Modal>
    );
}

type PluginDetailsModalProps = {
    plugin?: RegisteredPlugin;
    restoreFocus: boolean;
    onClose: () => void;
};

export function PluginDetailsModal({ plugin, restoreFocus, onClose }: PluginDetailsModalProps) {
    return (
        <Modal
            className="workspace-modal workspace-modal-wide plugin-details-modal"
            title={plugin ? (
                <div className="plugin-details-title">
                    <FileText className="size-4" />
                    <span>{plugin.manifest.name}</span>
                    <span className="plugin-version">v{plugin.manifest.version}</span>
                </div>
            ) : null}
            open={Boolean(plugin)}
            centered
            footer={null}
            destroyOnHidden
            focusTriggerAfterClose={restoreFocus}
            onCancel={onClose}
            styles={{ body: { maxHeight: "min(78vh, 820px)", overflowY: "auto", overscrollBehavior: "contain" } }}
        >
            {plugin ? <PluginMarkdown className="plugin-details-document" source={getPluginDocumentation(plugin.manifest)} /> : null}
        </Modal>
    );
}
