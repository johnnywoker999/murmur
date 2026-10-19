import { Euler, Matrix4, Vector3 } from "three";

import { interpolateDirectorTransform, resolveDirectorKeyframeProgress } from "@/lib/canvas/director/director-scene";
import { directorStageDirection, directorStageMatrix, directorStagePoint, directorStageTransform } from "@/lib/canvas/director/director-stage-transform";
import type { DirectorCamera, DirectorKeyframe, DirectorScene, DirectorShot, DirectorTransform, DirectorVec3 } from "@/types/director";

/**
 * 視口取景模式（3D / CAM / 五個正交軸向：俯視、正視、背視、左視、右視）。
 *
 * 與一級模式（director-modes.ts 的擺場/姿態/動畫/攝影機）是兩個正交的量：
 * 一級模式決定「能改什麼」，取景模式只決定「從哪隻眼睛看」。
 *
 * viewMode 是純視口狀態，絕不寫入 DirectorScene，也絕不產生 undo/history 記錄 ——
 * 換一隻眼睛看場景不是對內容的修改。本模組只做純函式，不持有任何 three 物件。
 *
 * 五個正交軸向和 CAM 一樣鎖環繞，但取景來自場景內容的包圍盒而不是某臺攝影機：
 * resolveDirectorOrthographicFraming 解出帶 margin 的投影跨度，
 * resolveDirectorOrthographicFrustum 再按視口寬高比收成安全的正交半範圍。
 */

export type DirectorViewMode = "free" | "camera" | "top" | "front" | "back" | "left" | "right";

export type DirectorViewModeCapabilities = {
    /** 是否允許 OrbitControls 自由環繞。只有 free 允許；CAM 與五個正交軸向都要鎖定構圖，拖拽會破壞取景。 */
    orbit: boolean;
    /** 是否由 shot 的攝影機接管取景（視口相機 == 當前鏡頭）。只有 CAM。 */
    framed: boolean;
    /** 投影方式。free/camera 是透視；五個正交軸向必須是正交投影，否則物體比例會隨遠近畸變。 */
    projection: "perspective" | "orthographic";
};

const CAPABILITIES: Record<DirectorViewMode, DirectorViewModeCapabilities> = {
    // 3D：編輯用的自由視角，可環繞、可縮放，攝影機只被關鍵幀驅動時才回寫。
    free: { orbit: true, framed: false, projection: "perspective" },
    // CAM：所見即成片取景，視口 == 當前 shot 的攝影機，禁止環繞。
    camera: { orbit: false, framed: true, projection: "perspective" },
    // 五個正交軸向：取景來自場景包圍盒而非某臺攝影機，同樣鎖環繞，投影必須正交。
    top: { orbit: false, framed: false, projection: "orthographic" },
    front: { orbit: false, framed: false, projection: "orthographic" },
    back: { orbit: false, framed: false, projection: "orthographic" },
    left: { orbit: false, framed: false, projection: "orthographic" },
    right: { orbit: false, framed: false, projection: "orthographic" },
};

export const DIRECTOR_VIEW_MODES: Array<{ mode: DirectorViewMode; label: string; hint: string }> = [
    { mode: "free", label: "3D", hint: "自由視角：拖拽環繞、滾輪縮放" },
    { mode: "camera", label: "CAM", hint: "機位檢視：按當前鏡頭的攝影機取景，環繞已鎖定" },
    { mode: "top", label: "TOP", hint: "俯視：從正上方向下看，正交投影，環繞已鎖定" },
    { mode: "front", label: "FRONT", hint: "正視：沿 -Z 方向看向場景，正交投影，環繞已鎖定" },
    { mode: "back", label: "BACK", hint: "背視：沿 +Z 方向看向場景，正交投影，環繞已鎖定" },
    { mode: "left", label: "LEFT", hint: "左視：沿 +X 方向看向場景，正交投影，環繞已鎖定" },
    { mode: "right", label: "RIGHT", hint: "右視：沿 -X 方向看向場景，正交投影，環繞已鎖定" },
];

