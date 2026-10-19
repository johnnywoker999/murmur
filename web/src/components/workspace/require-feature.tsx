import type { ReactNode } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { useUserStore } from "@/stores/use-user-store";

type FeatureKey = "shortDramaEnabled" | "taskCenterEnabled" | "frontendModelsEnabled" | "pluginCenterEnabled";

const featureNames: Record<FeatureKey, string> = {
    shortDramaEnabled: "短劇創作",
    taskCenterEnabled: "任務中心",
    frontendModelsEnabled: "前臺模型",
    pluginCenterEnabled: "外掛中心",
};

export function RequireFeature({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    if (!features[feature]) {

        return (
            <WorkspacePage>
                <WorkspaceState icon="empty" title={`${featureNames[feature]}暫不可用`} description="當前本地工作區未啟用此模組。" action={<Button type="primary" onClick={() => navigate("/", { replace: true })}>返回創作臺</Button>} />
            </WorkspacePage>
        );
    }
    return children;
}
