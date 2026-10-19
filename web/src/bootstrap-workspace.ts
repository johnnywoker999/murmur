import { bootstrapAppearance } from "@/services/appearance-bootstrap";
import { bootstrapDesktopRuntime } from "@/services/desktop-runtime";
import { hydrateLocalCanvasProjectsFromBackend } from "@/services/local-workspace-repository";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export async function startApplication() {
    await bootstrapDesktopRuntime();
    // 浏览器缓存晚于后端读入完成时，会用旧连接数组盖掉刚合并的画布。
    await useCanvasStore.persist.rehydrate();
    // 純靜態部署（GitHub Pages）沒有後端：讀取失敗時退回瀏覽器本地工作區，不能整頁卡死。
    try {
        await hydrateLocalCanvasProjectsFromBackend();
    } catch (error) {
        console.warn("后端不可用，以浏览器本地工作区启动", error);
    }
    await bootstrapAppearance().catch(() => console.warn("外观初始化未完成，继续打开工作区"));
    await import("./application");
}