export const DIRECTOR_DEFAULT_VIEW_MODE: DirectorViewMode = "free";

/** 未知模式回落預設能力，絕不返回 undefined —— 呼叫方直接讀 .orbit / .framed。 */
export function directorViewModeCapabilities(mode: DirectorViewMode): DirectorViewModeCapabilities {
    return CAPABILITIES[mode] ?? CAPABILITIES[DIRECTOR_DEFAULT_VIEW_MODE];
}

/**
 * 當前 shot / 攝影機的唯一解析入口。
 *
 * activeShotId 指向不存在的 shot 時回落到第一個 shot；shot 的 cameraId 指向不存在的
 * 攝影機時回落到第一臺。空場景返回 null 而不是拋異常 —— 視口在任何場景下都必須能渲染。
 */
export function resolveDirectorActiveShot(scene: DirectorScene): DirectorShot | null {
    return scene.shots.find((item) => item.id === scene.activeShotId) || scene.shots[0] || null;
}

export function resolveDirectorActiveCamera(scene: DirectorScene): DirectorCamera | null {
    const shot = resolveDirectorActiveShot(scene);
    return scene.cameras.find((item) => item.id === shot?.cameraId) || scene.cameras[0] || null;
}

/** 取景資料：CAM 模式下視口相機需要被寫入的完整狀態。 */
export type DirectorViewFraming = {
    cameraId: string;
    position: DirectorVec3;
    target: DirectorVec3;
    /** 世界系 up。保留 roll，且保證與視線不共線。 */
    up: DirectorVec3;
    fov: number;
    near: number;
    far: number;
};

// 叉積長度低於此值即視為共線：lookAt 會解出非法基向量（NaN 矩陣），視口直接黑屏。
const DIRECTOR_VIEW_COLLINEAR_EPSILON = 1e-6;

// 退化時的備選 up：世界 up 優先，其次兩個水平軸 —— 正俯視/正仰視鏡頭落在這裡。
const DIRECTOR_VIEW_UP_FALLBACKS: DirectorVec3[] = [
    [0, 1, 0],
    [0, 0, -1],
    [1, 0, 0],
];

/**
 * 解出帶 roll 的 up 向量。
 *
 * 攝影機 rotation 的 z 分量就是荷蘭角。裸 lookAt 會丟掉它 —— three 用固定的 camera.up
 * 重算基向量，畫面永遠水平。這裡把世界 up 按攝影機自身尤拉角旋轉，roll 才留得住。
 *
 * 再處理退化：正俯視/正仰視時旋轉後的 up 與視線共線，叉積為 0，lookAt 解出 NaN 矩陣。
 * 此時按 世界up -> -Z -> +X 取第一個不共線的備選，絕不返回讓相機失效的值。
 */
export function resolveDirectorViewUp(rotation: DirectorVec3, viewDirection: DirectorVec3): DirectorVec3 {
    const view = new Vector3(...viewDirection);
    if (view.lengthSq() <= DIRECTOR_VIEW_COLLINEAR_EPSILON) return [0, 1, 0];
    const rolled = new Vector3(0, 1, 0).applyEuler(new Euler(...rotation));
    const candidates = rolled.lengthSq() > DIRECTOR_VIEW_COLLINEAR_EPSILON ? [rolled.toArray() as DirectorVec3, ...DIRECTOR_VIEW_UP_FALLBACKS] : DIRECTOR_VIEW_UP_FALLBACKS;
    return candidates.find((candidate) => new Vector3(...candidate).cross(view).length() > DIRECTOR_VIEW_COLLINEAR_EPSILON) ?? [0, 1, 0];
}

/**
 * Three 透視投影是否可寫進 PerspectiveCamera。
 *
 * 只檢查有限還不夠：fov=0 / 180、near<=0、far<=near 都能通過 isFinite，
 * 但 makePerspective 會得到 Inf/NaN 矩陣，視口黑屏。fov 必須落在 (0, 180)。
 */
