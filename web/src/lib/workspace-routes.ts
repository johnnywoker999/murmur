export function isSpatialWorkbenchPath(pathname: string) {
    // 畫佈列表屬於使用者工作臺，只有具體畫布編輯器與運營後臺保留各自現有視覺契約。
    const canvasEditor = /^\/canvas\/[^/]+(?:\/|$)/.test(pathname);
    return !canvasEditor && !pathname.startsWith("/admin");
}
