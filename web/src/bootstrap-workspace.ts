import { bootstrapAppearance } from "@/services/appearance-bootstrap";
import { bootstrapDesktopRuntime } from "@/services/desktop-runtime";
import { hydrateLocalCanvasProjectsFromBackend } from "@/services/local-workspace-repository";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export async function startApplication() {
    await bootstrapDesktopRuntime();
    // 瀏覽器快取晚於後端讀入完成時，會用舊連線陣列蓋掉剛合併的畫布。
    await useCanvasStore.persist.rehydrate();
    // 純靜態部署（GitHub Pages）沒有後端：讀取失敗時退回瀏覽器本地工作區，不能整頁卡死。
    try {
        await hydrateLocalCanvasProjectsFromBackend();
    } catch (error) {
        console.warn("後端不可用，以瀏覽器本地工作區啟動", error);
    }
    await bootstrapAppearance().catch(() => console.warn("外觀初始化未完成，繼續開啟工作區"));
    await import("./application");
}
