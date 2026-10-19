import type { DirectorObject, DirectorVec3 } from "../../../types/director";

export type DirectorFootprint = { width: number; depth: number };
export type DirectorPlacementCandidate = { footprint: DirectorFootprint; position: DirectorVec3 };

/** 擺放最小間隙，保證新物件與既有物件之間肉眼可分。 */
export const DIRECTOR_PLACEMENT_MARGIN = 0.25;
const SEARCH_STEP = 0.75;
const MAX_RINGS = 24;
const SAMPLES_PER_RING = 12;
// 模型匯入後被 normalizeModel 縮放到最大邊 2，未知尺寸時按此保守佔位。
const MODEL_FOOTPRINT = 2;
const GRID_STEP = 0.5;

/** Ground grid is XZ-only: object height stays under its constructor/inspector's control. */
export function snapDirectorGroundPosition(position: DirectorVec3, enabled: boolean): DirectorVec3 {
    if (!enabled) return position;
    const snap = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP || 0;
    return [snap(position[0]), position[1], snap(position[2])];
}

function baseFootprint(object: Pick<DirectorObject, "kind" | "primitive">): DirectorFootprint {
    if (object.kind === "actor" || object.primitive === "character") return { width: 0.8, depth: 0.8 };
    if (object.kind === "model") return { width: MODEL_FOOTPRINT, depth: MODEL_FOOTPRINT };
    if (object.kind === "billboard" || object.primitive === "plane") return { width: 1.6, depth: 0.3 };
    if (object.primitive === "sphere") return { width: 1.2, depth: 1.2 };
    if (object.primitive === "cylinder") return { width: 1, depth: 1 };
    if (object.primitive === "torus") return { width: 1.16, depth: 1.16 };
    if (object.primitive === "cone" || object.primitive === "pyramid") return { width: 1.1, depth: 1.1 };
    if (object.primitive === "empty") return { width: 0.24, depth: 0.24 };
    return { width: 1, depth: 1 };
}

/** XZ 平面佔位：只用 scale 的 x/z，取絕對值以容忍負縮放；不參與 Y 判斷。 */
export function directorObjectFootprint(object: Pick<DirectorObject, "kind" | "primitive" | "transform">): DirectorFootprint {
    const base = baseFootprint(object);
    const scaleX = Math.abs(object.transform?.scale?.[0] ?? 1);
    const scaleZ = Math.abs(object.transform?.scale?.[2] ?? 1);
    return {
        width: Math.max(0.05, base.width * (Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1)),
        depth: Math.max(0.05, base.depth * (Number.isFinite(scaleZ) && scaleZ > 0 ? scaleZ : 1)),
    };
}

function overlaps(a: DirectorPlacementCandidate, b: DirectorPlacementCandidate, margin: number) {
    const halfX = (a.footprint.width + b.footprint.width) / 2 + margin;
    const halfZ = (a.footprint.depth + b.footprint.depth) / 2 + margin;
    return Math.abs(a.position[0] - b.position[0]) < halfX && Math.abs(a.position[2] - b.position[2]) < halfZ;
}

/** 確定性 ring 取樣：先原位，再逐環外擴；索引順序固定，便於測試與復現。 */
function candidateOffsets() {
    const offsets: Array<[number, number]> = [[0, 0]];
    for (let ring = 1; ring <= MAX_RINGS; ring += 1) {
        const radius = ring * SEARCH_STEP;
        for (let sample = 0; sample < SAMPLES_PER_RING; sample += 1) {
            const angle = (sample / SAMPLES_PER_RING) * Math.PI * 2;
            offsets.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
        }
    }
    return offsets;
}

/**
 * 為新物件求不與任何既有物件 XZ 佔位相交的位置。
 * 只改 X/Z，保留呼叫方給定的 Y（actor/model 的地面 y、primitive 的 0.5、billboard 的 1.1）。
 * 隱藏物件同樣佔位；ring 取樣耗盡時回退到「所有佔位最右邊界之外」的確定性位置，
 * 該位置在有限 existing 集合下必然不與任何 AABB 相交。
 */
