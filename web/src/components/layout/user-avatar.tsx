import { useEffect, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalUser } from "@/stores/use-user-store";

export function UserAvatar({ user, className }: { user: LocalUser; className?: string }) {
    const [failed, setFailed] = useState(false);
    const avatarUrl = /^https?:\/\//i.test(user.avatarUrl || "") ? user.avatarUrl : "";

    useEffect(() => setFailed(false), [avatarUrl]);

    // 結構保持 button > span > svg：佔點陣圖示自動複用頂欄圖示按鈕的 18px/1.8 描邊與配色合同；預設不套圓角容器，hover 由按鈕背景反饋。
    return (
        <span className={cn("grid shrink-0 place-items-center overflow-hidden", className)}>
            {avatarUrl && !failed ? (
                <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(true)} />
            ) : (
                <CircleUserRound className="size-full" aria-hidden />
            )}
        </span>
    );
}
