import { resolveDirectorPlacement } from "@/lib/canvas/director/director-placement";
import { DIRECTOR_QUATERNIUS_FEMALE_URL, DIRECTOR_QUATERNIUS_MALE_URL } from "@/lib/canvas/director/director-actor-assets";
import { createDirectorActorPreset, DIRECTOR_ACTOR_PRESET_OPTIONS } from "@/lib/canvas/director/director-actor-presets";
import { createDirectorModel, touchDirectorScene } from "@/lib/canvas/director/director-scene";
import type { DirectorObject, DirectorScene, DirectorVec3 } from "@/types/director";

/**
 * P0 復現用確定性 fixture。
 *
 * 硬約束：fixture 自身絕不引用網路資產。
 * - 不使用 createDirectorScene（它預設包含演員，影響測試物件數量）；
 * - 所有物件都是 primitive，不帶 url / storageKey / assetId；
 * - 所有 id 與時間戳都是字面量，因此每次構造完全一致（可直接斷言）。
 *
 * 注意邊界：這隻保證「初始 fixture」離線。真實工作臺自帶的新增控制元件
 * （上傳模型、畫布圖片立牌）仍可能聯網，因此模型相關的復現項
 * 需要顯式注入本地資產，不能假裝當前 fixture 已經覆蓋。
 */

const FIXTURE_CREATED_AT = "2026-01-01T00:00:00.000Z";
const FIXTURE_SCENE_ID = "repro-scene-1";
const FIXTURE_SHOT_ID = "repro-shot-1";
const FIXTURE_CAMERA_ID = "repro-camera-1";

function fixtureObject(input: { id: string; name: string; primitive: "box" | "sphere" | "cylinder" | "plane"; position: DirectorVec3; color: string }): DirectorObject {
    return {
        id: input.id,
        name: input.name,
        kind: "primitive",
        primitive: input.primitive,
        color: input.color,
        visible: true,
        castShadow: true,
        receiveShadow: true,
        transform: { position: input.position, rotation: [0, 0, 0], scale: [1, 1, 1] },
        keyframes: [],
    };
}

/**
 * 構造 fixture 場景。同一 seed 下結構完全確定，不含任何遠端資產。
 * 返回全新物件，呼叫方可以自由改寫而不影響後續構造。
 */
