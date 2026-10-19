import type { ReactNode } from "react";

import { DirectorScreenshotGallery } from "@/components/canvas/director/director-screenshot-gallery";
import { releaseDirectorFocusAfterPointer } from "@/lib/canvas/director/director-shortcuts";
import type { DirectorScene, DirectorScreenshot } from "@/types/director";

export type DirectorCameraInspectorTab = "properties" | "motion" | "screenshots";

/** 截圖屬於鏡頭，但截圖頁按攝影機展示；同一機位的多個鏡頭不可丟失。 */
export function groupDirectorCameraScreenshots(scene: Pick<DirectorScene, "cameras" | "shots">): Array<{ cameraId: string; cameraName: string; screenshots: DirectorScreenshot[] }> {
    return scene.cameras.map((camera) => ({
        cameraId: camera.id,
        cameraName: camera.name,
        screenshots: scene.shots.filter((shot) => shot.cameraId === camera.id).flatMap((shot) => shot.screenshots || []),
    })).filter((group) => group.screenshots.length > 0);
}

export function DirectorCameraScreenshotTabs({ scene, tab = "properties", motionTabVisible = true, onTabChange, motionContent, children }: { scene: Pick<DirectorScene, "cameras" | "shots">; tab?: DirectorCameraInspectorTab; motionTabVisible?: boolean; onTabChange?: (tab: DirectorCameraInspectorTab) => void; motionContent?: ReactNode; children: ReactNode }) {
    const groups = groupDirectorCameraScreenshots(scene);
    return <div className="min-h-full" aria-label="攝像機檢查器">
        <div className="border-b px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--director-sequencer-border)" }}>攝像機</div>
        <div role="tablist" aria-label="攝像機面板" className="flex gap-1 border-b px-3 py-2" style={{ borderColor: "var(--director-sequencer-border)" }}>
            {(["properties", ...(motionTabVisible ? ["motion"] as const : []), "screenshots"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={`rounded-md px-3 py-1.5 text-xs transition ${tab === item ? "bg-white/10 opacity-100" : "opacity-55 hover:opacity-85"}`} onClick={(event) => { onTabChange?.(item); releaseDirectorFocusAfterPointer(event); }}>{item === "properties" ? "屬性" : item === "motion" ? "運動軌跡" : "截圖"}</button>)}
        </div>
        <div role="tabpanel" aria-label={tab === "properties" ? "屬性" : tab === "motion" ? "運動軌跡" : "截圖"}>
            {tab === "properties" ? children : tab === "motion" ? motionContent : <div className="space-y-4 px-3 py-4">{groups.length ? groups.map((group) => <DirectorScreenshotGallery key={group.cameraId} title={`${group.cameraName}截圖`} screenshots={group.screenshots} compact />) : <p className="text-xs opacity-55">暫無截圖</p>}</div>}
        </div>
    </div>;
}
