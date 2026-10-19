import { AudioLines, Bot, Box, Clapperboard, Image, Layers3, Video } from "lucide-react";

export const beefTVCapabilityItems = [
    { id: "canvas", label: "自由畫布", detail: "組織鏡頭與素材", to: "/canvas?mode=new", icon: Layers3, disabled: false },
    { id: "video", label: "影片生成", detail: "在畫布中建立影片節點", to: "/canvas?mode=new&add=video", icon: Video, disabled: false },
    { id: "image", label: "圖片生成", detail: "在畫布中建立圖片節點", to: "/canvas?mode=new&add=image", icon: Image, disabled: false },
    // Audio generation is a creation entry, not an asset filter. Start a
    // local canvas and let the canvas insert the correctly configured node.
    { id: "audio", label: "音訊生成", detail: "配音與聲音素材", to: "/canvas?mode=new&add=audio", icon: AudioLines, disabled: false },
    { id: "director", label: "3D 導演臺", detail: "新建畫布並開啟 3D 導演臺", to: "/canvas?mode=new&start=director", icon: Box, disabled: false },
    { id: "agent", label: "MURMUR Agent", detail: "新建畫布並開啟 MURMUR Agent", to: "/canvas?mode=new&start=agent", icon: Bot, disabled: false },
    { id: "projects", label: "專案庫", detail: "檢視已有專案，繼續創作", to: "/project", icon: Clapperboard, disabled: false },
] as const;
