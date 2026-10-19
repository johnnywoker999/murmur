import type { DirectorAspectRatio } from "@/lib/canvas/director/director-aspect-ratio";

export type DirectorVec3 = [number, number, number];
export type DirectorQuat = [number, number, number, number];

export type DirectorTransform = {
    position: DirectorVec3;
    rotation: DirectorVec3;
    scale: DirectorVec3;
};

export type DirectorPrimitiveKind = "box" | "sphere" | "cylinder" | "torus" | "cone" | "pyramid" | "empty" | "plane" | "character";
export type DirectorObjectKind = "primitive" | "model" | "actor" | "billboard";
export type DirectorActorPresetId = "standard_male" | "standard_female" | "athletic" | "slim" | "teen" | "child" | "broad" | "chibi" | "geometric";
export type DirectorPose = "neutral" | "stand" | "t_pose" | "walk" | "run" | "sit" | "squat" | "kneel_single" | "kneel_double" | "hands_hips" | "lean" | "bow" | "think" | "fight" | "kick" | "throw" | "push" | "wave" | "reach" | "arms_crossed" | "phone";
export type DirectorCameraMove = "static" | "push_in" | "pull_out" | "pan_left" | "pan_right" | "tilt_up" | "tilt_down" | "orbit_left" | "orbit_right" | "handheld";
export type DirectorShotSize = "extreme_wide" | "wide" | "full" | "medium" | "close_up" | "extreme_close_up";
export type DirectorRenderMode = "beauty" | "clay" | "depth" | "normal" | "pose";
export type DirectorKeyframeEasing = "step" | "linear" | "smooth";

export type DirectorKeyframe = {
    id: string;
    time: number;
    transform: DirectorTransform;
    easing?: DirectorKeyframeEasing;
    /** 攝影機專用：false 表示該時刻未記錄位置；舊幀預設仍是位置幀。 */
    positionKeyed?: boolean;
    /** 攝影機專用：旋轉軌與位置軌獨立；舊幀預設仍有旋轉幀。 */
    rotationKeyed?: boolean;
    /** 物件專用：false 表示此幀不記錄縮放；舊幀預設為完整 Transform 幀。 */
    scaleKeyed?: boolean;
    /** 攝影機專用；舊場景沒有這些欄位時仍採用 camera.target / camera.fov。 */
    target?: DirectorVec3;
    fov?: number;
};

export type DirectorFingerBone =
    | "leftThumb1" | "leftThumb2" | "leftThumb3" | "leftIndex1" | "leftIndex2" | "leftIndex3" | "leftMiddle1" | "leftMiddle2" | "leftMiddle3" | "leftRing1" | "leftRing2" | "leftRing3" | "leftPinky1" | "leftPinky2" | "leftPinky3"
    | "rightThumb1" | "rightThumb2" | "rightThumb3" | "rightIndex1" | "rightIndex2" | "rightIndex3" | "rightMiddle1" | "rightMiddle2" | "rightMiddle3" | "rightRing1" | "rightRing2" | "rightRing3" | "rightPinky1" | "rightPinky2" | "rightPinky3";

export type DirectorHumanoidBone = "root" | "hips" | "spine" | "chest" | "neck" | "head" | "leftShoulder" | "leftUpperArm" | "leftLowerArm" | "leftHand" | "rightShoulder" | "rightUpperArm" | "rightLowerArm" | "rightHand" | "leftUpperLeg" | "leftLowerLeg" | "leftFoot" | "rightUpperLeg" | "rightLowerLeg" | "rightFoot" | DirectorFingerBone;

export type DirectorBoneKeyframe = {
    id: string;
    time: number;
    rotation: DirectorQuat;
    easing?: DirectorKeyframeEasing;
};

export type DirectorBoneTrack = {
    bone: DirectorHumanoidBone;
    keyframes: DirectorBoneKeyframe[];
};

/**
 * 時間軸上一個可刪除關鍵幀的定位資訊。
 * 三類覆蓋當前時間軸真正可見的關鍵幀軌道：物件 transform、物件骨骼、攝影機。
 */
export type DirectorKeyframeDeleteTarget =
    | { track: "object-transform"; objectId: string; keyframeId: string; channel?: "position" | "rotation" | "scale" }
    | { track: "object-bone"; objectId: string; bone: DirectorHumanoidBone; keyframeId: string }
    | { track: "camera"; cameraId: string; keyframeId: string; channel?: "position" | "rotation" | "focus" | "fov" };

export type DirectorRig = {
    status: "unmapped" | "ready";
    boneMap: Partial<Record<DirectorHumanoidBone, string>>;
    animationNames: string[];
};

export type DirectorMotionClip = {
    id: string;
    name: string;
    sourceAnimation: string;
    start: number;
    duration: number;
    playbackRate: number;
    loop: boolean;
};

