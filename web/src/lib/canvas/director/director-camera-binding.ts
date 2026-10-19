import { interpolateDirectorTransform } from "@/lib/canvas/director/director-scene";
import { resolveDirectorCameraLocalFraming } from "@/lib/canvas/director/director-view-modes";
import type { DirectorCamera, DirectorObject, DirectorScene, DirectorVec3 } from "@/types/director";

/** Freeze framing against the original scene before removing all layout objects. */
export function replaceDirectorSceneObjects(scene: DirectorScene, objects: DirectorObject[], time: number): DirectorScene {
    const retained = new Set(objects.map((object) => object.id));
    const removed = scene.objects.filter((object) => !retained.has(object.id));
    const cameras = scene.cameras.map((camera) => removed.reduce((current, object) => removeDirectorCameraBindingsForObject(current, object.id, scene, time), camera));
    return { ...scene, objects, cameras, groups: undefined };
}

/** 當前幀作為新目標錨點；切換目標先烘焙舊位移，繫結瞬間構圖不跳。 */
export function bindDirectorCameraFollow(camera: DirectorCamera, scene: DirectorScene, objectId: string, time: number): DirectorCamera {
    const object = scene.objects.find((item) => item.id === objectId);
    if (!object) return camera;
    const position = interpolateDirectorTransform(object.transform, object.keyframes, Number.isFinite(time) ? time : 0).position;
    if (!position.every(Number.isFinite)) return camera;
    const detached = camera.followObjectId ? unbindDirectorCameraFollow(camera, scene, time) : camera;
    return { ...detached, followObjectId: objectId, followAnchor: [...position] };
}

/** 脫離跟隨時把當前目標位移烘焙進機位軌跡，避免畫面跳回繫結前的位置。 */
export function unbindDirectorCameraFollow(camera: DirectorCamera, scene: DirectorScene, time: number): DirectorCamera {
    const clearBinding = { followObjectId: undefined, followAnchor: undefined };
    const object = scene.objects.find((item) => item.id === camera.followObjectId);
    const anchor = camera.followAnchor;
    if (!object || !anchor) return { ...camera, ...clearBinding };
    const position = interpolateDirectorTransform(object.transform, object.keyframes, Number.isFinite(time) ? time : 0).position;
    if (![...position, ...anchor].every(Number.isFinite)) return { ...camera, ...clearBinding };
    const delta = position.map((value, axis) => value - anchor[axis]) as DirectorVec3;
    const move = (original: DirectorVec3): DirectorVec3 => original.map((value, axis) => value + delta[axis]) as DirectorVec3;
    return {
        ...camera,
        ...clearBinding,
        transform: { ...camera.transform, position: move(camera.transform.position) },
        keyframes: camera.keyframes.map((frame) => ({ ...frame, transform: { ...frame.transform, position: move(frame.transform.position) } })),
    };
}

/** 刪除物件前凍結當前取景並清除懸空引用；無關機位保持原引用。 */
export function removeDirectorCameraBindingsForObject(camera: DirectorCamera, objectId: string, scene: DirectorScene, time: number): DirectorCamera {
    const followsObject = camera.followObjectId === objectId;
    const looksAtObject = camera.lookAtObjectId === objectId;
    if (!followsObject && !looksAtObject) return camera;
    const currentTarget = looksAtObject ? resolveDirectorCameraLocalFraming(scene, camera, time)?.target : null;
    const detached = followsObject ? unbindDirectorCameraFollow(camera, scene, time) : camera;
    return {
        ...detached,
        ...(looksAtObject ? { lookAtMode: "coordinates" as const, lookAtObjectId: undefined, target: currentTarget ?? camera.target } : {}),
    };
}
