// 編輯器宿主上下文：store 例項 + 宿主能力（專案資訊、資產等）。
// 插槽渲染函式經 registerEditorSlot 註冊，宿主在 editor 檢視建立 store 後經
// EditorStoreProvider 注入；面板元件用 useEditorStoreContext 消費。
// Host 上下文獨立於 store，供需要宿主資料的面板（資產庫、匯出）使用。

import { createContext, useContext } from "react";
import type { StoreApi, UseBoundStore } from "zustand";

import type { EditorStore } from "@/stores/editor/editor-store";
import type { ProjectAsset } from "@/services/api/projects";

type EditorStoreHook = UseBoundStore<StoreApi<EditorStore>>;

export type EditorHostContextValue = {
    projectId: string;
    /** 當前使用者、當前專案的資產快照；由編輯器宿主獲取，素材匯入外掛只消費和觸發重新整理。 */
    assets: ProjectAsset[];
    /** 重新拉取專案資產（匯入媒體後重新整理列表）。 */
    refreshAssets: () => Promise<ProjectAsset[] | null>;
};

const EditorStoreContext = createContext<EditorStoreHook | null>(null);
const EditorHostContext = createContext<EditorHostContextValue | null>(null);

export function EditorStoreProvider({
    store,
    host,
    children,
}: {
    store: EditorStoreHook;
    host: EditorHostContextValue;
    children: React.ReactNode;
}) {
    return (
        <EditorStoreContext.Provider value={store}>
            <EditorHostContext.Provider value={host}>{children}</EditorHostContext.Provider>
        </EditorStoreContext.Provider>
    );
}

export function useEditorStoreContext(): EditorStore {
    const store = useContext(EditorStoreContext);
    if (!store) throw new Error("useEditorStoreContext must be used within <EditorStoreProvider>");
    return store();
}

export function useEditorHostContext(): EditorHostContextValue {
    const host = useContext(EditorHostContext);
    if (!host) throw new Error("useEditorHostContext must be used within <EditorStoreProvider>");
    return host;
}
