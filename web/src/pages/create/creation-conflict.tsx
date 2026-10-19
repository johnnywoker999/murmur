import { AppModal } from "@/components/ui/product/app-modal";
import type { CreationConversation } from "./creation-types";

export type CreationConflictPreview = {
    title: string;
    messageCount: number;
    excerpt: string;
};

export function creationConflictPreview(conversation: { title?: string; messages?: Array<{ role?: string; content?: string }> } | undefined): CreationConflictPreview {
    const messages = conversation?.messages || [];
    const lastUser = [...messages].reverse().find((item) => item.role === "user" && String(item.content || "").trim());
    const excerpt = String(lastUser?.content || "").trim().replace(/\s+/g, " ");
    return {
        title: String(conversation?.title || "").trim() || "未命名對話",
        messageCount: messages.length,
        excerpt: excerpt ? (excerpt.length > 42 ? `${excerpt.slice(0, 41)}…` : excerpt) : "還沒有文字",
    };
}

export function CreationConflictBanner({
    parked,
    onReview,
    onUseSaved,
    onRestoreParked,
}: {
    parked?: boolean;
    onReview: () => void;
    onUseSaved: () => void;
    onRestoreParked?: () => void;
}) {
    if (parked) {
        return (
            <div className="creation-conflict-banner" role="status">
                <p>已改為已儲存的版本。剛才的草稿還在，可以再換回來。</p>
                <div className="creation-conflict-banner-actions">
                    <button type="button" onClick={onRestoreParked}>恢復剛才的草稿</button>
                </div>
            </div>
        );
    }
    return (
        <div className="creation-conflict-banner" role="status">
            <p>這份對話和已儲存的版本不一樣。先看兩邊，再決定用哪一份。</p>
            <div className="creation-conflict-banner-actions">
                <button type="button" onClick={onReview}>檢視兩邊</button>
                <button type="button" onClick={onUseSaved}>用已儲存的版本</button>
            </div>
        </div>
    );
}

export function CreationConflictDialog({
    open,
    local,
    remote,
    onClose,
    onUseSaved,
    onUseLocal,
}: {
    open: boolean;
    local?: CreationConversation;
    remote?: CreationConversation;
    onClose: () => void;
    onUseSaved: () => void;
    onUseLocal: () => void;
}) {
    const localPreview = creationConflictPreview(local);
    const remotePreview = creationConflictPreview(remote);
    return (
        <AppModal
            open={open}
            title="有兩個版本"
            onCancel={onClose}
            footer={null}
            centered
            width="min(560px, calc(100vw - 32px))"
            className="creation-conflict-modal"
        >
            <div className="creation-conflict-dialog">
                <p className="creation-conflict-lead">先看兩邊的標題和最近一句。用已儲存的版本時，這份草稿會留下來，之後還能換回來。</p>
                <div className="creation-conflict-cards">
                    <section className="creation-conflict-card">
                        <h3>這份草稿</h3>
                        <p className="creation-conflict-title">{localPreview.title}</p>
                        <p>{localPreview.messageCount} 條訊息</p>
                        <p className="creation-conflict-excerpt">{localPreview.excerpt}</p>
                    </section>
                    <section className="creation-conflict-card">
                        <h3>已儲存的版本</h3>
                        <p className="creation-conflict-title">{remotePreview.title}</p>
                        <p>{remotePreview.messageCount} 條訊息</p>
                        <p className="creation-conflict-excerpt">{remotePreview.excerpt}</p>
                    </section>
                </div>
                <div className="creation-conflict-dialog-actions">
                    <button type="button" onClick={onUseLocal}>用這份草稿替換已儲存的版本</button>
                    <button type="button" className="is-primary" onClick={onUseSaved}>用已儲存的版本</button>
                    <button type="button" className="is-quiet" onClick={onClose}>先不處理</button>
                </div>
            </div>
        </AppModal>
    );
}
