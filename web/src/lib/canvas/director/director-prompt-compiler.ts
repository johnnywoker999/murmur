import type { DirectorCamera, DirectorObject, DirectorScene, DirectorShot } from "@/types/director";
import { directorColorLabel, directorPoseLabel } from "@/lib/canvas/director/director-scene";

const shotSizeLabels: Record<DirectorShot["shotSize"], string> = {
    extreme_wide: "大遠景",
    wide: "遠景",
    full: "全身景",
    medium: "中景",
    close_up: "近景特寫",
    extreme_close_up: "大特寫",
};

const cameraMoveLabels: Record<DirectorShot["cameraMove"], string> = {
    static: "固定機位",
    push_in: "鏡頭緩慢推進",
    pull_out: "鏡頭緩慢拉遠",
    pan_left: "鏡頭向左橫搖",
    pan_right: "鏡頭向右橫搖",
    tilt_up: "鏡頭向上搖攝",
    tilt_down: "鏡頭向下搖攝",
    orbit_left: "鏡頭向左環繞主體",
    orbit_right: "鏡頭向右環繞主體",
    handheld: "剋制的手持攝影運動",
};

export function compileDirectorPrompt(scene: DirectorScene, shot: DirectorShot) {
    const camera = scene.cameras.find((item) => item.id === shot.cameraId) || scene.cameras[0];
    const cameraKeys = camera?.keyframes.filter((key) => Number.isFinite(key.time) && key.transform.position.every(Number.isFinite)).sort((a, b) => a.time - b.time) || [];
    const hasKeyframedMotion = cameraKeys.slice(1).some((key, index) => {
        const previous = cameraKeys[index].transform;
        return key.transform.position.some((value, axis) => Math.abs(value - previous.position[axis]) > 1e-4)
            || key.transform.rotation.some((value, axis) => Math.abs(value - previous.rotation[axis]) > 1e-4);
    });
    const cameraMove = hasKeyframedMotion
        ? `按 ${cameraKeys.length} 個關鍵幀執行機位軌跡，${formatNumber(cameraKeys[0].time)} 秒位於 ${formatPosition(cameraKeys[0].transform.position)}，${formatNumber(cameraKeys.at(-1)!.time)} 秒位於 ${formatPosition(cameraKeys.at(-1)!.transform.position)}`
        : cameraMoveLabels[shot.cameraMove];
    const visibleObjects = scene.objects.filter((item) => item.visible);
    const actors = visibleObjects.filter((item) => item.kind === "actor" || item.primitive === "character");
    return [
        shot.prompt.trim(),
        `鏡頭設計：${shotSizeLabels[shot.shotSize]}，${cameraMove}，時長 ${formatNumber(shot.duration)} 秒。`,
        camera ? cameraPrompt(camera) : "",
        actors.length ? `角色顏色對映：${actors.map((actor) => `${directorColorLabel(actor.color)}人偶（${actor.color}）代表${actor.name}`).join("；")}。生成影片時嚴格按顏色識別角色，不交換人物身份。` : "",
        visibleObjects.length ? `空間排程：${visibleObjects.map(objectPrompt).join("；")}。` : "",
        `燈光：${scene.lights.map((light) => `${light.name}${formatNumber(light.intensity)}強度${light.color}`).join("，")}。`,
        "保持角色、道具、空間方向、光線方向和鏡頭軸線連續，遵循真實攝影機透視與物理遮擋。",
    ]
        .filter(Boolean)
        .join("\n");
}

function cameraPrompt(camera: DirectorCamera) {
    const [x, y, z] = camera.transform.position;
    const [tx, ty, tz] = camera.target;
    const height = y < ty - 0.4 ? "低機位" : y > ty + 1.2 ? "高機位" : "平視機位";
    const side = x < tx - 0.8 ? "主體左前側" : x > tx + 0.8 ? "主體右前側" : "主體正面";
    const distance = Math.hypot(x - tx, y - ty, z - tz);
    return `攝影機：${formatNumber(camera.focalLength)}mm 焦段，f/${formatNumber(camera.aperture)} 光圈，焦點距離 ${formatNumber(camera.focusDistance)} 米，${height}，位於${side}，機位距離約 ${formatNumber(distance)} 米，焦點指向 (${formatNumber(tx)}, ${formatNumber(ty)}, ${formatNumber(tz)})，景深遵循真實鏡頭光學。`;
}

function objectPrompt(object: DirectorObject) {
    const [x, y, z] = object.transform.position;
    const pose = object.pose ? `，姿勢${directorPoseLabel(object.pose)}` : "";
    const color = object.kind === "actor" || object.primitive === "character" ? `，${directorColorLabel(object.color)}參考人偶` : "";
    return `${object.name}${color}位於 (${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)})${pose}`;
}

function formatNumber(value: number) {
    return Number(value.toFixed(2));
}

function formatPosition(position: [number, number, number]) {
    return `(${position.map(formatNumber).join(", ")})`;
}
