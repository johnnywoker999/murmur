import { App } from "antd";
import { CanvasDeleteConfirmation } from "./canvas-delete-confirmation";

import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { deleteWorkspaceCanvasProjects } from "@/services/workspace-project-repository";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";

export function CanvasDeleteProjectsDialog() {
    const { message } = App.useApp();
    const ids = useCanvasUiStore((state) => state.deleteProjectIds);
    const scope = useCanvasUiStore((state) => state.deleteProjectScope);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const removeSelectedIds = useCanvasUiStore((state) => state.removeSelectedProjectIds);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const deletionLabel = isLocalWorkspaceMode() ? "本地畫布" : "畫布";
    const confirm = async (assertCurrent: () => void) => {
        const selected = [...useCanvasUiStore.getState().deleteProjectIds];
        if (!selected.length) return;
        await deleteWorkspaceCanvasProjects(selected);
        assertCurrent();
        void cleanupImages();
        removeSelectedIds(selected);
        message.success(`已刪除 ${selected.length} 個${deletionLabel}`);
    };
    if (!scope || !ids.length) return null;
    return <CanvasDeleteConfirmation scope={scope} title={`刪除${deletionLabel}？`}
        description={`將刪除 ${ids.length} 個${deletionLabel}，裡面的節點和連線也會一起移除。`}
        onCancel={() => setDeleteIds([])} onConfirm={confirm} />;
}
