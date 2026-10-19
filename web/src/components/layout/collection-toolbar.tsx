import { Button } from "antd";
import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

/** 內容庫的瀏覽控制元件，不復用後臺表格的篩選外框。 */
export function CollectionToolbar({ children, trailing, active, onReset, label = "搜尋與篩選" }: {
    children: ReactNode;
    trailing?: ReactNode;
    active?: boolean;
    onReset?: () => void;
    label?: string;
}) {
    return <section className="collection-toolbar" aria-label={label}>
        <div className="collection-toolbar-controls">{children}</div>
        <div className="collection-toolbar-actions">
            {active && onReset ? <Button type="text" icon={<RotateCcw />} onClick={onReset}>重置</Button> : null}
            {trailing}
        </div>
    </section>;
}
