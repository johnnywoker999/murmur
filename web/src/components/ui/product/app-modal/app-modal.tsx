import { Modal, type ModalProps } from "antd";
import type { CSSProperties } from "react";

// 用途：產品彈窗殼。消費 token 由內容自己負責。接管 AntD Modal 的重複 flush 內邊距。
const FLUSH_STYLES = {
    container: { padding: 0, overflow: "hidden" },
    body: { padding: 0 },
} as const;

export type AppModalProps = ModalProps & {
    /** 內容自帶外殼時去掉 AntD 預設內邊距，避免每個業務彈窗複製同一套 styles。 */
    flush?: boolean;
};

export function AppModal({ flush = false, destroyOnHidden = true, centered = true, styles, ...props }: AppModalProps) {
    const mergeResolvedStyles = (resolved: unknown) => {
        const base = resolved && typeof resolved === "object" ? (resolved as Record<string, unknown>) : {};
        if (!flush) return base;
        const container = base.container && typeof base.container === "object" ? (base.container as CSSProperties) : {};
        const body = base.body && typeof base.body === "object" ? (base.body as CSSProperties) : {};
        return {
            ...base,
            container: { ...container, ...FLUSH_STYLES.container },
            body: { ...body, ...FLUSH_STYLES.body },
        };
    };
    const mergedStyles =
        typeof styles === "function"
            ? (info: { props: ModalProps }) => mergeResolvedStyles(styles(info))
            : mergeResolvedStyles(styles);

    return <Modal destroyOnHidden={destroyOnHidden} centered={centered} {...props} styles={mergedStyles as ModalProps["styles"]} />;
}
