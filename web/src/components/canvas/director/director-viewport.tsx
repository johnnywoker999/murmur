import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls, TransformControls } from "@react-three/drei";
import { Video as VideoIcon } from "lucide-react";
import { Component, forwardRef, memo, Suspense, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AnimationClip, AnimationMixer, BackSide, Box3, Bone, Camera, Color, EquirectangularReflectionMapping, Euler, Group, LoopOnce, LoopRepeat, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshNormalMaterial, MeshStandardMaterial, Object3D, OrthographicCamera, PerspectiveCamera, Plane, Quaternion, Raycaster, Scene, SkeletonHelper, SphereGeometry, SRGBColorSpace, Texture, TextureLoader, Vector2, Vector3, Vector4, WebGLRenderTarget, WebGLRenderer } from "three";
import type { Material } from "three";
import { GLTFLoader, SkeletonUtils } from "three-stdlib";

import { resolveDirectorBoneRotation, resolveDirectorMultiObjectGroupTransformEdit } from "@/lib/canvas/director/director-animation-semantics";
import { DIRECTOR_PROCEDURAL_ACTOR_SKELETON_EDGES, resolveDirectorProceduralActorPose } from "@/lib/canvas/director/director-procedural-pose";
import { DIRECTOR_QUATERNIUS_FEMALE_URL, DIRECTOR_QUATERNIUS_MALE_URL, resolveDirectorBuiltInActorUrl } from "@/lib/canvas/director/director-actor-assets";
import { reshapeDirectorQuaterniusActor } from "@/lib/canvas/director/director-quaternius-body";
import { cropDirectorCanvas, resolveDirectorFrameRect, resolveDirectorPixelCrop, type DirectorAspectRatio } from "@/lib/canvas/director/director-aspect-ratio";
import { directorStagePalette } from "@/lib/canvas/director/director-stage-palette";
import { directorGroundSettings } from "@/lib/canvas/director/director-ground";
import { directorPanoramaSphere, suspendDirectorPanoramaSphere } from "@/lib/canvas/director/director-panorama-sphere";
import { directorStageLocalCamera, directorStageLocalPoint, directorStageMatrix, directorStagePoint, directorStageTransform } from "@/lib/canvas/director/director-stage-transform";
import { resolveDirectorFocusFrame } from "@/lib/canvas/director/director-focus";
import { suspendDirectorEditorOverlays } from "@/lib/canvas/director/director-editor-overlays";
import type { DirectorOrientation } from "@/lib/canvas/director/director-orientation-gizmo";
import { applyClaySceneMaterials } from "@/lib/canvas/director/director-clay-materials";
import { selectDirectorRecordingMimeType, waitForDirectorDecodedFrame } from "@/lib/canvas/director/director-recording-format";
import { createDirectorTransaction, installDirectorTerminalListeners } from "@/lib/canvas/director/director-gesture-transaction";
import { emptyDirectorPlacementIntent, finiteDirectorGroundPoint, type DirectorGroundPoint, type DirectorPlacementIntent } from "@/lib/canvas/director/director-placement";
import { directorDiagnosticObjectKind } from "@/lib/canvas/director/director-diagnostics";
import { recordDirectorDiagnostic } from "@/lib/canvas/director/director-diagnostics-recorder";
import { resolveDirectorActorShape, resolveDirectorCapsuleShape } from "@/lib/canvas/director/director-actor-presets";
import { directorCaptureInitial, directorCaptureUsable, directorLoadIdentity, directorLoadInitial, installDirectorContextListeners, reduceDirectorCapture, reduceDirectorLoad, releaseDirectorCapture, resolveDirectorDisplay, restoreDirectorCapture, upsertDirectorFailedLoad, type DirectorFailedLoads, type DirectorLoadSignal } from "@/lib/canvas/director/director-recovery";
import { disposeDirectorAdoptionFailure, disposeDirectorHelper, disposeDirectorMaterials, disposeDirectorModelResources, disposeDirectorObject3D, resolveDirectorLoadOwnership } from "@/lib/canvas/director/director-resources";
import { DIRECTOR_DEFAULT_ACTOR_URL, directorPoseBoneDeltas, directorTransformPathLength, finiteDirectorTransformKeyframes, interpolateDirectorTransform, visibleDirectorCameras } from "@/lib/canvas/director/director-scene";
import { directorCameraAidDistance, directorCameraAidVisibility, directorCameraFrameSegments, directorCameraGuideSegments, shouldClearDirectorViewportSelection } from "@/lib/canvas/director/director-camera-aid";
import { DIRECTOR_DEFAULT_VIEW_MODE, directorViewFramingKey, resolveDirectorActiveCamera, resolveDirectorCameraLocalFraming, resolveDirectorCameraTransform, resolveDirectorEffectiveViewport, resolveDirectorOrthographicFraming, resolveDirectorOrthographicFrustum, resolveDirectorViewFraming, resolveDirectorViewUp, type DirectorOrthographicFraming, type DirectorViewFraming, type DirectorViewMode } from "@/lib/canvas/director/director-view-modes";
import { DirectorViewToolbar } from "@/components/canvas/director/director-view-toolbar";
import { resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { DirectorHumanoidBone, DirectorKeyframe, DirectorLight, DirectorObject, DirectorQuat, DirectorRenderMode, DirectorRig, DirectorScene, DirectorTransform, DirectorVec3 } from "@/types/director";

export type DirectorOrbitControls = ComponentRef<typeof OrbitControls>;

export type DirectorViewportHandle = {
    capture: (mode: DirectorRenderMode) => Promise<Blob>;
    captureCameraPreview: (playhead: number) => Promise<Blob>;
    captureShot: (playhead: number) => Promise<Blob>;
    readCaptureCameraKind: () => "free" | "camera" | "orthographic" | null;
    recordVideo: (duration: number, fps: number) => Promise<Blob>;
    readCameraTransform: () => DirectorTransform | null;
    focusOnPoint: (point: DirectorVec3, radius: number) => boolean;
    /** 只讀放置意圖。上下文不可用或從未產生合法點時返回空意圖，絕不拋異常。 */
    readPlacementIntent: () => DirectorPlacementIntent;
};

type DirectorViewportProps = {
    scene: DirectorScene;
    /** Preview workspace may impose a delivery frame without mutating the saved scene ratio. */
    aspectRatioOverride?: DirectorAspectRatio;
    selectedObjectId: string | null;
    selectedObjectIds?: string[];
    selectedCameraId?: string | null;
    selectedBone: string | null;
    /** Bone handles are visible only while the actor pose inspector is active. */
    showBoneControls?: boolean;
    transformMode: "translate" | "rotate" | "scale";
    renderMode: DirectorRenderMode;
    playhead: number;
    playing: boolean;
    /** 動畫模式下顯示演員與攝影機 Transform 關鍵幀形成的空間路徑。 */
    showMotionPaths?: boolean;
    drawActorPath?: "pencil" | "pen" | null;
    onDrawActorPath?: (points: DirectorGroundPoint[], kind: "pencil" | "pen") => void;
    drawCameraPath?: "pencil" | "pen" | null;
    onDrawCameraPath?: (points: DirectorGroundPoint[], kind: "pencil" | "pen") => void;
    onPenFirstPoint?: () => void;
    onSelectPathKeyframe?: (kind: "actor" | "camera", id: string, keyframe: DirectorKeyframe) => void;
    onSelectPath?: (kind: "actor" | "camera", id: string) => void;
    selectedPath?: { kind: "actor" | "camera"; id: string; keyframeId?: string } | null;
    onMovePathPoint?: (kind: "actor" | "camera", id: string, keyframeId: string, position: DirectorVec3) => void;
    /** 取景模式。省略即自由視角，保持接線前的行為不變。 */
    viewMode?: DirectorViewMode;
    /** 提供該回撥即在視口內渲染 3D/CAM 切換器；不提供則不顯示，視口仍按 viewMode 取景。 */
    onViewModeChange?: (mode: DirectorViewMode) => void;
    onCaptureReadyChange?: (ready: boolean) => void;
    onSelectObject: (id: string | null) => void;
    onSelectBone: (bone: string | null) => void;
    onObjectTransform: (id: string, from: DirectorTransform, to: DirectorTransform) => void;
    onSelectCamera: (id: string) => void;
    onCameraTransform: (id: string, from: DirectorTransform, to: DirectorTransform) => void;
    onMultiObjectTransform: (ids: string[], from: DirectorTransform, to: DirectorTransform) => void;
    onBoneTransform: (id: string, bone: string, rotation: DirectorQuat) => void;
    onActorRigReady: (id: string, rig: DirectorRig, animations: AnimationClip[]) => void;
};

type CaptureContext = { gl: WebGLRenderer; scene: Scene; camera: Camera; cameraKind: "free" | "camera" | "orthographic"; suspendDisplayMaterialOverride: () => () => void };

// 穩定空值：identity 不匹配時返回同一引用，避免下游 effect 依賴每次 render 都變化。
const emptyAnimations: AnimationClip[] = [];
const emptyRestRotations: Partial<Record<DirectorHumanoidBone, DirectorQuat>> = {};

// Canvas 配置必須是穩定引用：inline literal 每次父級 render 都是新物件，
// context lost 的 dispatch 觸發重渲染後 R3F 會 configure 並在失效 context 上
// 重建 WebGLRenderer，拋 getMaxPrecision / autoReset。穩定後 lost 只顯示 notice。
const directorCanvasGl = { antialias: true, preserveDrawingBuffer: true, alpha: false } as const;
const directorCanvasCamera = { position: [0, 2, 13] as [number, number, number], fov: 45, near: 0.05, far: 1200 } as const;
const directorCanvasDpr: [number, number] = [1, 1.5];
// 自由視角固定環繞焦點：free 是獨立觀察相機，不跟隨 shot 攝影機的 target 走，
// 否則切換鏡頭/攝影機會連帶把使用者正在環繞的焦點也悄悄挪走。
const DIRECTOR_FREE_ORBIT_TARGET: DirectorVec3 = [0, 1.4, 0];

export const DirectorViewport = forwardRef<DirectorViewportHandle, DirectorViewportProps>(function DirectorViewport(props, ref) {
    // onViewModeChange 只服務 DOM 層的切換器，絕不進 Canvas 子樹：它的身份每次父級
    // render 都可能變化，穿透到 memo 化的 Canvas 會觸發 configure 重建 renderer。
    const { onViewModeChange, onCaptureReadyChange, ...sceneProps } = props;
    const captureContext = useRef<CaptureContext | null>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const [shellSize, setShellSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const shell = shellRef.current;
        if (!shell) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setShellSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(shell);
        return () => observer.disconnect();
    }, []);
    const aspectRatio = props.aspectRatioOverride ?? props.scene.aspectRatio ?? "adaptive";
    const frame = resolveDirectorFrameRect(shellSize.width, shellSize.height, aspectRatio);
    // 地面點連同 owner canvas 一起記錄：owner 不是當前 renderer 的 canvas 就是陳舊值。
    const groundRef = useRef<{ owner: HTMLCanvasElement; point: DirectorGroundPoint } | null>(null);
    const orbitControlsRef = useRef<DirectorOrbitControls | null>(null);
    const orbitOrientationListenerRef = useRef<(() => void) | null>(null);
    const [freeOrientation, setFreeOrientation] = useState<DirectorOrientation>([0, 0, 0, 1]);
    const [cameraOrientation, setCameraOrientation] = useState<DirectorOrientation>([0, 0, 0, 1]);
    const onCameraOrientation = useCallback((next: DirectorOrientation) => {
        setCameraOrientation((current) => current.every((value, index) => Math.abs(value - next[index]) < 0.002) ? current : next);
    }, []);
    /** pointermove 高頻路徑只寫 ref，不觸發 render；清空只允許由該點的 owner 發起。 */
    const onGroundPoint = useCallback((owner: HTMLCanvasElement, point: DirectorGroundPoint | null) => {
        if (point) {
            groundRef.current = { owner, point };
            return;
        }
        if (groundRef.current?.owner === owner) groundRef.current = null;
    }, []);
    const onOrbitControls = useCallback((controls: DirectorOrbitControls | null) => {
        orbitOrientationListenerRef.current?.();
        orbitOrientationListenerRef.current = null;
        orbitControlsRef.current = controls;
        if (!controls) return;
        const readOrientation = () => {
            const { x, y, z, w } = controls.object.quaternion;
            const next: DirectorOrientation = [x, y, z, w];
            setFreeOrientation((current) => current.every((value, index) => Math.abs(value - next[index]) < 0.002) ? current : next);
        };
        controls.addEventListener("change", readOrientation);
        orbitOrientationListenerRef.current = () => controls.removeEventListener("change", readOrientation);
        readOrientation();
    }, []);
    useEffect(() => () => orbitOrientationListenerRef.current?.(), []);
    const resetView = useCallback(() => {
        onViewModeChange?.("free");
        const controls = orbitControlsRef.current;
        if (!controls) return;
        // reset() 本身不清掉仍在衰減的拖拽量；臨時關閉阻尼使本次 update 消耗掉殘量。
        const damping = controls.enableDamping;
        controls.enableDamping = false;
        controls.reset();
        controls.target.fromArray(DIRECTOR_FREE_ORBIT_TARGET);
        controls.object.position.set(...directorCanvasCamera.position);
        controls.update();
        controls.saveState();
        controls.enableDamping = damping;
    }, [onViewModeChange]);
    // retryKey 變化會真正重建 Canvas 與 ErrorBoundary，而不是隻換文案。
    const [retryKey, setRetryKey] = useState(0);
    // capture 可用性：上下文丟失期間不得再使用失效 renderer；恢復後需重新登記。
    const [capture, dispatchCapture] = useReducer(reduceDirectorCapture, directorCaptureInitial);
    const captureReady = directorCaptureUsable(capture);
    useEffect(() => {
        onCaptureReadyChange?.(captureReady);
    }, [captureReady, onCaptureReadyChange]);
    useEffect(() => () => onCaptureReadyChange?.(false), [onCaptureReadyChange]);
    const captureRef = useRef(capture);
    captureRef.current = capture;
    // 載入失敗的物件 id -> 該物件自己的 retry；Canvas 內部無法呈現可操作提示，統一提到 DOM 層。
    const [failedLoads, setFailedLoads] = useState<DirectorFailedLoads>({});
    const onCaptureContext = useCallback((context: CaptureContext) => {
        captureContext.current = context;
        dispatchCapture("register");
    }, []);
    /** 子樹解除安裝 / boundary 捕獲：清掉指向已銷燬 renderer 的引用並打回不可用。 */
    const releaseCapture = useCallback(() => {
        releaseDirectorCapture({
            clearContext: () => {
                captureContext.current = null;
            },
            onAvailability: dispatchCapture,
        });
        // 地面點與 controls 都屬於已銷燬的 renderer，必須一併作廢。
        groundRef.current = null;
        orbitControlsRef.current = null;
    }, []);
    const retry = useCallback(() => {
        releaseCapture();
        setFailedLoads({});
        setRetryKey((value) => value + 1);
    }, [releaseCapture]);
    const onLoadStateChange = useCallback((id: string, signal: DirectorLoadSignal, retryLoad: () => void) => {
        setFailedLoads((current) => upsertDirectorFailedLoad(current, id, signal, retryLoad));
    }, []);
    // 穩定引用：否則新的監聽 effect 會在每次父級 render 時摘除重灌。
    const onContextLost = useCallback(() => {
        // 上下文丟失後相機與射線結果都不可信，舊地面點必須作廢，恢復後需重新移動 pointer。
        groundRef.current = null;
        recordDirectorDiagnostic("DIRECTOR_VIEWPORT_CONTEXT_LOST");
        dispatchCapture("lost");
    }, []);
    const onContextRestored = useCallback(() => {
        recordDirectorDiagnostic("DIRECTOR_VIEWPORT_CONTEXT_RESTORED");
        dispatchCapture("restored");
    }, []);
    const failedIds = Object.keys(failedLoads);
    // 上下文失效時 renderer 不可用：capture/record/readCamera 必須明確失敗而不是畫出髒幀。
    const usableContext = () => {
        if (!directorCaptureUsable(captureRef.current)) return null;
        return captureContext.current;
    };
    useImperativeHandle(ref, () => ({
        capture: (mode) => captureFrame(usableContext(), mode, aspectRatio),
        captureCameraPreview: (playhead) => captureCameraPreviewFrame(usableContext(), props.scene, playhead),
        captureShot: (playhead) => {
            const context = usableContext();
            if (!context) throw new Error("3D 視口尚未就緒");
            const canvas = context.gl.domElement;
            const crop = resolveDirectorPixelCrop(canvas.width, canvas.height, aspectRatio, { width: canvas.clientWidth, height: canvas.clientHeight });
            return captureCameraPreviewFrame(context, props.scene, playhead, crop.width, crop.height);
        },
        readCaptureCameraKind: () => usableContext()?.cameraKind ?? null,
        recordVideo: (duration, fps) => {
            const context = usableContext();
            if (context && context.cameraKind !== "camera") throw new Error("機位視角尚未就緒，無法錄製參考影片");
            return recordCanvas(context, duration, fps, aspectRatio);
        },
        readCameraTransform: () => {
            const camera = usableContext()?.camera;
            return camera ? directorStageLocalCamera(directorStageTransform(props.scene), { position: camera.position.toArray() as DirectorTransform["position"], rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z], scale: [1, 1, 1] }) : null;
        },
        focusOnPoint: (point, radius) => {
            const controls = orbitControlsRef.current;
            if (!controls || !point.every(Number.isFinite) || !Number.isFinite(radius)) return false;
            const stage = directorStageTransform(props.scene);
            const worldTarget = directorStagePoint(stage, point);
            const frame = resolveDirectorFocusFrame({
                cameraPosition: controls.object.position.toArray() as DirectorVec3,
                cameraTarget: controls.target.toArray() as DirectorVec3,
                focusTarget: worldTarget,
                radius: Math.abs(radius) * stage.scale,
                fov: controls.object instanceof PerspectiveCamera ? controls.object.fov : 50,
            });
            if (!frame) return false;
            controls.target.fromArray(frame.target);
            controls.object.position.fromArray(frame.position);
            controls.update();
            onViewModeChange?.("free");
            return true;
        },
        readPlacementIntent: () => {
            const context = usableContext();
            if (!context) return emptyDirectorPlacementIntent;
            // owner 校驗：上下文重建後，舊 renderer canvas 記錄的點一律不採用。
            const tracked = groundRef.current;
            const pointer = tracked && tracked.owner === context.gl.domElement ? tracked.point : null;
            // 讀例項當前世界系 target，再轉回場景區域性 XZ；平移/旋轉/縮放後仍能按原座標放置。
            const target = orbitControlsRef.current?.target;
            const localTarget = target ? directorStageLocalPoint(directorStageTransform(props.scene), target.toArray() as DirectorVec3) : null;
            return { pointer, orbitTarget: finiteDirectorGroundPoint(localTarget?.[0], localTarget?.[2]) };
        },
    }), [aspectRatio, onViewModeChange, props.scene]);

    return (
        // data-renderer-ready 直接來自 directorCaptureUsable：capture context 已登記且未 lost。
        // 這是真實就緒訊號，供 E2E 在觸發 context loss 前確定監聽器已安裝。
        <div ref={shellRef} className="director-viewport-shell" data-drawing-actor-path={props.drawActorPath ? "true" : "false"} data-drawing-camera-path={props.drawCameraPath ? "true" : "false"} data-renderer-ready={directorCaptureUsable(capture) ? "true" : "false"}>
            <DirectorViewportErrorBoundary key={`boundary-${retryKey}`} onRelease={releaseCapture} onRetry={retry}>
                <DirectorCanvasSurface
                    key={`canvas-${retryKey}`}
                    {...sceneProps}
                    onCaptureContext={onCaptureContext}
                    onRelease={releaseCapture}
                    onContextLost={onContextLost}
                    onContextRestored={onContextRestored}
                    onLoadStateChange={onLoadStateChange}
                    onGroundPoint={onGroundPoint}
                    onOrbitControls={onOrbitControls}
                    onCameraOrientation={onCameraOrientation}
                />
            </DirectorViewportErrorBoundary>
            {aspectRatio !== "adaptive" && frame.width > 0 ? <div data-director-aspect-frame={aspectRatio} aria-label={`${aspectRatio} 畫幅取景框`} className="pointer-events-none absolute rounded-xl border border-white/35" style={{ zIndex: 1, left: frame.x, top: frame.y, width: frame.width, height: frame.height, boxShadow: "0 0 0 100vmax rgba(0, 0, 0, 0.68)" }} /> : null}
            {/* 取景切換是純視口狀態：放在 DOM 層，不隨 Canvas 重建而丟失。 */}
            {onViewModeChange ? <DirectorViewToolbar viewMode={props.viewMode ?? DIRECTOR_DEFAULT_VIEW_MODE} orientation={props.viewMode === "camera" ? cameraOrientation : freeOrientation} onViewModeChange={onViewModeChange} onResetView={resetView} /> : null}
            {capture.contextLost ? (
                <DirectorViewportNotice
                    title="3D 顯示上下文已丟失"
                    description="瀏覽器回收了 WebGL 上下文。等待自動恢復，或立即重建視口。"
                    actionLabel="重建 3D 視口"
                    onAction={retry}
                />
            ) : null}
            {!capture.contextLost && failedIds.length ? (
                <DirectorViewportNotice
                    variant="corner"
                    title={`${failedIds.length} 個 3D 模型載入失敗`}
                    description="已用佔位人偶繼續顯示場景。可能是網路或模型地址不可用，重試將重新載入。"
                    actionLabel="重試載入"
                    onAction={() => {
                        // 重試觸發新的 load generation，舊的晚到回撥會被忽略並釋放資源。
                        Object.values(failedLoads).forEach((retryLoad) => retryLoad());
                        setFailedLoads({});
                    }}
                />
            ) : null}
        </div>
    );
});

