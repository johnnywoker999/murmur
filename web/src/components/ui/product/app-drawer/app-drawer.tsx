import { Drawer, type DrawerProps } from "antd";
import type { CSSProperties } from "react";

// 用途：產品側欄殼。消費 token 由內容自己負責。預設 destroyOnHidden，可選 flush 去內邊距。
export type AppDrawerProps = DrawerProps & {
    flush?: boolean;
};

export function AppDrawer({ flush = false, destroyOnHidden = true, styles, className, rootClassName, ...props }: AppDrawerProps) {
    const mergeResolvedStyles = (resolved: unknown) => {
        const base = resolved && typeof resolved === "object" ? (resolved as Record<string, unknown>) : {};
        if (!flush) return base;
        const body = base.body && typeof base.body === "object" ? (base.body as CSSProperties) : {};
        return { ...base, body: { ...body, padding: 0 } };
    };
    const mergedStyles =
        typeof styles === "function"
            ? (info: { props: DrawerProps }) => mergeResolvedStyles(styles(info))
            : mergeResolvedStyles(styles);

    return <Drawer destroyOnHidden={destroyOnHidden} className={className} rootClassName={rootClassName} {...props} styles={mergedStyles as DrawerProps["styles"]} />;
}