export function directorUsablePerspectiveProjection(input: { fov: number; near: number; far: number }): boolean {
    const { fov, near, far } = input;
    if (![fov, near, far].every(Number.isFinite)) return false;
    if (fov <= 0 || fov >= 180) return false;
    if (near <= 0) return false;
    return far > near;
}

export type DirectorEffectiveViewport = {
    /** 視口應啟用的專用相機。CAM 取景失敗時必須是 free，不能停在從未寫入的 camCamera。 */
    camera: "free" | "camera" | "orthographic";
    /** 是否允許環繞 free 相機。與 camera 同步：只有 free 為 true。 */
    orbit: boolean;
};

/**
 * 視口活動相機與互動的唯一決策。
 *
 * CAM 取景為 null（空場景、非法光學引數）時回落到已有的 free 相機和自由環繞，
 * 絕不改 DirectorScene。取景重新合法後確定性回到 CAM（orbit 鎖死）。
 * 正交軸向不走這條回落：它們始終有安全預設包圍盒。
 */
export function resolveDirectorEffectiveViewport(input: { mode: DirectorViewMode; framing: DirectorViewFraming | null }): DirectorEffectiveViewport {
    if (directorViewModeCapabilities(input.mode).projection === "orthographic") return { camera: "orthographic", orbit: false };
    if (input.mode === "camera" && input.framing) return { camera: "camera", orbit: false };
    return { camera: "free", orbit: true };
}

/**
 * 解出 CAM 模式下視口相機應有的取景。
 *
 * 返回 null 的情形都必須走 free 回落：3D 模式、空場景、位置/旋轉非法、
 * 透視投影不可用（fov/near/far）。絕不把非法值寫進 three 相機。
 *
 * position 取 playhead 上插值後的值，所以 CAM 模式下拖時間軸就是在預覽成片運鏡。
 */
export function resolveDirectorViewFraming(input: { scene: DirectorScene; mode: DirectorViewMode; playhead: number }): DirectorViewFraming | null {
    if (!directorViewModeCapabilities(input.mode).framed) return null;
    const camera = resolveDirectorActiveCamera(input.scene);
    if (!camera) return null;
    const local = resolveDirectorCameraLocalFraming(input.scene, camera, input.playhead);
    if (!local) return null;
    const stage = directorStageTransform(input.scene);
    return { ...local, position: directorStagePoint(stage, local.position), target: directorStagePoint(stage, local.target), up: directorStageDirection(stage, local.up), near: local.near * stage.scale, far: local.far * stage.scale };
}

/** CAM 畫面與自由視角機位輔助圖形共用的場景區域性取景；也支援非活動機位。 */
export function resolveDirectorCameraLocalFraming(scene: DirectorScene, camera: DirectorCamera, playhead: number): DirectorViewFraming | null {
    const time = Number.isFinite(playhead) ? playhead : 0;
    const transform: DirectorTransform = resolveDirectorCameraTransform(camera, time);
    if (![...transform.position, ...transform.rotation].every(Number.isFinite)) return null;
    const optical = resolveDirectorCameraTrackValues(camera, time);
    const fov = optical.fov;
    if (!directorUsablePerspectiveProjection({ fov, near: camera.near, far: camera.far })) return null;
    const followed = scene.objects.find((item) => item.id === camera.followObjectId);
    const followedPosition = followed ? interpolateDirectorTransform(followed.transform, followed.keyframes, time).position : null;
    const followAnchor = camera.followAnchor;
    const followDelta = followedPosition && followAnchor && [...followedPosition, ...followAnchor].every(Number.isFinite)
        ? followedPosition.map((value, index) => value - followAnchor[index]) as DirectorVec3 : null;
    const position: DirectorVec3 = followDelta ? transform.position.map((value, index) => value + followDelta[index]) as DirectorVec3 : transform.position;
    let requestedTarget = optical.target;
    if (camera.lookAtMode === "rotation") {
        const forward = new Vector3(0, 0, -1).applyEuler(new Euler(...transform.rotation));
        requestedTarget = [position[0] + forward.x, position[1] + forward.y, position[2] + forward.z];
    } else if (camera.lookAtMode !== "coordinates" && camera.lookAtObjectId) {
        const object = scene.objects.find((item) => item.id === camera.lookAtObjectId);
        if (object) {
            const objectPosition = interpolateDirectorTransform(object.transform, object.keyframes, time).position;
            if (objectPosition.every(Number.isFinite)) requestedTarget = [objectPosition[0], objectPosition[1] + (object.kind === "actor" || object.primitive === "character" ? 1.2 : 0), objectPosition[2]];
        }
    }
    if (![...position, ...requestedTarget].every(Number.isFinite)) return null;
    const raw = new Vector3(requestedTarget[0] - position[0], requestedTarget[1] - position[1], requestedTarget[2] - position[2]);
    const degenerate = raw.lengthSq() <= DIRECTOR_VIEW_COLLINEAR_EPSILON;
    // 位置與焦點重合時視線為零向量，lookAt 無解：沿攝影機自身 -Z 造一個 1m 外的焦點。
    const view = degenerate ? new Vector3(0, 0, -1).applyEuler(new Euler(...transform.rotation)) : raw;
    const target: DirectorVec3 = degenerate ? [position[0] + view.x, position[1] + view.y, position[2] + view.z] : requestedTarget;
    return { cameraId: camera.id, position, target, up: resolveDirectorViewUp(transform.rotation, view.toArray() as DirectorVec3), fov, near: camera.near, far: camera.far };
}

