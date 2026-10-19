export const WORKSPACE_SIDEBAR_STORAGE_KEY = "infinite-canvas:workspace-sidebar-collapsed";
export const WORKSPACE_SIDEBAR_CHANGE_EVENT = "workspace:sidebar-collapsed-change";

type WorkspaceSidebarStorage = Pick<Storage, "getItem" | "setItem">;

function workspaceSidebarStorage(storage?: WorkspaceSidebarStorage) {
    if (storage) return storage;
    if (typeof window === "undefined") return undefined;
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

export function readWorkspaceSidebarCollapsed(storage?: WorkspaceSidebarStorage) {
    try {
        return workspaceSidebarStorage(storage)?.getItem(WORKSPACE_SIDEBAR_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function writeWorkspaceSidebarCollapsed(collapsed: boolean, storage?: WorkspaceSidebarStorage) {
    try {
        workspaceSidebarStorage(storage)?.setItem(WORKSPACE_SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
        // localStorage 不可用時保留當前記憶體狀態，不能阻斷側欄互動。
    }
}

export function publishWorkspaceSidebarCollapsed(collapsed: boolean) {
    writeWorkspaceSidebarCollapsed(collapsed);
    window.dispatchEvent(new CustomEvent(WORKSPACE_SIDEBAR_CHANGE_EVENT, { detail: { collapsed } }));
}

export function subscribeWorkspaceSidebarCollapsed(onChange: (collapsed: boolean) => void) {
    const handleChange = (event: Event) => onChange(Boolean((event as CustomEvent<{ collapsed?: boolean }>).detail?.collapsed));
    const handleStorage = (event: StorageEvent) => {
        if (event.key === WORKSPACE_SIDEBAR_STORAGE_KEY) onChange(event.newValue === "1");
    };
    window.addEventListener(WORKSPACE_SIDEBAR_CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
        window.removeEventListener(WORKSPACE_SIDEBAR_CHANGE_EVENT, handleChange);
        window.removeEventListener("storage", handleStorage);
    };
}