// onViewModeChange 被顯式排除：切換器活在 DOM 層，Canvas 子樹只需要 viewMode 取值。
type DirectorCanvasSurfaceProps = Omit<DirectorViewportProps, "onViewModeChange" | "onCaptureReadyChange"> & {
    onCaptureContext: (context: CaptureContext) => void;
    onRelease: () => void;
    onContextLost: () => void;
    onContextRestored: () => void;
    onLoadStateChange: (id: string, signal: DirectorLoadSignal, retry: () => void) => void;
    onGroundPoint: (owner: HTMLCanvasElement, point: DirectorGroundPoint | null) => void;
    onOrbitControls: (controls: DirectorOrbitControls | null) => void;
    onCameraOrientation: (orientation: DirectorOrientation) => void;
    transformClaimRef?: { current: boolean };
};

/**
 * Canvas 表面獨立 memo。
 *
 * R3F 本地 CanvasImpl 的 layout effect 沒有依賴陣列，父級每次 rerender 都會 configure。
 * context lost 時 DirectorViewport 會 dispatchCapture 觸發 rerender，若 Canvas 跟著重渲染，
 * configure 就會在已失效的 canvas 上重建 WebGLRenderer 並拋 getMaxPrecision / autoReset。
 * 隔離在 memo 子元件後，contextLost / failedLoads 這類外層狀態變化不再穿透到 Canvas；
 * 只有 props 真的變化才重渲染，retryKey 變化仍由外層 key 觸發真正 remount。
 */
const DirectorCanvasSurface = memo(function DirectorCanvasSurface(props: DirectorCanvasSurfaceProps) {
    const { onCaptureContext, onRelease, onContextLost, onContextRestored, onLoadStateChange, onGroundPoint, onOrbitControls, onCameraOrientation, ...sceneProps } = props;
    const onSelectObject = sceneProps.onSelectObject;
    const transformClaimRef = useRef(false);
    const pathPointerClaimUntilRef = useRef(0);
    const claimPathPointer = useCallback((holdMs: number) => { pathPointerClaimUntilRef.current = Date.now() + holdMs; }, []);
    const onPointerMissed = useCallback(() => {
        // A path handle may release pointer capture after moving the playhead or
        // committing a drag. That click is not a blank-canvas deselection.
        if (Date.now() < pathPointerClaimUntilRef.current) return;
        if (shouldClearDirectorViewportSelection(Boolean(sceneProps.drawActorPath || sceneProps.drawCameraPath), transformClaimRef.current)) onSelectObject(null);
    }, [onSelectObject, sceneProps.drawActorPath, sceneProps.drawCameraPath]);

    return (
        <Canvas
            shadows
            frameloop="demand"
            dpr={directorCanvasDpr}
            camera={directorCanvasCamera}
            gl={directorCanvasGl}
            onPointerMissed={onPointerMissed}
        >
            <Suspense fallback={null}>
                <DirectorSceneContent
                    {...sceneProps}
                    onCaptureContext={onCaptureContext}
                    onRelease={onRelease}
                    onContextLost={onContextLost}
                    onContextRestored={onContextRestored}
                    onLoadStateChange={onLoadStateChange}
                    onGroundPoint={onGroundPoint}
                    onOrbitControls={onOrbitControls}
                    onCameraOrientation={onCameraOrientation}
                    transformClaimRef={transformClaimRef}
                    onClaimPathPointer={claimPathPointer}
                />
            </Suspense>
        </Canvas>
    );
});

/** 本地失敗隔離：3D 視口異常只替換視口本身，不影響畫布/專案其餘部分。 */
class DirectorViewportErrorBoundary extends Component<{ children: ReactNode; onRelease: () => void; onRetry: () => void }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch() {
        // 只記錄穩定錯誤碼：原始 error / componentStack 可能帶素材 URL 或正文，不落日誌。
        recordDirectorDiagnostic("DIRECTOR_VIEWPORT_RENDER_FAILED");
        // 子樹已被 React 解除安裝，capture context 指向已銷燬的 renderer，必須同步釋放。
        this.props.onRelease();
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <DirectorViewportNotice
                title="3D 視口渲染失敗"
                description="導演臺其餘面板仍可使用。可重試重建視口；若持續失敗請檢查顯示卡驅動或瀏覽器 WebGL 支援。"
                actionLabel="重試 3D 視口"
                onAction={() => {
                    this.setState({ failed: false });
                    this.props.onRetry();
                }}
            />
        );
    }
}

function DirectorViewportNotice({ title, description, actionLabel, onAction, variant = "cover" }: { title: string; description: string; actionLabel: string; onAction: () => void; variant?: "cover" | "corner" }) {
    return (
        <div className={`director-viewport-notice ${variant === "corner" ? "is-corner" : "is-cover"}`} role="alert">
            <div className="director-viewport-notice-title">{title}</div>
            <p className="director-viewport-notice-text">{description}</p>
            <button type="button" className="director-viewport-notice-action" onClick={onAction}>{actionLabel}</button>
        </div>
    );
}

