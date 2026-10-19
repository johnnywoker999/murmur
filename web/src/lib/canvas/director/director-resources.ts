import type { AnimationMixer, Material, Mesh, Object3D, Texture } from "three";

type DisposableMaterial = Material & Record<string, unknown>;

// 材質上可能承載紋理的常見槽位；只釋放本 owner 真正引用到的紋理。
const TEXTURE_SLOTS = [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
    "specularMap",
    "clearcoatMap",
    "clearcoatNormalMap",
    "clearcoatRoughnessMap",
    "sheenColorMap",
    "sheenRoughnessMap",
    "transmissionMap",
    "thicknessMap",
    "iridescenceMap",
    "specularColorMap",
    "specularIntensityMap",
] as const;

function collectTextures(material: DisposableMaterial, sink: Set<Texture>) {
    TEXTURE_SLOTS.forEach((slot) => {
        const value = material[slot];
        // 必須真的是 Texture：僅憑「有 dispose」會把 RenderTarget 等誤判成紋理並造成錯誤釋放。
        if (isDirectorTexture(value)) sink.add(value);
    });
}

function isDirectorTexture(value: unknown): value is Texture {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<Texture>;
    return candidate.isTexture === true && typeof candidate.dispose === "function";
}

/**
 * GLTF 載入結果的所有權判定。
 * SkeletonUtils.clone 與 source 共享 geometry/material/texture，
 * 因此被採納（adopt）時絕不能釋放 source —— 共享資源隨 owned clone 的最終 cleanup 一併釋放。
 * 只有未被採納的晚到/失效 generation 才需要釋放 source，避免孤兒洩漏。
 */
export function resolveDirectorLoadOwnership(input: { active: boolean; generation: number; currentGeneration: number }) {
    const adopt = input.active && input.generation === input.currentGeneration;
    return { adopt, disposeSource: !adopt };
}

/** 釋放一組材質及其引用紋理；用於被替換掉的原材質，避免 actor 參考材質造成洩漏。 */
export function disposeDirectorMaterials(materials: Array<Material | null | undefined>) {
    const owned = new Set<DisposableMaterial>();
    materials.forEach((material) => {
        if (material && typeof material.dispose === "function") owned.add(material as DisposableMaterial);
    });
    const textures = new Set<Texture>();
    owned.forEach((material) => collectTextures(material, textures));
    textures.forEach((texture) => texture.dispose());
    owned.forEach((material) => material.dispose());
}

function collectObject3DResources(root: Object3D | null | undefined, geometries: Set<{ dispose: () => void }>, materials: Set<DisposableMaterial>) {
    if (!root) return;
    root.traverse((child) => {
        const mesh = child as Mesh;
        if (mesh.geometry && typeof mesh.geometry.dispose === "function") geometries.add(mesh.geometry);
        if (!mesh.material) return;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        list.forEach((material) => {
            if (!material || typeof material.dispose !== "function") return;
            materials.add(material as DisposableMaterial);
        });
    });
}

function disposeCollected(geometries: Set<{ dispose: () => void }>, materials: Set<DisposableMaterial>) {
    const textures = new Set<Texture>();
    materials.forEach((material) => collectTextures(material, textures));
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
}

/**
 * 釋放一棵 owned Object3D 的 GPU 資源。
 * 共享的 geometry/material/texture 用 Set 去重，保證同一資源只 dispose 一次。
 * `<primitive object={...}>` 不會代為釋放，必須由 owner 顯式呼叫。
 */
export function disposeDirectorObject3D(root: Object3D | null | undefined) {
    if (!root) return;
    const geometries = new Set<{ dispose: () => void }>();
    const materials = new Set<DisposableMaterial>();
    collectObject3DResources(root, geometries, materials);
    disposeCollected(geometries, materials);
}

/** SkeletonHelper 自帶 geometry/material，必須單獨釋放。 */
export function disposeDirectorHelper(helper: Object3D | null | undefined) {
    disposeDirectorObject3D(helper);
}

/** mixer 停止全部動作並解除 root 快取，避免 clip 繫結洩漏。 */
export function disposeDirectorMixer(mixer: AnimationMixer | null | undefined, root?: Object3D | null) {
    if (!mixer) return;
    mixer.stopAllAction();
    if (root) mixer.uncacheRoot(root as never);
}

/**
 * 一次性釋放某個模型 generation 擁有的全部資源。
 * 只釋放 owned clone 與 helper：clone 持有與 source 共享的 GPU 引用，
 * source 的 Object3D 層級本身可被 GC，不需要（也不能）在這裡再 dispose 一遍。
 * model/helper 在同一次去重集合內收集，共享資源恰好 dispose 一次。
 */
export function disposeDirectorModelResources(input: { model?: Object3D | null; helper?: Object3D | null; mixer?: AnimationMixer | null }) {
    disposeDirectorMixer(input.mixer, input.model);
    const geometries = new Set<{ dispose: () => void }>();
    const materials = new Set<DisposableMaterial>();
    collectObject3DResources(input.model, geometries, materials);
    collectObject3DResources(input.helper, geometries, materials);
    disposeCollected(geometries, materials);
}

/**
 * 採納過程中途拋錯時的精確清理，生產與測試共用。
 * 二選一，絕不 double-dispose：
 * - clone 已建成：它已持有與 source 共享的 GPU 引用，只釋放 clone(+mixer)，source 交給 GC。
 * - clone 尚未建成：本次沒有任何 owned 資源，只釋放這份未被採納的 source。
 */
export function disposeDirectorAdoptionFailure(input: { clone?: Object3D | null; mixer?: AnimationMixer | null; source?: Object3D | null }) {
    if (input.clone) {
        disposeDirectorModelResources({ model: input.clone, mixer: input.mixer });
        return;
    }
    disposeDirectorMixer(input.mixer, null);
    disposeDirectorObject3D(input.source);
}
