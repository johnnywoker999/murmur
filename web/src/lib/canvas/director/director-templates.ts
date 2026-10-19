import { nanoid } from "nanoid";

import { createDirectorActor, createDirectorCamera, createDirectorLight, createDirectorObject, directorFocalLengthToFov, DIRECTOR_ACTOR_COLORS } from "@/lib/canvas/director/director-scene";
import { DIRECTOR_DEFAULT_GROUND } from "@/lib/canvas/director/director-ground";
import { DIRECTOR_DEFAULT_STAGE_TRANSFORM } from "@/lib/canvas/director/director-stage-transform";
import type { DirectorCamera, DirectorLight, DirectorObject, DirectorScene, DirectorShot } from "@/types/director";

/**
 * 新建場景模板。
 *
 * 為什麼存在：createDirectorScene 無條件塞一個預設演員，產品/空場景根本不需要它，
 * 而雙人、走位這類常見開局每次都要手工擺一遍。模板把「開局佈局」變成顯式選擇。
 *
 * 硬約束：
 * - 純函式 + 確定性佈局。同一模板每次生成的結構完全一致，只有 id 與時間戳不同。
 * - 每次呼叫都產生獨立 id（工廠內部 nanoid），兩個例項不會共享物件身份。
 * - 不改變 DirectorScene 版本：模板只預填已有場景欄位。
 * - 物件之間 XZ 佔位不重疊，判據與 resolveDirectorPlacement 完全一致。
 */

export type DirectorTemplateId = "empty" | "monologue" | "dialogue" | "blocking" | "product";

export type DirectorTemplate = {
    id: DirectorTemplateId;
    name: string;
    description: string;
    /** 列表裡給使用者的預期提示，不參與生成。 */
    summary: string;
};

/** 展示順序即使用者看到的順序：空場景在最前，其餘按上手複雜度遞增。 */
export const DIRECTOR_TEMPLATES: DirectorTemplate[] = [
    { id: "empty", name: "空場景", description: "只有攝影機和三點布光，沒有任何演員或道具。", summary: "攝影機 + 布光" },
    { id: "monologue", name: "單人對白", description: "一名演員居中，中近景機位，適合獨白與特寫。", summary: "1 演員 · 中近景" },
    { id: "dialogue", name: "雙人對話", description: "兩名演員面對面分立左右，過肩機位起手。", summary: "2 演員 · 對話機位" },
    { id: "blocking", name: "人物走位", description: "三名演員分散站位，廣角機位便於安排走動路線。", summary: "3 演員 · 廣角" },
    { id: "product", name: "產品/道具鏡頭", description: "產品置於中心，背景板與側面道具就位，長焦特寫。", summary: "產品 + 背景板 · 長焦" },
];

type TemplateBlueprint = {
    objects: DirectorObject[];
    camera: DirectorCamera;
    shot: Omit<DirectorShot, "id" | "cameraId">;
};

/**
 * 三點布光：主光、輪廓光、環境光。
 * 五個模板共用同一套光位，避免模板之間打光風格漂移。
 */
function threePointRig(): DirectorLight[] {
    return [createDirectorLight("directional", "主光", [4, 6, 4], 2.4), createDirectorLight("directional", "輪廓光", [-4, 3, -2], 1.1), createDirectorLight("ambient", "環境光", [0, 0, 0], 0.65)];
}

/** 按模板意圖擺機位。focalLength 與 fov 一起寫，保證兩者自洽。 */
function templateCamera(input: { name: string; position: DirectorCamera["transform"]["position"]; target: DirectorCamera["target"]; focalLength: number; focusDistance: number; aperture: number }): DirectorCamera {
    const base = createDirectorCamera(input.name);
    return {
        ...base,
        transform: { ...base.transform, position: input.position },
        target: input.target,
        focalLength: input.focalLength,
        fov: directorFocalLengthToFov(input.focalLength),
        aperture: input.aperture,
        focusDistance: input.focusDistance,
    };
}

/** 演員朝向：繞 Y 軸。左側演員朝右為 +PI/2，右側演員朝左為 -PI/2。 */
function facing(actor: DirectorObject, yaw: number): DirectorObject {
    return { ...actor, transform: { ...actor.transform, rotation: [0, yaw, 0] } };
}