function DirectorSceneContent({ scene, selectedObjectId, selectedObjectIds = [], selectedCameraId = null, selectedBone, showBoneControls = false, transformMode, renderMode, playhead, playing, showMotionPaths = false, drawActorPath = null, onDrawActorPath, drawCameraPath = null, onDrawCameraPath, onPenFirstPoint, onSelectPathKeyframe, onSelectPath, selectedPath, onMovePathPoint, onClaimPathPointer, viewMode = DIRECTOR_DEFAULT_VIEW_MODE, onSelectObject, onSelectCamera, onCameraTransform, onSelectBone, onObjectTransform, onMultiObjectTransform, onBoneTransform, onActorRigReady, onCaptureContext, onRelease, onContextLost, onContextRestored, onLoadStateChange, onGroundPoint, onOrbitControls, onCameraOrientation, transformClaimRef: sharedTransformClaimRef }: DirectorCanvasSurfaceProps & { onClaimPathPointer: (holdMs: number) => void }) {
    const { gl, camera, scene: threeScene, invalidate, set, size } = useThree();
    const orbitRef = useRef<DirectorOrbitControls>(null);
    const penPointsRef = useRef<DirectorGroundPoint[]>([]);
    const pencilStrokeRef = useRef<{ pointerId: number; points: DirectorGroundPoint[] } | null>(null);
    const [penPoints, setPenPoints] = useState<DirectorGroundPoint[]>([]);
    const [pencilPreviewPoints, setPencilPreviewPoints] = useState<DirectorGroundPoint[]>([]);
    const drawPath = drawCameraPath || drawActorPath;
    useEffect(() => {
        penPointsRef.current = [];
        pencilStrokeRef.current = null;
        setPenPoints([]);
        setPencilPreviewPoints([]);
    }, [drawActorPath, drawCameraPath]);
    const stage = directorStageTransform(scene);
    const stageMatrix = useMemo(() => directorStageMatrix(stage), [stage]);
    const [transforming, setTransforming] = useState(false);
    const transformingRef = useRef(false);
    const fallbackTransformClaimRef = useRef(false);
    const transformClaimRef = sharedTransformClaimRef ?? fallbackTransformClaimRef;
    const setTransformingState = useCallback((value: boolean) => {
        transformingRef.current = value;
        if (value) transformClaimRef.current = true;
        else requestAnimationFrame(() => { transformClaimRef.current = false; });
        setTransforming(value);
    }, []);
    const [multiFrozenTransforms, setMultiFrozenTransforms] = useState<Record<string, DirectorTransform> | null>(null);
    const objectTargetsRef = useRef(new Map<string, Group>());
    const registerObjectTarget = useCallback((id: string, target: Group | null) => {
        if (target) objectTargetsRef.current.set(id, target);
        else objectTargetsRef.current.delete(id);
    }, []);
    const freezeMultiObjects = useCallback((transforms: Record<string, DirectorTransform> | null) => setMultiFrozenTransforms(transforms), []);
    const displayClayRestoreRef = useRef<(() => void) | null>(null);
    const panoramaSphereRef = useRef<Mesh | null>(null);
    const panoramaSettings = directorPanoramaSphere(scene);
    const panoramaDisplayRef = useRef({ ...panoramaSettings, renderMode });
    panoramaDisplayRef.current = { ...panoramaSettings, renderMode };
    // 三臺相機各司其職、互不共享：free 只由 OrbitControls 驅動，CAM/正交只在各自模式下
    // 由取景資料接管。切換 viewMode 只挪動「誰是活動相機」這個指標，任何一臺的內部狀態
    // 都不會因為切換而被讀寫——這是「切換不丟失/不汙染任一相機狀態」的唯一來源。
    const [freeCamera] = useState(() => {
        const instance = new PerspectiveCamera(directorCanvasCamera.fov, 1, directorCanvasCamera.near, directorCanvasCamera.far);
        instance.position.set(...directorCanvasCamera.position);
        return instance;
    });
    const [camCamera] = useState(() => new PerspectiveCamera(directorCanvasCamera.fov, 1, directorCanvasCamera.near, directorCanvasCamera.far));
    const [orthoCamera] = useState(() => new OrthographicCamera(-1, 1, 1, -1, 0.05, 500));
    // CAM 與正交軸向的取景解算都是純函式：mode 不匹配時各自返回 null，互不衝突。
    // 活動相機不直接看 viewMode：CAM 取景失敗必須回落 free，否則會露出從未寫入的 camCamera。
    const camFraming = resolveDirectorViewFraming({ scene, mode: viewMode, playhead });
    const orthoFraming = resolveDirectorOrthographicFraming({ scene, mode: viewMode });
    const effectiveViewport = resolveDirectorEffectiveViewport({ mode: viewMode, framing: camFraming });
    useFrame(() => {
        if (viewMode !== "camera" || effectiveViewport.camera !== "camera") return;
        const { x, y, z, w } = camCamera.quaternion;
        onCameraOrientation([x, y, z, w]);
    });
    const actorMotionPaths = useMemo(() => showMotionPaths ? scene.objects.filter((object) => object.visible && (object.kind === "actor" || object.primitive === "character") && directorTransformPathLength(object.keyframes) > 0.001) : [], [scene.objects, showMotionPaths]);
    const penOrigin = drawPath === "pen" ? drawCameraPath ? scene.cameras.find((item) => item.id === selectedCameraId)?.transform.position : scene.objects.find((object) => object.id === selectedObjectId)?.transform.position : null;
    const pendingPenPositions: DirectorVec3[] = penOrigin ? [penOrigin, ...penPoints.map((point) => [point.x, penOrigin[1], point.z] as DirectorVec3)] : [];
    const pencilPreviewPositions: DirectorVec3[] = pencilPreviewPoints.map((point) => [point.x, 0.025, point.z]);
    const cameraMotionPaths = useMemo(() => showMotionPaths ? visibleDirectorCameras(scene).filter((item) => directorTransformPathLength(item.keyframes.filter((key) => key.positionKeyed !== false)) > 0.001) : [], [scene, showMotionPaths]);
    const suspendDisplayMaterialOverride = useCallback(() => {
        const suspended = Boolean(displayClayRestoreRef.current);
        displayClayRestoreRef.current?.();
        displayClayRestoreRef.current = null;
        return () => {
            if (suspended) displayClayRestoreRef.current = applyClaySceneMaterials(threeScene);
        };
    }, [threeScene]);

    const readCaptureContext = useCallback((): CaptureContext => ({ gl, camera: camera as Camera, cameraKind: camera === camCamera ? "camera" : camera === orthoCamera ? "orthographic" : "free", scene: threeScene, suspendDisplayMaterialOverride }), [camera, camCamera, gl, orthoCamera, suspendDisplayMaterialOverride, threeScene]);

    useEffect(() => {
        onCaptureContext(readCaptureContext());
    }, [onCaptureContext, readCaptureContext]);

    // 子樹解除安裝（重試重建、boundary 捕獲後 React 解除安裝）時同步釋放：
    // 此後 captureContext 指向已銷燬的 renderer，必須清空並打回不可用。
    // 單獨 effect 且只依賴穩定的 onRelease，不會被 readCaptureContext 變化連帶觸發。
    useEffect(() => () => onRelease(), [onRelease]);

    // 上下文丟失/恢復監聽繫結在 renderer 自己的 canvas 上，隨 renderer 與重試精確摘除。
    useEffect(() => installDirectorContextListeners(gl.domElement, {
        onLost: onContextLost,
        // 恢復後 registered 會被置回 false，必須用當前 renderer 重新登記，
        // 否則 capture/record/readCameraTransform 會一直不可用。走與測試共用的序列 helper。
        onRestored: () => restoreDirectorCapture({
            readContext: readCaptureContext,
            onAvailability: onContextRestored,
            onRegister: onCaptureContext,
            invalidate,
        }),
    }), [gl, invalidate, onCaptureContext, onContextLost, onContextRestored, readCaptureContext]);

    /**
     * 地面拾取：renderer 自己的 canvas 上做 pointer 監聽，再用真實 Raycaster 與
     * 變換後的場景區域性 y=0 Plane 求交。不走 mesh onPointerMove（會被物體 stopPropagation 截斷），
     * 也不做 DOM 畫素偽換算；因此 pointer 懸停在物體上方時射線仍與地面相交。
     * 高頻路徑只寫 ref，絕不 setState。
     */
    useEffect(() => {
        const canvasElement = gl.domElement;
        const raycaster = new Raycaster();
        const groundPlane = new Plane(new Vector3(0, 1, 0), 0).applyMatrix4(stageMatrix);
        const inverseStageMatrix = stageMatrix.clone().invert();
        const hit = new Vector3();
        const localHit = new Vector3();
        const ndc = new Vector2();
        let previewFrame = 0;

        const groundPointForEvent = (event: PointerEvent) => {
            const bounds = canvasElement.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) return null;
            ndc.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
            raycaster.setFromCamera(ndc, camera);
            // 射線與地面平行或背離時 intersectPlane 返回 null：保留上一個合法點，不寫非法值。
            if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
            localHit.copy(hit).applyMatrix4(inverseStageMatrix);
            return finiteDirectorGroundPoint(localHit.x, localHit.z);
        };
        const onPointerMove = (event: PointerEvent) => {
            const point = groundPointForEvent(event);
            if (point) onGroundPoint(canvasElement, point);
            if (drawPath === "pen") event.stopImmediatePropagation();
            const stroke = pencilStrokeRef.current;
            if (drawPath === "pencil" && stroke?.pointerId === event.pointerId) {
                event.stopImmediatePropagation();
                const last = stroke.points.at(-1);
                if (point && (!last || Math.hypot(point.x - last.x, point.z - last.z) >= 0.05)) {
                    stroke.points.push(point);
                    // Publish draft samples at display cadence; scene/history remain untouched until pointerup.
                    if (!previewFrame) previewFrame = requestAnimationFrame(() => {
                        previewFrame = 0;
                        if (pencilStrokeRef.current?.pointerId === event.pointerId) setPencilPreviewPoints([...stroke.points]);
                    });
                }
            }
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!drawPath || event.button !== 0) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (drawPath === "pen") return;
            const point = groundPointForEvent(event);
            if (!point) return;
            pencilStrokeRef.current = { pointerId: event.pointerId, points: [point] };
            setPencilPreviewPoints([point]);
            canvasElement.setPointerCapture(event.pointerId);
        };
        const onPointerUp = (event: PointerEvent) => {
            if (drawPath === "pen") {
                event.stopImmediatePropagation();
                const point = groundPointForEvent(event);
                const last = penPointsRef.current.at(-1);
                if (point && (!last || Math.hypot(point.x - last.x, point.z - last.z) >= 0.05)) {
                    penPointsRef.current = [...penPointsRef.current, point];
                    setPenPoints(penPointsRef.current);
                    if (penPointsRef.current.length === 1) onPenFirstPoint?.();
                }
                return;
            }
            const stroke = pencilStrokeRef.current;
            if (drawPath !== "pencil" || stroke?.pointerId !== event.pointerId) return;
            event.stopImmediatePropagation();
            const point = groundPointForEvent(event);
            const points = stroke.points;
            if (point && (!points.at(-1) || Math.hypot(point.x - points.at(-1)!.x, point.z - points.at(-1)!.z) >= 0.05)) points.push(point);
            pencilStrokeRef.current = null;
            if (previewFrame) cancelAnimationFrame(previewFrame);
            previewFrame = 0;
            setPencilPreviewPoints([]);
            if (canvasElement.hasPointerCapture(event.pointerId)) canvasElement.releasePointerCapture(event.pointerId);
            if (points.length >= 2) {
                if (drawCameraPath) onDrawCameraPath?.(points, "pencil");
                else onDrawActorPath?.(points, "pencil");
            }
        };
        const onDoubleClick = (event: MouseEvent) => {
            if (drawPath !== "pen") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (penPointsRef.current.length >= 2) {
                if (drawCameraPath) onDrawCameraPath?.(penPointsRef.current, "pen");
                else onDrawActorPath?.(penPointsRef.current, "pen");
            }
        };
        const onPointerCancel = () => {
            pencilStrokeRef.current = null;
            if (previewFrame) cancelAnimationFrame(previewFrame);
            previewFrame = 0;
            setPencilPreviewPoints([]);
        };

        canvasElement.addEventListener("pointerdown", onPointerDown, { capture: true });
        canvasElement.addEventListener("pointerup", onPointerUp, { capture: true });
        canvasElement.addEventListener("dblclick", onDoubleClick, { capture: true });
        canvasElement.addEventListener("pointercancel", onPointerCancel);
        canvasElement.addEventListener("pointermove", onPointerMove, { passive: !drawPath, capture: Boolean(drawPath) });
        return () => {
            if (previewFrame) cancelAnimationFrame(previewFrame);
            canvasElement.removeEventListener("pointerdown", onPointerDown, { capture: true });
            canvasElement.removeEventListener("pointerup", onPointerUp, { capture: true });
            canvasElement.removeEventListener("dblclick", onDoubleClick, { capture: true });
            canvasElement.removeEventListener("pointercancel", onPointerCancel);
            canvasElement.removeEventListener("pointermove", onPointerMove, { capture: Boolean(drawPath) });
            // 這個 renderer 的 canvas 解除安裝後，它記錄的地面點不得再被讀到。
            onGroundPoint(canvasElement, null);
        };
    }, [camera, drawPath, drawCameraPath, gl, onDrawActorPath, onDrawCameraPath, onGroundPoint, onPenFirstPoint, stageMatrix]);

    // OrbitControls 的真實 target 只能從例項讀；activeCamera.target 只是初始 prop。
    // 掛載期登記一次即可：drei 重建例項會連帶重跑本 effect。
    useEffect(() => {
        // drei 構造時 target0 是原點，且初次 commit 的相機/target 寫入可能不同步。
        // 明確設定自由視角後再儲存 reset 狀態，隻影響本次 Canvas 掛載。
        const controls = orbitRef.current;
        if (controls) {
            controls.object.position.set(...directorCanvasCamera.position);
            controls.target.fromArray(DIRECTOR_FREE_ORBIT_TARGET);
            controls.update();
            controls.saveState();
        }
        onOrbitControls(controls);
        return () => onOrbitControls(null);
    }, [onOrbitControls]);

    useEffect(() => {
        let cancelled = false;
        let texture: Texture | null = null;
        let sphere: Mesh | null = null;
        threeScene.background = new Color(scene.background);
        invalidate();
        if (scene.panorama?.url) {
            void resolveImageUrl(scene.panorama.storageKey, scene.panorama.url, { cacheMiss: true }).then((url) => {
                if (cancelled) return;
                new TextureLoader().load(url, (loaded) => {
                    if (cancelled) { loaded.dispose(); return; }
                    loaded.mapping = EquirectangularReflectionMapping;
                    loaded.colorSpace = SRGBColorSpace;
                    texture = loaded;
                    threeScene.background = loaded;
                    const backdrop = new Mesh(new SphereGeometry(1, 64, 32), new MeshBasicMaterial({ map: loaded, side: BackSide, depthWrite: false, toneMapped: false }));
                    backdrop.userData.directorPanoramaSphere = true;
                    backdrop.raycast = () => {};
                    backdrop.renderOrder = -1000;
                    backdrop.scale.setScalar(panoramaDisplayRef.current.radius);
                    backdrop.rotation.y = panoramaDisplayRef.current.rotation * Math.PI / 180;
                    backdrop.visible = panoramaDisplayRef.current.renderMode === "beauty";
                    sphere = backdrop;
                    panoramaSphereRef.current = backdrop;
                    threeScene.add(backdrop);
                    invalidate();
                });
            });
        }
        return () => {
            cancelled = true;
            if (sphere) {
                threeScene.remove(sphere);
                if (panoramaSphereRef.current === sphere) panoramaSphereRef.current = null;
                sphere.geometry.dispose();
                (sphere.material as MeshBasicMaterial).dispose();
            }
            if (texture) {
                if (threeScene.background === texture) threeScene.background = new Color(scene.background);
                texture.dispose();
            }
        };
    }, [invalidate, scene.background, scene.panorama?.storageKey, scene.panorama?.url, threeScene]);

    useEffect(() => {
        threeScene.backgroundRotation.y = panoramaSettings.rotation * Math.PI / 180;
        if (panoramaSphereRef.current) {
            panoramaSphereRef.current.rotation.y = panoramaSettings.rotation * Math.PI / 180;
            panoramaSphereRef.current.scale.setScalar(panoramaSettings.radius);
            panoramaSphereRef.current.visible = renderMode === "beauty";
        }
        invalidate();
    }, [invalidate, panoramaSettings.radius, panoramaSettings.rotation, renderMode, threeScene]);

    useEffect(() => {
        const material = renderMode === "depth" ? new MeshDepthMaterial() : renderMode === "normal" ? new MeshNormalMaterial() : renderMode === "pose" ? new MeshBasicMaterial({ color: "#ffffff", wireframe: true }) : null;
        if (renderMode === "clay") displayClayRestoreRef.current = applyClaySceneMaterials(threeScene);
        threeScene.overrideMaterial = material;
        invalidate();
        return () => {
            if (threeScene.overrideMaterial === material) threeScene.overrideMaterial = null;
            displayClayRestoreRef.current?.();
            displayClayRestoreRef.current = null;
            material?.dispose();
        };
    }, [invalidate, renderMode, scene.objects, threeScene]);

    // 透視相機（free/CAM）的寬高比隨容器尺寸變化；正交相機的半範圍在自己的同步 effect 裡
    // 按水平/豎直跨度與 aspect 同時擬合，這裡只負責兩臺透視相機的 aspect + 投影矩陣。
    useEffect(() => {
        const aspect = size.width / Math.max(size.height, 1);
        freeCamera.aspect = aspect;
        freeCamera.updateProjectionMatrix();
        camCamera.aspect = aspect;
        camCamera.updateProjectionMatrix();
        invalidate();
    }, [camCamera, freeCamera, invalidate, size]);

    // 唯一決定「視口活動相機是誰」的入口：只挪動 state.camera 指標，從不讀寫另外兩臺
    // 相機物件的內部狀態——這是「切換模式互不汙染」的保證來源。
    // CAM 無合法取景時指標指向 freeCamera，取景恢復後再指回 camCamera。
    useEffect(() => {
        const next = effectiveViewport.camera === "orthographic" ? orthoCamera : effectiveViewport.camera === "camera" ? camCamera : freeCamera;
        set({ camera: next });
        invalidate();
    }, [camCamera, effectiveViewport.camera, freeCamera, invalidate, orthoCamera, set]);

    const stagePalette = directorStagePalette(scene.background);
    const ground = directorGroundSettings(scene);
    const multiSelectedObjects = useMemo(() => scene.objects.filter((item) => selectedObjectIds.includes(item.id)), [scene.objects, selectedObjectIds]);
    const showMultiGizmo = multiSelectedObjects.length > 1 && multiSelectedObjects.every((item) => !item.locked && item.visible);
    const hasMultiSelection = multiSelectedObjects.length > 1;
    return (
        <>
            {/* CAM 與正交軸向的取景各自獨立同步到專屬相機物件，互不幹擾；free 完全交給
                下面的 OrbitControls，這裡不對它做任何寫入。 */}
            <DirectorShotCameraSync camera={camCamera} framing={camFraming} />
            <DirectorOrthoCameraSync camera={orthoCamera} framing={orthoFraming} aspect={size.width / Math.max(size.height, 1)} />
            <ambientLight intensity={scene.environmentIntensity * 0.35} />
            <group position={stage.position} rotation={stage.rotation.map((degrees) => degrees * Math.PI / 180) as DirectorVec3} scale={stage.scale}>
            {scene.lights.map((light) => <DirectorLightView key={light.id} light={light} />)}
            {viewMode === "free" && renderMode === "beauty" ? visibleDirectorCameras(scene).map((item) => <DirectorCameraAid key={item.id} item={item} scene={scene} playhead={playhead} stage={stage} active={item.id === resolveDirectorActiveCamera(scene)?.id} selected={item.id === selectedCameraId} labelsVisible={scene.labelsVisible !== false} transformMode={transformMode} onSelect={() => onSelectCamera(item.id)} onTransforming={setTransformingState} onTransform={(from, to) => onCameraTransform(item.id, from, to)} />) : null}
            {scene.gridVisible ? <Grid userData={{ directorEditorOnly: true }} position={[0, 0, 0]} infiniteGrid fadeDistance={60} fadeStrength={1.5} cellSize={2} sectionSize={5} cellColor={stagePalette.cell} sectionColor={stagePalette.section} /> : null}
            {ground.visible ? <mesh userData={{ directorStageGround: true }} rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, ground.height - 0.012, 0]}>
                <planeGeometry args={[120, 120]} />
                <meshStandardMaterial color={stagePalette.ground} roughness={0.92} transparent={ground.opacity < 1} opacity={ground.opacity} depthWrite={ground.opacity >= 1} />
            </mesh> : null}
            {actorMotionPaths.map((object) => <DirectorTransformPath key={`actor-path-${object.id}`} keyframes={object.keyframes} playhead={playhead} color="#5b9dc7" visibleKeyIds={object.motionPath?.kind === "pencil" ? undefined : object.motionPath?.controlKeyframeIds} maxVisiblePoints={object.motionPath?.kind === "pencil" ? 10 : undefined} selected={selectedPath?.kind === "actor" && selectedPath.id === object.id} selectedKeyframeId={selectedPath?.kind === "actor" && selectedPath.id === object.id ? selectedPath.keyframeId : undefined} lineOnly={!object.motionPath} onSelectPath={object.motionPath ? () => onSelectPath?.("actor", object.id) : undefined} onSelectKeyframe={object.motionPath ? (keyframe) => onSelectPathKeyframe?.("actor", object.id, keyframe) : undefined} onMoveKeyframe={object.motionPath ? (keyframe, position) => onMovePathPoint?.("actor", object.id, keyframe.id, position) : undefined} onDragActive={setTransformingState} onClaimPointer={onClaimPathPointer} />)}
            {pendingPenPositions.length > 1 ? <group userData={{ directorEditorOnly: true }}>
                <Line points={pendingPenPositions} color="#5b9dc7" lineWidth={2} raycast={() => null} />
                {pendingPenPositions.slice(1).map((point, index) => <mesh key={`pen-point-${index}`} position={point} raycast={() => null}>
                    <sphereGeometry args={[0.035, 12, 8]} />
                    <meshBasicMaterial color="#4f8ef7" />
                </mesh>)}
            </group> : null}
            {pencilPreviewPositions.length > 1 ? <group userData={{ directorEditorOnly: true, directorPencilDraft: true }}>
                <Line points={pencilPreviewPositions} color="#b277cc" lineWidth={2.5} raycast={() => null} />
            </group> : null}
            {cameraMotionPaths.map((item) => <DirectorTransformPath key={`camera-path-${item.id}`} keyframes={item.keyframes.filter((key) => key.positionKeyed !== false)} playhead={playhead} color="#8963a2" visibleKeyIds={item.drawnPath?.kind === "pencil" ? undefined : item.drawnPath ? item.keyframes.filter((key) => !item.drawnPath?.sampleKeyframeIds.includes(key.id)).map((key) => key.id) : undefined} maxVisiblePoints={item.drawnPath?.kind === "pencil" ? 10 : undefined} selected={selectedPath?.kind === "camera" && selectedPath.id === item.id} selectedKeyframeId={selectedPath?.kind === "camera" && selectedPath.id === item.id ? selectedPath.keyframeId : undefined} lineOnly={!item.drawnPath} onSelectPath={item.drawnPath ? () => onSelectPath?.("camera", item.id) : undefined} onSelectKeyframe={item.drawnPath ? (keyframe) => onSelectPathKeyframe?.("camera", item.id, keyframe) : undefined} onMoveKeyframe={item.drawnPath ? (keyframe, position) => onMovePathPoint?.("camera", item.id, keyframe.id, position) : undefined} onDragActive={setTransformingState} onClaimPointer={onClaimPathPointer} />)}
            {scene.objects.filter((item) => item.visible).map((object) => (
                <DirectorObjectView
                    key={object.id}
                    object={object}
                    selected={selectedObjectId === object.id || selectedObjectIds.includes(object.id)}
                    showGizmo={!hasMultiSelection}
                    isMultiSelection={hasMultiSelection}
                    externalFrozenTransform={multiFrozenTransforms?.[object.id] || null}
                    onTargetReady={registerObjectTarget}
                    transformClaimRef={transformClaimRef}
                    selectedBone={selectedObjectId === object.id && !object.locked ? selectedBone : null}
                    showBoneControls={showBoneControls}
                    showLabel={scene.labelsVisible !== false && (object.kind === "actor" || object.primitive === "character")}
                    transformMode={transformMode}
                    playhead={playhead}
                    onSelect={() => onSelectObject(object.id)}
                    onSelectBone={(bone) => { if (!object.locked) { onSelectObject(object.id); onSelectBone(bone); } }}
                    onTransforming={setTransformingState}
                    isTransformingRef={transformingRef}
                    onTransform={(from, to) => onObjectTransform(object.id, from, to)}
                    onBoneTransform={(bone, rotation) => onBoneTransform(object.id, bone, rotation)}
                    onActorRigReady={(rig, animations) => onActorRigReady(object.id, rig, animations)}
                    onLoadStateChange={onLoadStateChange}
                />
            ))}
            {showMultiGizmo ? <DirectorMultiObjectGizmo objects={multiSelectedObjects} targets={objectTargetsRef.current} playhead={playhead} transformMode={transformMode} onFreeze={freezeMultiObjects} onTransforming={setTransformingState} onTransform={(from, to) => onMultiObjectTransform(multiSelectedObjects.map((item) => item.id), from.group, to.group)} /> : null}
            </group>
            {/* 只有有效 free 回落允許環繞：drei 只在 enabled 時調 controls.update()，CAM/正交下這是
                真正的鎖定，不會有 controls 每幀把相機拽回自己 target 的回寫競爭。
                camera 顯式繫結 freeCamera：即使 state.camera 當前指向別的相機，也絕不會
                被這份環繞狀態誤傷。CAM 取景失敗時 orbit 開啟，用已有的自由視角，不改場景。 */}
            <OrbitControls ref={orbitRef} makeDefault camera={freeCamera} enabled={!transforming && !drawPath && effectiveViewport.orbit} target={DIRECTOR_FREE_ORBIT_TARGET} minDistance={0.6} maxDistance={80} />
        </>
    );
}

