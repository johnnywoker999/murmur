import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 資產庫卡片的共同外殼；頁面只負責業務動作和卡片內的資訊層級。 */
export function AssetLibraryCard({ children, className, selected = false }: { children: ReactNode; className?: string; selected?: boolean }) {
    return <article className={cn("product-collection-card library-card library-card-surface asset-library-card group", selected && "is-selected", className)}>{children}</article>;
}

export function AssetLibraryCardMedia({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("library-card-media", className)}>{children}</div>;
}