export function resolveDirectorCameraTrackValues(camera: DirectorCamera, time: number): { target: DirectorVec3; fov: number } {
    return {
        target: interpolateDirectorCameraTrack(camera.keyframes, time, "target", camera.target),
        fov: interpolateDirectorCameraTrack(camera.keyframes, time, "fov", camera.fov),
    };
}

export function resolveDirectorCameraTransform(camera: DirectorCamera, time: number): DirectorTransform {
    const position = interpolateDirectorTransform(camera.transform, camera.keyframes.filter((key) => key.positionKeyed !== false), time);
    const rotation = interpolateDirectorTransform(camera.transform, camera.keyframes.filter((key) => key.rotationKeyed !== false), time);
    return { ...position, rotation: rotation.rotation };
}

/** Convert the visible camera aim into a rotation that preserves the frame when changing look-at modes. */
export function resolveDirectorCameraAimRotation(scene: DirectorScene, camera: DirectorCamera, time: number): DirectorVec3 | null {
    const framing = resolveDirectorCameraLocalFraming(scene, camera, time);
    if (!framing) return null;
    const euler = new Euler().setFromRotationMatrix(new Matrix4().lookAt(
        new Vector3(...framing.position), new Vector3(...framing.target), new Vector3(...framing.up),
    ));
    return [euler.x, euler.y, euler.z];
}

/** LibTV's inspector shows the effective aim even while coordinates/object tracking owns the camera view. */
export function resolveDirectorCameraInspectorRotation(scene: DirectorScene, camera: DirectorCamera, time: number): DirectorVec3 {
    const rotation = resolveDirectorCameraAimRotation(scene, camera, time) ?? resolveDirectorCameraTransform(camera, time).rotation;
    const degrees = 180 / Math.PI;
    return [-rotation[0] * degrees, ((rotation[1] * degrees + 180) % 360 + 360) % 360, rotation[2] * degrees];
}

function interpolateDirectorCameraTrack<K extends "target" | "fov">(keyframes: DirectorKeyframe[], time: number, track: K, fallback: NonNullable<DirectorKeyframe[K]>): NonNullable<DirectorKeyframe[K]> {
    const keys = keyframes.filter((key) => key[track] !== undefined).sort((a, b) => a.time - b.time);
    if (!keys.length) return fallback;
    const previous = [...keys].reverse().find((key) => key.time <= time) || keys[0];
    const next = keys.find((key) => key.time >= time) || keys.at(-1)!;
    if (previous === next || next.time <= previous.time) return previous[track]! as NonNullable<DirectorKeyframe[K]>;
    const progress = resolveDirectorKeyframeProgress((time - previous.time) / (next.time - previous.time), previous.easing);
    if (track === "fov") return (Number(previous.fov) + (Number(next.fov) - Number(previous.fov)) * progress) as NonNullable<DirectorKeyframe[K]>;
    return previous.target!.map((value, axis) => value + (next.target![axis] - value) * progress) as NonNullable<DirectorKeyframe[K]>;
}