/** Editor-only camera model/frustum; selected cameras use the same transactional gizmo as scene objects. */
function DirectorCameraAid({ item, scene, playhead, stage, active, selected, labelsVisible, transformMode, onSelect, onTransforming, onTransform }: { item: DirectorScene["cameras"][number]; scene: DirectorScene; playhead: number; stage: NonNullable<DirectorScene["stageTransform"]>; active: boolean; selected: boolean; labelsVisible: boolean; transformMode: DirectorViewportProps["transformMode"]; onSelect: () => void; onTransforming: (value: boolean) => void; onTransform: (from: DirectorTransform, to: DirectorTransform) => void }) {
    const framing = resolveDirectorCameraLocalFraming(scene, item, playhead);
    const transform = resolveDirectorCameraTransform(item, playhead);
    const localPosition = framing?.position ?? transform.position;
    const position = new Vector3(...localPosition);
    const lookTarget = new Vector3(...(framing?.target ?? item.target));
    const direction = lookTarget.clone().sub(position);
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1).applyEuler(new Euler(...transform.rotation));
    const up = framing?.up ?? resolveDirectorViewUp(transform.rotation, direction.toArray() as DirectorVec3);
    const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position, position.clone().add(direction), new Vector3(...up)));
    const distance = directorCameraAidDistance(direction.length());
    const halfHeight = Math.tan((Math.min(120, Math.max(10, item.fov || 50)) * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * 16 / 9;
    const corners: DirectorVec3[] = [[-halfWidth, halfHeight, -distance], [halfWidth, halfHeight, -distance], [halfWidth, -halfHeight, -distance], [-halfWidth, -halfHeight, -distance]];
    const segments = directorCameraFrameSegments(corners);
    const guides = directorCameraGuideSegments(corners);
    const worldPosition = new Vector3(...directorStagePoint(stage, localPosition));
    const [nearViewer, setNearViewer] = useState(false);
    const [frozen, setFrozen] = useState<DirectorTransform | null>(null);
    const aidTransform = frozen || transform;
    const aidPosition = selected ? frozen?.position || localPosition : transform.position;
    const aidRotation = new Quaternion().setFromEuler(new Euler(...aidTransform.rotation));
    const inverseAidRotation = aidRotation.clone().invert();
    const framingOffset = new Vector3(...localPosition).sub(new Vector3(...aidPosition)).applyQuaternion(inverseAidRotation);
    const framingOrientation = inverseAidRotation.multiply(orientation);
    useFrame(({ camera }) => {
        const next = camera.position.distanceTo(worldPosition) < 0.5;
        setNearViewer((current) => current === next ? current : next);
    });
    const [gizmoTarget, setTarget] = useState<Group | null>(null);
    const bindTarget = useCallback((instance: Group | null) => setTarget(instance), []);
    if (!framing) return null;
    const { body: showBody, guides: showGuides, gizmo: showGizmo } = directorCameraAidVisibility(selected, nearViewer);
    return <>
        <group ref={bindTarget} userData={{ directorEditorOnly: true }} position={aidPosition} rotation={aidTransform.rotation}>
            {showBody ? <><mesh onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}>
                <boxGeometry args={[0.34, 0.28, 0.28]} />
                <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
            </mesh>
            <mesh onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}>
                <boxGeometry args={[0.15, 0.1, 0.12]} />
                <meshBasicMaterial color={selected ? "#f7a815" : active ? "#8ba5b6" : "#718391"} />
            </mesh>
            <mesh position={[0, 0, -0.09]} rotation={[Math.PI / 2, 0, 0]} onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}>
                <cylinderGeometry args={[0.045, 0.045, 0.07, 16]} />
                <meshBasicMaterial color={selected ? "#ffd16b" : "#344858"} />
            </mesh>
            <mesh position={[0.015, 0.065, 0]} onPointerDown={(event) => { event.stopPropagation(); onSelect(); }}>
                <boxGeometry args={[0.055, 0.025, 0.045]} />
                <meshBasicMaterial color={selected ? "#ffd16b" : "#718391"} />
            </mesh></> : null}
            {showGuides ? <group userData={{ directorEditorOnly: true }} position={framingOffset} quaternion={framingOrientation}>
                <Line segments points={segments} color={selected ? "#f7a815" : active ? "#5b9dc7" : "#3f6f8b"} lineWidth={selected ? 1.5 : 1} transparent opacity={selected ? 0.85 : active ? 0.5 : 0.3} raycast={() => {}} />
                <Line segments points={guides} color={selected ? "#f7a815" : active ? "#5b9dc7" : "#3f6f8b"} lineWidth={1} transparent opacity={selected ? 0.7 : active ? 0.4 : 0.25} raycast={() => {}} />
                {showBody ? <Html center position={[0, 0.3, 0]} style={{ pointerEvents: "none" }}>
                    <div className="flex flex-col items-center gap-0.5 whitespace-nowrap" style={{ color: "#fff", textShadow: "0 1px 3px #000, 0 0 5px #000" }}>
                        {labelsVisible || selected ? <span data-director-camera-label={item.id} data-director-camera-gizmo-target={selected ? item.id : undefined} data-director-camera-look-at-mode={item.lookAtMode === "rotation" ? "rotation" : item.lookAtMode === "object" && item.lookAtObjectId ? "object" : "coordinates"} style={{ fontSize: 12, fontWeight: 600 }}>{item.name}</span> : null}
                        <VideoIcon size={25} color={selected ? "#f7a815" : active ? "#f7a815" : "#8ba5b6"} strokeWidth={2.8} aria-hidden />
                    </div>
                </Html> : null}
            </group> : null}
        </group>
        {showGizmo && !item.locked && gizmoTarget ? <DirectorCameraGizmo target={gizmoTarget} transformMode={transformMode} onFreeze={setFrozen} onTransforming={onTransforming} onTransform={onTransform} /> : null}
    </>;
}

function DirectorCameraGizmo({ target, transformMode, onFreeze, onTransforming, onTransform }: { target: Group; transformMode: DirectorViewportProps["transformMode"]; onFreeze: (transform: DirectorTransform | null) => void; onTransforming: (value: boolean) => void; onTransform: (from: DirectorTransform, to: DirectorTransform) => void }) {
    const transaction = useDirectorGizmoTransaction<DirectorTransform>({
        read: () => readObject3DTransform(target),
        restore: (snapshot) => applyObject3DTransform(target, snapshot),
        commit: onTransform,
        onActive: (active, snapshot) => {
            onFreeze(active ? snapshot : null);
            onTransforming(active);
        },
    });
    return <TransformControls object={target} mode={transformMode} size={0.8} onMouseDown={() => transaction.begin()} onMouseUp={() => transaction.end("commit")} />;
}

/** 起點、終點、路徑點、方向與當前進度共用一條 Transform 關鍵幀路徑。 */
function DirectorTransformPath({ keyframes, playhead, color, visibleKeyIds, maxVisiblePoints, selected = false, selectedKeyframeId, lineOnly = false, onSelectPath, onSelectKeyframe, onMoveKeyframe, onDragActive, onClaimPointer }: { keyframes: DirectorObject["keyframes"]; playhead: number; color: string; visibleKeyIds?: string[]; maxVisiblePoints?: number; selected?: boolean; selectedKeyframeId?: string; lineOnly?: boolean; onSelectPath?: () => void; onSelectKeyframe?: (keyframe: DirectorKeyframe) => void; onMoveKeyframe?: (keyframe: DirectorKeyframe, position: DirectorVec3) => void; onDragActive?: (active: boolean) => void; onClaimPointer?: (holdMs: number) => void }) {
    const sorted = useMemo(() => finiteDirectorTransformKeyframes(keyframes).sort((left, right) => left.time - right.time), [keyframes]);
    const points = useMemo(() => sorted.map((keyframe) => keyframe.transform.position), [sorted]);
    const visibleFrames = useMemo(() => {
        const candidates = visibleKeyIds ? sorted.filter((keyframe) => visibleKeyIds.includes(keyframe.id)) : sorted;
        if (!maxVisiblePoints || candidates.length <= maxVisiblePoints) return candidates;
        const cumulative = candidates.map((frame, index) => index ? Math.hypot(frame.transform.position[0] - candidates[index - 1].transform.position[0], frame.transform.position[2] - candidates[index - 1].transform.position[2]) : 0);
        for (let index = 1; index < cumulative.length; index += 1) cumulative[index] += cumulative[index - 1];
        const total = cumulative.at(-1) || 0;
        let previous = -1;
        return Array.from({ length: maxVisiblePoints }, (_, index) => {
            const target = total * index / (maxVisiblePoints - 1);
            const maxIndex = candidates.length - (maxVisiblePoints - index);
            let nearest = previous + 1;
            for (let candidate = nearest + 1; candidate <= maxIndex; candidate += 1) {
                if (Math.abs(cumulative[candidate] - target) >= Math.abs(cumulative[nearest] - target)) break;
                nearest = candidate;
            }
            previous = nearest;
            return candidates[nearest];
        });
    }, [maxVisiblePoints, sorted, visibleKeyIds]);
    const visiblePoints = visibleFrames.map((keyframe) => keyframe.transform.position);
    const current = sorted.length ? interpolateDirectorTransform(sorted[0].transform, sorted, playhead).position : [0, 0, 0] as DirectorVec3;
    const previous = points[points.length - 2] || points[0] || [0, 0, 0] as DirectorVec3;
    const end = points[points.length - 1] || [0, 0, 0] as DirectorVec3;
    const direction = useMemo(() => {
        const vector = new Vector3(...end).sub(new Vector3(...previous));
        if (vector.lengthSq() < 1e-8) return [0, 0, 0, 1] as DirectorQuat;
        return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), vector.normalize()).toArray() as DirectorQuat;
    }, [end, previous]);
    const dragRef = useRef<{ pointerId: number; frame: DirectorKeyframe; origin: DirectorVec3; offset: Vector3; current: DirectorVec3 } | null>(null);
    const [preview, setPreview] = useState<{ id: string; position: DirectorVec3 } | null>(null);
    const displayedPoints = preview ? sorted.map((frame) => frame.id === preview.id ? preview.position : frame.transform.position) : points;
    const localPoint = (event: ThreeEvent<PointerEvent>, origin: DirectorVec3): Vector3 | null => {
        const parent = event.object.parent;
        if (!parent) return null;
        parent.updateWorldMatrix(true, false);
        const worldOrigin = parent.localToWorld(new Vector3(...origin));
        const normal = new Vector3(0, 1, 0).transformDirection(parent.matrixWorld);
        const hit = event.ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(normal, worldOrigin), new Vector3());
        return hit ? parent.worldToLocal(hit) : null;
    };
    const finishDrag = (event: ThreeEvent<PointerEvent>, cancelled = false) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        dragRef.current = null;
        onClaimPointer?.(250);
        (event.target as unknown as { releasePointerCapture?: (pointerId: number) => void })?.releasePointerCapture?.(event.pointerId);
        onDragActive?.(false);
        setPreview(null);
        if (!cancelled && Math.hypot(drag.current[0] - drag.origin[0], drag.current[2] - drag.origin[2]) > 1e-4) onMoveKeyframe?.(drag.frame, drag.current);
    };
    useEffect(() => () => onDragActive?.(false), [onDragActive]);

    if (sorted.length < 2) return null;

    return <group userData={{ directorEditorOnly: true }}>
        <Line points={displayedPoints} color={selected ? "#dfb0f4" : color} lineWidth={selected ? 4 : 2.5} raycast={() => null} />
        {onSelectPath ? <Line points={displayedPoints} color={color} lineWidth={16} transparent opacity={0} depthTest={false} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); onClaimPointer?.(250); onSelectPath(); }} /> : null}
        {!lineOnly && visiblePoints.map((point, index) => <mesh key={visibleFrames[index].id} position={preview?.id === visibleFrames[index].id ? preview.position : point} onPointerOver={(event) => { event.stopPropagation(); onDragActive?.(true); }} onPointerOut={(event) => { event.stopPropagation(); if (!dragRef.current) onDragActive?.(false); }} onPointerDown={onSelectKeyframe ? (event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.nativeEvent.stopImmediatePropagation();
            onClaimPointer?.(60_000);
            onSelectKeyframe(visibleFrames[index]);
            if (!onMoveKeyframe) return;
            const hit = localPoint(event, point);
            if (!hit) return;
            dragRef.current = { pointerId: event.pointerId, frame: visibleFrames[index], origin: [...point] as DirectorVec3, offset: new Vector3(...point).sub(hit), current: [...point] as DirectorVec3 };
            (event.target as unknown as { setPointerCapture?: (pointerId: number) => void })?.setPointerCapture?.(event.pointerId);
            onDragActive?.(true);
        } : undefined} onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId || drag.frame.id !== visibleFrames[index].id) return;
            event.stopPropagation();
            const hit = localPoint(event, drag.origin);
            if (!hit) return;
            hit.add(drag.offset);
            drag.current = [hit.x, drag.origin[1], hit.z];
            setPreview({ id: drag.frame.id, position: drag.current });
        }} onPointerUp={(event) => finishDrag(event)} onPointerCancel={(event) => finishDrag(event, true)}>
            <sphereGeometry args={[0.12, 12, 8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            <mesh raycast={() => null}>
                <sphereGeometry args={[selectedKeyframeId === visibleFrames[index].id ? 0.09 : 0.065, 12, 8]} />
                <meshBasicMaterial color={selectedKeyframeId === visibleFrames[index].id ? "#f8db72" : selected ? "#e2b2f3" : color} depthTest={false} />
            </mesh>
        </mesh>)}
        {!lineOnly && <mesh position={end} quaternion={direction}>
            <coneGeometry args={[0.1, 0.28, 10]} />
            <meshBasicMaterial color={color} />
        </mesh>}
        {!lineOnly && <mesh position={current}>
            <sphereGeometry args={[0.14, 12, 8]} />
            <meshBasicMaterial color="#f0d36a" />
        </mesh>}
    </group>;
}

/**
 * CAM 取景：把 shot 攝影機的解算結果寫進專屬的機位相機物件。
 *
 * 這臺相機獨立持有，不是共享的視口預設相機：離開 CAM 模式後不需要任何快照/還原——
 * 沒有人會在其他模式下碰它，回到 CAM 時上一次寫入的狀態原樣還在，物理上不可能被汙染。
 *
 * 只寫這臺相機物件，絕不觸碰 DirectorScene：換一隻眼睛看場景不是內容改動，
 * 因此不產生任何 undo/history 記錄，也不會觸發儲存。
 */
