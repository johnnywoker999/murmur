import type { ArtCritiqueIssue, ArtCritiquePoint, ArtCritiqueTarget } from "./contracts";

export const ART_CRITIQUE_CATEGORY_COLORS = {
    composition: "#f97316",
    color: "#a855f7",
    lighting: "#eab308",
    proportion: "#06b6d4",
    other: "#ef4444",
} as const;

export const ART_CRITIQUE_SEVERITY_COLORS = {
    high: "#ef4444",
    medium: "#f59e0b",
    low: "#22c55e",
} as const;

export type ArtCritiqueBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ArtCritiqueLabelPlacement = {
    x: number;
    y: number;
};

/**
 * 小於這個跨度的框通常不是可讀的目標框，而是模型把兩個點放到了同一條線上。
 * 這是顯示層的最低約束，避免錯誤資料變成一條橫線或豎線。
 */
export const MIN_ART_CRITIQUE_BOX_SPAN = 0.025;

export function targetPolygon(target: ArtCritiqueTarget): ArtCritiquePoint[] {
    if (target.type === "global") return [];
    if (target.type === "points") return target.points;
    if (target.type === "box" && target.points.length >= 2) {
        const left = Math.min(target.points[0].x, target.points[1].x);
        const right = Math.max(target.points[0].x, target.points[1].x);
        const top = Math.min(target.points[0].y, target.points[1].y);
        const bottom = Math.max(target.points[0].y, target.points[1].y);
        return [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
        ];
    }
    return target.points;
}

export function targetBounds(target: ArtCritiqueTarget): ArtCritiqueBounds {
    const points = targetPolygon(target);
    if (!points.length) return { x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
        x,
        y,
        width: Math.max(0.015, Math.max(...xs) - x),
        height: Math.max(0.015, Math.max(...ys) - y),
    };
}