/**
 * 取景同步鍵。
 *
 * 相機回寫的 effect 只依賴這個字串：草稿物件每次 render 都是新身份，但取景數值沒變
 * 就不該重寫相機。數值截到 4 位小數，避免浮點噪聲引起無意義的重同步。
 */
export function directorViewFramingKey(framing: DirectorViewFraming | null): string {
    if (!framing) return "";
    return [...framing.position, ...framing.target, ...framing.up, framing.fov, framing.near, framing.far].map((value) => value.toFixed(4)).join("|") + `|${framing.cameraId}`;
}

/**
 * 五個正交軸向的視線方向與 up。這五個軸上視線與 up 恆定正交（都是不同的主軸向量），
 * 不會出現 CAM 取景那種「roll 導致 up 與視線共線」的退化情形，因此不需要
 * resolveDirectorViewUp 那套回落鏈。
 *
 * 方向約定（世界系，Y-up）：
 * - top：看向 -Y（從上往下看），up 取 -Z。
 * - front：看向 -Z，up 取 +Y。
 * - back：看向 +Z，up 取 +Y —— front 的正對面。
 * - left：看向 +X（從場景左側看向右側），up 取 +Y。
 * - right：看向 -X，up 取 +Y —— left 的正對面。
 */
type DirectorOrthographicAxis = "top" | "front" | "back" | "left" | "right";

/**
 * 正交畫面上的世界軸。horizontal/vertical 是投影后的螢幕軸，不是視線軸：
 * - top：水平 X / 豎直 Z
 * - front / back：水平 X / 豎直 Y
 * - left / right：水平 Z / 豎直 Y
 */
const DIRECTOR_ORTHOGRAPHIC_AXES: Record<DirectorOrthographicAxis, { view: DirectorVec3; up: DirectorVec3; horizontal: 0 | 1 | 2; vertical: 0 | 1 | 2 }> = {
    top: { view: [0, -1, 0], up: [0, 0, -1], horizontal: 0, vertical: 2 },
    front: { view: [0, 0, -1], up: [0, 1, 0], horizontal: 0, vertical: 1 },
    back: { view: [0, 0, 1], up: [0, 1, 0], horizontal: 0, vertical: 1 },
    left: { view: [1, 0, 0], up: [0, 1, 0], horizontal: 2, vertical: 1 },
    right: { view: [-1, 0, 0], up: [0, 1, 0], horizontal: 2, vertical: 1 },
};

/** 窮舉型別守衛：合法的正交軸向集合在型別層面就是窮舉的，呼叫方無需再查能力表判斷。 */
function isDirectorOrthographicAxis(mode: DirectorViewMode): mode is DirectorOrthographicAxis {
    return mode === "top" || mode === "front" || mode === "back" || mode === "left" || mode === "right";
}

function directorFinitePoint(point: DirectorVec3): boolean {
    return point.every(Number.isFinite);
}

/**
 * 取景點雲：可見物件的旋轉後縮放包圍盒角點 + 全部攝影機/燈光的位置。
 *
 * 只收物件中心會把大比例背景板、長道具等裁掉。資源尚未載入時無法讀取真實 geometry，
 * transform.scale 是當前場景合同裡穩定可用的保守代理；旋轉後的八個角點還能覆蓋斜放物件。
 */
