import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

import type { CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { createStyleProfileSnapshot, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { updateProject as updateDomainProject } from "@/services/api/projects";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "@/types/canvas";
import { getActiveUserScope } from "@/lib/user-scope";

type UseCanvasStyleWorkflowOptions = {
    canvasId: string;
    domainProjectId?: string;
    nodesRef: { current: CanvasNodeData[] };
    selectedNodeIdsRef: { current: Set<string> };
    getCanvasCenter: () => Position;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setStylePickerOpen: Dispatch<SetStateAction<boolean>>;
};

export function useCanvasStyleWorkflow({ canvasId, domainProjectId, nodesRef, selectedNodeIdsRef, getCanvasCenter, setNodes, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId, setStylePickerOpen }: UseCanvasStyleWorkflowOptions) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const liveContext = useRef({ canvasId, domainProjectId, mounted: true });
    liveContext.current = { canvasId, domainProjectId, mounted: liveContext.current.mounted };
    const applyingRef = useRef(false);
    useEffect(() => { liveContext.current.mounted = true; return () => { liveContext.current.mounted = false; }; }, []);

    const applyCanvasStyle = useCallback(
        (preset: CanvasStylePreset, profileJson: string) => {
            const current = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
            const metadata: CanvasNodeMetadata = {
                content: preset.prompt,
                prompt: preset.prompt,
                status: "success",
                workflowKind: "styleboard",
                workflowTitle: "專案畫風",
                workflowDescription: preset.description,
                stylePresetId: preset.id,
                styleProfileJson: profileJson,
                fontSize: 14,
            };
            let styleNode: CanvasNodeData;
            if (current) {
                styleNode = { ...current, title: `畫風 · ${preset.title}`, metadata: { ...current.metadata, ...metadata } };
                nodesRef.current = nodesRef.current.map((node) => (node.id === current.id ? styleNode : node));
            } else {
                styleNode = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), metadata);
                styleNode.title = `畫風 · ${preset.title}`;
                styleNode.width = 420;
                styleNode.height = 240;
                nodesRef.current = [...nodesRef.current, styleNode];
            }
            setNodes(nodesRef.current);
            const selection = new Set([styleNode.id]);
            selectedNodeIdsRef.current = selection;
            setSelectedNodeIds(selection);
            setSelectedConnectionId(null);
            setDialogNodeId(null);
            setStylePickerOpen(false);
            message.success(`已應用“${preset.title}”畫風`);
        },
        [getCanvasCenter, message, nodesRef, selectedNodeIdsRef, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds, setStylePickerOpen],
    );

    const persistStyleMutation = useMutation({
        mutationFn: ({ preset, profileJson }: { preset: CanvasStylePreset; profileJson: string }) => {
            if (!domainProjectId) throw new Error("畫布尚未關聯專案");
            return updateDomainProject(domainProjectId, { stylePresetId: preset.id, styleProfileJson: profileJson });
        },
    });

    const applyCanvasStyleAsync = useCallback(async (preset: CanvasStylePreset) => {
        if (applyingRef.current) throw new Error("畫風正在儲存，請稍後重試");
        const scope = getActiveUserScope();
        applyingRef.current = true;
        try {
            const profileJson = serializeStyleProfile(preset.profile || createStyleProfileSnapshot(preset));
            if (domainProjectId) {
                await persistStyleMutation.mutateAsync({ preset, profileJson });
                void queryClient.invalidateQueries({ queryKey: ["project", domainProjectId] });
            }
            if (!liveContext.current.mounted || liveContext.current.canvasId !== canvasId || liveContext.current.domainProjectId !== domainProjectId || getActiveUserScope() !== scope) throw new Error("頁面或賬號已變化，未向當前畫布應用畫風；如專案儲存已完成，請回原專案檢視");
            applyCanvasStyle(preset, profileJson);
        } finally { applyingRef.current = false; }
    }, [canvasId, domainProjectId, persistStyleMutation.mutateAsync, queryClient, applyCanvasStyle]);

    const selectCanvasStyle = useCallback(
        (preset: CanvasStylePreset) => {
            void applyCanvasStyleAsync(preset).catch((error) => message.error(error instanceof Error ? error.message : "專案畫風儲存失敗"));
        },
        [applyCanvasStyleAsync, message],
    );

    return { selectCanvasStyle, applyCanvasStyleAsync, styleApplying: persistStyleMutation.isPending };
}
