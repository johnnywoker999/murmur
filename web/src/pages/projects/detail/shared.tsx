import { StatusBadge } from "@/components/ui/base/badges";
import type { ReactNode } from "react";

import type { ProjectDetail, ProjectUnit } from "@/services/api/projects";
import { ASSET_CATEGORY_LABELS, assetCategoryLabel as sharedAssetCategoryLabel } from "@/lib/asset-category";

export type ProjectDetailViewProps = {
    detail: ProjectDetail;
    refreshProject: () => void;
    onCreateCanvas: () => void;
};

export const categoryLabels: Record<string, string> = ASSET_CATEGORY_LABELS;

export const mediaLabels: Record<string, string> = {
    image: "圖片",
    video: "影片",
    audio: "音訊",
    text: "文本",
    model: "3D 模型",
    entity: "角色卡",
};

const statusLabels: Record<string, string> = {
    active: "進行中",
    archived: "已歸檔",
    draft: "草稿",
    ready: "待制作",
    completed: "已完成",
    review: "待稽核",
    confirmed: "已確認",
    pending: "待處理",
    pending_confirmation: "待確認",
    running: "進行中",
    failed: "失敗",
    ignored: "已忽略",
    skipped: "已跳過",
    cancelled: "已取消",
    succeeded: "已完成",
    disabled: "已停用",
    idle: "待開始",
    loading: "處理中",
    queued: "排隊中",
    success: "已完成",
    error: "異常",
    deleted: "已刪除",
    reserved: "已凍結",
    settled: "已結算",
    refunded: "已退款",
    uncertain: "待核對",
};

const sourceTypeLabels: Record<string, string> = {
    blank: "空白開始",
    novel: "匯入小說",
    text: "貼上文本",
};

export function categoryLabel(value: string) {
    return sharedAssetCategoryLabel(value);
}

export function statusLabel(value: string) {
    return statusLabels[value] || "未知狀態";
}

export function mediaLabel(value: string) {
    return mediaLabels[value] || "其他型別";
}

export function sourceTypeLabel(value: string) {
    return sourceTypeLabels[value] || "其他來源";
}

export function StatusPill({ status }: { status: string }) {
    const tone = status === "completed" || status === "confirmed" || status === "succeeded" ? "success" : status === "failed" ? "error" : status === "running" || status === "active" ? "loading" : status === "review" || status === "pending_confirmation" ? "warning" : "neutral";
    return <StatusBadge tone={tone} label={statusLabel(status)} className="m-0" />;
}

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow ? <div className="mb-1 text-[var(--fs-tiny)] font-semibold text-foreground/40">{eyebrow}</div> : null}
                <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
                {description ? <p className="mt-1 text-sm leading-5 text-foreground/55">{description}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    );
}

export function MetricTile({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
    return (
        <div className={`overflow-hidden rounded-lg border px-3 py-3 ${accent ? "border-[color-mix(in_srgb,var(--workspace-accent)_30%,transparent)] bg-[var(--workspace-accent-soft)]" : "border-border/80 bg-background/70"}`}>
            <div className="text-xs text-foreground/50">{label}</div>
            <div className="mt-2 flex items-end gap-2"><strong className="text-2xl font-semibold tracking-normal">{value}</strong>{detail ? <span className="pb-0.5 text-xs text-foreground/45">{detail}</span> : null}</div>
        </div>
    );
}

export function UnitProgress({ unit }: { unit: ProjectUnit }) {
    const progress = unit.status === "completed" ? 100 : unit.status === "ready" ? 66 : 24;
    return <div className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-[var(--workspace-accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>;
}

export function formatTime(value?: string) {
    if (!value) return "-";
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatCount(value: number) {
    return new Intl.NumberFormat("zh-CN").format(value);
}

export function textValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