function collectDirectorFramingPoints(scene: DirectorScene): DirectorVec3[] {
    const points: DirectorVec3[] = [];
    for (const object of scene.objects) {
        const { position, rotation, scale } = object.transform;
        if (!object.visible || !directorFinitePoint(position)) continue;
        points.push(position);
        if (![...rotation, ...scale].every(Number.isFinite)) continue;
        const half = scale.map((value) => Math.abs(value) / 2) as DirectorVec3;
        const euler = new Euler(...rotation);
        for (const x of [-half[0], half[0]]) {
            for (const y of [-half[1], half[1]]) {
                for (const z of [-half[2], half[2]]) {
                    const corner = new Vector3(x, y, z).applyEuler(euler).add(new Vector3(...position));
                    points.push(corner.toArray() as DirectorVec3);
                }
            }
        }
    }
    for (const camera of scene.cameras) if (directorFinitePoint(camera.transform.position)) points.push(camera.transform.position);
    for (const light of scene.lights) if (directorFinitePoint(light.transform.position)) points.push(light.transform.position);
    return points;
}

type DirectorFramingBounds = { center: DirectorVec3; extent: DirectorVec3 };

// 空場景 / 全部點位非法時的安全預設包圍盒，貼近場景模板的預設佈景尺度（見 director-templates.ts 三點布光半徑）。
const DIRECTOR_ORTHOGRAPHIC_DEFAULT_BOUNDS: DirectorFramingBounds = { center: [0, 0, 0], extent: [6, 6, 6] };
// 單軸範圍下限：單點或共面內容不能把該軸壓成 0，否則正交相機等於無限縮放。
const DIRECTOR_ORTHOGRAPHIC_MIN_EXTENT = 2;
// 構圖留白：內容貼著畫面邊緣看不清楚，按包圍盒放大這個比例再取景。
const DIRECTOR_ORTHOGRAPHIC_MARGIN = 1.2;
// 相機與目標的距離相對包圍盒半徑的倍數：太近會讓正交相機的機位穿進內容內部。
const DIRECTOR_ORTHOGRAPHIC_DISTANCE_FACTOR = 2;
const DIRECTOR_ORTHOGRAPHIC_NEAR = 0.1;
// far 相對距離額外預留的深度倍數，保證視線方向上的內容不被裁切。
const DIRECTOR_ORTHOGRAPHIC_FAR_MARGIN = 4;
// 視錐換算的跨度下限：0 / 負 / 非有限值都不能當除數或半範圍。
const DIRECTOR_ORTHOGRAPHIC_MIN_SPAN = 1e-3;
// 非法寬高比（0 / 負 / NaN / Infinity）回落正方形，避免半範圍變成 NaN 或 Infinity。
const DIRECTOR_ORTHOGRAPHIC_DEFAULT_ASPECT = 1;

/** 點雲的軸對齊包圍盒中心與三軸範圍。點雲為空時回落安全預設值，每軸範圍不低於最小下限。 */
function resolveDirectorFramingBounds(points: DirectorVec3[]): DirectorFramingBounds {
    if (points.length === 0) return DIRECTOR_ORTHOGRAPHIC_DEFAULT_BOUNDS;
    const min: DirectorVec3 = [Infinity, Infinity, Infinity];
    const max: DirectorVec3 = [-Infinity, -Infinity, -Infinity];
    for (const point of points) {
        for (let axis = 0; axis < 3; axis += 1) {
            if (point[axis] < min[axis]) min[axis] = point[axis];
            if (point[axis] > max[axis]) max[axis] = point[axis];
        }
    }
    const center = [0, 1, 2].map((axis) => (min[axis] + max[axis]) / 2) as DirectorVec3;
    const extent = [0, 1, 2].map((axis) => Math.max(max[axis] - min[axis], DIRECTOR_ORTHOGRAPHIC_MIN_EXTENT)) as DirectorVec3;
    return { center, extent };
}

/** 正交軸向取景資料：視口相機需要被寫入的完整狀態。 */
export type DirectorOrthographicFraming = {
    position: DirectorVec3;
    target: DirectorVec3;
    /** 世界系 up，恆定為主軸向量，絕不與視線共線。 */
    up: DirectorVec3;
    /** 投影后的水平跨度（已含構圖留白）。不得單獨按高度×寬高比展開，否則寬內容會被裁切。 */
    horizontalSpan: number;
    /** 投影后的豎直跨度（已含構圖留白）。 */
    verticalSpan: number;
    near: number;
    far: number;
};

