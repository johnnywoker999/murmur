import { useCallback, useRef, useState } from "react";
import { App } from "antd";

import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { assertUserScope, type CapturedUserScope } from "@/lib/user-scope-guard";
import type { CanvasNodeData, Position } from "@/types/canvas";
import type { TimelineDirectMedia } from "@/types/timeline";

type UseCanvasTimelineAssetInsertOptions = {
    linkedProjectId?: string;
    refetchLinkedProject: () => Promise<unknown>;
    handleAssetsInsert: (payloads: InsertAssetPayload[], expectedScope?: CapturedUserScope) => Promise<CanvasNodeData[]>;
    handleProjectAssetsInsert: (payloads: InsertAssetPayload[], position?: Position, expectedScope?: CapturedUserScope) => Promise<CanvasNodeData[]>;
    openAssetsAtPosition: (position?: Position) => void;
};

function payloadToTimelineMedia(payload: InsertAssetPayload): TimelineDirectMedia | null {
    const randomSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (payload.kind === "video") {
        return {
            id: payload.assetId || `asset-${randomSuffix}`,
            kind: "video",
            title: payload.title,
            assetId: payload.assetId,
            storageKey: payload.storageKey,
            url: payload.url,
            width: payload.width,
            height: payload.height,
            durationMs: payload.durationMs,
            bytes: payload.bytes,
            mimeType: payload.mimeType,
        };
    }
    if (payload.kind === "audio") {
        return { id: payload.assetId || `asset-${randomSuffix}`, kind: "audio", title: payload.title, assetId: payload.assetId, storageKey: payload.storageKey, url: payload.url, durationMs: payload.durationMs, bytes: payload.bytes, mimeType: payload.mimeType };
    }
    return null;
}

export function useCanvasTimelineAssetInsert({
    linkedProjectId,
    refetchLinkedProject,
    handleAssetsInsert,
    handleProjectAssetsInsert,
    openAssetsAtPosition,
}: UseCanvasTimelineAssetInsertOptions) {
    const { message } = App.useApp();
    // 時間線彈窗內新增素材的回填通道：素材庫/上傳建立節點後由彈窗通過 ref 加入草稿。
    const timelineAddNodeRef = useRef<((node: CanvasNodeData) => void) | null>(null);
    // 時間線作用域直連媒體入軌通道：素材庫/專案資產/本地上傳不落畫布，僅加入時間線草稿。
    const timelineMediaAddRef = useRef<((media: TimelineDirectMedia) => void) | null>(null);
    // 素材庫與專案資產彈窗的插入作用域：時間線彈窗內開啟時為 timeline，其餘為 canvas。
    const [assetInsertScope, setAssetInsertScope] = useState<"canvas" | "timeline">("canvas");
    const [projectAssetScope, setProjectAssetScope] = useState<"canvas" | "timeline">("canvas");
    const [projectAssetOpen, setProjectAssetOpen] = useState(false);
    const [projectAssetInitialCategory, setProjectAssetInitialCategory] = useState("all");
    const [projectAssetInitialFolderId, setProjectAssetInitialFolderId] = useState("all");
    const [projectAssetInsertPosition, setProjectAssetInsertPosition] = useState<Position | undefined>();

    const handleLibraryAssetsInsert = useCallback(
        async (payloads: InsertAssetPayload[], expectedScope: CapturedUserScope) => {
            assertUserScope(expectedScope);
            if (assetInsertScope === "timeline") {
                const media = payloads.map(payloadToTimelineMedia).filter((item): item is TimelineDirectMedia => Boolean(item));
                if (media.length !== payloads.length) throw new Error("圖片和文本素材暫不支援直接入軌，請先插入畫布");
                media.forEach((item) => timelineMediaAddRef.current?.(item));
                assertUserScope(expectedScope);
                return;
            }
            const created = await handleAssetsInsert(payloads, expectedScope);
            assertUserScope(expectedScope);
            created.forEach((node) => timelineAddNodeRef.current?.(node));
        },
        [assetInsertScope, handleAssetsInsert],
    );

    const handleTimelineProjectAssetsInsert = useCallback(
        async (payloads: InsertAssetPayload[], expectedScope: CapturedUserScope) => {
            assertUserScope(expectedScope);
            if (projectAssetScope === "timeline") {
                let inserted = 0;
                for (const payload of payloads) {
                    const media = payloadToTimelineMedia(payload);
                    if (media) {
                        timelineMediaAddRef.current?.(media);
                        inserted += 1;
                    }
                }
                if (inserted < payloads.length) message.info("圖片/文本/角色素材暫不支援直接入軌，僅音影片素材已加入時間線");
                assertUserScope(expectedScope);
                return;
            }
            const created = await handleProjectAssetsInsert(payloads, projectAssetInsertPosition, expectedScope);
            assertUserScope(expectedScope);
            created.forEach((node) => timelineAddNodeRef.current?.(node));
        },
        [handleProjectAssetsInsert, message, projectAssetInsertPosition, projectAssetScope],
    );

    const openProjectAssets = useCallback(
        (initialCategory = "all", position?: Position, scope: "canvas" | "timeline" = "canvas", initialFolderId = "all") => {
            setProjectAssetScope(scope);
            setProjectAssetInitialCategory(initialCategory);
            setProjectAssetInitialFolderId(initialFolderId);
            setProjectAssetInsertPosition(position);
            setProjectAssetOpen(true);
            // 資產與專案即時同步：開啟彈窗前重新整理關聯短劇專案資產，避免快取導致資產列表空白/過期。
            if (linkedProjectId) void refetchLinkedProject();
        },
        [linkedProjectId, refetchLinkedProject],
    );

    const openCanvasAssetLibrary = useCallback(
        (position?: Position) => {
            setAssetInsertScope("canvas");
            openAssetsAtPosition(position);
        },
        [openAssetsAtPosition],
    );
    const openTimelineAssetLibrary = useCallback(() => {
        setAssetInsertScope("timeline");
        openAssetsAtPosition();
    }, [openAssetsAtPosition]);
    const closeProjectAssets = useCallback(() => {
        setProjectAssetOpen(false);
        setProjectAssetInsertPosition(undefined);
        setProjectAssetInitialFolderId("all");
    }, []);

    return {
        timelineAddNodeRef,
        timelineMediaAddRef,
        assetInsertScope,
        projectAssetScope,
        projectAssetOpen,
        projectAssetInitialCategory,
        projectAssetInitialFolderId,
        projectAssetInsertPosition,
        handleLibraryAssetsInsert,
        handleTimelineProjectAssetsInsert,
        openProjectAssets,
        openCanvasAssetLibrary,
        openTimelineAssetLibrary,
        closeProjectAssets,
    };
}