function DirectorShotCameraSync({ camera, framing }: { camera: PerspectiveCamera; framing: DirectorViewFraming | null }) {
    const invalidate = useThree((state) => state.invalidate);
    const framingKey = directorViewFramingKey(framing);
    useEffect(() => {
        if (!framing) return;
        // up 必須先寫：lookAt 用當前 camera.up 解基向量，順序顛倒會丟掉荷蘭角。
        camera.up.set(...framing.up);
        camera.position.set(...framing.position);
        camera.fov = framing.fov;
        camera.near = framing.near;
        camera.far = framing.far;
        camera.lookAt(...framing.target);
        camera.updateProjectionMatrix();
        invalidate();
        // framing 只通過 framingKey 參與依賴：草稿物件身份變化不觸發無謂回寫。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [framingKey, invalidate, camera]);
    return null;
}

/**
 * 正交軸向取景：把包圍盒解算結果寫進專屬的正交相機物件，語義與 DirectorShotCameraSync
 * 完全對稱——獨立持有、無需快照還原、絕不碰 DirectorScene。
 *
 * 水平/豎直跨度由領域層給出；視口只傳入執行時 aspect，半範圍換算走
 * resolveDirectorOrthographicFrustum，同時裝下兩條軸，避免寬內容被裁切。
 */
function DirectorOrthoCameraSync({ camera, framing, aspect }: { camera: OrthographicCamera; framing: DirectorOrthographicFraming | null; aspect: number }) {
    const invalidate = useThree((state) => state.invalidate);
    const framingKey = framing ? [...framing.position, ...framing.target, ...framing.up, framing.horizontalSpan, framing.verticalSpan, framing.near, framing.far].map((value) => value.toFixed(4)).join("|") : "";
    useEffect(() => {
        if (!framing) return;
        const frustum = resolveDirectorOrthographicFrustum({ horizontalSpan: framing.horizontalSpan, verticalSpan: framing.verticalSpan, aspect });
        camera.up.set(...framing.up);
        camera.position.set(...framing.position);
        camera.left = frustum.left;
        camera.right = frustum.right;
        camera.top = frustum.top;
        camera.bottom = frustum.bottom;
        camera.near = framing.near;
        camera.far = framing.far;
        camera.lookAt(...framing.target);
        camera.updateProjectionMatrix();
        invalidate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [framingKey, aspect, invalidate, camera]);
    return null;
}

function DirectorObjectView({ object, selected, selectedBone, showBoneControls, showLabel, showGizmo = true, isMultiSelection = false, externalFrozenTransform, onTargetReady, isTransformingRef, transformClaimRef, transformMode, playhead, onSelect, onSelectBone, onTransforming, onTransform, onBoneTransform, onActorRigReady, onLoadStateChange }: { object: DirectorObject; selected: boolean; selectedBone: string | null; showBoneControls: boolean; showLabel: boolean; showGizmo?: boolean; isMultiSelection?: boolean; externalFrozenTransform?: DirectorTransform | null; onTargetReady?: (id: string, target: Group | null) => void; isTransformingRef?: { current: boolean }; transformClaimRef?: { current: boolean }; transformMode: DirectorViewportProps["transformMode"]; playhead: number; onSelect: () => void; onSelectBone: (bone: string | null) => void; onTransforming: (value: boolean) => void; onTransform: (from: DirectorTransform, to: DirectorTransform) => void; onBoneTransform: (bone: string, rotation: DirectorQuat) => void; onActorRigReady: (rig: DirectorRig, animations: AnimationClip[]) => void; onLoadStateChange: (id: string, signal: DirectorLoadSignal, retry: () => void) => void }) {
    const [target, setTarget] = useState<Group | null>(null);
    const resolved = interpolateDirectorTransform(object.transform, object.keyframes, playhead);
    // 手勢進行中凍結宣告式 transform，交由 gizmo 直接改寫 Object3D；終態後再由場景狀態接管。
    const [frozen, setFrozen] = useState<DirectorTransform | null>(null);
    const transform = frozen || externalFrozenTransform || resolved;
    const bindTarget = useCallback((instance: Group | null) => {
        setTarget(instance);
        onTargetReady?.(object.id, instance);
    }, [object.id, onTargetReady]);
    return (
        <>
            <group
                ref={bindTarget}
                position={transform.position}
                rotation={transform.rotation}
                scale={transform.scale}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    if (isTransformingRef?.current) return;
                    if (isMultiSelection) {
                        // TransformControls listens on the canvas DOM node after R3F raycasting.
                        // Defer selection until that listener has had a chance to claim a group-gizmo drag.
                        requestAnimationFrame(() => { if (!isTransformingRef?.current && !transformClaimRef?.current) onSelect(); });
                        return;
                    }
                    onSelect();
                }}
            >
                <DirectorObjectVisual object={object} selected={selected} selectedBone={selectedBone} showBoneControls={showBoneControls} playhead={playhead} onSelectBone={onSelectBone} onBoneTransform={onBoneTransform} onActorRigReady={onActorRigReady} onLoadStateChange={onLoadStateChange} />
                {showLabel ? <Html position={[0, 2.04, 0]} center style={{ pointerEvents: "none" }}>
                    <span data-director-actor-label={object.id} data-director-bone-gizmo-target={selectedBone || undefined} role="note" aria-label={`角色 ${object.name}`} style={{ color: "#fff", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textShadow: "0 1px 3px #000, 0 0 5px #000" }}>{object.name}</span>
                </Html> : null}
            </group>
            {selected && showGizmo && !object.locked && !selectedBone && target ? (
                <DirectorObjectGizmo
                    target={target}
                    transformMode={transformMode}
                    onFreeze={setFrozen}
                    onTransforming={onTransforming}
                    onTransform={onTransform}
                />
            ) : null}
        </>
    );
}

function DirectorObjectGizmo({ target, transformMode, onFreeze, onTransforming, onTransform }: { target: Group; transformMode: DirectorViewportProps["transformMode"]; onFreeze: (transform: DirectorTransform | null) => void; onTransforming: (value: boolean) => void; onTransform: (from: DirectorTransform, to: DirectorTransform) => void }) {
    const transaction = useDirectorGizmoTransaction<DirectorTransform>({
        read: () => readObject3DTransform(target),
        restore: (snapshot) => applyObject3DTransform(target, snapshot),
        commit: onTransform,
        onActive: (active, snapshot) => {
            onFreeze(active ? snapshot : null);
            onTransforming(active);
        },
    });
    return (
        <TransformControls
            object={target}
            mode={transformMode}
            size={0.8}
            onMouseDown={() => transaction.begin()}
            onMouseUp={() => transaction.end("commit")}
        />
    );
}

type DirectorMultiObjectSnapshot = { group: DirectorTransform; objects: Record<string, DirectorTransform> };

function DirectorMultiObjectGizmo({ objects, targets, playhead, transformMode, onFreeze, onTransforming, onTransform }: { objects: DirectorObject[]; targets: Map<string, Group>; playhead: number; transformMode: DirectorViewportProps["transformMode"]; onFreeze: (transforms: Record<string, DirectorTransform> | null) => void; onTransforming: (value: boolean) => void; onTransform: (from: DirectorMultiObjectSnapshot, to: DirectorMultiObjectSnapshot) => void }) {
    const [target, setTarget] = useState<Group | null>(null);
    const baselineRef = useRef<DirectorMultiObjectSnapshot | null>(null);
    const pivot = useMemo(() => {
        const position = new Vector3();
        objects.forEach((object) => position.add(new Vector3(...interpolateDirectorTransform(object.transform, object.keyframes, playhead).position)));
        if (objects.length) position.multiplyScalar(1 / objects.length);
        return position.toArray() as DirectorVec3;
    }, [objects, playhead]);
    const bindTarget = useCallback((instance: Group | null) => setTarget(instance), []);
    useLayoutEffect(() => {
        if (!target) return;
        target.position.set(...pivot);
        target.rotation.set(0, 0, 0);
        target.scale.set(1, 1, 1);
        target.updateMatrixWorld(true);
    }, [pivot, target]);

    const read = useCallback((): DirectorMultiObjectSnapshot | null => {
        if (!target) return null;
        const transforms: Record<string, DirectorTransform> = {};
        for (const object of objects) {
            const objectTarget = targets.get(object.id);
            if (!objectTarget) return null;
            transforms[object.id] = readObject3DTransform(objectTarget);
        }
        return { group: readObject3DTransform(target), objects: transforms };
    }, [objects, target, targets]);
    const transaction = useDirectorGizmoTransaction<DirectorMultiObjectSnapshot>({
        read,
        restore: (snapshot) => {
            if (target) applyObject3DTransform(target, snapshot.group);
            for (const [id, transform] of Object.entries(snapshot.objects)) {
                const objectTarget = targets.get(id);
                if (objectTarget) applyObject3DTransform(objectTarget, transform);
            }
        },
        commit: onTransform,
        onActive: (active, snapshot) => {
            onFreeze(active && snapshot ? snapshot.objects : null);
            onTransforming(active);
            if (!active) baselineRef.current = null;
        },
    });
    const begin = () => {
        baselineRef.current = read();
        transaction.begin();
    };
    const preview = () => {
        const baseline = baselineRef.current;
        const current = read();
        if (!baseline || !current) return;
        const transformed = resolveDirectorMultiObjectGroupTransformEdit({ objects, selectedIds: objects.map((item) => item.id), from: baseline.group, to: current.group, autoKey: false, time: playhead });
        transformed.forEach((object) => {
            const objectTarget = targets.get(object.id);
            if (objectTarget) applyObject3DTransform(objectTarget, interpolateDirectorTransform(object.transform, object.keyframes, playhead));
        });
    };
    return <>
        <group ref={bindTarget} position={pivot} />
        {target ? <TransformControls object={target} mode={transformMode} size={0.8} onMouseDown={begin} onObjectChange={preview} onMouseUp={() => transaction.end("commit")} /> : null}
    </>;
}

/**
 * gizmo 事務的統一接線：物件與骨骼共用，避免兩套實現產生偏差。
 * 監聽在掛載期間常駐安裝（不以「當前是否有手勢」為安裝條件），
 * 非活躍時 end 自身是空操作。
 */
function useDirectorGizmoTransaction<TSnapshot>({ read, restore, commit, onActive }: { read: () => TSnapshot | null; restore: (snapshot: TSnapshot) => void; commit: (from: TSnapshot, to: TSnapshot) => void; onActive: (active: boolean, snapshot: TSnapshot | null) => void }) {
    const hooksRef = useRef({ read, restore, commit, onActive });
    useEffect(() => { hooksRef.current = { read, restore, commit, onActive }; }, [commit, onActive, read, restore]);

    const transaction = useMemo(() => createDirectorTransaction<TSnapshot>({
        read: () => hooksRef.current.read(),
        restore: (snapshot) => hooksRef.current.restore(snapshot),
        commit: (from, to) => hooksRef.current.commit(from, to),
        setActive: (active) => hooksRef.current.onActive(active, active ? hooksRef.current.read() : null),
        // stdlib 在 domElement.ownerDocument 上註冊 pointerup，其 pointerUp({button:0})
        // 會 dispatch mouseUp 後清 dragging=false / axis=null。因此用真實事件走它自己的
        // 收尾通道，而不是寫它的私有欄位（.d.ts 中 dragging/axis 均為 private）。
        terminateDrag: () => document.dispatchEvent(new PointerEvent("pointerup", { button: 0, bubbles: true })),
    }), []);

    useEffect(() => installDirectorTerminalListeners(transaction, {
        window,
        document,
        isHidden: () => document.visibilityState === "hidden",
    }), [transaction]);

    // 取消選中、刪除物件、切換模型或解除安裝都必須回到快照並釋放 transforming。
    useEffect(() => () => transaction.end("cancel"), [transaction]);

    return transaction;
}

function readObject3DTransform(target: Object3D): DirectorTransform {
    return { position: target.position.toArray() as DirectorVec3, rotation: [target.rotation.x, target.rotation.y, target.rotation.z], scale: target.scale.toArray() as DirectorVec3 };
}

function applyObject3DTransform(target: Object3D, transform: DirectorTransform) {
    target.position.set(...transform.position);
    target.rotation.set(...transform.rotation);
    target.scale.set(...transform.scale);
    target.updateMatrixWorld(true);
}

export function resolveDirectorActorVisualUrl(object: DirectorObject): string | null {
    return object.url || (object.kind === "actor" ? resolveDirectorBuiltInActorUrl(object.actorPreset) : null);
}

function DirectorObjectVisual({ object, selected, selectedBone, showBoneControls, playhead, onSelectBone, onBoneTransform, onActorRigReady, onLoadStateChange }: { object: DirectorObject; selected: boolean; selectedBone: string | null; showBoneControls: boolean; playhead: number; onSelectBone: (bone: string | null) => void; onBoneTransform: (bone: string, rotation: DirectorQuat) => void; onActorRigReady: (rig: DirectorRig, animations: AnimationClip[]) => void; onLoadStateChange: (id: string, signal: DirectorLoadSignal, retry: () => void) => void }) {
    const actorUrl = resolveDirectorActorVisualUrl(object);
    if (object.kind === "actor" && !actorUrl) return <DirectorProceduralActor object={object} selected={selected} selectedBone={selectedBone} showBoneControls={showBoneControls} onSelectBone={onSelectBone} onBoneTransform={onBoneTransform} preset={object.actorPreset ?? "standard_male"} />;
    if (object.kind === "actor" && actorUrl && !object.url) return <DirectorModel object={{ ...object, url: actorUrl }} selected={selected} selectedBone={selectedBone} showBoneControls={showBoneControls} playhead={playhead} onSelectBone={onSelectBone} onBoneTransform={onBoneTransform} onActorRigReady={onActorRigReady} onLoadStateChange={onLoadStateChange} />;
    if ((object.kind === "model" || object.kind === "actor" || object.primitive === "character") && (object.url || object.primitive === "character")) return <DirectorModel object={object} selected={selected} selectedBone={selectedBone} showBoneControls={showBoneControls} playhead={playhead} onSelectBone={onSelectBone} onBoneTransform={onBoneTransform} onActorRigReady={onActorRigReady} onLoadStateChange={onLoadStateChange} />;
    if (object.kind === "billboard" && object.url) return <DirectorBillboard object={object} selected={selected} />;
    const material = <meshStandardMaterial color={selected ? "#2f8cff" : object.color} roughness={0.68} metalness={0.05} />;
    return (
        <mesh castShadow={object.castShadow} receiveShadow={object.receiveShadow}>
            {object.primitive === "sphere" ? <sphereGeometry args={[0.6, 32, 24]} />
                : object.primitive === "cylinder" ? <cylinderGeometry args={[0.5, 0.5, 1.2, 32]} />
                    : object.primitive === "plane" ? <planeGeometry args={[1.6, 1]} />
                        : object.primitive === "torus" ? <torusGeometry args={[0.42, 0.16, 16, 36]} />
                            : object.primitive === "cone" ? <coneGeometry args={[0.55, 1.2, 32]} />
                                : object.primitive === "pyramid" ? <coneGeometry args={[0.65, 1.2, 4]} />
                                    : object.primitive === "empty" ? <octahedronGeometry args={[0.12, 0]} />
                                        : <boxGeometry args={[1, 1, 1]} />}
            {object.primitive === "empty" ? <meshBasicMaterial color={selected ? "#2f8cff" : object.color} wireframe transparent opacity={0.78} /> : material}
        </mesh>
    );
}

function DirectorModel({ object, selected, selectedBone, showBoneControls, playhead, onSelectBone, onBoneTransform, onActorRigReady, onLoadStateChange }: { object: DirectorObject; selected: boolean; selectedBone: string | null; showBoneControls: boolean; playhead: number; onSelectBone: (bone: string | null) => void; onBoneTransform: (bone: string, rotation: DirectorQuat) => void; onActorRigReady: (rig: DirectorRig, animations: AnimationClip[]) => void; onLoadStateChange: (id: string, signal: DirectorLoadSignal, retry: () => void) => void }) {
    const [load, dispatchLoad] = useReducer(reduceDirectorLoad, directorLoadInitial);
    const loadRef = useRef(load);
    loadRef.current = load;
    const loadGeneration = load.generation;
    const modelUrl = object.url || DIRECTOR_DEFAULT_ACTOR_URL;
    // 展示身份 = generation + 解析輸入。render 階段用它遮蔽舊資源，
    // 因此 prop/retry 變化的第一次 render 就已卸下上一代 model，隨後 cleanup 才 dispose。
    const identity = directorLoadIdentity({ generation: loadGeneration, url: modelUrl, storageKey: object.storageKey, kind: object.kind });
    type LoadedModel = { model: Object3D; rig: DirectorRig; animations: AnimationClip[]; restRotations: Partial<Record<DirectorHumanoidBone, DirectorQuat>> };
    const [loaded, setLoaded] = useState<{ identity: string; value: LoadedModel } | null>(null);
    const display = resolveDirectorDisplay(loaded, identity);
    const model = display?.model ?? null;
    const rig = display?.rig ?? null;
    const animations = display?.animations ?? emptyAnimations;
    const restRotations = display?.restRotations ?? emptyRestRotations;
    const setLoadPhase = useCallback((phase: "loading" | "ready" | "error") => {
        if (phase === "loading") dispatchLoad({ type: "start" });
        else dispatchLoad({ type: phase === "ready" ? "loaded" : "failed", generation: loadRef.current.generation });
    }, []);
    const mixerRef = useRef<AnimationMixer | null>(null);
    const ownedRef = useRef<{ model: Object3D | null; mixer: AnimationMixer | null }>({ model: null, mixer: null });
    const onActorRigReadyRef = useRef(onActorRigReady);
    const invalidate = useThree((state) => state.invalidate);
    // helper 只跟隨「當前 identity 下真正要展示的 model」，不會掛在已卸下的舊 model 上。
    const helper = useMemo(() => model ? new SkeletonHelper(model) : null, [model]);
    useEffect(() => () => disposeDirectorHelper(helper), [helper]);

    // 把 loading/error/ready 報到 DOM 層，Canvas 內部無法呈現可操作提示。
    // 依賴必須收斂到穩定原始值：object 每次場景編輯都是新引用，
    // 若掛在 [object] 上會讓下面的登出 effect 每次編輯都誤報 unmounted，
    // 失敗模型的重試入口會隨之消失。
    const objectId = object.id;
    const objectKind = directorDiagnosticObjectKind(object);
    const retryLoad = useCallback(() => {
        recordDirectorDiagnostic("DIRECTOR_MODEL_LOAD_RETRY", { objectId, objectKind, attempt: loadRef.current.generation, userInitiated: true });
        dispatchLoad({ type: "retry" });
    }, [objectId, objectKind]);
    const onLoadStateChangeRef = useRef(onLoadStateChange);
    useEffect(() => { onLoadStateChangeRef.current = onLoadStateChange; }, [onLoadStateChange]);
    useEffect(() => {
        onLoadStateChangeRef.current(object.id, load.phase, retryLoad);
    }, [load.phase, object.id, retryLoad]);

    // 解除安裝（刪除、隱藏分支、換 URL/kind、Canvas 重建）必須登出自己，避免通知殘留陳舊條目。
    // 單獨 effect 且只依賴 id：phase 變化不會反覆登出重登。
    useEffect(() => () => onLoadStateChangeRef.current(object.id, "unmounted", retryLoad), [object.id, retryLoad]);
    const selectedBoneObject = selectedBone && rig?.boneMap[selectedBone as DirectorHumanoidBone] ? model?.getObjectByName(rig.boneMap[selectedBone as DirectorHumanoidBone]!) : null;
    const motion = object.motionClips?.find((item) => item.id === object.activeMotionClipId);
    const activeAnimation = motion ? animations.find((item) => item.name === motion.sourceAnimation) : undefined;
    const handleModelPointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
        if (!selected || !rig) return;
        let nearestBone: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        Object.entries(rig.boneMap).forEach(([bone, name]) => {
            if (!name) return;
            const target = model?.getObjectByName(name);
            if (!target) return;
            const distance = event.ray.distanceSqToPoint(target.getWorldPosition(new Vector3()));
            if (distance <= 0.12 ** 2 && distance < nearestDistance) {
                nearestBone = bone;
                nearestDistance = distance;
            }
        });
        if (!nearestBone) return;
        // 模型表面可能先於關節控制球被射線命中，用最近骨骼保證點選仍可選中。
        event.stopPropagation();
        onSelectBone(nearestBone);
    }, [model, onSelectBone, rig, selected]);

    useEffect(() => { onActorRigReadyRef.current = onActorRigReady; }, [onActorRigReady]);

    useEffect(() => {
        const generation = loadRef.current.generation;
        let active = true;
        // render 階段已由 identity 遮蔽舊資源；這裡再清一次作為防禦，不作為安全性依據。
        setLoaded(null);
        setLoadPhase("loading");
        const failLoad = () => {
            if (!active || generation !== loadRef.current.generation) return;
            // 只記錄穩定碼與安全列舉：URL / storageKey / 原始 error 都不落日誌。
            recordDirectorDiagnostic("DIRECTOR_MODEL_LOAD_FAILED", { objectId: object.id, objectKind: directorDiagnosticObjectKind(object), attempt: generation });
            setLoadPhase("error");
        };
        const loader = new GLTFLoader();
        void resolveMediaUrl(object.storageKey, modelUrl)
            .then((url) => {
                // 解析完成時已失效：不再發起無意義的網路載入。
                if (!active || generation !== loadRef.current.generation) return;
                loader.load(
                    url,
                    (gltf) => {
                        const ownership = resolveDirectorLoadOwnership({ active, generation, currentGeneration: loadRef.current.generation });
                        if (!ownership.adopt) {
                            // 未被採納的晚到 source 必須釋放，否則孤兒洩漏。
                            if (ownership.disposeSource) disposeDirectorObject3D(gltf.scene);
                            return;
                        }
                        // 採納流程整體包裹：clone / normalize / rig 推斷 / 材質替換 / mixer /
                        // setLoaded / onActorRigReady 任一步拋錯都不得逃出，也不得留下半採納資源。
                        let clone: Object3D | null = null;
                        let mixer: AnimationMixer | null = null;
                        try {
                            // clone 與 source 共享 geometry/material/texture。
                            // 採納後 source 的 Object3D 層級可被 GC，共享 GPU 資源由 owned clone 持有，
                            // 最終只在 clone 的 cleanup 裡釋放一次；這裡絕不 dispose source。
                            clone = SkeletonUtils.clone(gltf.scene);
                            normalizeModel(clone, object.castShadow, object.receiveShadow);
                            if (object.kind === "actor" && object.url === DIRECTOR_QUATERNIUS_MALE_URL && object.actorPreset) {
                                reshapeDirectorQuaterniusActor(clone, object.actorPreset);
                            }
                            const nextRig = inferDirectorRig(
                                clone,
                                gltf.animations.map((clip) => clip.name),
                            );
                            if (object.kind === "actor" || object.primitive === "character") applyActorReferenceMaterial(clone, object.color);
                            mixer = new AnimationMixer(clone);
                            mixerRef.current = mixer;
                            ownedRef.current = { model: clone, mixer };
                            // 一次性寫入帶 identity 的展示記錄，避免 model/rig/animations 之間出現中間態。
                            setLoaded({
                                identity,
                                value: { model: clone, rig: nextRig, animations: gltf.animations, restRotations: readRigRestRotations(clone, nextRig) },
                            });
                            setLoadPhase("ready");
                            onActorRigReadyRef.current(nextRig, gltf.animations);
                        } catch {
                            // 只記錄穩定錯誤碼：原始 error / URL / 素材正文都不落日誌。
                            recordDirectorDiagnostic("DIRECTOR_MODEL_ADOPT_FAILED", { objectId: object.id, objectKind: directorDiagnosticObjectKind(object) });
                            // 先摘掉 owned 記錄，避免 effect cleanup 二次釋放同一批資源。
                            ownedRef.current = { model: null, mixer: null };
                            mixerRef.current = null;
                            setLoaded(null);
                            disposeDirectorAdoptionFailure({ clone, mixer, source: gltf.scene });
                            // 回到既有 error/retry/佔位人偶路徑。
                            failLoad();
                        }
                    },
                    undefined,
                    failLoad,
                );
            })
            // 地址解析失敗與 GLTFLoader onError 走同一條 error/retry 通道。
            .catch(failLoad);
        return () => {
            active = false;
            // 替換/重試/解除安裝：釋放本 generation 擁有的 clone 與 mixer（共享資源隨之恰好釋放一次）。
            const owned = ownedRef.current;
            ownedRef.current = { model: null, mixer: null };
            mixerRef.current = null;
            disposeDirectorModelResources({ model: owned.model, mixer: owned.mixer });
        };
    }, [identity, modelUrl, object.storageKey]);

    useEffect(() => {
        if (!model) return;
        model.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = object.castShadow;
            mesh.receiveShadow = object.receiveShadow;
        });
        invalidate();
    }, [invalidate, model, object.castShadow, object.receiveShadow]);

    useEffect(() => {
        if (!model || (object.kind !== "actor" && object.primitive !== "character")) return;
        updateActorReferenceColor(model, object.color);
        invalidate();
    }, [invalidate, model, object.color, object.kind]);

    useEffect(() => {
        if (!model || !mixerRef.current) return;
        const mixer = mixerRef.current;
        mixer.stopAllAction();
        if (!activeAnimation) return;
        mixer.clipAction(activeAnimation).setLoop(motion?.loop ? LoopRepeat : LoopOnce, motion?.loop ? Infinity : 1).play();
        return () => {
            mixer.stopAllAction();
        };
    }, [activeAnimation, model, motion?.loop]);

    useEffect(() => {
        if (!model || !mixerRef.current) return;
        if (activeAnimation && motion) {
            const localTime = Math.max(0, playhead - motion.start) * motion.playbackRate;
            const clipDuration = motion.duration || activeAnimation.duration;
            mixerRef.current.setTime(motion.loop && clipDuration > 0 ? localTime % clipDuration : localTime);
        }
        applyDirectorBoneTracks(model, object, playhead, rig, restRotations, Boolean(activeAnimation && motion));
        helper?.updateMatrixWorld(true);
        invalidate();
    }, [activeAnimation, helper, invalidate, model, motion, object.boneOverrides, object.boneTracks, object.pose, playhead, restRotations, rig]);

    useFrame(() => {
        if (selectedBoneObject && selected) selectedBoneObject.updateMatrixWorld(true);
    });

    if (!model) return <DirectorMannequin color={object.color} selected={selected} />;
    return <group onPointerDown={handleModelPointerDown}>
        <primitive object={model} />
        {selected && showBoneControls && helper ? <primitive object={helper} /> : null}
        {selected && showBoneControls && rig ? Object.entries(rig.boneMap).filter(([, name]) => Boolean(name)).map(([bone, name]) => {
            const fingerGroup = directorFingerGroup(bone);
            const selectedFingerGroup = directorFingerGroup(selectedBone);
            return <BoneController key={bone} bone={model.getObjectByName(name!)} selected={selectedBone === bone} dimmed={Boolean(fingerGroup && selectedFingerGroup && fingerGroup !== selectedFingerGroup)} onSelect={() => onSelectBone(bone)} />;
        }) : null}
        {selected && selectedBoneObject && selectedBone ? <DirectorBoneGizmo bone={selectedBoneObject} onCommit={(rotation) => onBoneTransform(selectedBone, rotation)} /> : null}
    </group>;
}