/** 正交相機的左右上下半範圍。始終對稱，且 width/height 等於安全後的寬高比。 */
export type DirectorOrthographicFrustum = {
    halfWidth: number;
    halfHeight: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
};

function directorSafePositive(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 把投影跨度與視口寬高比收成正交半範圍。
 *
 * 必須同時裝下水平與豎直跨度：只按高度×aspect 算寬度時，寬於畫面的內容會被裁掉。
 * aspect 為 0 / 負 / NaN / ±Infinity 時回落 1；跨度非法時回落最小正跨度。
 * 這是純函式，不讀 scene，也不寫 three 相機。
 */
export function resolveDirectorOrthographicFrustum(input: { horizontalSpan: number; verticalSpan: number; aspect: number }): DirectorOrthographicFrustum {
    const horizontalSpan = directorSafePositive(input.horizontalSpan, DIRECTOR_ORTHOGRAPHIC_MIN_SPAN);
    const verticalSpan = directorSafePositive(input.verticalSpan, DIRECTOR_ORTHOGRAPHIC_MIN_SPAN);
    const aspect = directorSafePositive(input.aspect, DIRECTOR_ORTHOGRAPHIC_DEFAULT_ASPECT);
    const neededHalfWidth = horizontalSpan / 2;
    const neededHalfHeight = verticalSpan / 2;
    const halfWidth = Math.max(neededHalfWidth, neededHalfHeight * aspect);
    const halfHeight = Math.max(neededHalfHeight, neededHalfWidth / aspect);
    return {
        halfWidth,
        halfHeight,
        left: -halfWidth,
        right: halfWidth,
        top: halfHeight,
        bottom: -halfHeight,
    };
}

/**
 * 解出五個正交軸向的取景。free/camera 不是正交軸向，返回 null。
 *
 * target 與兩條投影跨度來自可見物件的變換包圍盒 + 全部攝影機/燈光的位置包圍盒；空場景或全部
 * 位置非法（NaN/Infinity）時回落安全預設值，絕不返回會讓正交相機退化成無限縮放的 0 值。
 * position 由 target 沿該軸向的視線方向反推，因此永遠落在包圍盒之外，不會穿模。
 */
export function resolveDirectorOrthographicFraming(input: { scene: DirectorScene; mode: DirectorViewMode }): DirectorOrthographicFraming | null {
    if (!isDirectorOrthographicAxis(input.mode)) return null;
    const axis = DIRECTOR_ORTHOGRAPHIC_AXES[input.mode];
    const stage = directorStageTransform(input.scene);
    const stageMatrix = directorStageMatrix(stage);
    const bounds = resolveDirectorFramingBounds(collectDirectorFramingPoints(input.scene).map((point) => new Vector3(...point).applyMatrix4(stageMatrix).toArray() as DirectorVec3));
    const radius = Math.max(...bounds.extent) / 2;
    const distance = Math.max(radius * DIRECTOR_ORTHOGRAPHIC_DISTANCE_FACTOR, DIRECTOR_ORTHOGRAPHIC_MIN_EXTENT);
    const target = bounds.center;
    const position: DirectorVec3 = [target[0] - axis.view[0] * distance, target[1] - axis.view[1] * distance, target[2] - axis.view[2] * distance];
    return {
        position,
        target,
        up: axis.up,
        horizontalSpan: bounds.extent[axis.horizontal] * DIRECTOR_ORTHOGRAPHIC_MARGIN,
        verticalSpan: bounds.extent[axis.vertical] * DIRECTOR_ORTHOGRAPHIC_MARGIN,
        near: DIRECTOR_ORTHOGRAPHIC_NEAR,
        far: distance + radius * DIRECTOR_ORTHOGRAPHIC_FAR_MARGIN,
    };
}
