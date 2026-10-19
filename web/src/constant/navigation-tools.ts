import { Blocks, CircleDollarSign, Clapperboard, Images, LibraryBig, ListTodo, PanelsTopLeft, Settings, WandSparkles } from "lucide-react";

export const navigationTools = [
    {
        slug: "create",
        label: "創作",
        icon: WandSparkles,
        section: "創作空間",
    },
    {
        slug: "projects",
        label: "短劇創作",
        icon: Clapperboard,
        section: "創作空間",
    },
    {
        slug: "canvas",
        label: "畫布",
        icon: PanelsTopLeft,
        section: "創作空間",
    },
    {
        slug: "tasks",
        label: "任務",
        icon: ListTodo,
        section: "創作空間",
    },
    {
        slug: "assets",
        label: "素材",
        icon: Images,
        section: "創作空間",
    },
    {
        slug: "skills",
        label: "技能庫",
        icon: LibraryBig,
        section: "工作臺管理",
    },
    {
        slug: "plugins",
        label: "外掛中心",
        icon: Blocks,
        section: "工作臺管理",
    },
    {
        slug: "wallet",
        label: "積分中心",
        icon: CircleDollarSign,
        section: "工作臺管理",
    },
    {
        slug: "settings",
        label: "設定",
        icon: Settings,
        section: "工作臺管理",
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