/** 骨骼 gizmo 與物件 gizmo 共用事務接線，取消時恢復骨骼 quaternion。 */
function DirectorBoneGizmo({ bone, onCommit }: { bone: Object3D; onCommit: (rotation: DirectorQuat) => void }) {
    const transaction = useDirectorGizmoTransaction<DirectorQuat>({
        read: () => bone.quaternion.toArray() as DirectorQuat,
        restore: (snapshot) => {
            bone.quaternion.fromArray(snapshot);
            bone.updateMatrixWorld(true);
        },
        commit: (_from, to) => onCommit(to),
        onActive: () => undefined,
    });
    return <TransformControls object={bone} mode="rotate" size={0.55} onMouseDown={() => transaction.begin()} onMouseUp={() => transaction.end("commit")} />;
}

const DIRECTOR_UPPER_TORSO_PROFILE = [[0.11, -0.25], [0.15, -0.2], [0.18, -0.11], [0.19, 0], [0.23, 0.1], [0.22, 0.19], [0.16, 0.26], [0.105, 0.29]] as const;
const DIRECTOR_WAIST_PROFILE = [[0.12, -0.17], [0.17, -0.12], [0.19, -0.04], [0.18, 0.07], [0.165, 0.15], [0.12, 0.18]] as const;
const DIRECTOR_PELVIS_PROFILE = [[0.08, -0.13], [0.14, -0.08], [0.18, -0.01], [0.19, 0.06], [0.15, 0.13]] as const;

function DirectorMannequin({ color, selected }: { color: string; selected: boolean }) {
    const resolvedColor = selected ? new Color(color).lerp(new Color("#78a9ff"), 0.18).getStyle() : color;
    const joints: DirectorVec3[] = [[0, 1.72, 0], [0, 1.48, 0], [-0.3, 1.4, 0], [0.3, 1.4, 0], [-0.32, 1.05, 0], [0.32, 1.05, 0], [-0.33, 0.72, 0], [0.33, 0.72, 0], [-0.13, 0.88, 0], [0.13, 0.88, 0], [-0.13, 0.46, 0], [0.13, 0.46, 0], [-0.13, 0.05, 0], [0.13, 0.05, 0]];
    const bones: Array<[DirectorVec3, DirectorVec3]> = [[joints[0], joints[1]], [joints[1], joints[2]], [joints[1], joints[3]], [joints[2], joints[4]], [joints[4], joints[6]], [joints[3], joints[5]], [joints[5], joints[7]], [joints[1], [0, 0.92, 0]], [[0, 0.92, 0], joints[8]], [[0, 0.92, 0], joints[9]], [joints[8], joints[10]], [joints[10], joints[12]], [joints[9], joints[11]], [joints[11], joints[13]]];
    return <group>
        {bones.map(([from, to], index) => <LoadingBone key={`bone-${index}`} from={from} to={to} color={resolvedColor} />)}
        {joints.map((position, index) => <mesh key={`joint-${index}`} position={position}><sphereGeometry args={[index === 0 ? 0.11 : 0.04, 12, 8]} /><meshBasicMaterial color={resolvedColor} transparent opacity={0.72} /></mesh>)}
    </group>;
}