export function createDirectorReproScene(): DirectorScene {
    return {
        id: FIXTURE_SCENE_ID,
        version: 1,
        title: "P0 復現場景",
        background: "#060608",
        environmentIntensity: 0.7,
        gridVisible: true,
        objects: [
            fixtureObject({ id: "repro-box-1", name: "立方體 A", primitive: "box", position: [0, 0.5, 0], color: "#8795a5" }),
            fixtureObject({ id: "repro-sphere-1", name: "球體 B", primitive: "sphere", position: [2.2, 0.5, 0], color: "#6f8fb8" }),
            fixtureObject({ id: "repro-cylinder-1", name: "圓柱 C", primitive: "cylinder", position: [-2.2, 0.5, 0], color: "#b8926f" }),
        ],
        cameras: [
            {
                id: FIXTURE_CAMERA_ID,
                name: "主攝影機",
                transform: { position: [4.8, 2.7, 6.8], rotation: [0, 0, 0], scale: [1, 1, 1] },
                target: [0, 1, 0],
                focalLength: 35,
                fov: 50,
                aperture: 2.8,
                focusDistance: 5,
                near: 0.05,
                far: 500,
                keyframes: [],
            },
        ],
        lights: [
            {
                id: "repro-light-1",
                name: "主光",
                type: "directional",
                color: "#ffffff",
                intensity: 2.4,
                castShadow: true,
                transform: { position: [4, 6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
        ],
        shots: [
            {
                id: FIXTURE_SHOT_ID,
                name: "鏡頭 1",
                cameraId: FIXTURE_CAMERA_ID,
                shotSize: "medium",
                cameraMove: "static",
                duration: 4,
                fps: 24,
                prompt: "",
            },
        ],
        activeShotId: FIXTURE_SHOT_ID,
        createdAt: FIXTURE_CREATED_AT,
        updatedAt: FIXTURE_CREATED_AT,
    };
}

/**
 * 離線人物視覺對照場景：無 URL 的歷史標準演員會使用本地內建模型。
 * 原始 P0 fixture 保持不變，避免影響已有的互動與迴歸用例。
 */
export function createDirectorReproActorScene(): DirectorScene {
    const scene = createDirectorReproScene();
    const actor: DirectorObject = {
        id: "repro-actor-1",
        name: "演員 1",
        kind: "actor",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        color: "#4f8ef7",
        visible: true,
        castShadow: true,
        receiveShadow: true,
        pose: "stand",
        rig: { status: "unmapped", boneMap: {}, animationNames: [] },
        motionClips: [],
        boneOverrides: {},
        boneTracks: [],
        keyframes: [],
    };
    return {
        ...scene,
        title: "人物視覺對照場景",
        objects: [actor],
        cameras: scene.cameras.map((camera) => ({ ...camera, name: "機位1", transform: { ...camera.transform, position: [0, 2.2, 10] }, target: [0, 1.2, 0] })),
    };
}

/** Side-by-side preview of both free CC0 Quaternius Standard bodies. */
export function createDirectorReproQuaterniusCompareScene(): DirectorScene {
    const scene = createDirectorReproActorScene();
    const original = scene.objects[0];
    const quaternius: DirectorObject = {
        ...original,
        id: "repro-quaternius-male",
        name: "Quaternius 免費男性",
        url: DIRECTOR_QUATERNIUS_MALE_URL,
        mimeType: "model/gltf-binary",
        transform: { ...original.transform, position: [1.1, 0, 0] },
    };
    return {
        ...scene,
        title: "Quaternius 男女模型對照",
        objects: [
            { ...original, name: "Quaternius 免費女性", actorPreset: "standard_female", url: DIRECTOR_QUATERNIUS_FEMALE_URL, mimeType: "model/gltf-binary", transform: { ...original.transform, position: [-1.1, 0, 0] } },
            quaternius,
        ],
        cameras: scene.cameras.map((camera) => ({ ...camera, transform: { ...camera.transform, position: [0, 2.4, 6.4] }, target: [0, 1, 0] })),
    };
}

/** Same lighting and camera for every built-in body type; useful for visual proportion comparison. */
export function createDirectorReproActorPresetScene(): DirectorScene {
    const scene = createDirectorReproActorScene();
    const actors = DIRECTOR_ACTOR_PRESET_OPTIONS.map(({ id, label }, index) => ({
        ...createDirectorActorPreset(id, label, [((index % 3) - 1) * 1.45, 0, (Math.floor(index / 3) - 1) * 1.75]),
        id: `repro-preset-${id}`,
    }));
    return {
        ...scene,
        title: "人物預設對照場景",
        objects: actors,
        cameras: scene.cameras.map((camera) => ({ ...camera, transform: { ...camera.transform, position: [0, 3.2, 10] }, target: [0, 0.9, 0] })),
    };
}

/** fixture 是否完全不依賴網路資產：任何 url/storageKey/assetId 都算違約。 */
export function directorReproSceneIsOffline(scene: DirectorScene): boolean {
    return scene.objects.every((object) => !object.url && !object.storageKey && !object.assetId);
}

/** P0 手工復現矩陣。頁面據此渲染清單，Stage D 可以逐條執行。 */
export type DirectorReproCase = {
    id: string;
    group: string;
    title: string;
    steps: string;
    expected: string;
};

export const DIRECTOR_REPRO_MATRIX: readonly DirectorReproCase[] = [
    { id: "empty-click", group: "選擇語義", title: "空白單擊", steps: "在視口空白處單擊。", expected: "取消選擇，不產生歷史記錄，狀態列不變為未儲存。" },
    { id: "right-click", group: "選擇語義", title: "右擊", steps: "在物件上右擊，再在空白處右擊。", expected: "不改變選擇、不開始手勢、不寫入歷史。" },
    { id: "switch-object", group: "選擇語義", title: "切換物件", steps: "拖動物件 A 後不鬆手切換選中 B（或先鬆手再選 B）。", expected: "舊手勢先被終結，B 不消費 A 的 base。" },
    { id: "release-outside", group: "手勢終結", title: "視口外釋放", steps: "在視口內按下並拖動，移出視口後鬆開滑鼠。", expected: "手勢以 commit 終結一次，不留下懸掛預覽。" },
    { id: "blur", group: "手勢終結", title: "視窗 blur", steps: "拖動過程中切換到其它視窗。", expected: "手勢終結，草稿狀態一致，不重複映象。" },
    { id: "escape", group: "手勢終結", title: "Escape 取消", steps: "拖動過程中按 Escape。", expected: "恢復到手勢前快照，且被取消的值絕不釋出。" },
    { id: "playing", group: "時間軸", title: "播放中操作", steps: "點選播放，播放中嘗試選擇與拖動。", expected: "播放不被打斷成錯誤狀態；改動語義與暫停時一致。" },
    { id: "non-zero-time", group: "時間軸", title: "非 0 秒操作", steps: "把播放頭拖到非 0 且非幀格整數位置後拖動物件。", expected: "增量以 raw playhead 為起點，不產生漂移。" },
    { id: "autokey-on", group: "時間軸", title: "Auto Key 開", steps: "開啟 Auto Key，在非 0 秒拖動物件。", expected: "在吸附後的目的時間寫入關鍵幀。" },
    { id: "autokey-off", group: "時間軸", title: "Auto Key 關", steps: "關閉 Auto Key，在非 0 秒拖動物件。", expected: "只改基礎 transform，不產生關鍵幀。" },
    { id: "add-move-delete-undo", group: "編輯鏈路", title: "連續新增/移動/刪除/Undo", steps: "連續新增三個物件，各移動一次，刪除中間一個，然後連續 Undo 到初始。", expected: "每步都可逆，Undo 後位置與選擇狀態自洽，不出現重疊或丟失。" },
    { id: "delete-while-loading", group: "模型", title: "模型載入中刪除", steps: "點選「注入本地模型」，立即開啟工作臺，在模型仍在載入時於左側列表刪除它。", expected: "晚到的載入結果被丟棄並釋放，不留孤兒資源、不報錯。" },
    { id: "model-load-failed", group: "模型", title: "模型載入失敗", steps: "點選「注入缺失模型」，開啟工作臺等待載入失敗。", expected: "退回佔位人偶，右上出現可操作「重試載入」，診斷記錄 DIRECTOR_MODEL_LOAD_FAILED。" },
    { id: "save-failed", group: "儲存", title: "儲存失敗", steps: "讓儲存 flush 拋錯後觀察頭部狀態與重試。", expected: "狀態為錯誤，草稿保留時提示可恢復，重試可再次嘗試。" },
    { id: "close-recovery", group: "儲存", title: "關閉與草稿恢復", steps: "儲存失敗後關閉；重開同一場景。", expected: "關閉走 prepareClose 決策；重開時提示恢復或放棄，放棄後不再重複提示。" },
];

/** 注入變體：本地可達 glTF，或確定性不可達地址。 */
export type DirectorReproModelVariant = "local" | "missing";

/** 固定 id：重複注入必須替換同一物件，而不是不斷堆疊新物件。 */
export const DIRECTOR_REPRO_MODEL_IDS: Record<DirectorReproModelVariant, string> = {
    local: "repro-model-local",
    missing: "repro-model-missing",
};

/** 同源本地資產，不依賴外網可達性。
 *  手寫 glTF 2.0：內嵌 base64 buffer、無紋理、無壓縮擴充套件，
 *  因此不需要 KTX2Loader / DRACOLoader 也能被 GLTFLoader 直接解析。 */
export const DIRECTOR_REPRO_LOCAL_MODEL_URL = "/canvas/models/director-repro-triangle.gltf";
/** 同源但確定不存在：穩定觸發載入失敗路徑，不依賴外網可達性。 */
export const DIRECTOR_REPRO_MISSING_MODEL_URL = "/__director-repro-missing.glb";
/** 輕量離線人形 GLTF，含真實手臂旋轉動畫，用於動作時間軸互動驗收。 */
export const DIRECTOR_REPRO_ANIMATED_PERSON_URL = "/canvas/models/director-repro-animated-person.gltf";

const MODEL_URLS: Record<DirectorReproModelVariant, string> = {
    local: DIRECTOR_REPRO_LOCAL_MODEL_URL,
    missing: DIRECTOR_REPRO_MISSING_MODEL_URL,
};

/** local 是 JSON 形態 glTF，missing 仍按二進位制宣告，各自與 URL 字尾一致。 */
const MODEL_MIME_TYPES: Record<DirectorReproModelVariant, string> = {
    local: "model/gltf+json",
    missing: "model/gltf-binary",
};

const MODEL_NAMES: Record<DirectorReproModelVariant, string> = {
    local: "本地模型 repro triangle",
    missing: "缺失模型（預期失敗）",
};

/**
 * 純函式：把一個模型物件注入場景副本並返回新場景，絕不改寫入參。
 *
 * 語義要點：
 * - 固定 id，重複注入先移除同 id 再重算位置，因此不會堆疊也不會自我碰撞；
 * - 只改 XZ，Y 嚴格保留 createDirectorModel 給出的 0（模型貼地）；
 * - 位置經 resolveDirectorPlacement 避讓現有物件；
 * - 初始 fixture 本身不含模型，注入是顯式動作，不汙染離線基線。
 */
export function injectDirectorReproModel(scene: DirectorScene, variant: DirectorReproModelVariant): DirectorScene {
    const id = DIRECTOR_REPRO_MODEL_IDS[variant];
    const base = createDirectorModel({
        name: MODEL_NAMES[variant],
        assetId: id,
        storageKey: undefined,
        url: MODEL_URLS[variant],
        mimeType: MODEL_MIME_TYPES[variant],
    });
    const model: DirectorObject = { ...base, id };

    // 先剔除同 id 舊物件，避免重複點選時新位置去避讓自己。
    const others = scene.objects.filter((object) => object.id !== id);
    const position = resolveDirectorPlacement({ object: model, existing: others });

    return touchDirectorScene({
        ...scene,
        objects: [...others, { ...model, transform: { ...model.transform, position } }],
    });
}

/** Add/replace a same-origin animated character fixture without touching the production actor asset path. */
export function injectDirectorReproAnimatedPerson(scene: DirectorScene): DirectorScene {
    const id = "repro-animated-person";
    const model = createDirectorModel({
        name: "離線動畫人物",
        assetId: id,
        storageKey: undefined,
        url: DIRECTOR_REPRO_ANIMATED_PERSON_URL,
        mimeType: "model/gltf+json",
    });
    const others = scene.objects.filter((object) => object.id !== id);
    const position = resolveDirectorPlacement({ object: model, existing: others });
    return touchDirectorScene({
        ...scene,
        objects: [...others, { ...model, id, transform: { ...model.transform, position } }],
    });
}