export function resolveDirectorPlacement(input: { object: Pick<DirectorObject, "kind" | "primitive" | "transform">; existing: Array<Pick<DirectorObject, "kind" | "primitive" | "transform">>; margin?: number; gridSnap?: boolean }): DirectorVec3 {
    const { object, existing } = input;
    const margin = input.margin ?? DIRECTOR_PLACEMENT_MARGIN;
    const desired = object.transform?.position ?? [0, 0, 0];
    const safeY = Number.isFinite(desired[1]) ? desired[1] : 0;
    const originX = Number.isFinite(desired[0]) ? desired[0] : 0;
    const originZ = Number.isFinite(desired[2]) ? desired[2] : 0;
    const footprint = directorObjectFootprint(object);
    const occupied = existing.flatMap((item) => {
        const position = item.transform?.position;
        const x = Number.isFinite(position?.[0]) ? position![0] : 0;
        const z = Number.isFinite(position?.[2]) ? position![2] : 0;
        return [{ footprint: directorObjectFootprint(item), position: [x, safeY, z] as DirectorVec3 }];
    });
    for (const [offsetX, offsetZ] of candidateOffsets()) {
        const position = snapDirectorGroundPosition([originX + offsetX, safeY, originZ + offsetZ], input.gridSnap === true);
        if (!occupied.some((item) => overlaps({ footprint, position }, item, margin))) return position;
    }
    const right = clearRightOfAll(occupied, footprint, margin, originX);
    return [input.gridSnap ? Math.ceil(right / GRID_STEP) * GRID_STEP : right, safeY, input.gridSnap ? snapDirectorGroundPosition([0, safeY, originZ], true)[2] : originZ];
}

/**
 * 取所有佔位的最右邊界，再讓新物件整體位於其右側。
 * 因為 |dx| >= halfX + margin 恆成立，overlaps 的 X 條件必然為假，故一定不相交。
 */
function clearRightOfAll(occupied: DirectorPlacementCandidate[], footprint: DirectorFootprint, margin: number, originX: number) {
    const maxRight = occupied.reduce((rightmost, item) => Math.max(rightmost, item.position[0] + item.footprint.width / 2), Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(maxRight)) return originX;
    // 額外加一個 margin 抵消浮點誤差，保證嚴格大於 overlaps 的閾值。
    return maxRight + footprint.width / 2 + margin * 2;
}

/** 地面錨點：只有 XZ，Y 恆由建構子決定，絕不從這裡流入。 */
export type DirectorGroundPoint = { x: number; z: number };

/**
 * 新增物件時的空間意圖。兩個來源都可能缺失（尚未移動過 pointer、上下文不可用）。
 * 順序固定：pointer > orbit target > 物件自身預設 XZ。
 */
export type DirectorPlacementIntent = {
    pointer: DirectorGroundPoint | null;
    orbitTarget: DirectorGroundPoint | null;
};

export const emptyDirectorPlacementIntent: DirectorPlacementIntent = { pointer: null, orbitTarget: null };

/**
 * 歸一化任意數值來源為合法地面點：非有限（NaN / ±Infinity）一律判為不可用。
 * 射線與地面平行、相機在平面內、上下文半失效時都會產出這類值，必須在入口擋掉。
 */
export function finiteDirectorGroundPoint(x: unknown, z: unknown): DirectorGroundPoint | null {
    if (typeof x !== "number" || typeof z !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { x, z };
}

/**
 * 按固定優先順序選出錨點 XZ，並嚴格保留 fallback 的 Y。
 * fallback 來自建構子（primitive 0.5 / actor 0 / model 0 / billboard 1.1），
 * 因此「貼地物件不懸空、billboard 不落地」這一語義只依賴建構子，不受指標高度影響。
 *
 * 兩個來源都在選擇時重新歸一化：intent 可能攜帶結構完整但數值非法的點
 * （NaN / ±Infinity）。若只用 `??` 判空，非法 pointer 會遮蔽合法 orbitTarget，
 * 兩者都非法時也無法可靠回退 fallback。
 */
export function resolveDirectorPlacementAnchor(input: { intent: DirectorPlacementIntent | null; fallback: DirectorVec3 }): DirectorVec3 {
    const { intent, fallback } = input;
    const fallbackY = Number.isFinite(fallback?.[1]) ? fallback[1] : 0;
    const pointer = finiteDirectorGroundPoint(intent?.pointer?.x, intent?.pointer?.z);
    const orbitTarget = finiteDirectorGroundPoint(intent?.orbitTarget?.x, intent?.orbitTarget?.z);
    const fallbackPoint = finiteDirectorGroundPoint(fallback?.[0], fallback?.[2]);
    const chosen = pointer ?? orbitTarget ?? fallbackPoint ?? { x: 0, z: 0 };
    return [chosen.x, fallbackY, chosen.z];
}