function buildBlueprint(id: DirectorTemplateId): TemplateBlueprint {
    if (id === "monologue") {
        return {
            objects: [createDirectorActor("演員 1", [0, 0, 0], DIRECTOR_ACTOR_COLORS[0])],
            camera: templateCamera({ name: "主攝影機", position: [1.5, 1.65, 3.1], target: [0, 1.15, 0], focalLength: 50, focusDistance: 3.4, aperture: 2.2 }),
            shot: { name: "鏡頭 1", duration: 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "dialogue") {
        // dx = 1.6 >= (0.8 + 0.8) / 2 + 0.25 = 1.05，兩名演員必然不重疊。
        return {
            objects: [facing(createDirectorActor("演員 1", [-0.8, 0, 0.3], DIRECTOR_ACTOR_COLORS[0]), Math.PI / 2), facing(createDirectorActor("演員 2", [0.8, 0, -0.3], DIRECTOR_ACTOR_COLORS[2]), -Math.PI / 2)],
            camera: templateCamera({ name: "主攝影機", position: [2.9, 1.7, 3.4], target: [0, 1.1, 0], focalLength: 40, focusDistance: 4.2, aperture: 2.8 }),
            shot: { name: "鏡頭 1", duration: 6, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "blocking") {
        // 三名演員兩兩 dx >= 1.8，全部大於 1.05 閾值。
        return {
            objects: [createDirectorActor("演員 1", [-1.8, 0, 0.6], DIRECTOR_ACTOR_COLORS[0]), createDirectorActor("演員 2", [0, 0, -0.4], DIRECTOR_ACTOR_COLORS[2]), createDirectorActor("演員 3", [1.8, 0, 0.8], DIRECTOR_ACTOR_COLORS[3])],
            camera: templateCamera({ name: "主攝影機", position: [0.6, 3.1, 7.4], target: [0, 1, 0], focalLength: 28, focusDistance: 7.6, aperture: 4 }),
            shot: { name: "鏡頭 1", duration: 8, fps: 24, shotSize: "wide", cameraMove: "static", prompt: "" },
        };
    }

    if (id === "product") {
        // 產品鏡頭沒有演員。背景板靠 dz=1.35 拉開，側面道具靠 dx=1.15 拉開。
        const product = createDirectorObject("box", "產品主體", [0, 0.5, 0], "#b8c0ca");
        const backdrop = createDirectorObject("plane", "背景板", [0, 1.4, -1.35], "#e8ebef");
        const prop = createDirectorObject("cylinder", "側面道具", [1.15, 0.4, 0.5], "#8795a5");
        return {
            objects: [
                { ...product, transform: { ...product.transform, scale: [0.9, 0.9, 0.9] } },
                { ...backdrop, transform: { ...backdrop.transform, scale: [3.2, 2, 1] } },
                { ...prop, transform: { ...prop.transform, scale: [0.5, 0.8, 0.5] } },
            ],
            camera: templateCamera({ name: "主攝影機", position: [1.1, 1.05, 2.35], target: [0, 0.55, 0], focalLength: 85, focusDistance: 2.6, aperture: 2.8 }),
            shot: { name: "鏡頭 1", duration: 4, fps: 24, shotSize: "close_up", cameraMove: "push_in", prompt: "" },
        };
    }

    return {
        objects: [],
        camera: templateCamera({ name: "主攝影機", position: [4.8, 2.7, 6.8], target: [0, 1, 0], focalLength: 35, focusDistance: 5, aperture: 2.8 }),
        shot: { name: "鏡頭 1", duration: 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" },
    };
}

/**
 * 按模板生成全新場景。
 * 未知 id 回落到空場景 —— 寧可少給內容，也不要偷偷塞回預設演員。
 */
export function createDirectorSceneFromTemplate(templateId: DirectorTemplateId, title = "未命名場景"): DirectorScene {
    const blueprint = buildBlueprint(templateId);
    const now = new Date().toISOString();
    const shotId = nanoid();
    return {
        id: nanoid(),
        version: 1,
        title,
        background: "#060608",
        environmentIntensity: 0.7,
        gridVisible: true,
        gridSnap: false,
        panoramaRotation: 0,
        panoramaRadius: 60,
        ground: { ...DIRECTOR_DEFAULT_GROUND },
        stageTransform: { ...DIRECTOR_DEFAULT_STAGE_TRANSFORM, position: [...DIRECTOR_DEFAULT_STAGE_TRANSFORM.position], rotation: [...DIRECTOR_DEFAULT_STAGE_TRANSFORM.rotation] },
        labelsVisible: true,
        aspectRatio: "adaptive",
        objects: blueprint.objects,
        cameras: [blueprint.camera],
        lights: threePointRig(),
        shots: [{ ...blueprint.shot, id: shotId, cameraId: blueprint.camera.id }],
        activeShotId: shotId,
        createdAt: now,
        updatedAt: now,
    };
}
