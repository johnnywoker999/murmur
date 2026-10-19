import { ChevronDown, ChevronRight, ChevronUp, KeyRound, Magnet, Pause, Play, Plus, Rows3, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { DIRECTOR_KEYFRAME_EPSILON, directorBoneLabel, interpolateDirectorTransform } from "@/lib/canvas/director/director-scene";
import { resolveDirectorCameraTrackValues, resolveDirectorCameraTransform } from "@/lib/canvas/director/director-view-modes";
import type { DirectorCameraDrawPathKind, DirectorCameraPathKind } from "@/lib/canvas/director/director-camera-paths";
import { releaseDirectorFocusAfterPointer } from "@/lib/canvas/director/director-shortcuts";
import type { DirectorCamera, DirectorKeyframeDeleteTarget, DirectorKeyframeEasing, DirectorObject, DirectorScene, DirectorShot } from "@/types/director";

type DirectorSequencerProps = {
    scene: DirectorScene;
    shot: DirectorShot;
    camera: DirectorCamera | null;
    objects: DirectorObject[];
    selectedObjectId: string | null;
    pendingActorPathId?: string | null;
    selectedBone: string | null;
    playhead: number;
    playing: boolean;
    autoKey: boolean;
    height: number;
    visible: boolean;
    presentation?: "editor" | "preview";
    onPlayToggle: () => void;
    onCreateCameraPath?: (kind: DirectorCameraPathKind | DirectorCameraDrawPathKind) => void;
    onCreateActorPath?: (id: string, kind: DirectorCameraPathKind | DirectorCameraDrawPathKind) => void;
    onCreateObjectTrack?: (id: string) => void;
    onRemoveObjectTrack?: (id: string) => void;
    onRemoveActorPath?: (id: string) => void;
    onRemoveCameraPath?: (id: string) => void;
    /** 將當前機位的白膜參考影片回寫到畫布。 */
    onExportVideo?: () => void;
    exportBusy?: boolean;
    onPlayheadChange: (time: number) => void;
    onAutoKeyChange: (value: boolean) => void;
    onHeightChange: (height: number) => void;
    onVisibilityChange: (visible: boolean) => void;
    onSelectObject: (id: string | null) => void;
    onSelectBone: (bone: string | null) => void;
    onSelectCameraTrack?: () => void;
    onToggleCameraTrack?: (channel: "position" | "focus" | "fov") => void;
    onToggleObjectChannel?: (objectId: string, channel: "position" | "rotation" | "scale") => void;
    onRecordKeyframe: () => void;
    onAddShot: () => void;
    /** 刪除某條可見軌道上的關鍵幀；覆蓋 transform / camera / bone 三類。 */
    onDeleteKeyframe: (target: DirectorKeyframeDeleteTarget) => void;
    /** 更新關鍵幀到下一幀區間的緩動。 */
    onSetKeyframeEasing: (target: DirectorKeyframeDeleteTarget, easing: DirectorKeyframeEasing) => void;
    onSelectShot: (id: string) => void;
};

/**
 * 軌道上的一個關鍵幀標記。
 * 帶 target 才可刪除；鏡頭總軌等只讀軌道不給 target。
 */
type TrackKey = { id: string; time: number; color?: string; label?: string; easing?: DirectorKeyframeEasing; target?: DirectorKeyframeDeleteTarget };

export function DirectorSequencer({ scene, shot, camera, objects, selectedObjectId, pendingActorPathId = null, selectedBone, playhead, playing, autoKey, height, visible, presentation = "editor", onPlayToggle, onCreateCameraPath, onCreateActorPath, onCreateObjectTrack, onRemoveObjectTrack, onRemoveActorPath, onRemoveCameraPath, onExportVideo, exportBusy = false, onPlayheadChange, onAutoKeyChange, onHeightChange, onVisibilityChange, onSelectObject, onSelectBone, onSelectCameraTrack, onToggleCameraTrack, onToggleObjectChannel, onRecordKeyframe, onAddShot, onDeleteKeyframe, onSetKeyframeEasing, onSelectShot }: DirectorSequencerProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [showDetails, setShowDetails] = useState(true);
    const [timelineScale, setTimelineScale] = useState(1);
    const [selectedKey, setSelectedKey] = useState<TrackKey | null>(null);
    const [pathMenuTarget, setPathMenuTarget] = useState<string | null>(null);
    const [pathMenuPosition, setPathMenuPosition] = useState({ top: 0, left: 0 });
    const duration = Math.max(0.5, shot.duration);
    const fps = shot.fps || 24;
    const rootRef = useRef<HTMLDivElement>(null);
    const pathMenuRef = useRef<HTMLDivElement>(null);
    const pathMenuPortalRef = useRef<HTMLDivElement>(null);
    const pathMenuOpen = pathMenuTarget !== null;
    const ticks = useMemo(() => Array.from({ length: Math.ceil(duration) + 1 }, (_, index) => index), [duration]);
    const trackedObjects = objects.filter((object) => object.animationTrackEnabled || object.motionPath || object.keyframes.length || object.boneTracks?.some((track) => track.keyframes.length) || object.id === pendingActorPathId);
    const timelineObjects = objects.filter((object) => object.kind === "actor" || object.primitive === "character" || trackedObjects.some((tracked) => tracked.id === object.id));
    const actorObjects = trackedObjects.filter((object) => object.kind === "actor" || object.primitive === "character");
    const selectedObject = objects.find((object) => object.id === selectedObjectId);
    const selectedObjectTrack = trackedObjects.find((object) => object.id === selectedObjectId) || null;
    const visibleObjectFrames = (object: DirectorObject) => object.keyframes.filter((key, index, all) => object.motionPath?.controlKeyframeIds
        ? object.motionPath.controlKeyframeIds.includes(key.id)
        : object.motionPath?.kind !== "pencil" || index === 0 || index === all.length - 1);
    const objectChannels = (object: DirectorObject) => (["position", "rotation", "scale"] as const).filter((channel) => object.keyframes.some((key) => object.motionPath && channel !== "position"
        ? key[`${channel}Keyed`] === true : key[`${channel}Keyed`] !== false));
    const objectTrackKeys = (object: DirectorObject, channel: "position" | "rotation" | "scale"): TrackKey[] => visibleObjectFrames(object)
        .filter((key) => key[`${channel}Keyed`] !== false && (!object.motionPath || channel === "position" || key[`${channel}Keyed`] === true))
        .map((key) => ({ id: key.id, time: key.time, color: "#4dd1e9", label: `${object.name} ${{ position: "位置", rotation: "旋轉", scale: "縮放" }[channel]}`, easing: key.easing, target: { track: "object-transform", objectId: object.id, keyframeId: key.id, channel } }));
    const objectOverviewKeys = (object: DirectorObject): TrackKey[] => visibleObjectFrames(object).map((key) => ({ id: key.id, time: key.time, color: "#4dd1e9", label: `${object.name} ${key.positionKeyed !== false ? "位置" : key.rotationKeyed !== false ? "旋轉" : "縮放"}`, easing: key.easing, target: { track: "object-transform", objectId: object.id, keyframeId: key.id } }));
    const activeSelectedKey = selectedKey?.target && directorKeyframeTargetExists(selectedKey.target, camera, objects) ? selectedKey : null;
    const isPreview = presentation === "preview";
    // 編輯時間軸只使用同一套軌道 UI；高度改變的是可見空間，不改變控制元件和軌道語義。
    const isCompact = !isPreview;

    // 選擇只對當前可見軌道有效。切換鏡頭/攝影機或外部刪幀後立即廢棄舊 target，
    // 避免頂部緩動與刪除控制元件繼續修改已經不可見的軌道。
    useEffect(() => {
        setSelectedKey((current) => current?.target && !directorKeyframeTargetExists(current.target, camera, objects) ? null : current);
    }, [camera, objects]);

    useEffect(() => {
        if (!pathMenuTarget) return;
        const dismiss = (event: PointerEvent) => { if (!(event.target as Element).closest("[data-director-path-menu-trigger]") && !pathMenuPortalRef.current?.contains(event.target as Node)) setPathMenuTarget(null); };
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPathMenuTarget(null); };
        document.addEventListener("pointerdown", dismiss);
        document.addEventListener("keydown", escape);
        return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
    }, [pathMenuTarget]);

    const togglePathMenu = (event: MouseEvent<HTMLButtonElement>, targetId: string) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setPathMenuPosition({ top: rect.top - 8, left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)) });
        setPathMenuTarget((current) => current === targetId ? null : targetId);
    };
    const createPathFromMenu = (kind: DirectorCameraPathKind | DirectorCameraDrawPathKind) => {
        // 新路徑完成後按路徑資料重新決定二級軌道的預設展開狀態。
        setExpanded((current) => {
            const next = { ...current };
            if (pathMenuTarget) delete next[pathMenuTarget];
            return next;
        });
        if (pathMenuTarget === "camera") onCreateCameraPath?.(kind);
        else if (pathMenuTarget) onCreateActorPath?.(pathMenuTarget, kind);
        setPathMenuTarget(null);
    };

    const setTimeFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const rawTime = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / Math.max(rect.width, 1)) * duration));
        onPlayheadChange(snapEnabled ? Math.round(rawTime * fps) / fps : rawTime);
    };

    const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = height;
        const move = (moveEvent: PointerEvent) => onHeightChange(startHeight + startY - moveEvent.clientY);
        const stop = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", stop);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop, { once: true });
    };

    // 攝影機關鍵幀只在攝影機行提供刪除入口；Camera Cut 是概覽軌，保持只讀。
    const cameraKeys: TrackKey[] = camera?.keyframes.filter((key) => !camera.drawnPath?.sampleKeyframeIds.includes(key.id)).map((key) => ({ id: key.id, time: key.time, color: "#78a9ff", label: `${camera.name} 鏡頭`, easing: key.easing, target: { track: "camera", cameraId: camera.id, keyframeId: key.id } })) || [];
    const cameraPositionKeys: TrackKey[] = cameraKeys.filter((key) => camera?.keyframes.some((frame) => frame.id === key.id && frame.positionKeyed !== false))
        .map((key) => ({ ...key, label: `${camera?.name} 位置`, target: { track: "camera", cameraId: camera!.id, keyframeId: key.id, channel: "position" } }));
    const cameraFocusKeys: TrackKey[] = cameraKeys.filter((key) => camera?.keyframes.some((frame) => frame.id === key.id && frame.target))
        .map((key) => ({ ...key, label: `${camera?.name} 焦點`, target: { track: "camera", cameraId: camera!.id, keyframeId: key.id, channel: "focus" } }));
    const cameraFovKeys: TrackKey[] = cameraKeys.filter((key) => camera?.keyframes.some((frame) => frame.id === key.id && frame.fov !== undefined))
        .map((key) => ({ ...key, label: `${camera?.name} 視角`, target: { track: "camera", cameraId: camera!.id, keyframeId: key.id, channel: "fov" } }));
    const cameraTrackValues = camera ? resolveDirectorCameraTrackValues(camera, playhead) : null;
    const cameraPosition = camera ? resolveDirectorCameraTransform(camera, playhead).position : null;
    const currentTrackTime = snapEnabled ? Math.round(playhead * fps) / fps : playhead;

    const selectTrackKey = (key: TrackKey) => {
        if (!key.target) return;
        setSelectedKey(key);
        onPlayheadChange(key.time);
        if (key.target.track === "camera") {
            onSelectObject(null);
            onSelectBone(null);
            onSelectCameraTrack?.();
        } else {
            onSelectObject(key.target.objectId);
            onSelectBone(key.target.track === "object-bone" ? key.target.bone : null);
        }
    };
    const removeSelectedTrack = () => {
        if (!selectedObjectTrack) return;
        if (selectedObjectTrack.motionPath) onRemoveActorPath?.(selectedObjectTrack.id);
        else onRemoveObjectTrack?.(selectedObjectTrack.id);
    };

    const deleteTrackKey = (target: DirectorKeyframeDeleteTarget) => {
        onDeleteKeyframe(target);
        if (selectedKey?.target && directorKeyframeTargetId(selectedKey.target) === directorKeyframeTargetId(target)) setSelectedKey(null);
    };

    if (!visible) {
        return <section className="director-sequencer shrink-0 border-t" style={{ height: "var(--space-8)", minHeight: 0, background: "var(--director-sequencer-surface)", borderColor: "var(--director-sequencer-border)" }}>
            <div className="flex h-full items-center justify-end px-3">
                <button type="button" className="director-sequencer-tool" title="顯示時間軸" aria-label="顯示時間軸" onClick={() => onVisibilityChange(true)}><ChevronUp className="size-3.5" /><span>顯示時間軸</span></button>
            </div>
        </section>;
    }

    return (
        <section ref={rootRef} data-presentation={isCompact ? "compact" : presentation} className={`director-sequencer shrink-0 border-t ${isPreview ? "is-preview" : ""}`} style={isPreview ? { height: "min(150px, 22vh)", minHeight: 118, maxHeight: "25vh", background: "var(--director-sequencer-surface)", borderColor: "var(--director-sequencer-border)" } : { height, minHeight: 130, maxHeight: "60vh", background: "var(--director-sequencer-surface)", borderColor: "var(--director-sequencer-border)" }}>
            {!isPreview ? <div className="director-sequencer-resizer" onPointerDown={startResize} role="separator" aria-label="調整時間軸高度" /> : null}
            {isCompact ? <div className="director-sequencer-compact-grid" style={{ display: "grid", gridTemplateColumns: "min(322px, 36vw) minmax(0, 1fr)", gridTemplateRows: "36px minmax(0, 1fr)", height: "100%" }}>
                <div className="flex min-w-0 items-center gap-1 border-b px-2" style={{ borderColor: "var(--director-sequencer-border)" }}>
                    <button type="button" className="director-sequencer-transport" onClick={onPlayToggle} aria-label={playing ? "暫停" : "播放"}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
                    <button type="button" className={`director-sequencer-icon ${autoKey ? "is-active" : ""}`} aria-label="自動幀" aria-pressed={autoKey} onClick={() => onAutoKeyChange(!autoKey)}><KeyRound className="size-3.5" /></button>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs tabular-nums text-white/80">{formatTime(playhead)}</span>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs tabular-nums text-white/80">{formatTime(duration)}</span>
                    <span className="text-xs text-white/55">s</span>
                    {selectedObjectTrack ? <button type="button" aria-label="移除軌道" className="ml-auto whitespace-nowrap text-xs text-white/70 hover:text-white" onClick={removeSelectedTrack}>− 移除軌道</button>
                        : <button type="button" aria-label="新建軌道" className="ml-auto whitespace-nowrap text-xs text-white/70 hover:text-white disabled:text-white/25" disabled={!selectedObject} onClick={() => selectedObject && onCreateObjectTrack?.(selectedObject.id)}>＋ 新建軌道</button>}
                </div>
                <div className="relative min-w-0 border-b" style={{ borderColor: "var(--director-sequencer-border)" }}>
                    <div className="director-sequencer-ruler h-full" style={{ height: 35 }} onPointerDown={setTimeFromPointer}>
                        {ticks.map((tick) => <span key={tick} className="director-sequencer-tick" style={{ left: `${(tick / duration) * 100}%` }}>{tick}s</span>)}
                        <span className="director-sequencer-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
                    </div>
                    <span className="absolute right-2 top-1 flex items-center gap-2">
                        <button type="button" className="director-sequencer-icon" aria-label={height > 150 ? "收起時間軸" : "展開時間軸"} title={height > 150 ? "收起時間軸" : "展開時間軸"} onClick={() => onHeightChange(height > 150 ? 130 : 300)}>{height > 150 ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}</button>
                        {onExportVideo ? <button type="button" disabled={exportBusy} className="rounded bg-white px-3 py-1 text-xs font-medium disabled:opacity-40" style={{ color: "#171717" }} onClick={onExportVideo}>{exportBusy ? "正在匯出" : "匯出影片到畫布"}</button> : null}
                    </span>
                </div>
                <div className="thin-scrollbar col-span-2 min-h-0 overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "min(322px, 36vw) minmax(0, 1fr)", gridAutoRows: "31px", alignContent: "start" }}>
                {timelineObjects.map((object) => {
                    const channels = objectChannels(object);
                    const isExpanded = expanded[object.id] ?? Boolean(object.motionPath);
                    return <div key={object.id} className="contents">
                        <MainTrackLabel name={object.name} kind="actor" pathExists={Boolean(object.motionPath)} expanded={isExpanded} hasDetails={channels.length > 0} menuOpen={pathMenuTarget === object.id} onToggle={() => setExpanded((current) => ({ ...current, [object.id]: !isExpanded }))} onSelect={() => { onSelectObject(object.id); onSelectBone(null); }} onRemovePath={() => { setExpanded((current) => { const next = { ...current }; delete next[object.id]; return next; }); onRemoveActorPath?.(object.id); }} onTogglePathMenu={(event) => togglePathMenu(event, object.id)} />
                        <div className="relative bg-[#0b9db4]/70" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button")) setTimeFromPointer(event); }}><TrackKeys duration={duration} keys={objectOverviewKeys(object)} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /><span className="director-sequencer-playhead" style={{ left: `${(playhead / duration) * 100}%` }} /></div>
                        {isExpanded && object.keyframes.length ? channels.map((channel) => {
                            const keys = objectTrackKeys(object, channel);
                            const label = { position: "位置", rotation: "旋轉", scale: "縮放" }[channel];
                            const value = interpolateDirectorTransform(object.transform, object.keyframes, playhead)[channel].map((item) => Number(item.toFixed(2))).join(",");
                            return <div key={channel} className="contents"><CameraTrackLabel dataChannel={channel} label={label} value={value} keys={keys} currentTime={currentTrackTime} onSelect={() => onSelectObject(object.id)} onSeek={onPlayheadChange} onToggle={onToggleObjectChannel ? () => onToggleObjectChannel(object.id, channel) : undefined} /><div data-director-object-channel={channel} className="relative border-t bg-[#17363a]" style={{ borderColor: "var(--director-sequencer-border)" }}><TrackKeys duration={duration} keys={keys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></div></div>;
                        }) : null}
                    </div>;
                })}
                <MainTrackLabel name="主機位" kind="camera" pathExists={Boolean(camera?.drawnPath)} expanded={expanded.camera ?? Boolean(camera?.drawnPath || cameraKeys.length > 1)} hasDetails={cameraKeys.length > 0} menuOpen={pathMenuTarget === "camera"} onToggle={() => setExpanded((current) => ({ ...current, camera: !(current.camera ?? Boolean(camera?.drawnPath || cameraKeys.length > 1)) }))} onSelect={() => { onSelectObject(null); onSelectBone(null); onSelectCameraTrack?.(); }} onRemovePath={() => { setExpanded((current) => { const next = { ...current }; delete next.camera; return next; }); if (camera) onRemoveCameraPath?.(camera.id); }} onTogglePathMenu={(event) => togglePathMenu(event, "camera")} />
                <div className="relative min-w-0 bg-[#28646a]/55" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest("button")) setTimeFromPointer(event); }}>
                    <TrackKeys duration={duration} keys={cameraKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} />
                    <span className="director-sequencer-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
                </div>
                {cameraKeys.length && (expanded.camera ?? Boolean(camera?.drawnPath || cameraKeys.length > 1)) ? <>
                    <CameraTrackLabel label="位置" value={cameraPosition?.map((value) => Number(value.toFixed(2))).join(",") || ""} keys={cameraPositionKeys} currentTime={currentTrackTime} onSelect={onSelectCameraTrack} onSeek={onPlayheadChange} onToggle={() => onToggleCameraTrack?.("position")} /><div className="relative border-t bg-[#18343a]" style={{ borderColor: "var(--director-sequencer-border)" }}><TrackKeys duration={duration} keys={cameraPositionKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></div>
                    <CameraTrackLabel label="焦點" value={cameraTrackValues?.target.map((value) => Number(value.toFixed(2))).join(",") || ""} keys={cameraFocusKeys} currentTime={currentTrackTime} onSelect={onSelectCameraTrack} onSeek={onPlayheadChange} onToggle={() => onToggleCameraTrack?.("focus")} /><div className="relative border-t bg-[#18343a]" style={{ borderColor: "var(--director-sequencer-border)" }}><TrackKeys duration={duration} keys={cameraFocusKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></div>
                    <CameraTrackLabel label="視角" value={cameraTrackValues?.fov.toFixed(2).replace(/\.00$/, "") || ""} keys={cameraFovKeys} currentTime={currentTrackTime} onSelect={onSelectCameraTrack} onSeek={onPlayheadChange} onToggle={() => onToggleCameraTrack?.("fov")} /><div className="relative border-t bg-[#18343a]" style={{ borderColor: "var(--director-sequencer-border)" }}><TrackKeys duration={duration} keys={cameraFovKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></div>
                </> : null}
                </div>
            </div> : isPreview ? <header className="director-sequencer-preview-header" style={{ borderColor: "var(--director-sequencer-border)" }}>
                <button type="button" className="director-sequencer-transport" onClick={onPlayToggle} aria-label={playing ? "暫停" : "播放"} title={playing ? "暫停" : "播放"}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
                <span className="director-sequencer-preview-time" aria-live="off">{formatClockTime(playhead)} / {formatClockTime(duration)}</span>
                <span className="director-sequencer-preview-actions">
                    <button type="button" className="director-sequencer-icon" title="新增鏡頭" aria-label="新增鏡頭" onClick={onAddShot}><Plus className="size-3.5" /></button>
                    <input type="range" min="0.75" max="2.5" step="0.25" value={timelineScale} aria-label="時間線縮放" title={`時間線縮放 ${Math.round(timelineScale * 100)}%`} onChange={(event) => setTimelineScale(Number(event.target.value))} />
                    <button type="button" className="director-sequencer-icon" title="收起時間軸" aria-label="收起時間軸" onClick={() => onVisibilityChange(false)}><ChevronDown className="size-3.5" /></button>
                </span>
            </header> : <header className="flex h-10 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--director-sequencer-border)" }}>
                <button type="button" className="director-sequencer-transport" onClick={onPlayToggle} aria-label={playing ? "暫停" : "播放"} title={playing ? "暫停" : "播放"}>{playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</button>
                <span className="w-14 text-right text-[var(--fs-caption)] font-medium tabular-nums text-white/75">{formatTime(playhead)}</span>
                <span className="text-[var(--fs-micro)] text-white/35">/ {formatTime(duration)} · {fps}fps</span>
                <span className="mx-1 h-4 w-px bg-white/10" />
                <select className="director-sequencer-shot-select" value={shot.id} aria-label="當前鏡頭" onChange={(event) => onSelectShot(event.target.value)}>
                    {scene.shots.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>)}
                </select>
                {selectedObjectTrack ? <button type="button" aria-label="移除軌道" className="director-sequencer-tool" onClick={removeSelectedTrack}><span>− 移除軌道</span></button>
                    : <button type="button" aria-label="新建軌道" className="director-sequencer-tool" disabled={!selectedObject} onClick={() => selectedObject && onCreateObjectTrack?.(selectedObject.id)}><Plus className="size-3.5" /><span>新建軌道</span></button>}
                <button type="button" className={`director-sequencer-tool ${autoKey ? "is-active" : ""}`} onClick={() => onAutoKeyChange(!autoKey)} aria-pressed={autoKey} title="自動關鍵幀"><KeyRound className="size-3.5" /><span>自動關鍵幀</span></button>
                <button type="button" className={`director-sequencer-tool ${snapEnabled ? "is-active" : ""}`} title="吸附到幀" aria-pressed={snapEnabled} onClick={() => setSnapEnabled((value) => !value)}><Magnet className="size-3.5" /><span>吸附</span></button>
                <button type="button" className="director-sequencer-tool" title="記錄當前關鍵幀" onClick={onRecordKeyframe}><KeyRound className="size-3.5" /><span>記錄</span></button>
                {activeSelectedKey?.target ? <>
                    <select
                        className="director-sequencer-shot-select"
                        value={activeSelectedKey.easing || "linear"}
                        aria-label="關鍵幀緩動"
                        title="關鍵幀到下一幀的緩動"
                        onChange={(event) => {
                            const easing = event.target.value as DirectorKeyframeEasing;
                            onSetKeyframeEasing(activeSelectedKey.target!, easing);
                            setSelectedKey((current) => current ? { ...current, easing } : current);
                        }}
                    >
                        <option value="step">保持</option>
                        <option value="linear">線性</option>
                        <option value="smooth">平滑</option>
                    </select>
                    <button type="button" className="director-sequencer-icon" title="刪除所選關鍵幀" aria-label="刪除所選關鍵幀" onClick={() => deleteTrackKey(activeSelectedKey.target!)}><Trash2 className="size-3.5" /></button>
                </> : null}
                <span className="ml-auto flex items-center gap-1">
                    <button type="button" className="director-sequencer-icon" title="縮小時間軸" aria-label="縮小時間軸" onClick={() => setTimelineScale((value) => Math.max(0.75, value - 0.25))}><ZoomOut className="size-3.5" /></button>
                    <button type="button" className="director-sequencer-icon" title="放大時間軸" aria-label="放大時間軸" onClick={() => setTimelineScale((value) => Math.min(2.5, value + 0.25))}><ZoomIn className="size-3.5" /></button>
                    <button type="button" className={`director-sequencer-icon ${showDetails ? "is-active" : ""}`} title="顯示子軌道" aria-label="顯示子軌道" aria-pressed={showDetails} onClick={() => setShowDetails((value) => !value)}><Rows3 className="size-3.5" /></button>
                    <button type="button" className="director-sequencer-icon" title="新增鏡頭" aria-label="新增鏡頭" onClick={onAddShot}><Plus className="size-3.5" /></button>
                    <button type="button" className="director-sequencer-icon" title="收起高階軌道" aria-label="收起高階軌道" onClick={() => onHeightChange(130)}><ChevronDown className="size-3.5" /></button>
                    <button type="button" className="director-sequencer-icon" title="隱藏時間軸" aria-label="隱藏時間軸" onClick={() => onVisibilityChange(false)}><ChevronDown className="size-3.5" /></button>
                </span>
            </header>}

            {isCompact ? null : isPreview ? <div className="director-sequencer-preview-body thin-scrollbar overflow-auto">
                <div className="director-sequencer-preview-grid" style={{ "--director-sequencer-track-scale": timelineScale } as CSSProperties}>
                    <div className="director-sequencer-preview-ruler" aria-hidden="true" onPointerDown={setTimeFromPointer}>
                        {ticks.map((tick) => <span key={tick} className="director-sequencer-tick" style={{ left: `${(tick / duration) * 100}%` }}>{tick}s</span>)}
                        <span className="director-sequencer-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
                    </div>
                    <div className="director-sequencer-preview-track" role="slider" aria-label="預演時間線" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={playhead} aria-valuetext={`${formatClockTime(playhead)} / ${formatClockTime(duration)}`} tabIndex={0} onPointerDown={setTimeFromPointer} onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const step = snapEnabled ? 1 / fps : 0.1;
                        onPlayheadChange(Math.max(0, Math.min(duration, playhead + (event.key === "ArrowRight" ? step : -step))));
                    }}>
                        <span className="director-sequencer-preview-clip">{shot.name} · {formatClockTime(duration)}</span>
                        <span className="director-sequencer-preview-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
                    </div>
                </div>
            </div> : <div className="director-sequencer-body thin-scrollbar overflow-auto">
                <div className="director-sequencer-grid" style={{ "--director-sequencer-duration": duration, "--director-sequencer-track-scale": timelineScale } as CSSProperties}>
                    <span className="director-sequencer-global-playhead"><i style={{ left: `${(playhead / duration) * 100}%` }} /></span>
                    <div className="director-sequencer-label director-sequencer-ruler-label">軌道</div>
                    <div className="director-sequencer-ruler" onPointerDown={setTimeFromPointer}>
                        {ticks.map((tick) => <span key={tick} className="director-sequencer-tick" style={{ left: `${(tick / duration) * 100}%` }}>{tick}s</span>)}
                        <span className="director-sequencer-playhead" style={{ left: `${(playhead / duration) * 100}%` }} />
                    </div>

                    {camera ? <SequencerRow label={camera.name} icon="⌾" selected={!selectedObjectId} className="director-sequencer-camera-row" labelContent={<CameraMainTrackLabel cameraName={camera.name} pathExists={Boolean(camera.drawnPath)} pathMenuOpen={pathMenuOpen} pathMenuRef={pathMenuRef} onSelect={() => { onSelectObject(null); onSelectBone(null); onSelectCameraTrack?.(); }} onRemovePath={() => onRemoveCameraPath?.(camera.id)} onTogglePathMenu={(event) => togglePathMenu(event, "camera")} />} onClick={() => { onSelectObject(null); onSelectBone(null); onSelectCameraTrack?.(); }}>
                        <TrackKeys duration={duration} keys={cameraKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} />
                    </SequencerRow> : null}
                    {actorObjects.map((object) => {
                        const isExpanded = expanded[object.id] ?? object.id === selectedObjectId;
                        const activeClip = object.motionClips?.find((clip) => clip.id === object.activeMotionClipId);
                        // 骨骼幀 id 在不同軌道間可能重複，React key 用「骨骼-幀」組合；刪除目標仍指向原始幀 id。
                        const boneTrackKeys: TrackKey[] = object.boneTracks?.flatMap((track) => track.keyframes.map((key) => ({ id: `bone-${track.bone}-${key.id}`, time: key.time, color: "#f0b36a", label: `${object.name} ${directorBoneLabel(track.bone)}`, easing: key.easing, target: { track: "object-bone" as const, objectId: object.id, bone: track.bone, keyframeId: key.id } }))) || [];
                        const transformKeys: TrackKey[] = object.keyframes.map((key) => ({ id: `transform-${key.id}`, time: key.time, color: "#61d2ad", label: `${object.name} Transform`, easing: key.easing, target: { track: "object-transform" as const, objectId: object.id, keyframeId: key.id } }));
                        return <div key={object.id} className="contents">
                            <SequencerRow label={object.name} icon={isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} selected={selectedObjectId === object.id && !selectedBone} onClick={() => { onSelectObject(object.id); onSelectBone(null); setExpanded((current) => ({ ...current, [object.id]: !isExpanded })); }}>
                                {/* 摺疊時這是唯一的關鍵幀入口，必須可刪除。 */}
                                <TrackKeys duration={duration} keys={[...transformKeys, ...boneTrackKeys]} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} />
                            </SequencerRow>
                            {isExpanded && showDetails ? <>
                                <SequencerRow label="動作片段" icon="▶" indent selected={selectedObjectId === object.id && !selectedBone} onClick={() => onSelectObject(object.id)}>
                                    <TrackBar duration={duration} color="#61d2ad" label={activeClip ? `${activeClip.name}${activeClip.loop ? " · 迴圈" : ""}` : "姿勢 / 動作"} start={activeClip?.start || 0} clipDuration={activeClip?.loop ? duration : activeClip?.duration || duration} />
                                </SequencerRow>
                                <SequencerRow label="Transform" icon="◇" indent selected={selectedObjectId === object.id && !selectedBone} onClick={() => { onSelectObject(object.id); onSelectBone(null); }}>
                                    <TrackKeys duration={duration} keys={transformKeys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} />
                                </SequencerRow>
                                {object.boneTracks?.map((track) => {
                                    const keys: TrackKey[] = track.keyframes.map((key) => ({ id: key.id, time: key.time, color: "#f0b36a", label: `${object.name} ${directorBoneLabel(track.bone)}`, easing: key.easing, target: { track: "object-bone", objectId: object.id, bone: track.bone, keyframeId: key.id } }));
                                    return <SequencerRow key={track.bone} label={directorBoneLabel(track.bone)} icon="◌" indent selected={selectedObjectId === object.id && selectedBone === track.bone} onClick={() => { onSelectObject(object.id); onSelectBone(track.bone); }}><TrackKeys duration={duration} keys={keys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></SequencerRow>;
                                })}
                            </> : null}
                        </div>;
                    })}
                    {trackedObjects.filter((object) => !actorObjects.some((actor) => actor.id === object.id)).map((object) => {
                        const keys: TrackKey[] = object.keyframes.map((key) => ({ id: key.id, time: key.time, color: "#b8c0ca", label: `${object.name} Transform`, easing: key.easing, target: { track: "object-transform", objectId: object.id, keyframeId: key.id } }));
                        return <SequencerRow key={object.id} label={object.name} icon="□" selected={selectedObjectId === object.id} onClick={() => { onSelectObject(object.id); onSelectBone(null); }}><TrackKeys duration={duration} keys={keys} selectedTarget={activeSelectedKey?.target} onSelectKey={selectTrackKey} onDeleteKey={deleteTrackKey} /></SequencerRow>;
                    })}
                </div>
            </div>}
            {pathMenuOpen && !isPreview ? createPortal(<div ref={pathMenuPortalRef} role="menu" aria-label={pathMenuTarget === "camera" ? "主機位繪製軌跡" : "人物繪製軌跡"} className="fixed w-40 rounded-lg border border-white/10 bg-[#252525] p-2 text-xs text-white shadow-xl" style={{ top: pathMenuPosition.top, left: pathMenuPosition.left, transform: "translateY(-100%)", zIndex: 1000 }}>
                {([ ["ring", "圓環路徑", "◯"], ["line", "直線路徑", "—"], ["rectangle", "矩形路徑", "□"] ] as const).map(([kind, label, icon]) => <button key={kind} type="button" role="menuitem" className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-white/75 hover:bg-white/10 hover:text-white" onClick={() => createPathFromMenu(kind)}><span aria-hidden="true" className="w-4 text-center">{icon}</span>{label}</button>)}
                {([ ["pencil", "鉛筆路徑", "✎"], ["pen", "鋼筆路徑", "✒"] ] as const).map(([kind, label, icon]) => <button key={kind} type="button" role="menuitem" className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-white/75 hover:bg-white/10 hover:text-white" onClick={() => createPathFromMenu(kind)}><span aria-hidden="true" className="w-4 text-center">{icon}</span>{label}</button>)}
            </div>, document.body) : null}
        </section>
    );
}

function MainTrackLabel({ name, kind, pathExists, expanded, hasDetails, menuOpen, onToggle, onSelect, onRemovePath, onTogglePathMenu }: { name: string; kind: "actor" | "camera"; pathExists: boolean; expanded: boolean; hasDetails: boolean; menuOpen: boolean; onToggle: () => void; onSelect: () => void; onRemovePath: () => void; onTogglePathMenu: (event: MouseEvent<HTMLButtonElement>) => void }) {
    return <div className={`director-sequencer-main-label is-${kind}`}>
        <button type="button" className="director-sequencer-main-toggle" aria-label={`${expanded ? "收起" : "展開"}${name}屬性`} aria-expanded={expanded} disabled={!hasDetails} onClick={(event) => { onToggle(); releaseDirectorFocusAfterPointer(event); }}>{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button>
        <button type="button" className="director-sequencer-main-name" title={name} onClick={(event) => { onSelect(); releaseDirectorFocusAfterPointer(event); }}>{name}</button>
        {pathExists ? <button type="button" className="director-sequencer-camera-action" aria-label={`移除${name}軌跡`} onClick={(event) => { onRemovePath(); releaseDirectorFocusAfterPointer(event); }}>− 移除</button> : null}
        <button type="button" data-director-path-menu-trigger className="director-sequencer-camera-action" aria-label={`繪製${name}軌跡`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onTogglePathMenu}>◎ 繪製軌跡</button>
    </div>;
}

function CameraTrackLabel({ label, value, keys, currentTime, onSelect, onSeek, onToggle, dataChannel }: { label: string; value: string; keys: TrackKey[]; currentTime: number; onSelect?: () => void; onSeek: (time: number) => void; onToggle?: () => void; dataChannel?: "position" | "rotation" | "scale" }) {
    const times = keys.map((key) => key.time).sort((a, b) => a - b);
    const previous = times.filter((time) => time < currentTime - DIRECTOR_KEYFRAME_EPSILON).at(-1);
    const next = times.find((time) => time > currentTime + DIRECTOR_KEYFRAME_EPSILON);
    const keyed = times.some((time) => Math.abs(time - currentTime) < DIRECTOR_KEYFRAME_EPSILON);
    return <div data-director-object-channel={dataChannel} className="director-sequencer-channel-label grid min-w-0 grid-cols-[minmax(0,1fr)_72px_68px] items-center gap-1 border-t bg-[#18343a] px-2 text-xs text-white/75" style={{ borderColor: "var(--director-sequencer-border)" }}>
        <button type="button" className="min-w-0 truncate text-left focus-visible:outline focus-visible:outline-2" onClick={(event) => { onSelect?.(); releaseDirectorFocusAfterPointer(event); }}>{label}</button>
        <div className="flex items-center justify-center gap-0.5">
            <button type="button" aria-label="上一關鍵幀" disabled={previous === undefined} className="size-5 rounded text-white/60 hover:bg-white/10 disabled:opacity-25" onClick={(event) => { if (previous !== undefined) onSeek(previous); releaseDirectorFocusAfterPointer(event); }}>‹</button>
            {onToggle ? <button type="button" aria-label={keyed ? "當前幀有關鍵幀" : "當前幀無關鍵幀"} aria-pressed={keyed} className="grid size-5 place-items-center rounded text-white/80 hover:bg-white/10" onClick={(event) => { onToggle(); releaseDirectorFocusAfterPointer(event); }}><span aria-hidden className={`size-2 rotate-45 rounded-[1px] border ${keyed ? "border-white/80 bg-white/75" : "border-white/50"}`} /></button> : <span aria-hidden className="size-5" />}
            <button type="button" aria-label="下一關鍵幀" disabled={next === undefined} className="size-5 rounded text-white/60 hover:bg-white/10 disabled:opacity-25" onClick={(event) => { if (next !== undefined) onSeek(next); releaseDirectorFocusAfterPointer(event); }}>›</button>
        </div>
        <span className="truncate text-right tabular-nums text-white/55" title={value}>{value}</span>
    </div>;
}

/**
 * 軌道行。標籤按鈕是選擇控制元件，點完必須釋放焦點：
 *「點選軌道 -> 按 Delete」與場景列表同源，焦點留在按鈕上會讓守衛吃掉 Delete。
 * 注意 children 裡的 TrackKeys 不走這條規則 —— 關鍵幀按鈕自己擁有那些鍵。
 */
function SequencerRow({ label, icon, selected, indent, children, onClick, className = "", labelContent }: { label: string; icon: ReactNode; selected: boolean; indent?: boolean; children: ReactNode; onClick: () => void; className?: string; labelContent?: ReactNode }) {
    return <div className={`director-sequencer-row ${className} ${selected ? "is-selected" : ""}`}>
        <div className={`director-sequencer-label ${indent ? "is-indent" : ""}`}>{labelContent || <button type="button" className="director-sequencer-row-select" onClick={(event) => { onClick(); releaseDirectorFocusAfterPointer(event); }}><span className="director-sequencer-row-icon">{icon}</span><span className="min-w-0 truncate">{label}</span></button>}</div>
        <div className="director-sequencer-track">{children}</div>
    </div>;
}

function CameraMainTrackLabel({ cameraName, pathExists, pathMenuOpen, pathMenuRef, onSelect, onRemovePath, onTogglePathMenu, compact = false }: { cameraName: string; pathExists: boolean; pathMenuOpen: boolean; pathMenuRef: RefObject<HTMLDivElement | null>; onSelect: () => void; onRemovePath: () => void; onTogglePathMenu: (event: MouseEvent<HTMLButtonElement>) => void; compact?: boolean }) {
    return <div className={`director-sequencer-camera-label ${compact ? "is-compact" : ""}`}>
        <button type="button" className="director-sequencer-camera-name" title={cameraName} onClick={(event) => { onSelect(); releaseDirectorFocusAfterPointer(event); }}><span className="director-sequencer-row-icon">⌾</span><span className="min-w-0 truncate">主機位</span></button>
        {pathExists ? <button type="button" aria-label="移除攝影機軌跡" className="director-sequencer-camera-action" onClick={onRemovePath}>− 移除軌跡</button> : null}
        <div className="relative shrink-0" ref={pathMenuRef}><button type="button" className="director-sequencer-camera-action" aria-label="繪製軌跡" aria-haspopup="menu" aria-expanded={pathMenuOpen} onClick={onTogglePathMenu}>◎ 繪製軌跡</button></div>
    </div>;
}

/**
 * 關鍵幀渲染為真實 button：可 Tab 聚焦、可 Enter/Space/Delete 觸發、也可點選。
 * 之前是惰性 span，關鍵幀一旦記錄就無法刪除。
 *
 * 只有同時具備 onDeleteKey 和 key.target 才可互動；
 * 概覽軌（Camera Cut）保持只讀 span，避免同一幀出現兩個語義相同的刪除入口。
 */
function TrackKeys({ duration, keys, selectedTarget, onSelectKey, onDeleteKey }: { duration: number; keys: TrackKey[]; selectedTarget?: DirectorKeyframeDeleteTarget; onSelectKey?: (key: TrackKey) => void; onDeleteKey?: (target: DirectorKeyframeDeleteTarget) => void }) {
    return (
        <div className="director-sequencer-track-content">
            {keys.map((key) => {
                const target = onDeleteKey && key.target;
                if (!target) {
                    return <span
                        key={key.id}
                        className="director-sequencer-key"
                        style={{ left: `clamp(8px, ${(key.time / duration) * 100}%, calc(100% - 8px))`, background: key.color || "#d7dee8" }}
                        title={`${key.time.toFixed(2)}s`}
                    />;
                }
                return <button
                    key={key.id}
                    type="button"
                    className={`director-sequencer-key is-actionable ${selectedTarget && directorKeyframeTargetId(selectedTarget) === directorKeyframeTargetId(target) ? "is-selected" : ""}`}
                    style={{ left: `clamp(8px, ${(key.time / duration) * 100}%, calc(100% - 8px))`, background: key.color || "#d7dee8" }}
                    aria-label={`選擇 ${key.label ?? "關鍵幀"} ${key.time.toFixed(2)}s 的關鍵幀`}
                    aria-pressed={Boolean(selectedTarget && directorKeyframeTargetId(selectedTarget) === directorKeyframeTargetId(target))}
                    title={`${key.time.toFixed(2)}s · 點選定位，按 Delete 刪除`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelectKey?.(key);
                    }}
                    onKeyDown={(event) => {
                        if (!["Enter", " ", "Delete", "Backspace"].includes(event.key)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.key === "Delete" || event.key === "Backspace") onDeleteKey(target);
                        else onSelectKey?.(key);
                    }}
                />;
            })}
        </div>
    );
}

function directorKeyframeTargetExists(target: DirectorKeyframeDeleteTarget, camera: DirectorCamera | null, objects: DirectorObject[]) {
    if (target.track === "camera") return camera?.id === target.cameraId && camera.keyframes.some((keyframe) => keyframe.id === target.keyframeId && (target.channel === "focus" ? keyframe.target !== undefined : target.channel === "fov" ? keyframe.fov !== undefined : target.channel === "position" ? keyframe.positionKeyed !== false : true));
    const object = objects.find((item) => item.id === target.objectId);
    if (!object) return false;
    if (target.track === "object-transform") return object.keyframes.some((keyframe) => keyframe.id === target.keyframeId && (!target.channel || keyframe[`${target.channel}Keyed`] !== false));
    return object.boneTracks?.some((track) => track.bone === target.bone && track.keyframes.some((keyframe) => keyframe.id === target.keyframeId)) ?? false;
}

function directorKeyframeTargetId(target: DirectorKeyframeDeleteTarget) {
    if (target.track === "camera") return `camera:${target.cameraId}:${target.keyframeId}:${target.channel || "position"}`;
    if (target.track === "object-transform") return `object:${target.objectId}:transform:${target.keyframeId}:${target.channel || "all"}`;
    return `object:${target.objectId}:bone:${target.bone}:${target.keyframeId}`;
}

function TrackBar({ duration, color, label, start = 0, clipDuration }: { duration: number; color: string; label: string; start?: number; clipDuration?: number }) {
    return <div className="director-sequencer-track-content"><span className="director-sequencer-clip" style={{ left: `${(start / duration) * 100}%`, width: `${((clipDuration ?? duration) / duration) * 100}%`, background: `${color}33`, borderColor: `${color}88`, color }}><span className="truncate">{label}</span></span></div>;
}

function formatTime(time: number) {
    return `${time.toFixed(2)}s`;
}

function formatClockTime(time: number) {
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const seconds = Math.floor(safeTime);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