/** Offline, filled humanoid driven by the same pose/bone-override values as imported rigs. */
function DirectorProceduralActor({ object, selected, selectedBone, showBoneControls, onSelectBone, onBoneTransform, preset }: { object: DirectorObject; selected: boolean; selectedBone: string | null; showBoneControls: boolean; onSelectBone: (bone: string | null) => void; onBoneTransform: (bone: string, rotation: DirectorQuat) => void; preset: NonNullable<DirectorObject["actorPreset"]> }) {
    const resolvedColor = selected ? new Color(object.color).lerp(new Color("#78a9ff"), 0.18).getStyle() : object.color;
    const [hoveredBone, setHoveredBone] = useState<string | null>(null);
    const [stagedBoneRotation, setStagedBoneRotation] = useState<{ bone: string; rotation: DirectorQuat } | null>(null);
    useEffect(() => setStagedBoneRotation(null), [object.id, object.pose, selectedBone]);
    const poseOverrides = useMemo(() => stagedBoneRotation && stagedBoneRotation.bone === selectedBone
        ? { ...(object.boneOverrides || {}), [stagedBoneRotation.bone]: stagedBoneRotation.rotation }
        : object.boneOverrides,
    [object.boneOverrides, selectedBone, stagedBoneRotation]);
    const shape = useMemo(() => resolveDirectorActorShape(preset), [preset]);
    const frame = useMemo(() => resolveDirectorProceduralActorPose(object.pose || "stand", poseOverrides, shape), [object.pose, poseOverrides, shape]);
    const lowPoly = preset === "geometric";
    const surfaceColor = useMemo(() => new Color(resolvedColor).multiplyScalar(0.92).getStyle(), [resolvedColor]);
    const highlightColor = useMemo(() => new Color(resolvedColor).lerp(new Color("#c5dafa"), 0.06).getStyle(), [resolvedColor]);
    const joints = frame.joints;
    const midpoint = (left: DirectorVec3, right: DirectorVec3): DirectorVec3 => left.map((value, index) => (value + right[index]) / 2) as DirectorVec3;
    const segments: Array<{ from: DirectorVec3; to: DirectorVec3; radius: number }> = [
        { from: joints.leftUpperArm, to: joints.leftLowerArm, radius: 0.075 }, { from: joints.leftLowerArm, to: joints.leftHand, radius: 0.06 },
        { from: joints.rightUpperArm, to: joints.rightLowerArm, radius: 0.075 }, { from: joints.rightLowerArm, to: joints.rightHand, radius: 0.06 },
        { from: joints.leftUpperLeg, to: joints.leftLowerLeg, radius: 0.112 }, { from: joints.leftLowerLeg, to: joints.leftFoot, radius: 0.085 },
        { from: joints.rightUpperLeg, to: joints.rightLowerLeg, radius: 0.112 }, { from: joints.rightLowerLeg, to: joints.rightFoot, radius: 0.085 },
    ];
    const interactiveBones: DirectorHumanoidBone[] = ["hips", "spine", "chest", "neck", "head", "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand", "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];
    return <group scale={shape.scale} onPointerDown={(event) => {
        // TransformControls listens on the canvas independently; stop the actor root's click
        // handler from clearing the selected bone before the rotation drag claims the pointer.
        if (selected && selectedBone) {
            event.stopPropagation();
            onSelectBone(selectedBone);
        }
    }}>
        <DirectorTorsoSection position={midpoint(joints.spine, joints.chest)} rotation={frame.worldRotations.chest} width={shape.shoulders} depth={shape.shoulders * 0.62} lowPoly={lowPoly} color={resolvedColor} profile={DIRECTOR_UPPER_TORSO_PROFILE} />
        <DirectorTorsoSection position={midpoint(joints.hips, joints.spine)} rotation={frame.worldRotations.spine} width={shape.waist} depth={shape.waist * 0.7} lowPoly={lowPoly} color={resolvedColor} profile={DIRECTOR_WAIST_PROFILE} />
        <DirectorTorsoSection position={joints.hips} rotation={frame.worldRotations.hips} width={shape.hips} depth={shape.hips * 0.78} lowPoly={lowPoly} color={resolvedColor} profile={DIRECTOR_PELVIS_PROFILE} />
        <mesh position={midpoint(joints.neck, joints.head)} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...joints.head).sub(new Vector3(...joints.neck)).normalize())} castShadow>
            <cylinderGeometry args={[0.062 * shape.head, 0.083 * shape.head, new Vector3(...joints.head).distanceTo(new Vector3(...joints.neck)), lowPoly ? 6 : shape.radialSegments]} />
            <meshStandardMaterial color={surfaceColor} roughness={0.84} flatShading={lowPoly} />
        </mesh>
        {(["leftShoulder", "rightShoulder"] as const).map((bone) => <mesh key={bone} position={joints[bone]} quaternion={new Quaternion(...frame.worldRotations[bone])} scale={[0.085 * shape.shoulders, 0.078 * shape.limbs, 0.087]} castShadow>
            <sphereGeometry args={[1, lowPoly ? 8 : shape.radialSegments, lowPoly ? 6 : 14]} /><meshStandardMaterial color={highlightColor} roughness={0.72} flatShading={lowPoly} />
        </mesh>)}
        <mesh position={joints.head} quaternion={new Quaternion(...frame.worldRotations.head)} scale={[0.112 * shape.head, 0.145 * shape.head, 0.102 * shape.head]} castShadow>
            <sphereGeometry args={[1, lowPoly ? 8 : 20, lowPoly ? 6 : 16]} /><meshStandardMaterial color={resolvedColor} roughness={0.78} flatShading={lowPoly} />
        </mesh>
        {!lowPoly ? <mesh position={new Vector3(...joints.head).add(new Vector3(0, -0.066 * shape.head, 0.025 * shape.head).applyQuaternion(new Quaternion(...frame.worldRotations.head)))} quaternion={new Quaternion(...frame.worldRotations.head)} scale={[0.079 * shape.head, 0.072 * shape.head, 0.076 * shape.head]} castShadow>
            <sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={resolvedColor} roughness={0.82} />
        </mesh> : null}
        {([-1, 1] as const).map((side) => <mesh key={`ear-${side}`} position={new Vector3(...joints.head).add(new Vector3(side * 0.105 * shape.head, -0.005 * shape.head, 0).applyQuaternion(new Quaternion(...frame.worldRotations.head)))} quaternion={new Quaternion(...frame.worldRotations.head)} scale={[0.021 * shape.head, 0.039 * shape.head, 0.027 * shape.head]} castShadow>
            <sphereGeometry args={[1, lowPoly ? 6 : 12, lowPoly ? 4 : 8]} /><meshStandardMaterial color={surfaceColor} roughness={0.84} flatShading={lowPoly} />
        </mesh>)}
        {!lowPoly ? ([-1, 1] as const).map((side) => <group key={`face-${side}`}>
            <mesh position={new Vector3(...joints.head).add(new Vector3(side * 0.039 * shape.head, 0.024 * shape.head, 0.094 * shape.head).applyQuaternion(new Quaternion(...frame.worldRotations.head)))} scale={[0.009 * shape.head, 0.006 * shape.head, 0.006 * shape.head]}>
                <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={surfaceColor} roughness={0.9} />
            </mesh>
            <mesh position={new Vector3(...joints.head).add(new Vector3(side * 0.041 * shape.head, 0.043 * shape.head, 0.087 * shape.head).applyQuaternion(new Quaternion(...frame.worldRotations.head)))} quaternion={new Quaternion(...frame.worldRotations.head)} scale={[0.035 * shape.head, 0.008 * shape.head, 0.009 * shape.head]}>
                <sphereGeometry args={[1, 10, 6]} /><meshStandardMaterial color={surfaceColor} roughness={0.9} />
            </mesh>
        </group>) : null}
        <mesh position={new Vector3(...joints.head).add(new Vector3(0, -0.008 * shape.head, 0.103 * shape.head).applyQuaternion(new Quaternion(...frame.worldRotations.head)))} quaternion={new Quaternion(...frame.worldRotations.head)} scale={[0.014 * shape.head, 0.021 * shape.head, 0.022 * shape.head]}>
            <sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color={resolvedColor} roughness={0.78} flatShading={lowPoly} />
        </mesh>
        {segments.map((segment, index) => <SolidActorLimb key={index} {...segment} radius={segment.radius * shape.limbs} color={resolvedColor} radialSegments={lowPoly ? 6 : shape.radialSegments} />)}
        {(["leftLowerArm", "rightLowerArm", "leftLowerLeg", "rightLowerLeg"] as const).map((bone) => <mesh key={`joint-${bone}`} position={joints[bone]} scale={bone.includes("Leg") ? [0.078 * shape.limbs, 0.054 * shape.limbs, 0.075 * shape.limbs] : [0.055 * shape.limbs, 0.048 * shape.limbs, 0.057 * shape.limbs]} castShadow>
            <sphereGeometry args={[1, lowPoly ? 6 : shape.radialSegments, lowPoly ? 4 : 12]} /><meshStandardMaterial color={surfaceColor} roughness={0.84} flatShading={lowPoly} />
        </mesh>)}
        {(["leftHand", "rightHand"] as const).map((bone) => {
            const side = bone === "leftHand" ? -1 : 1;
            const rotation = new Quaternion(...frame.worldRotations[bone]);
            return <group key={bone} position={joints[bone]} quaternion={rotation}>
                <mesh scale={[0.05 * shape.limbs, 0.074 * shape.limbs, 0.038 * shape.limbs]} castShadow>
                    <sphereGeometry args={[1, lowPoly ? 6 : 14, lowPoly ? 4 : 10]} /><meshStandardMaterial color={resolvedColor} roughness={0.82} flatShading={lowPoly} />
                </mesh>
                <mesh position={[side * 0.045 * shape.limbs, 0.007, 0.02]} rotation={[0, 0, side * 0.28]} scale={[0.02 * shape.limbs, 0.043 * shape.limbs, 0.023 * shape.limbs]} castShadow>
                    <sphereGeometry args={[1, lowPoly ? 6 : 12, lowPoly ? 4 : 8]} /><meshStandardMaterial color={resolvedColor} roughness={0.82} flatShading={lowPoly} />
                </mesh>
            </group>;
        })}
        {(["leftFoot", "rightFoot"] as const).map((bone) => {
            const footForward = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...frame.worldRotations[bone]));
            const footPosition = new Vector3(...joints[bone]).add(footForward.multiplyScalar(0.045));
            return <mesh key={bone} position={footPosition} quaternion={new Quaternion(...frame.worldRotations[bone])} scale={[0.075 * shape.stance, 0.05, 0.13 * shape.footLength]} castShadow>
                <sphereGeometry args={[1, lowPoly ? 6 : shape.radialSegments, lowPoly ? 4 : Math.max(8, shape.radialSegments - 4)]} /><meshStandardMaterial color={resolvedColor} roughness={0.84} flatShading={lowPoly} />
            </mesh>;
        })}
        {selected && selectedBone ? DIRECTOR_PROCEDURAL_ACTOR_SKELETON_EDGES.filter(([from, to]) => from === selectedBone || to === selectedBone).map(([from, to]) => <Line key={`skeleton-${from}-${to}`} points={[joints[from], joints[to]]} color="#78a9ff" lineWidth={0.8} transparent opacity={0.24} depthTest={false} raycast={() => null} />) : null}
        {selected && showBoneControls ? interactiveBones.map((bone) => <mesh key={`joint-${bone}`} position={joints[bone]} onPointerOver={(event) => { event.stopPropagation(); setHoveredBone(bone); }} onPointerOut={(event) => { event.stopPropagation(); setHoveredBone((current) => current === bone ? null : current); }} onPointerDown={(event) => { event.stopPropagation(); onSelectBone(bone); }} frustumCulled={false}>
            <sphereGeometry args={[selectedBone === bone ? 0.055 : hoveredBone === bone ? 0.045 : 0.022, 10, 8]} />
            <meshBasicMaterial color={selectedBone === bone ? "#f0b36a" : "#78a9ff"} depthTest={false} transparent opacity={selectedBone === bone ? 0.95 : hoveredBone === bone ? 0.8 : 0.08} />
        </mesh>) : null}
        {selected && selectedBone && selectedBone in joints ? <DirectorProceduralBoneGizmo
            bone={selectedBone as DirectorHumanoidBone}
            position={joints[selectedBone as DirectorHumanoidBone]}
            rotation={frame.rotations[selectedBone as DirectorHumanoidBone]}
            onPreview={(rotation) => setStagedBoneRotation({ bone: selectedBone, rotation })}
            onCommit={(rotation) => onBoneTransform(selectedBone, rotation)}
        /> : null}
    </group>;
}

/** A tapered radial profile reads as shoulders/waist instead of the stack of round balls it replaces. */
function DirectorTorsoSection({ position, rotation, profile, width, depth, lowPoly, color }: { position: DirectorVec3; rotation: DirectorQuat; profile: ReadonlyArray<readonly [number, number]>; width: number; depth: number; lowPoly: boolean; color: string }) {
    const points = useMemo(() => profile.map(([radius, height]) => new Vector2(radius * width, height)), [profile, width]);
    return <mesh position={position} quaternion={new Quaternion(...rotation)} scale={[1, 1, depth / Math.max(width, 0.01)]} castShadow>
        <latheGeometry args={[points, lowPoly ? 8 : 20]} />
        <meshStandardMaterial color={color} roughness={0.78} flatShading={lowPoly} />
    </mesh>;
}

/** Rotation gizmo for the offline mannequin. Dragging previews through React state; the shared gesture transaction commits or restores once. */
function DirectorProceduralBoneGizmo({ bone, position, rotation, onPreview, onCommit }: { bone: DirectorHumanoidBone; position: DirectorVec3; rotation: DirectorQuat; onPreview: (rotation: DirectorQuat) => void; onCommit: (rotation: DirectorQuat) => void }) {
    const target = useMemo(() => new Object3D(), []);
    const draggingRef = useRef(false);
    useLayoutEffect(() => {
        target.position.fromArray(position);
        if (!draggingRef.current) target.quaternion.fromArray(rotation);
        target.updateMatrixWorld(true);
    }, [position, rotation, target]);
    const transaction = useDirectorGizmoTransaction<DirectorQuat>({
        read: () => target.quaternion.toArray() as DirectorQuat,
        restore: (snapshot) => {
            target.quaternion.fromArray(snapshot);
            target.updateMatrixWorld(true);
            onPreview(snapshot);
        },
        commit: (_from, to) => onCommit(to),
        onActive: (active, snapshot) => {
            draggingRef.current = active;
            if (active && snapshot) onPreview(snapshot);
        },
    });
    return <>
        <primitive object={target} />
        <TransformControls
            object={target}
            mode="rotate"
            size={0.55}
            onMouseDown={() => transaction.begin()}
            onObjectChange={() => onPreview(target.quaternion.toArray() as DirectorQuat)}
            onMouseUp={() => transaction.end("commit")}
        />
    </>;
}

function SolidActorLimb({ from, to, radius, color, radialSegments = 12 }: { from: DirectorVec3; to: DirectorVec3; radius: number; color: string; radialSegments?: number }) {
    const start = useMemo(() => new Vector3(...from), [from]);
    const end = useMemo(() => new Vector3(...to), [to]);
    const direction = useMemo(() => end.clone().sub(start), [end, start]);
    const midpoint = useMemo(() => start.clone().add(end).multiplyScalar(0.5), [end, start]);
    const rotation = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), [direction]);
    const capsule = useMemo(() => resolveDirectorCapsuleShape(direction.length(), radius), [direction, radius]);
    const length = Math.max(0.01, direction.length());
    const profile = useMemo(() => [
        new Vector2(0, -length / 2),
        new Vector2(capsule.radius * 0.82, -length / 2),
        new Vector2(capsule.radius * 1.08, -length * 0.27),
        new Vector2(capsule.radius, 0),
        new Vector2(capsule.radius * 0.79, length * 0.32),
        new Vector2(capsule.radius * 0.67, length / 2),
        new Vector2(0, length / 2),
    ], [capsule.radius, length]);
    return <mesh position={midpoint} quaternion={rotation} castShadow>
        <latheGeometry args={[profile, radialSegments]} />
        <meshStandardMaterial color={color} roughness={0.84} flatShading={radialSegments < 12} />
    </mesh>;
}

function LoadingBone({ from, to, color }: { from: DirectorVec3; to: DirectorVec3; color: string }) {
    const start = useMemo(() => new Vector3(...from), [from]);
    const end = useMemo(() => new Vector3(...to), [to]);
    const direction = useMemo(() => end.clone().sub(start), [end, start]);
    const midpoint = useMemo(() => start.clone().add(end).multiplyScalar(0.5), [end, start]);
    const rotation = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()), [direction]);
    return <mesh position={midpoint} quaternion={rotation}><cylinderGeometry args={[0.025, 0.025, direction.length(), 8]} /><meshBasicMaterial color={color} transparent opacity={0.62} /></mesh>;
}

function BoneController({ bone, selected, dimmed, onSelect }: { bone: Object3D | undefined; selected: boolean; dimmed: boolean; onSelect: () => void }) {
    const ref = useRef<Group>(null);
    const visibleRef = useRef<Mesh>(null);
    const hitRef = useRef<Mesh>(null);
    const world = useMemo(() => new Vector3(), []);
    const local = useMemo(() => new Vector3(), []);
    const cameraWorld = useMemo(() => new Vector3(), []);
    const { camera, size } = useThree();
    useFrame(() => {
        if (!bone || !ref.current) return;
        const parent = ref.current.parent;
        if (!parent) return;
        // 控制點與模型根節點是兄弟關係，必須轉換到控制點父級座標，否則點選區域會與骨骼錯位。
        bone.getWorldPosition(world);
        camera.getWorldPosition(cameraWorld);
        local.copy(world);
        parent.worldToLocal(local);
        ref.current.position.copy(local);
        const distance = cameraWorld.distanceTo(world);
        const visualPixels = selected ? 5 : dimmed ? 2.5 : 3.5;
        const hitPixels = selected ? 12 : 10;
        visibleRef.current?.scale.setScalar(screenPixelsToWorldRadius(camera, distance, visualPixels, size.height));
        hitRef.current?.scale.setScalar(screenPixelsToWorldRadius(camera, distance, hitPixels, size.height));
    });
    if (!bone) return null;
    const handlePointerDown = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onSelect(); };
    return <group ref={ref}>
        <mesh ref={visibleRef} onPointerDown={handlePointerDown} frustumCulled={false}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshBasicMaterial color={selected ? "#f0b36a" : "#78a9ff"} depthTest={false} transparent opacity={selected ? 1 : dimmed ? 0.14 : 0.68} />
        </mesh>
        {/* 可視點保持小尺寸，透明球只負責提供穩定的點選面積。 */}
        <mesh ref={hitRef} onPointerDown={handlePointerDown} frustumCulled={false}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} />
        </mesh>
    </group>;
}

function screenPixelsToWorldRadius(camera: Camera, distance: number, pixels: number, viewportHeight: number) {
    const height = Math.max(1, viewportHeight);
    if (camera instanceof PerspectiveCamera) return (pixels * 2 * Math.max(0.01, distance) * Math.tan((camera.fov * Math.PI) / 360)) / (height * Math.max(0.01, camera.zoom));
    if (camera instanceof OrthographicCamera) return (pixels * (camera.top - camera.bottom)) / (height * Math.max(0.01, camera.zoom));
    return pixels * 0.001;
}

function directorFingerGroup(bone: string | null) {
    const match = bone?.match(/^(left|right)(Thumb|Index|Middle|Ring|Pinky)\d$/);
    return match ? `${match[1]}${match[2]}` : null;
}

function normalizeModel(root: Object3D, castShadow: boolean, receiveShadow: boolean) {
    root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(root, true);
    const size = bounds.getSize(new Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.001);
    root.scale.multiplyScalar(2 / maxSize);
    root.updateMatrixWorld(true);
    const centered = new Box3().setFromObject(root, true);
    const center = centered.getCenter(new Vector3());
    root.position.sub(center);
    root.position.y -= centered.min.y - center.y;
    root.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
    });
}

function applyActorReferenceMaterial(root: Object3D, color: string) {
    const material = new MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.02 });
    const replaced: Material[] = [];
    root.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        // 被頂掉的原材質不再被任何 mesh 引用，必須釋放，否則每次載入都洩漏一份。
        if (mesh.material) replaced.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
        mesh.material = material;
        mesh.userData.directorActor = true;
        mesh.userData.directorActorMaterial = material;
    });
    disposeDirectorMaterials(replaced.filter((item) => item !== material));
}

function updateActorReferenceColor(root: Object3D, color: string) {
    root.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh || !mesh.userData.directorActor) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
            if (material instanceof MeshStandardMaterial) material.color.set(color);
        });
    });
}

function readRigRestRotations(root: Object3D, rig: DirectorRig) {
    return Object.fromEntries(Object.entries(rig.boneMap).flatMap(([bone, name]) => {
        const target = name ? root.getObjectByName(name) : null;
        return target ? [[bone, target.quaternion.toArray() as DirectorQuat]] : [];
    })) as Partial<Record<DirectorHumanoidBone, DirectorQuat>>;
}