export function isRenderableArtCritiqueTarget(target: ArtCritiqueTarget) {
    if (target.type === "global") return true;
    if (!target.points.length || target.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
    if (target.type === "point" || target.type === "points") return true;
    if (target.type === "box") {
        if (target.points.length < 2) return false;
        const [first, second] = target.points;
        return Math.abs(first.x - second.x) >= MIN_ART_CRITIQUE_BOX_SPAN && Math.abs(first.y - second.y) >= MIN_ART_CRITIQUE_BOX_SPAN;
    }
    if (target.type === "polygon") return polygonArea(target.points) >= MIN_ART_CRITIQUE_BOX_SPAN * MIN_ART_CRITIQUE_BOX_SPAN;
    return false;
}

/**
 * 對歷史報告和模型返回的異常目標做顯示層修復。
 * 這不會改寫節點狀態，但能保證舊報告重新開啟時也不會出現零高度標註。
 */
export function repairIssueTarget(issue: ArtCritiqueIssue): ArtCritiqueIssue {
    if (isRenderableArtCritiqueTarget(issue.target)) return issue;
    const target = referenceTargetForIssue(issue);
    return {
        ...issue,
        target,
        targetSource: target.type === "global" ? "global" : "reference",
    };
}

type ArtCritiqueReferenceInput = Pick<ArtCritiqueIssue, "category" | "title" | "explanation" | "targetDescription">;

/**
 * Grounding 服務不可用時的保守兜底。
 *
 * 這裡不是目標檢測，而是把報告裡的自然語言位置描述對映到一組固定的原圖參考區域，
 * 讓使用者可以先知道“問題大概落在哪一帶”。沒有明確位置線索時仍返回 global。
 */
export function referenceTargetForIssue(issue: ArtCritiqueReferenceInput): ArtCritiqueTarget {
    const text = [issue.targetDescription, issue.title, issue.explanation].filter(Boolean).join(" ").toLowerCase();
    if (!text || matches(text, ["整體", "全域性", "全圖", "總體", "overall", "global", "whole image"])) return globalTarget();

    const left = matches(text, ["左側", "左邊", "左方", "左上", "左下", "left"]);
    const right = matches(text, ["右側", "右邊", "右方", "右上", "右下", "right"]);
    const top = matches(text, ["上方", "頂部", "上部", "上半", "天空", "top", "upper"]);
    const bottom = matches(text, ["下方", "底部", "下部", "下半", "地面", "bottom", "lower"]);
    const foreground = matches(text, ["前景", "近景", "foreground"]);
    const table = matches(text, ["桌", "檯面", "臺子", "桌腿", "table", "desk"]);
    const subject = matches(text, ["人物", "少女", "男孩", "女孩", "臉", "面部", "主體", "人像", "產品", "物體", "subject", "person", "face", "portrait"]);
    const head = matches(text, ["頭部", "髮絲", "髮際", "head", "hair"]);
    const scattered = matches(text, ["多處", "多個", "多塊", "散落", "分散", "亮點", "光點", "色塊", "高飽和", "暖色", "反光", "highlight", "hotspot", "specular"]);

    if (table) {
        if (left && !right) return referenceBox(0.08, 0.53, 0.38, 0.38);
        if (right && !left) return referenceBox(0.54, 0.53, 0.38, 0.38);
        return referenceBox(0.16, 0.5, 0.68, 0.44);
    }

    if (foreground) {
        if (left && !right) return referenceBox(0.04, 0.05, 0.36, 0.9);
        if (right && !left) return referenceBox(0.6, 0.05, 0.36, 0.9);
        return referenceBox(0.16, 0.54, 0.68, 0.4);
    }

    const headClearance = head && matches(text, ["留白", "擁擠", "切線", "貼近", "輪廓", "裝飾", "clearance"]);
    if (headClearance) {
        if (left && !right) return referenceBox(0.08, 0.08, 0.34, 0.34);
        if (right && !left) return referenceBox(0.58, 0.08, 0.34, 0.34);
        return referenceBox(0.34, 0.06, 0.42, 0.36);
    }

    if (scattered) return referencePoints({ left, right, top, bottom });

    if (head) {
        if (left && !right) return referenceBox(0.08, 0.08, 0.34, 0.34);
        if (right && !left) return referenceBox(0.58, 0.08, 0.34, 0.34);
        return referenceBox(0.34, 0.06, 0.42, 0.36);
    }

    if (subject) {
        if (left && top) return referenceBox(0.06, 0.06, 0.34, 0.34);
        if (right && top) return referenceBox(0.6, 0.06, 0.34, 0.34);
        if (left && bottom) return referenceBox(0.06, 0.6, 0.34, 0.34);
        if (right && bottom) return referenceBox(0.6, 0.6, 0.34, 0.34);
        if (left && !right) return referenceBox(0.06, 0.16, 0.34, 0.68);
        if (right && !left) return referenceBox(0.6, 0.16, 0.34, 0.68);
        if (top && !bottom) return referenceBox(0.24, 0.06, 0.52, 0.34);
        if (bottom && !top) return referenceBox(0.24, 0.6, 0.52, 0.34);
        return referenceBox(0.24, 0.16, 0.52, 0.68);
    }

    if (left && top) return referenceBox(0.06, 0.06, 0.34, 0.34);
    if (right && top) return referenceBox(0.6, 0.06, 0.34, 0.34);
    if (left && bottom) return referenceBox(0.06, 0.6, 0.34, 0.34);
    if (right && bottom) return referenceBox(0.6, 0.6, 0.34, 0.34);
    if (left && !right) return referenceBox(0.06, 0.2, 0.34, 0.6);
    if (right && !left) return referenceBox(0.6, 0.2, 0.34, 0.6);
    if (top && !bottom) return referenceBox(0.24, 0.06, 0.52, 0.34);
    if (bottom && !top) return referenceBox(0.24, 0.6, 0.52, 0.34);
    return globalTarget();
}

/**
 * 給標註標題分配穩定的起點。它不是精確排版引擎，但能處理最常見的上下重疊，
 * 並且始終把標題留在 SVG 視口內。
 */
export function layoutArtCritiqueLabels(issues: readonly ArtCritiqueIssue[]): ArtCritiqueLabelPlacement[] {
    const placements: ArtCritiqueLabelPlacement[] = [];
    issues.forEach((issue, index) => {
        const bounds = targetBounds(issue.target);
        const preferred = {
            // The label is a compact pill, so place its center just inside the
            // target's top-left corner instead of putting another marker on the image.
            x: clamp(bounds.x + 0.035, 0.04, 0.96),
            y: clamp(bounds.y + 0.035, 0.04, 0.96),
        };
        let next = preferred;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const collides = placements.some((placed) => Math.abs(placed.x - next.x) < 0.095 && Math.abs(placed.y - next.y) < 0.07);
            if (!collides) break;
            next = { x: preferred.x, y: clamp(preferred.y + (attempt + 1) * 0.07, 0.04, 0.96) };
        }
        placements[index] = next;
    });
    return placements;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function polygonArea(points: ArtCritiquePoint[]) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
        const current = points[index];
        const next = points[(index + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
}

function referenceBox(x: number, y: number, width: number, height: number): ArtCritiqueTarget {
    return {
        type: "box",
        points: [
            { x, y },
            { x: x + width, y: y + height },
        ],
    };
}

function referencePoints({ left, right, top, bottom }: { left: boolean; right: boolean; top: boolean; bottom: boolean }): ArtCritiqueTarget {
    if (left && top) return { type: "points", points: [{ x: 0.18, y: 0.18 }, { x: 0.26, y: 0.3 }] };
    if (right && top) return { type: "points", points: [{ x: 0.74, y: 0.18 }, { x: 0.82, y: 0.3 }] };
    if (left && bottom) return { type: "points", points: [{ x: 0.18, y: 0.7 }, { x: 0.26, y: 0.82 }] };
    if (right && bottom) return { type: "points", points: [{ x: 0.74, y: 0.7 }, { x: 0.82, y: 0.82 }] };
    if (left && !right) return { type: "points", points: [{ x: 0.18, y: 0.25 }, { x: 0.2, y: 0.66 }] };
    if (right && !left) return { type: "points", points: [{ x: 0.76, y: 0.25 }, { x: 0.8, y: 0.66 }] };
    if (top && !bottom) return { type: "points", points: [{ x: 0.28, y: 0.18 }, { x: 0.72, y: 0.18 }] };
    if (bottom && !top) return { type: "points", points: [{ x: 0.28, y: 0.72 }, { x: 0.72, y: 0.72 }] };
    return { type: "points", points: [{ x: 0.26, y: 0.2 }, { x: 0.74, y: 0.2 }, { x: 0.52, y: 0.68 }] };
}

function globalTarget(): ArtCritiqueTarget {
    return { type: "global", points: [] };
}

function matches(text: string, values: string[]) {
    return values.some((value) => text.includes(value));
}
