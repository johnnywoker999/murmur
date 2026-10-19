import { ScrollText } from "lucide-react";
import { lazy, Suspense, useState, type CSSProperties, type ReactNode } from "react";

const AppChangelogDialog = lazy(() => import("@/components/layout/app-changelog-dialog").then((module) => ({ default: module.AppChangelogDialog })));

export const APP_VERSION = __APP_VERSION__;

type AppChangelogButtonProps = {
    className?: string;
    style?: CSSProperties;
    showVersion?: boolean;
    showLabel?: boolean;
    showIcon?: boolean;
    labelClassName?: string;
    versionClassName?: string;
    icon?: ReactNode;
    label?: ReactNode;
    version?: string;
    ariaLabel?: string;
};

export function formatAppVersionLabel(version: string) {
    const raw = version.trim();
    if (!raw) return "";
    return `v${raw.replace(/^v/, "")}`;
}

export function AppChangelogButton({ className, style, showVersion = false, showLabel = false, showIcon = true, labelClassName, versionClassName, icon, label = "更新日誌", version, ariaLabel }: AppChangelogButtonProps) {
    const [open, setOpen] = useState(false);
    const displayed = formatAppVersionLabel(version ?? APP_VERSION);
    const resolvedAriaLabel = ariaLabel || (displayed ? `當前版本 ${displayed}，檢視更新日誌` : "檢視更新日誌");

    return (
        <>
            <button type="button" className={className} style={style} onClick={() => setOpen(true)} aria-label={resolvedAriaLabel} title={displayed ? `當前版本 ${displayed}` : "更新日誌"}>
                {showIcon ? (icon ?? <ScrollText className="size-4 shrink-0" />) : null}
                {showLabel ? <span className={`whitespace-nowrap ${labelClassName || ""}`}>{label}</span> : null}
                {showVersion && displayed ? <span className={versionClassName}>{displayed}</span> : null}
            </button>
            {open ? (
                <Suspense fallback={null}>
                    <AppChangelogDialog open onClose={() => setOpen(false)} />
                </Suspense>
            ) : null}
        </>
    );
}