export function inferDirectorRig(root: Object3D, animationNames: string[]): DirectorRig {
    const names = new Map<string, string>();
    root.traverse((child) => { if (child instanceof Bone) names.set(normalizeBoneName(child.name), child.name); });
    const fingerPatterns = (side: "left" | "right", finger: "thumb" | "index" | "middle" | "ring" | "pinky", segment: 1 | 2 | 3) => [
        new RegExp(`^mixamorig${side}hand${finger}${segment}$`),
        new RegExp(`^${side}hand${finger}${segment}$`),
        new RegExp(`^${side}${finger}${segment}$`),
        new RegExp(`^${finger}0?${segment}${side === "left" ? "l" : "r"}$`),
    ];
    const patterns: Record<DirectorHumanoidBone, RegExp[]> = {
        root: [/^root$/, /armature/], hips: [/hips|pelvis/, /mixamorig.*hip/], spine: [/spine0?1?$|lowerback/], chest: [/spine0?2|chest|upperback/], neck: [/neck/], head: [/head/],
        leftShoulder: [/leftshoulder|shoulderl|mixamorigleftshoulder/], leftUpperArm: [/leftupperarm|leftarm|upperarml|mixamorigleftarm/], leftLowerArm: [/leftforearm|leftlowerarm|forearml|lowerarml|mixamorigleftforearm/], leftHand: [/^lefthand$/, /^handl$/, /^mixamoriglefthand$/],
        leftThumb1: fingerPatterns("left", "thumb", 1), leftThumb2: fingerPatterns("left", "thumb", 2), leftThumb3: fingerPatterns("left", "thumb", 3),
        leftIndex1: fingerPatterns("left", "index", 1), leftIndex2: fingerPatterns("left", "index", 2), leftIndex3: fingerPatterns("left", "index", 3),
        leftMiddle1: fingerPatterns("left", "middle", 1), leftMiddle2: fingerPatterns("left", "middle", 2), leftMiddle3: fingerPatterns("left", "middle", 3),
        leftRing1: fingerPatterns("left", "ring", 1), leftRing2: fingerPatterns("left", "ring", 2), leftRing3: fingerPatterns("left", "ring", 3),
        leftPinky1: fingerPatterns("left", "pinky", 1), leftPinky2: fingerPatterns("left", "pinky", 2), leftPinky3: fingerPatterns("left", "pinky", 3),
        rightShoulder: [/rightshoulder|shoulderr|mixamorigrightshoulder/], rightUpperArm: [/rightupperarm|rightarm|upperarmr|mixamorigrightarm/], rightLowerArm: [/rightforearm|rightlowerarm|forearmr|lowerarmr|mixamorigrightforearm/], rightHand: [/^righthand$/, /^handr$/, /^mixamorigrighthand$/],
        rightThumb1: fingerPatterns("right", "thumb", 1), rightThumb2: fingerPatterns("right", "thumb", 2), rightThumb3: fingerPatterns("right", "thumb", 3),
        rightIndex1: fingerPatterns("right", "index", 1), rightIndex2: fingerPatterns("right", "index", 2), rightIndex3: fingerPatterns("right", "index", 3),
        rightMiddle1: fingerPatterns("right", "middle", 1), rightMiddle2: fingerPatterns("right", "middle", 2), rightMiddle3: fingerPatterns("right", "middle", 3),
        rightRing1: fingerPatterns("right", "ring", 1), rightRing2: fingerPatterns("right", "ring", 2), rightRing3: fingerPatterns("right", "ring", 3),
        rightPinky1: fingerPatterns("right", "pinky", 1), rightPinky2: fingerPatterns("right", "pinky", 2), rightPinky3: fingerPatterns("right", "pinky", 3),
        leftUpperLeg: [/leftupleg|leftthigh|thighl|mixamorigleftupleg/], leftLowerLeg: [/leftleg|leftcalf|calfl|mixamorigleftleg/], leftFoot: [/leftfoot|footl|mixamorigleftfoot/], rightUpperLeg: [/rightupleg|rightthigh|thighr|mixamorigrightupleg/], rightLowerLeg: [/rightleg|rightcalf|calfr|mixamorigrightleg/], rightFoot: [/rightfoot|footr|mixamorigrightfoot/],
    };
    const boneMap = Object.fromEntries(Object.entries(patterns).map(([bone, candidates]) => [bone, candidates.map((pattern) => [...names.entries()].find(([normalized]) => pattern.test(normalized))?.[1]).find(Boolean)]).filter(([, name]) => Boolean(name))) as DirectorRig["boneMap"];
    return { status: Object.keys(boneMap).length >= 8 ? "ready" : "unmapped", boneMap, animationNames };
}

function normalizeBoneName(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveDirectorActorPoseDeltas(object: DirectorObject): Partial<Record<DirectorHumanoidBone, DirectorQuat>> {
    const deltas = directorPoseBoneDeltas(object.pose || "stand");
    if ((object.url !== DIRECTOR_QUATERNIUS_MALE_URL && object.url !== DIRECTOR_QUATERNIUS_FEMALE_URL) || !deltas.leftUpperArm) return deltas;
    // Quaternius mirrors the left upper-arm local axis; the existing Soldier rig does not.
    return { ...deltas, leftUpperArm: new Quaternion(...deltas.leftUpperArm).invert().toArray() as DirectorQuat };
}

function applyDirectorBoneTracks(model: Object3D, object: DirectorObject, playhead: number, rig: DirectorRig | null, restRotations: Partial<Record<DirectorHumanoidBone, DirectorQuat>>, hasActiveMotion: boolean) {
    if (!rig) return;
    const poseDeltas = hasActiveMotion ? {} : resolveDirectorActorPoseDeltas(object);
    Object.entries(rig.boneMap).forEach(([bone, name]) => {
        const target = name ? model.getObjectByName(name) : null;
        if (!target) return;
        const humanoidBone = bone as DirectorHumanoidBone;
        // hasActiveMotion 時 mixer 已寫入 target.quaternion，直接作為動作層輸入。
        const rotation = resolveDirectorBoneRotation({
            motion: hasActiveMotion ? target.quaternion.toArray() as DirectorQuat : null,
            rest: hasActiveMotion ? null : restRotations[humanoidBone] || null,
            poseDelta: hasActiveMotion ? null : poseDeltas[humanoidBone] || null,
            override: object.boneOverrides?.[humanoidBone] || null,
            keyframes: object.boneTracks?.find((item) => item.bone === bone)?.keyframes || null,
            time: playhead,
        });
        if (rotation) {
            target.quaternion.copy(new Quaternion(...rotation));
            return;
        }
        if (hasActiveMotion) return;
        const rest = restRotations[humanoidBone];
        if (rest) target.quaternion.copy(new Quaternion(...rest));
        const delta = poseDeltas[humanoidBone];
        if (delta) target.quaternion.multiply(new Quaternion(...delta));
    });
}

function DirectorBillboard({ object, selected }: { object: DirectorObject; selected: boolean }) {
    // 展示狀態帶 url 身份：只有與當前 object.url 匹配才交給 material，
    // 這樣換 URL 的第一次 render 就卸下舊紋理，隨後 cleanup 才 dispose。
    const [loaded, setLoaded] = useState<{ identity: string; value: Texture } | null>(null);
    const identity = object.url || "";
    const texture = resolveDirectorDisplay(loaded, identity);
    useEffect(() => {
        let active = true;
        let owned: Texture | null = null;
        setLoaded(null);
        new TextureLoader().load(object.url!, (next) => {
            // 晚到的回撥：本元件已換 URL 或解除安裝，直接釋放這張紋理。
            if (!active) {
                next.dispose();
                return;
            }
            owned = next;
            setLoaded({ identity, value: next });
        }, undefined, () => active && setLoaded(null));
        return () => {
            active = false;
            owned?.dispose();
            owned = null;
        };
    }, [identity, object.url]);
    return (
        <mesh castShadow={object.castShadow}>
            <planeGeometry args={[1.6, 1]} />
            <meshBasicMaterial map={texture || undefined} color={texture ? "#ffffff" : selected ? "#2f8cff" : object.color} toneMapped={false} />
        </mesh>
    );
}

function DirectorLightView({ light }: { light: DirectorLight }) {
    const position = light.transform.position;
    if (light.type === "ambient") return <ambientLight color={light.color} intensity={light.intensity} />;
    if (light.type === "point") return <pointLight position={position} color={light.color} intensity={light.intensity} castShadow={light.castShadow} />;
    if (light.type === "spot") return <spotLight position={position} color={light.color} intensity={light.intensity} angle={light.angle} penumbra={light.penumbra} castShadow={light.castShadow} />;
    return <directionalLight position={position} color={light.color} intensity={light.intensity} castShadow={light.castShadow} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />;
}

async function captureFrame(context: CaptureContext | null, mode: DirectorRenderMode, aspectRatio: DirectorAspectRatio) {
    if (!context) throw new Error("3D 視口尚未就緒");
    const { gl, scene, camera } = context;
    const resumeDisplayMaterialOverride = context.suspendDisplayMaterialOverride();
    const previous = scene.overrideMaterial;
    const override = mode === "depth" ? new MeshDepthMaterial() : mode === "normal" ? new MeshNormalMaterial() : mode === "pose" ? new MeshBasicMaterial({ color: "#ffffff", wireframe: true }) : null;
    const restoreClayMaterials = mode === "clay" ? applyClaySceneMaterials(scene) : null;
    const resumeEditorOverlays = suspendDirectorEditorOverlays(scene);
    const resumePanoramaSphere = mode === "beauty" ? null : suspendDirectorPanoramaSphere(scene);
    try {
        scene.overrideMaterial = override;
        gl.render(scene, camera);
        return await canvasToBlob(cropDirectorCanvas(gl.domElement, aspectRatio));
    } finally {
        scene.overrideMaterial = previous;
        restoreClayMaterials?.();
        override?.dispose();
        resumeDisplayMaterialOverride();
        resumeEditorOverlays();
        resumePanoramaSphere?.();
        gl.render(scene, camera);
    }
}

/**
 * 攝像機檢查器縮略預覽：在現有 renderer 的小型離屏 target 渲染，不建立第二個 WebGL context，
 * 且在同步讀回畫素後立刻恢復主視口 target / viewport / overlay 狀態，避免汙染使用者當前取景。
 */
function captureCameraPreviewFrame(context: CaptureContext | null, directorScene: DirectorScene, playhead: number, width = 384, height = 216) {
    if (!context) throw new Error("3D 視口尚未就緒");
    const framing = resolveDirectorViewFraming({ scene: directorScene, mode: "camera", playhead });
    if (!framing) throw new Error("當前場景沒有可用機位");

    const { gl, scene, camera: activeCamera } = context;
    const target = new WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
    target.texture.colorSpace = SRGBColorSpace;
    const previewCamera = new PerspectiveCamera(framing.fov, width / height, framing.near, framing.far);
    previewCamera.position.fromArray(framing.position);
    previewCamera.up.fromArray(framing.up);
    previewCamera.lookAt(...framing.target);
    previewCamera.updateProjectionMatrix();
    previewCamera.updateMatrixWorld(true);

    const previousTarget = gl.getRenderTarget();
    const previousViewport = gl.getViewport(new Vector4());
    const previousScissor = gl.getScissor(new Vector4());
    const previousScissorTest = gl.getScissorTest();
    const previousClearColor = gl.getClearColor(new Color()).clone();
    const previousClearAlpha = gl.getClearAlpha();
    const resumeDisplayMaterialOverride = context.suspendDisplayMaterialOverride();
    const resumeEditorOverlays = suspendDirectorEditorOverlays(scene);
    const pixels = new Uint8Array(width * height * 4);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    try {
        gl.setRenderTarget(target);
        gl.setViewport(0, 0, width, height);
        gl.setScissorTest(false);
        gl.setClearColor("#060608", 1);
        gl.clear(true, true, true);
        gl.render(scene, previewCamera);
        gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);

        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) throw new Error("無法初始化攝影機預覽畫布");
        const imageData = canvasContext.createImageData(width, height);
        for (let row = 0; row < height; row += 1) {
            const sourceStart = (height - row - 1) * width * 4;
            const targetStart = row * width * 4;
            imageData.data.set(pixels.subarray(sourceStart, sourceStart + width * 4), targetStart);
        }
        canvasContext.putImageData(imageData, 0, 0);
    } finally {
        gl.setRenderTarget(previousTarget);
        gl.setViewport(previousViewport);
        gl.setScissor(previousScissor);
        gl.setScissorTest(previousScissorTest);
        gl.setClearColor(previousClearColor, previousClearAlpha);
        target.dispose();
        resumeDisplayMaterialOverride();
        resumeEditorOverlays();
        gl.render(scene, activeCamera);
    }

    return canvasToBlob(canvas);
}

async function recordCanvas(context: CaptureContext | null, duration: number, fps: number, aspectRatio: DirectorAspectRatio) {
    if (!context) throw new Error("3D 視口尚未就緒");
    if (!context.gl.domElement.captureStream || typeof MediaRecorder === "undefined") throw new Error("當前瀏覽器不支援影片錄製，請匯出幀序列");
    const resumeDisplayMaterialOverride = context.suspendDisplayMaterialOverride();
    const previousMaterial = context.scene.overrideMaterial;
    const restoreClayMaterials = applyClaySceneMaterials(context.scene);
    let cropFrame = 0;
    let stream: MediaStream | null = null;
    let stopTimer: number | null = null;
    let onRenderError: (() => void) | null = null;
    const resumeEditorOverlays = suspendDirectorEditorOverlays(context.scene);
    const resumePanoramaSphere = suspendDirectorPanoramaSphere(context.scene);
    try {
        context.scene.overrideMaterial = null;
        context.gl.render(context.scene, context.camera);
        const sourceCanvas = context.gl.domElement;
        const outputCanvas = aspectRatio === "adaptive" ? sourceCanvas : cropDirectorCanvas(sourceCanvas, aspectRatio);
        const crop = aspectRatio === "adaptive" ? null : resolveDirectorPixelCrop(sourceCanvas.width, sourceCanvas.height, aspectRatio, { width: sourceCanvas.clientWidth, height: sourceCanvas.clientHeight });
        const outputContext = crop ? outputCanvas.getContext("2d") : null;
        if (crop && outputContext) {
            const draw = () => {
                outputContext.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, outputCanvas.width, outputCanvas.height);
                cropFrame = window.requestAnimationFrame(draw);
            };
            cropFrame = window.requestAnimationFrame(draw);
        }
        stream = outputCanvas.captureStream(fps);
        const mimeType = selectDirectorRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        // captureStream 依賴渲染迴圈持續產出新幀；異常立即停止，避免靜默回寫殘缺影片。
        let renderError: Error | null = null;
        onRenderError = () => {
            renderError ??= new Error("白膜影片錄製期間發生渲染錯誤，請重試");
            if (recorder.state !== "inactive") recorder.stop();
        };
        window.addEventListener("error", onRenderError);
        const result = new Promise<Blob>((resolve, reject) => {
            recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
            recorder.onerror = () => reject(new Error("白膜影片錄製失敗"));
            recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
        });
        recorder.start(250);
        const recordingStartedAt = performance.now();
        stopTimer = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, Math.max(250, duration * 1000 + 120));
        const rawBlob = await result;
        if (renderError) throw renderError;
        // Chrome's MediaRecorder WebM omits Duration; without it downloaded clips cannot seek reliably.
        const blob = rawBlob.type.includes("webm")
            ? await import("@fix-webm-duration/fix").then(({ fixWebmDuration }) => fixWebmDuration(rawBlob, Math.max(1, performance.now() - recordingStartedAt), { logger: false }))
            : rawBlob;
        const recorded = await probeRecordedDuration(blob);
        if (!Number.isFinite(recorded) || recorded < Math.max(0.25, duration * 0.5)) throw new Error("白膜影片時長異常，錄製可能不完整，請重試");
        return blob;
    } finally {
        if (stopTimer !== null) window.clearTimeout(stopTimer);
        if (cropFrame) window.cancelAnimationFrame(cropFrame);
        if (onRenderError) window.removeEventListener("error", onRenderError);
        stream?.getTracks().forEach((track) => track.stop());
        restoreClayMaterials();
        context.scene.overrideMaterial = previousMaterial;
        resumeDisplayMaterialOverride();
        resumeEditorOverlays();
        resumePanoramaSphere();
        context.gl.render(context.scene, context.camera);
    }
}

async function probeRecordedDuration(blob: Blob) {
    // Some WebM files expose metadata yet fail to decode in desktop WebKit.
    // Only commit a clip after the first actual frame is available.
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    try {
        const decoded = waitForDirectorDecodedFrame(video);
        video.src = url;
        video.load();
        await decoded;
        if (video.duration !== Infinity) return video.duration;
        await new Promise<void>((resolve) => {
            const finish = () => { video.removeEventListener("seeked", finish); resolve(); };
            video.addEventListener("seeked", finish);
            video.currentTime = 1e6;
            window.setTimeout(finish, 1000);
        });
        return video.duration;
    } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
    }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("3D 預覽圖匯出失敗"))), "image/png"));
}
