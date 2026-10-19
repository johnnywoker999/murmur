import { ArrowUpRight, Settings } from "lucide-react";
import { Link } from "react-router";
import { useUserStore } from "@/stores/use-user-store";
import { UserAvatar } from "./user-avatar";
import "./workspace-account-card.css";

/** 本地工作區賬戶卡片，只保留本地設定入口。 */
export function WorkspaceAccountCard({ onNavigate }: { onNavigate: () => void }) {
    const user = useUserStore((state) => state.user);
    if (!user) return null;
    return <section className="workspace-account-card" aria-label="我的賬戶">
        <header className="workspace-account-card-identity">
            <UserAvatar user={user} className="workspace-account-card-avatar" />
            <div><strong>{user.displayName || user.username}</strong><span>@{user.username}</span></div>
            <em>{user.role === "admin" ? "管理員" : "創作者"}</em>
        </header>
        <nav className="workspace-account-card-actions" aria-label="賬戶操作">
            <Link to="/settings" onClick={onNavigate}><Settings /><span>本地設定</span><ArrowUpRight /></Link>
        </nav>
    </section>;
}
