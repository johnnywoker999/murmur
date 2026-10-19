import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

export type CanvasExternalRevisionDecision =
    | { kind: "apply"; project: CanvasProject; localRevision: number; remoteRevision: number }
    | { kind: "keep-local"; projectId: string; candidate: CanvasProject; localRevision: number; remoteRevision: number };

/**
 * 外部寫入（內建助手回合、CLI/MCP 操作）到達時，決定是否把它投影到本地編輯器。
 *
 * 只有本地沒有服務端尚未確認的編輯時才允許應用；有編輯時保留本地內容，並把
 * 外部內容作為候選原樣留下（供使用者顯式選擇），因為外部檔案是整份覆蓋寫，
 * 直接套用會回滾使用者正在編輯的內容。
 */
export function decideExternalCanvasRevision(input: {
    remote: CanvasProject;
    local: CanvasProject | undefined;
    hasLocalEdits: boolean;
}): CanvasExternalRevisionDecision {
    const { remote, local, hasLocalEdits } = input;
    const remoteRevision = remote.revision ?? 0;
    if (!local) return { kind: "apply", project: remote, localRevision: 0, remoteRevision };
    const localRevision = local.revision ?? 0;
    if (hasLocalEdits) return { kind: "keep-local", projectId: remote.id, candidate: remote, localRevision, remoteRevision };
    return { kind: "apply", project: mergeExternalCanvasRevision(remote, local), localRevision, remoteRevision };
}

/**
 * 外部檔案是服務端權威內容，但視口與畫布外觀屬於本機檢視偏好，
 * 服務端不持久化它們；套用外部 revision 時保留本地視角，避免畫面跳動。
 */
function mergeExternalCanvasRevision(remote: CanvasProject, local: CanvasProject): CanvasProject {
    return {
        ...remote,
        viewport: local.viewport || remote.viewport,
        appearance: local.appearance || remote.appearance,
        backgroundMode: local.backgroundMode || remote.backgroundMode,
    };
}