export type DirectorObject = {
    id: string;
    /** Optional logical scene-list group membership. */
    groupId?: string;
    name: string;
    kind: DirectorObjectKind;
    primitive?: DirectorPrimitiveKind;
    transform: DirectorTransform;
    color: string;
    /** 獨立的統一縮放倍率；舊場景預設為 1，不抹平各軸比例。 */
    uniformScale?: number;
    /** 場景列表鎖定：保留選擇與屬性編輯，但禁止視口操控及誤刪。 */
    locked?: boolean;
    visible: boolean;
    castShadow: boolean;
    receiveShadow: boolean;
    pose?: DirectorPose;
    /** Local, lightweight procedural actor silhouette preset. */
    actorPreset?: DirectorActorPresetId;
    rig?: DirectorRig;
    motionClips?: DirectorMotionClip[];
    activeMotionClipId?: string;
    /** 顯式建立的時間軸軌道；舊場景仍由已有關鍵幀/軌跡推斷軌道。 */
    animationTrackEnabled?: boolean;
    /** 角色軌跡只接管生成的變換幀；移除時可還原建立前的手動動畫。 */
    motionPath?: { kind: "line" | "ring" | "rectangle" | "pencil" | "pen"; duration: number; facePath: boolean; transform: DirectorTransform; originalKeyframes: DirectorKeyframe[]; controlKeyframeIds?: string[] };
    boneOverrides?: Partial<Record<DirectorHumanoidBone, DirectorQuat>>;
    boneTracks?: DirectorBoneTrack[];
    sourceNodeId?: string;
    assetId?: string;
    storageKey?: string;
    url?: string;
    mimeType?: string;
    keyframes: DirectorKeyframe[];
};

export type DirectorCamera = {
    id: string;
    name: string;
    /** 編輯器機位輔助圖形；舊場景預設顯示，不影響該機位取景。 */
    visible?: boolean;
    /** 場景列表鎖定；保留機位選擇和屬性檢視。 */
    locked?: boolean;
    transform: DirectorTransform;
    target: DirectorVec3;
    /** 角色跟隨以繫結幀的位置為錨；相機原有關鍵幀仍可疊加角色位移。 */
    followObjectId?: string;
    followAnchor?: DirectorVec3;
    /** 舊場景預設為座標注視。 */
    lookAtMode?: "coordinates" | "rotation" | "object";
    lookAtObjectId?: string;
    focalLength: number;
    fov: number;
    aperture: number;
    focusDistance: number;
    near: number;
    far: number;
    keyframes: DirectorKeyframe[];
    /** 繪製或預設軌跡；插值取樣仍參與播放和匯出，但不佔滿編輯時間軸。 */
    drawnPath?: { kind: "pencil" | "pen" | "line" | "ring" | "rectangle"; sampleKeyframeIds: string[]; originalKeyframes?: DirectorKeyframe[] };
};

export type DirectorLight = {
    id: string;
    name: string;
    type: "directional" | "point" | "spot" | "ambient";
    transform: DirectorTransform;
    color: string;
    intensity: number;
    angle?: number;
    penumbra?: number;
    castShadow: boolean;
};

export type DirectorGroup = {
    id: string;
    name: string;
    collapsed?: boolean;
};

export type DirectorShot = {
    id: string;
    name: string;
    cameraId: string;
    duration: number;
    fps: 24 | 25 | 30;
    shotSize: DirectorShotSize;
    cameraMove: DirectorCameraMove;
    prompt: string;
    previewNodeId?: string;
    depthNodeId?: string;
    normalNodeId?: string;
    screenshots?: DirectorScreenshot[];
};

export type DirectorScreenshot = {
    id: string;
    name: string;
    storageKey: string;
    url: string;
    width: number;
    height: number;
    createdAt: string;
};

export type DirectorScene = {
    id: string;
    version: 1;
    title: string;
    background: string;
    environmentIntensity: number;
    gridVisible: boolean;
    /** Snap new placement and XZ moves to the half-unit ground grid; absent means off. */
    gridSnap?: boolean;
    /** Optional for scenes saved before ground controls existed. */
    ground?: { visible: boolean; opacity: number; height: number };
    /** Whole stage transform; absent in older scenes means identity. Rotation is in degrees. */
    stageTransform?: { scale: number; position: DirectorVec3; rotation: DirectorVec3 };
    /** Editor overlays only; older scenes keep labels visible. */
    labelsVisible?: boolean;
    /** Missing in older saved scenes; treated as adaptive. */
    aspectRatio?: DirectorAspectRatio;
    /** Optional equirectangular backdrop; older scenes keep their solid color. */
    panorama?: { url: string; storageKey?: string; name?: string; rotation: number };
    /** Sphere controls remain available even before a panorama image is connected. */
    panoramaRotation?: number;
    panoramaRadius?: number;
    objects: DirectorObject[];
    /** Optional to keep previously saved scenes fully backward compatible. */
    groups?: DirectorGroup[];
    cameras: DirectorCamera[];
    lights: DirectorLight[];
    shots: DirectorShot[];
    activeShotId: string;
    createdAt: string;
    updatedAt: string;
};

export type DirectorSceneOutput = {
    scene: DirectorScene;
    shot: DirectorShot;
    prompt: string;
    beauty: Blob;
    depth?: Blob;
    normal?: Blob;
    clayVideo?: Blob;
    clayVideoMimeType?: string;
};
