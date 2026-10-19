import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Copy, Eye, Palette, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, UserRound } from "lucide-react";
import { App, Button, Input } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { nanoid } from "nanoid";

import { StyleProfileEditorModal } from "@/components/canvas/style-profile-editor-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { createStyleProfileSnapshot, parseStyleProfile, serializeStyleProfile, type StyleProfileSnapshot } from "@/lib/canvas/style-profile";
import {
    compileCanvasStylePreset,
    customCanvasStylePreset,
    recommendedCanvasStylePresets,
    type CanvasStylePreset,
    type ProjectStyleSelection,
} from "@/lib/canvas/canvas-style-system";
import { createStyleProfile, deleteStyleProfile, listStyleProfiles, setStyleProfileFavorite, touchStyleProfile, updateStyleProfile, type UserStyleProfile } from "@/services/api/style-profiles";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { isLocalWorkspaceMode } from "@/services/workspace-mode";

export type { CanvasStylePreset } from "@/lib/canvas/canvas-style-system";

// 分類按短劇製作語境組織：先看媒介，再看題材與視覺氣質，避免用品牌名稱代替畫風。
const PROJECT_STYLE_SCOPE = "【使用邊界】本規範是全專案美術與影像風格基線，用於統一角色資產、服裝材質、建築世界觀、色彩語言和成片質感；它不是某張圖片或某個鏡頭的提示詞。具體場景內容、構圖、景別、機位、運鏡、動作、光源位置、天氣和單場情緒由劇情與分鏡節點決定，不得從本規範機械複製。";

const legacyCanvasStylePresets: CanvasStylePreset[] = [
    {
        id: "urban-live-action",
        title: "都市真人短劇",
        category: "真人實拍",
        description: "中性城市色調、真實東亞演員與生活化服化道；統一自然光感、城市材質和剋製表演，服務職場與情感題材。",
        tags: ["職場", "情感", "現實生活"],
        prompt: [
            "【專案定位】當代中國都市真人短劇的寫實輕電影風格，視覺核心是真實人物、可信生活空間和剋制的精緻感；全片保持統一的自然膚色、真實材質與現代城市氣質，不做影樓寫真、廣告大片或網紅濾鏡。",
            "【專案色彩系統】全專案色板使用權重約為 60% 中性白、霧灰、淺木和水泥色，30% 低飽和藏藍、灰綠和駝色，10% 琥珀、酒紅或專案識別色。該比例用於控制角色服裝、場景美術和資產庫的整體頻率，不要求每個畫面機械滿足；膚色始終保持自然暖中性。",
            "【角色設計系統】統一採用真實東亞骨相與當代年齡感，五官、髮型、體型、妝容和職業氣質自然穩定；保留皮膚紋理與微表情，不使用統一網紅臉、過度磨皮、誇張歐式深邃五官或跨集年齡漂移。",
            "【服飾與材質系統】按職業、收入、季節和性格建立西裝、襯衫、針織、風衣及休閒裝的角色衣櫥，主配色服從專案色板；羊毛、棉、皮革、玻璃、金屬和塑膠保持真實粗糙度，固定角色的標誌服飾與配飾形成可複用資產。",
            "【建築世界觀】統一使用可信的中國當代辦公室、公寓、咖啡館、商場、社群和城市公共空間，建築尺度、傢俱系統、中文標識與生活設施符合本地語境；不同地點可有身份差異，但不得跳成歐美城市、空洞樣板間或未來科幻空間。",
            "【影像與動態基線】全片採用自然光感、可信實景光源、適中的對比度和寫實表演節奏；動態氣質剋制、穩定、生活化，允許分鏡按劇情選擇靜態觀察或運動攝影，但不使用無敘事動機的炫技運動與濫用慢動作。",
            "【資產一致性】為主要角色固定臉型、髮型、體型、衣櫥編號和常用道具，為主要地點固定空間佈局、材質板和標識系統；跨集變化必須由劇情、時間或季節驅動並在角色資產或場景資產版本中留痕。",
            "【全域性停用】禁止歐美人物預設臉、塑膠皮膚、強烈青橙濾鏡、過飽和霓虹、廉價棚拍、錯誤中文、建築地域漂移、服飾隨機換色和同一資產在不同節點中改變材質。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/urban-live-action.jpg",
    },
    {
        id: "period-live-action",
        title: "古裝 / 年代真人",
        category: "真人實拍",
        description: "先鎖定單一歷史時期，再統一人物妝髮、服裝制度、器物與建築；用低飽和東方色和材質細節建立時代可信度。",
        tags: ["古裝", "民國", "歷史"],
        prompt: [
            "【專案定位】歷史題材真人短劇的寫實東方美學。專案啟動時必須依據小說從古代王朝、民國或其他年代中鎖定一個明確時代子型別，並形成唯一的時代考據基線；全專案人物制度、服化道、器物和建築只遵循該基線。",
            "【專案色彩系統】全專案色板使用權重約為 55% 米白、黛灰、木褐和土黃，30% 靛青、竹青、暗紅和月白，15% 硃砂、鎏金、翡翠或專案身份色。該比例控制服裝陣營、建築材質和道具資產的整體分佈；階層差異通過色彩純度、織物等級和金屬用量表達。",
            "【角色設計系統】統一採用真實東亞骨相、符合時代的妝容與髮式，並按年齡、身份、禮制和勞動狀態建立差異；角色的冠發、髮髻、鬍鬚、傷痕、體態與身份標記固定，不使用現代偶像妝或與時代無關的審美模板。",
            "【服飾與材質系統】古代子型別按襟形、袖型、腰帶、冠帽、鞋履和紋樣建立制度；民國子型別按旗袍、長衫、學生裝、軍裝和西裝建立階層。絲、麻、紗、錦、皮革、木、玉和金屬使用統一材質庫，兵器、首飾與器物必須歸屬明確年代。",
            "【建築世界觀】古代子型別使用中式木構、斗拱、瓦頂、院落、迴廊、園林和城鎮體系；民國子型別使用石庫門、騎樓、公館、車站、報館和舊式街道體系。專案只啟用所選時代的建築庫，統一木、磚、石、灰泥的年代質感與使用痕跡。",
            "【影像與動態基線】全片保持自然天光、窗紙漫射、燭火與燈籠等時代可信的光感，表演與動作遵循身份禮制和服裝重量；動態風格莊重、剋制、有真實慣性，具體節奏與排程交由分鏡決定。",
            "【資產一致性】建立時代手冊、角色衣櫥、紋樣庫、器物庫和建築模組庫；同一角色的髮飾、衣層與身份紋樣不可隨機改變，場景修繕、服裝汙損和身份升級只能依據劇情版本更新。",
            "【全域性停用】禁止朝代混搭、現代拉鏈與傢俱、廉價化纖反光、塑膠飾品、日式鳥居、歐洲城堡、現代偶像妝、隨機花瓣濾鏡和未經過時代歸屬的武器器物。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/period-live-action.jpg",
    },
    {
        id: "suspense-noir",
        title: "懸疑犯罪夜景",
        category: "真人實拍",
        description: "藍黑低照度基底配少量危險色，統一城市夜景材質、實景光感與心理壓迫氣質，服務線索和反轉題材。",
        tags: ["懸疑", "犯罪", "反轉"],
        prompt: [
            "【專案定位】現代中國懸疑犯罪真人短劇的寫實暗調體系，以低照度、真實城市紋理和心理壓迫作為全片視覺母題；風格服務於資訊隱藏與揭示，但任何場景都必須保持人物、環境和關鍵敘事資訊可讀。",
            "【專案色彩系統】全專案色板使用權重約為 65% 藍黑、炭灰和冷水泥色，25% 青綠熒光、髒黃鈉燈和冷白螢幕色，10% 暗紅、洋紅或專案危險色。強調色只承擔危險、權力或關鍵線索的視覺職責，不擴散成全片霓虹效果。",
            "【角色設計系統】統一採用真實東亞人物與自然年齡狀態，允許疲憊、細紋、胡茬、傷痕和職業壓力留下痕跡；角色臉型、髮型、傷痕與精神狀態有版本記錄，反派通過行為和身份系統塑造，不使用誇張臉譜妝。",
            "【服飾與材質系統】建立深色啞光外套、制服、便裝和職業服飾庫，通過剪裁、磨損和材質區分身份；證件、通訊裝置、檔案、監控裝置和關鍵道具使用統一設計語言，避免高反光材質破壞暗調體系。",
            "【建築世界觀】統一使用中國城市中的舊居民樓、樓梯間、地下空間、辦公場所、倉儲、便利店、街巷和城郊設施，形成潮溼牆面、玻璃、金屬、水泥和舊塗層的材質庫；不同地點共享同一城市地域與年代資訊。",
            "【影像與動態基線】全片保持低調但可讀的明暗關係、可解釋的城市實景光感與剋制的心理張力；動態風格偏觀察、跟隨和壓迫感，具體資訊揭示方式由分鏡設計，不把霓虹、煙霧或鏡頭晃動當作懸疑本身。",
            "【資產一致性】為角色建立傷痕與服飾版本，為主要地點建立平面關係、材質板和照明基線，為關鍵道具建立唯一外觀與狀態記錄；跨集變化必須對應明確劇情事件。",
            "【全域性停用】禁止黑成不可讀、賽博朋克燈海、無來源輪廓光、過量煙霧、反派臉譜化、血漿獵奇、錯誤警務與城市標識、同一地點地域漂移和關鍵資產隨機變形。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/suspense-noir.jpg",
    },
    {
        id: "chinese-2d",
        title: "國漫 2D",
        category: "二維動畫",
        description: "半寫實國漫人物、礦物東方色與工筆式場景體系；以穩定線稿、清晰剪影和統一二維資產保障跨集一致性。",
        tags: ["古風", "仙俠", "二維"],
        prompt: [
            "【專案定位】東方古風與仙俠題材的半寫實國漫 2D 動畫體系，統一採用有粗細變化的手繪線稿、賽璐璐角色上色與工筆式環境繪製；全專案保持二維繪畫語言，不混入塑膠手辦、三維渲染或日系萌系模板。",
            "【專案色彩系統】全專案色板使用權重約為 55% 月白、黛青、石青和菸灰，30% 硃砂、靛藍、竹青和赭石，15% 金色、亮青或專案法術色。該比例用於統籌角色陣營、場景色板和特效資產；每個主要角色固定主色、輔色與識別色。",
            "【角色設計系統】成年角色統一採用約 7 至 8 頭身和東方骨相，眼睛比例、臉型、髮際線、髮束、眉眼與年齡感遵循同一角色設計規範；不同角色依靠剪影、身高差、髮型和服飾結構區分，正側背參考圖必須屬於同一二維設計。",
            "【服飾與材質系統】漢服、勁裝、甲冑、宗門服和法器按身份與陣營形成款式庫，固定衣領、袖型、腰封、紋樣和配色；絲綢、麻布、金屬、玉石通過二維紋理、線條密度和高光形狀區分，不使用三維寫實材質貼圖。",
            "【建築世界觀】統一使用中式木構、斗拱、飛簷、瓦當、廊橋、山門、古城、竹林、雲海與東方山水系統，建立可複用的建築模組和場景色板；世界觀內不出現歐洲城堡、日式鳥居或現代城市元素。",
            "【影像與動態基線】全片保持清晰剪影、兩至三階角色明暗、工筆場景層次和適度水墨空氣感；動畫採用關鍵姿勢明確、有限但準確的二維運動，口型、髮絲、衣襬和特效遵循統一動畫節奏，具體動作由分鏡決定。",
            "【資產一致性】建立角色線稿規範、標準色卡、表情表、服飾拆件、法術色板、建築模組與特效元素庫；任何新資產先匹配線條粗細、上色層級和紋理密度，再進入分鏡生產。",
            "【全域性停用】禁止 3D 塑膠質感、手辦攝影、歐美漫畫肌肉模板、幼態大眼、角色隨機換臉換髮型、服飾紋樣漂移、背景風格跳變、法術顏色失控和畫面文字水印。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/chinese-2d.jpg",
    },
    {
        id: "ink-narrative",
        title: "水墨敘事",
        category: "風格化動畫",
        description: "宣紙留白佔主導，以焦墨、淡墨和少量硃砂組織敘事；人物身份靠穩定輪廓、筆法與色點區分，而不是抽象成不可識別墨團。",
        tags: ["水墨", "東方", "情緒"],
        prompt: [
            "【專案定位】以中國水墨畫語言構建的敘事動畫專案，統一使用宣紙纖維、乾溼筆觸、飛白、積墨、破墨與輕工筆勾線；全片保持詩意留白和角色可識別性之間的平衡，不把水墨理解成隨機濾鏡。",
            "【專案色彩系統】全專案色板使用權重約為 70% 宣紙暖白與留白，20% 焦墨、濃墨、淡墨組成的五級灰，10% 硃砂、石青、赭石或專案點色。點色按角色、陣營和關鍵器物分配固定職責，不在不同資產間隨機更換。",
            "【角色設計系統】人物採用穩定頭身、臉部勾線、髮髻與外輪廓系統，不同角色擁有固定的筆觸節奏、輪廓特徵和點色；近實遠簡是統一的繪製層級，但任何簡化都不得破壞角色身份。",
            "【服飾與材質系統】長衫、袍服、斗笠、披風、兵器和文房器物通過墨線疏密、乾溼變化與有限紋樣區分；固定角色的領口、腰帶、髮飾和關鍵道具保持明確形狀，衣物可融入筆勢但不能失去結構。",
            "【建築世界觀】統一建立山水、村落、亭臺、院牆、廊橋、舟船和古道的水墨資產庫，以中式結構、近實遠虛和墨色層級保持世界一致；霧、水、雲與紙白共享同一留白規則。",
            "【影像與動態基線】全片通過墨色濃度、紙白、邊緣虛實和點色明度表達光感；動態採用輪廓先行、筆勢跟隨、墨跡自然生長的統一原則，轉場語言可來自墨滴、筆鋒或留白，具體動作和排程由分鏡決定。",
            "【資產一致性】建立角色筆刷、標準墨階、點色色卡、服飾勾線、建築結構和自然元素的統一樣本；新增資產必須先通過紙張紋理、筆觸尺度、灰階與點色職責檢查。",
            "【全域性停用】禁止西式水彩插畫、隨機潑墨、全屏髒灰、角色五官消失、每個資產筆觸風格不同、建築結構融化、彩色過多、廉價紙紋濾鏡和隨機生成文字印章。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/ink-narrative.jpg",
    },
    {
        id: "three-d-cartoon",
        title: "3D 卡通短劇",
        category: "三維動畫",
        description: "輪廓鮮明的風格化三維人物、柔和材質與明快配色；用可讀表情、誇張節奏和穩定資產支撐喜劇、親子與治癒內容。",
        tags: ["3D", "喜劇", "治癒"],
        prompt: [
            "【專案定位】面向喜劇、親子與治癒內容的風格化 3D 卡通短劇體系，統一採用簡潔造型、清晰剪影、半啞光材質、柔和次表面散射和可讀表情；保持動畫片質感，不進入廉價塑膠玩具或超寫實恐怖谷。",
            "【專案色彩系統】全專案色板使用權重約為 50% 暖白、淺木、柔灰和天空色，35% 高識別度角色主色，15% 黃色、珊瑚紅、薄荷綠等專案點睛色。顏色按角色、地點和功能分配，始終保證角色資產與環境資產有穩定明度區分。",
            "【角色設計系統】成人統一約 5 至 6 頭身，兒童約 3.5 至 4.5 頭身，頭手可適度誇張但關節結構合理；通過眼鼻嘴比例、髮型、體型和剪影建立差異，所有角色共用同一造型語言與表情誇張尺度。",
            "【服飾與材質系統】服裝款式與紋樣簡化為可複用大色塊，棉布、針織、牛仔、皮革和金屬通過統一粗糙度範圍區分；道具採用適度圓潤邊緣和清晰功能造型，保持同一世界中的比例、材質與細節密度一致。",
            "【建築世界觀】統一使用圓角、簡化幾何和清晰功能分割槽構建都市公寓、學校、店鋪、辦公室、公園或幻想小鎮；背景資產細節層級低於角色但功能合理，所有地點遵循同一比例、材質和色彩系統。",
            "【影像與動態基線】全片保持柔和光感、受控高光、乾淨輪廓和明快節奏；角色運動統一遵循預備動作、擠壓拉伸、跟隨、緩入緩出和清晰停頓，誇張幅度由專案表演手冊約束，具體動作由分鏡決定。",
            "【資產一致性】建立標準角色比例、表情表、材質球、服飾色板、道具比例和建築模組庫；所有新資產必須匹配既有圓角半徑、粗糙度、色彩純度和細節等級。",
            "【全域性停用】禁止塑膠公仔反光、僵硬 T Pose、所有角色同臉、過大玻璃眼、毛孔級寫實皮膚、隨機改變頭身、背景貼圖模糊、穿模、漂浮道具和不屬於同一美術體系的寫實資產。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/three-d-cartoon.jpg",
    },
    {
        id: "fantasy-3d",
        title: "國風 3D 玄幻",
        category: "三維動畫",
        description: "半寫實東方人物、可信中式建築與分層材質構成玄幻世界；法術色受陣營約束，體積光和特效只強化動作與敘事重點。",
        tags: ["玄幻", "法術", "宏大場景"],
        prompt: [
            "【專案定位】東方玄幻題材的半寫實 3D 動畫短劇體系，統一採用東方角色設計、電影級 PBR 材質、中式幻想建築和分級法術視覺語言；專案奇觀建立在中國美術與建築邏輯上，不套用西方魔幻世界模板。",
            "【專案色彩系統】全專案色板使用權重約為 55% 黛青、墨黑、冷灰、古銅和雲霧白，30% 硃紅、靛藍、青玉、暗金等陣營色，15% 單一高亮能量色。該比例用於宗門、角色、建築和法術資產的整體規劃；每個陣營與角色的能量色具有唯一職責。",
            "【角色設計系統】成年角色統一採用約 7.5 至 8 頭身、真實東方骨相與適度理想化五官，皮膚、髮絲和眼神遵循同一半寫實渲染標準；發冠、髮束、身高、體型和身份符號固定，力量等級通過服飾層級與能量規則表達。",
            "【服飾與材質系統】袍服、勁裝、甲冑、披風、宗門紋樣、發冠與法器構成陣營化資產庫；絲綢、錦緞、皮革、金屬、玉石和木材使用統一 PBR 標準與粗糙度範圍，武器、吊墜和衣層具有穩定結構。",
            "【建築世界觀】統一使用中式木構山門、殿宇、樓閣、城池、洞府、棧道、山水雲海和東方祭壇，建立斗拱、屋脊、瓦面、岩石與雲霧模組庫；所有奇觀必須從中式結構演化，不能混入歐洲尖塔、哥特教堂和隨機異域拼貼。",
            "【影像與動態基線】全片保持可信體積感、受控特效亮度、真實材質和有重量的動畫表現；法術遵循統一的形狀語法、粒子密度、能量色和力量分級，角色與環境的運動規律一致，具體戰鬥動作與排程由分鏡決定。",
            "【資產一致性】建立角色三檢視、宗門色板、服飾拆件、材質球、武器法器、建築模組、法術模板和力量等級表；任何升級、受損或換裝都作為有因果的資產版本管理。",
            "【全域性停用】禁止歐洲城堡、預設精靈臉、西式板甲混搭、塑膠材質、彩虹粒子、全屏過曝特效、法術體系隨機變化、角色無因換裝換武器和建築資產跨文化漂移。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/fantasy-3d.jpg",
    },
    {
        id: "future-tech",
        title: "未來科技",
        category: "科幻實拍",
        description: "潔淨白灰空間、精密工業結構與剋製冷光構成可信近未來；科技來自功能與材質，不依賴滿屏霓虹和懸浮介面。",
        tags: ["科技", "近未來", "硬科幻"],
        prompt: [
            "【專案定位】近未來中國科技題材的寫實硬科幻短劇體系，以可推演的技術、清晰功能結構和剋制先進感為核心；世界比當下領先約十至三十年，所有裝置、服裝和空間都必須能解釋用途，不使用空泛的科幻裝飾。",
            "【專案色彩系統】全專案色板使用權重約為 65% 冷白、淺灰、鈦金屬和透明材質，25% 石墨黑、深海藍和低飽和工業色，10% 青綠或電藍狀態指示色。高亮色只用於裝置狀態、許可權和風險提示，不擴散為環境染色。",
            "【角色設計系統】角色保持真實東亞骨相、自然年齡與職業可信度，通過精確剪裁、功能裝備和身份識別細節區分科研、工程、醫療、安保與管理角色；義體或可穿戴裝置必須符合人體結構並具有明確功能。",
            "【服飾與材質系統】建立模組化工作服、防護服、通勤裝和輕型外骨骼體系，統一使用啞光技術織物、鈦合金、陶瓷、透明聚合物和精密玻璃；接縫、扣具、感測器與磨損位置必須符合使用邏輯。",
            "【建築世界觀】統一使用可信的中國近未來實驗室、資料中心、交通樞紐、智慧住宅、先進製造與城市公共設施；空間強調結構、維護通道、導視和裝置尺度，科技升級建立在現有城市之上而非憑空替換。",
            "【影像與動態基線】全片保持清晰冷靜、低噪點和高材質可讀性，光源來自頂燈、工作燈、螢幕與自然天光；動態強調精密操作、機械反饋和空間秩序，具體機位與節奏由分鏡決定。",
            "【資產一致性】建立裝置型號、介面協議、狀態燈職責、角色許可權色、服裝模組和空間導視手冊；同類裝置共享結構語言，升級與損壞必須形成可追蹤版本。",
            "【全域性停用】禁止無功能全息屏、滿屏藍色 HUD、隨機發光線、霓虹城市套殼、塑膠太空服、錯誤機械結構、裝置尺寸漂移、英文亂碼和把未來科技等同於賽博朋克。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/future-tech.jpg",
    },
    {
        id: "cyberpunk-neon",
        title: "賽博霓虹",
        category: "科幻實拍",
        description: "高密度亞洲夜城、潮溼舊材質與受控霓虹形成技術失衡的近未來；人物身份由義體、階層服裝和企業色區分。",
        tags: ["賽博朋克", "霓虹", "都市夜景"],
        prompt: [
            "【專案定位】亞洲高密度都市中的賽博朋克短劇體系，視覺核心是先進技術與老舊城市並存、企業秩序與街頭生活碰撞；霓虹只作為商業、交通與身份系統的一部分，世界必須保留真實生活痕跡。",
            "【專案色彩系統】全專案色板使用權重約為 55% 瀝青黑、舊水泥、潮溼金屬和菸灰，30% 冷青、髒黃與螢幕白，15% 洋紅、警戒紅或企業識別色。每種高亮色繫結陣營或功能，避免無差別彩虹霓虹。",
            "【角色設計系統】角色採用真實東亞骨相和明確階層差異，義眼、介面、義肢與皮下裝置遵循統一技術代際；街頭角色、企業僱員和執法人員通過剪影、改裝程度、磨損與身份標記區分。",
            "【服飾與材質系統】建立機能夾克、防水層、企業制服、舊式工裝和改裝配件庫，統一使用磨損尼龍、橡膠、舊皮革、氧化金屬、透明塑膠和低亮度電子元件；服裝必須可活動、可收納並符合天氣。",
            "【建築世界觀】統一使用高密度亞洲街區、舊樓加建、地下交通、企業塔樓、維修鋪、夜市與狹窄居住單元，中文標識與在地設施可信；新技術以加裝、覆蓋和侵入舊城市的方式出現。",
            "【影像與動態基線】全片保持夜景可讀、潮溼反射受控、實景光源有出處，動態兼具街頭擁擠感與企業空間秩序；雨、煙和故障只在劇情需要時出現，不能遮蓋人物表演與關鍵資訊。",
            "【資產一致性】建立企業標識、街區導視、義體代際、裝置介面、角色改裝和服裝磨損版本；同一地點的招牌、線路與空間關係跨集保持穩定。",
            "【全域性停用】禁止純裝飾霓虹、所有角色都裝義體、無來源彩色輪廓光、日文城市替代中國語境、英文亂碼、全屏雨霧、過曝招牌、隨機機械紋身和未來裝置無功能邏輯。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/cyberpunk-neon.jpg",
    },
    {
        id: "retro-hong-kong",
        title: "復古港風",
        category: "年代實拍",
        description: "八九十年代華語都市的膠片色、密集街區與生活化服飾；用鎢絲暖光、青綠陰影和真即時代器物建立懷舊感。",
        tags: ["港風", "膠片", "年代都市"],
        prompt: [
            "【專案定位】八十至九十年代華語都市題材的復古港風短劇體系，以真即時代生活、緊湊街區和膠片攝影質感為核心；懷舊來自服化道、空間和人物狀態，不靠泛黃濾鏡或明星仿妝。",
            "【專案色彩系統】全專案色板使用權重約為 50% 奶油白、舊牆灰、墨綠和木褐，35% 鎢絲暖黃、青綠色陰影、牛仔藍與暗紅，15% 招牌紅、計程車色或角色識別色。色彩保持膠片寬容度和自然膚色。",
            "【角色設計系統】統一採用真實東亞骨相與明確時代髮型、妝容和體態，按職業與階層建立差異；角色通過眉形、捲髮、短髮、眼鏡、手錶與穩定服裝剪影識別，不照搬具體明星面孔。",
            "【服飾與材質系統】建立寬肩西裝、襯衫、針織、牛仔、風衣、連衣裙和工裝衣櫥，使用真實棉、羊毛、皮革、滌綸和金屬配件；版型、花紋、紐扣、鞋履與隨身物件鎖定明確年代。",
            "【建築世界觀】統一使用騎樓、舊式住宅、茶餐廳、錄影廳、辦公室、街市、碼頭、巴士與密集招牌街道，保留窗機、瓷磚、鐵閘、電話和時代交通工具；不得混入智慧手機與當代城市傢俱。",
            "【影像與動態基線】全片使用適度膠片顆粒、柔和高光、鎢絲燈與窗外冷光的自然混合，動態保持手持觀察和經典劇情片的穩健節奏；具體景別、變焦與運動由分鏡決定。",
            "【資產一致性】建立年代器物清單、角色衣櫥、招牌字形、交通工具、室內材質和膠片色彩基線；時間推進通過服裝、髮型與城市更新版本體現。",
            "【全域性停用】禁止一鍵泛黃濾鏡、現代手機與車輛、錯誤年代品牌、過量霓虹、日系昭和混用、具體明星換臉、影樓旗袍寫真、乾淨到失真的街景和隨機繁體亂碼。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/retro-hong-kong.jpg",
    },
    {
        id: "clay-stop-motion",
        title: "黏土定格",
        category: "定格動畫",
        description: "保留手塑痕跡的黏土角色、微縮佈景與逐幀動作；統一模型比例、材料顆粒和燈光尺度，形成溫暖可觸的手工世界。",
        tags: ["黏土", "定格", "手工質感"],
        prompt: [
            "【專案定位】以手工黏土角色和微縮佈景製作的定格動畫短劇體系，視覺核心是可觸控的材料、真實模型尺度與逐幀表演；全專案保留適度手塑痕跡，不偽裝成光滑三維動畫。",
            "【專案色彩系統】全專案色板使用權重約為 55% 陶土、米白、舊木和紙張原色，30% 角色主色與場景功能色，15% 珊瑚紅、芥末黃、湖藍或專案點睛色。顏色帶有實體顏料的輕微不均勻感。",
            "【角色設計系統】角色採用統一頭身、眼球、嘴型替換與骨架關節規則，通過鼻形、髮型、體型和服裝剪影區分；指紋、接縫與替換口型可適度保留，但正側背結構必須一致且可製作。",
            "【服飾與材質系統】衣物使用薄黏土、布料、毛線、紙張與細金屬件組合，木、石、玻璃和食物以微縮材料模擬；每種材質保持可辨的顆粒、厚度與手工邊緣，避免統一塑膠表面。",
            "【建築世界觀】統一使用可搭建的微縮住宅、街道、店鋪、自然景觀與室內佈景，結構受真實模型尺寸、燈具和攝影空間約束；背景與道具遵循同一縮尺和手工製作語言。",
            "【影像與動態基線】全片保持棚內微縮攝影的真實景深、柔和體積光與輕微逐幀節奏，動作強調清晰關鍵姿勢、重量和停頓；不得用運動模糊掩蓋定格特徵，具體表演由分鏡決定。",
            "【資產一致性】建立角色骨架、替換臉、手型、標準色泥、縮尺、佈景模組與道具製作表；損壞、換裝和表情元件必須按資產版本維護。",
            "【全域性停用】禁止光滑 CGI、塑膠玩具反光、真實人類皮膚、模型比例漂移、關節憑空變形、材質尺度錯誤、過度景深虛化、隨機指紋汙漬和佈景看似無限真實空間。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/clay-stop-motion.jpg",
    },
    {
        id: "black-white-noir",
        title: "黑白默片",
        category: "風格化實拍",
        description: "以黑白灰階、硬朗光影和剋製表演建立無對白也可讀的戲劇性；時代質感來自構圖、材質與表演，不靠復古濾鏡。",
        tags: ["黑白", "默片", "電影感"],
        prompt: [
            "【專案定位】以黑白電影和默片敘事為核心的風格化實拍短劇體系，強調輪廓、構圖、肢體表演和視覺隱喻；可有少量時代道具，但不把專案固定為某一歷史年代。",
            "【專案色彩系統】全專案使用黑、白和五級中性灰作為主色，允許極少量單色強調作為敘事線索；明暗關係優先服務人物層次與資訊可讀性，禁止把畫面壓成一團黑或過度漂白。",
            "【角色設計系統】角色保持真實東亞骨相與明確剪影，妝髮和年齡感自然穩定；人物通過帽簷、領型、姿態、手勢和光影落點區分，正側背設定必須在灰階中仍然清楚。",
            "【服飾與材質系統】服裝按角色身份建立黑白灰明度差、紋理密度和輪廓結構，使用羊毛、棉、皮革、金屬與玻璃的真實反差；圖案不依賴顏色，必須通過材質和明度可辨。",
            "【建築世界觀】統一使用幾何清晰、層次明確的城市街道、室內、車站、劇院和工業空間；牆面、玻璃、磚石、金屬和霧氣都以灰階材質庫控制，不新增無敘事的奇觀背景。",
            "【影像與動態基線】使用硬光、側光、背光和區域性高光塑造戲劇性，允許少量膠片顆粒與光暈；表演通過停頓、視線、走位和誇張但可信的肢體傳達，具體節奏由分鏡決定。",
            "【資產一致性】建立灰階色卡、角色輪廓、帽飾與道具明度表、光影基線和場景構圖規則；同一角色的服裝紋理和標誌道具在不同曝光下仍需穩定。",
            "【全域性停用】禁止隨意套用棕色復古濾鏡、畫面全黑、現代彩色螢幕搶戲、過度煙霧、誇張舞臺妝、無意義魚眼變形、角色剪影混淆和字幕水印。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/black-white-noir.jpg",
    },
    {
        id: "space-opera",
        title: "太空歌劇",
        category: "科幻動畫",
        description: "宏大星際尺度與鮮明陣營服飾結合可信航天結構；用色彩、徽記和材質建立政治與冒險敘事，而不是堆砌宇宙奇觀。",
        tags: ["星際", "陣營", "史詩"],
        prompt: [
            "【專案定位】東方敘事語境下的太空歌劇專案，融合星際航行、陣營政治、家族關係與冒險成長；世界觀允許宏大奇觀，但人物動機、技術限制和空間尺度必須清楚可追蹤。",
            "【專案色彩系統】全專案色板使用權重約為 45% 深空黑、冷灰、銀白和艙體白，35% 陣營主色與艦隊識別色，20% 星雲紫、能源藍或警戒橙作為敘事強調；每個陣營只擁有穩定主色和輔助色。",
            "【角色設計系統】角色採用真實東方骨相或統一動畫化比例，通過軍銜、陣營徽記、髮型、體型和功能裝備區分；太空服、駕駛服和禮服必須適配人體活動，角色臉部與身體比例跨視角穩定。",
            "【服飾與材質系統】建立艙內工作服、戰術航天服、艦隊制服、外交禮服和維修裝模組，統一使用複合纖維、陶瓷、金屬、透明面罩和軟質密封件；介面、扣件、徽記與生命保障裝置具有功能邏輯。",
            "【建築世界觀】統一使用環形空間站、艦橋、推進艙、殖民地、軌道電梯和低重力生活區，結構遵循壓力艙、維護通道、重力與照明邏輯；奇觀服務於文明尺度，不隨機拼貼異星建築。",
            "【影像與動態基線】保持深空黑與艙內工作光的層次，使用剋制體積光和可信螢幕反射；動作體現慣性、失重、穿戴裝備和空間限制，具體戰鬥與運鏡由分鏡決定。",
            "【資產一致性】建立艦船型號、陣營徽記、艙體材質、介面標準、武器尺寸、角色制服和能源顏色版本表；任何艦船升級、損壞與換裝都要有劇情原因。",
            "【全域性停用】禁止現實宇航服直接套用、星球大小失真、所有陣營同一顏色、無功能 HUD、魔法與科技規則混雜、艦船結構穿透、角色裝備隨機變化和版權品牌標識。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/space-opera.jpg",
    },
    {
        id: "comic-pop",
        title: "漫畫分鏡",
        category: "風格化動畫",
        description: "高對比塊面、網點紋理與漫畫格律構成可讀的動作喜劇視覺；誇張來自構圖、擬聲和姿態，角色資產仍保持連續性。",
        tags: ["漫畫", "動作", "高對比"],
        prompt: [
            "【專案定位】面向動作、喜劇與都市冒險的漫畫分鏡風格，統一使用清晰外輪廓、平塗塊面、網點紋理和有節奏的畫格感；畫面可以誇張，但角色關係、動作方向與空間連續性必須可靠。",
            "【專案色彩系統】全專案以米白、墨黑和中性灰為結構底色，30% 使用高飽和紅、黃、藍或專案主色，10% 使用單一衝擊色承擔危險、速度或情緒重點；顏色必須形成角色和陣營識別。",
            "【角色設計系統】統一採用穩定頭身比例、強輪廓、清晰髮型和可重複的表情符號；角色通過剪影、服裝塊面、姿態和道具區分，誇張表情不得改變基本臉型與身份。",
            "【服飾與材質系統】服飾細節簡化成大色塊、粗線紋樣和少量高光，棉、皮革、金屬、牛仔和玻璃通過線條密度與高光形狀區分；戰鬥或動作服裝必須兼顧可動性。",
            "【建築世界觀】使用可快速識別的街區、商店、學校、辦公室、車站和屋頂等都市空間，背景以幾何塊面、透視線和有限網點表達；場景不搶角色輪廓，也不使用現實品牌標識。",
            "【影像與動態基線】動作使用速度線、衝擊形狀、停格姿勢和清晰重心，切換節奏由分鏡控制；鏡頭可以模擬畫格切分，但不得犧牲表情、手勢和動作方向的可讀性。",
            "【資產一致性】建立角色標準角度、表情表、線寬、網點密度、擬聲字形和動作特效模板；不同鏡頭共享同一線條、色塊與紋理規則。",
            "【全域性停用】禁止寫實照片與漫畫角色混用、線條粗細隨機、所有畫面滿屏速度線、複雜背景壓住人物、擬聲文字亂碼、角色換臉、四肢結構錯誤和過度血腥獵奇。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/comic-pop.jpg",
    },
    {
        id: "storybook-fantasy",
        title: "繪本童話",
        category: "插畫動畫",
        description: "紙張顆粒、柔和色塊和手繪邊緣構成溫暖童話世界；角色表情與輪廓清楚，避免把繪本感做成泛化的柔焦濾鏡。",
        tags: ["繪本", "童話", "溫暖"],
        prompt: [
            "【專案定位】面向成長、親子與寓言敘事的繪本童話動畫體系，統一使用手繪邊緣、紙張顆粒、有限色塊和可讀角色表情；故事世界可以奇幻，但情緒和人物關係保持溫暖、具體且可理解。",
            "【專案色彩系統】全專案色板使用權重約為 55% 紙張暖白、霧藍、鼠尾草綠和淺木色，30% 角色與場景主色，15% 蜜糖黃、珊瑚紅或星光金作為敘事點色；避免所有畫面都成為粉彩漸變。",
            "【角色設計系統】角色採用統一繪本頭身、圓潤但有差異的輪廓和清晰眼鼻嘴比例，通過帽子、髮型、耳朵、體型與服裝區分；正側背檢視必須保留同一手繪造型特徵。",
            "【服飾與材質系統】衣服使用布料、針織、皮革、木扣、紙張和毛線等可觸控材質，紋樣簡化為少量重複元素；角色標誌物件和衣領、袖口、鞋履保持穩定。",
            "【建築世界觀】統一使用村莊、森林、閣樓、車站、河岸、市場與小型城堡等可讀場景，建築結構偏手工搭建和繪本透視；奇幻元素從生活物件變形而來，不做無邏輯異域拼貼。",
            "【影像與動態基線】保持柔和但有方向的光影、紙張紋理和有限動畫節奏，動作強調呼吸、重心、眼神與衣襬跟隨；具體動作與鏡頭排程交由分鏡決定。",
            "【資產一致性】建立標準色卡、紙張紋理、筆刷邊緣、角色比例、表情表、場景模組和魔法點色規則；新資產必須匹配已有線條和顆粒尺度。",
            "【全域性停用】禁止塑膠 3D、氾濫柔焦、角色同臉、過度糖果色、陰影方向漂移、複雜文字水印、細節密度失控、隨機改髮型和把兒童角色做成恐怖谷。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/storybook-fantasy.jpg",
    },
    {
        id: "surreal-dream",
        title: "超現實夢境",
        category: "風格化實拍",
        description: "現實材質與不可能空間並置，以映象、尺度錯位和霧化光線表達夢境；所有超現實變化服務角色心理和敘事線索。",
        tags: ["夢境", "超現實", "心理"],
        prompt: [
            "【專案定位】以現實人物進入不可能空間為核心的超現實夢境短劇體系，夢境不是隨機奇觀，而是由人物記憶、慾望、恐懼和選擇構成的可追蹤視覺系統；現實段落與夢境段落必須有明確差異和回返規則。",
            "【專案色彩系統】現實段落使用自然中性灰與低飽和環境色，夢境段落使用 35% 霧白、淺金、冷青和暗紫，15% 固定象徵色承載角色心理線索；同一象徵色不能在不同角色間隨意換義。",
            "【角色設計系統】角色保持真實東亞骨相、年齡與身體比例，夢境只允許在髮型、服裝、尺度、影子或區域性材質上做有規則的變形；正側背結構必須仍能確認是同一角色。",
            "【服飾與材質系統】現實服裝遵循生活邏輯，夢境服裝可以通過重複、倒置、透明、過大或過小表達心理，但面料、紐扣、鞋履和標誌物件需要保持可追蹤變體。",
            "【建築世界觀】統一使用映象房間、無盡樓梯、漂浮街道、倒置建築、空曠大廳和霧中自然等空間語法；每種不可能空間繫結一個敘事規則，不把隨機生成的城堡和星空堆在一起。",
            "【影像與動態基線】現實使用可信光源和穩定鏡頭，夢境使用慢速漂浮、鏡面反射、尺度變化與非連續轉場；特效保持節制，具體夢境動作和節拍由分鏡決定。",
            "【資產一致性】建立象徵色、夢境規則、角色標誌物件、空間變形前後對照、鏡面材質和轉場語法表；每次變形都能對應劇情節點並可恢復。",
            "【全域性停用】禁止無因由的隨機變形、全屏煙霧、過度鏡面、所有空間都漂浮、夢境與現實沒有區別、角色五官融化、符號含義漂移和用噪點掩蓋生成錯誤。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/surreal-dream.jpg",
    },
    {
        id: "nature-healing",
        title: "自然療愈",
        category: "真人實拍",
        description: "真實自然光、植物與手作生活構成鬆弛的在地質感；以季節、聲音和微小行動表達療愈，不做廣告式空鏡。",
        tags: ["療愈", "自然", "慢生活"],
        prompt: [
            "【專案定位】面向家庭關係、返鄉、成長與情緒修復的自然療愈真人短劇體系，核心是人物在具體自然環境中的生活行動和關係變化；自然不是裝飾背景，而是參與敘事的真實空間。",
            "【專案色彩系統】全專案色板使用權重約為 55% 葉綠、苔蘚綠、土色和米白，30% 木材、石頭、天空與季節環境色，15% 赭紅、芥末黃或人物識別色；保持自然白平衡和季節連續性。",
            "【角色設計系統】角色採用真實東亞面孔、自然年齡與生活狀態，保留曬痕、髮絲、體態和勞動痕跡；通過衣著層次、動作習慣、髮型與隨身物件建立差異，不使用商業廣告式精緻人物。",
            "【服飾與材質系統】建立棉麻、針織、舊牛仔、雨具、工作服、帆布鞋與草帽衣櫥，材質保留褶皺、泥土、汗水和使用痕跡；固定角色的外套、包和手作物件形成識別資產。",
            "【建築世界觀】統一使用山村住宅、林間小屋、農場、茶室、河岸、菜園、集市和小城邊緣空間，保留木、石、土、舊牆、工具與本地生活設施；建築應有地域和季節證據。",
            "【影像與動態基線】採用真實日光、陰天漫射、篝火與室內暖燈，允許風、雨、昆蟲和環境聲進入畫面；動態觀察人物的微小行動與關係停頓，避免只拍漂亮自然空鏡。",
            "【資產一致性】建立季節色卡、植物與農具庫、住宅佈局、角色衣櫥、手作物件和天氣連續性記錄；季節變化應帶來可見但漸進的資產版本。",
            "【全域性停用】禁止商業民宿廣告感、過度航拍、飽和濾鏡、歐美鄉村替代中國在地生活、乾淨無人的自然空間、人物永遠精緻、隨機換季和把療愈做成空洞慢鏡頭。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/nature-healing.jpg",
    },
    {
        id: "real-life-documentary",
        title: "現實生活紀實",
        category: "真人實拍",
        description: "自然灰土色、真實東亞普通人與中國在地生活空間；保留環境痕跡和觀察式影像氣質，讓家庭與社會議題更可信。",
        tags: ["家庭", "成長", "紀實"],
        prompt: [
            "【專案定位】家庭、成長與社會議題的現實生活紀實短劇體系，接近觀察式劇情紀錄片：真實東亞普通人、真實中國在地空間、自然曝光和適度不完美；全片追求生活證據與人物關係的可信度，不追求廣告級精緻。",
            "【專案色彩系統】全專案色板使用權重約為 70% 自然灰、米白、舊木、土色和水泥色，20% 當地牆面、傢俱、植物與公共設施的環境色，10% 衣物、生活用品或專案識別色。色板允許隨季節與地區變化，但始終保持低飽和、自然白平衡和在地真實感。",
            "【角色設計系統】選擇具有真實年齡、體型、家庭關係和職業痕跡的東亞人物，保留皺紋、曬痕、眼袋、髮絲與生活狀態；妝髮接近日常，家人之間保持可信相似性，不使用網紅臉、統一精緻妝和不符合生活條件的造型。",
            "【服飾與材質系統】按季節、職業和經濟條件建立家居服、工裝、校服、普通襯衫、羽絨服與布鞋等衣櫥，保留褶皺、磨損和反覆使用痕跡；生活用品採用真實品牌中性化設計與合理使用年限，不做嶄新陳列品。",
            "【建築世界觀】統一使用中國老小區、城中村、普通住宅、學校、醫院、工廠、菜市場、公交站和縣城街道，保留線纜、晾曬、汙漬、擁擠傢俱與中文公共標識；專案地點共享明確地域、年代和經濟環境。",
            "【影像與動態基線】全片保持自然光感、現場混合色溫、適度顆粒與觀察式表演，允許真實環境中的停頓、重複和輕微不完美；動態風格樸素、貼近人物，不使用炫技攝影或消費苦難的煽情手法，具體排程由分鏡決定。",
            "【資產一致性】建立家庭成員外貌關係、角色衣櫥、生活道具使用痕跡、住宅佈局、社群設施和地域標識資產庫；時間推進造成的磨損、成長和季節變化必須作為連續版本維護。",
            "【全域性停用】禁止商業廣告布光、過度磨皮、精緻樣板房、歐美都市替代中國在地空間、強烈電影濾鏡、擺拍式苦難、統一網紅臉、無生活痕跡的道具和把紀實誤做成低清髒畫面。",
            PROJECT_STYLE_SCOPE,
        ].join("\n"),
        imageUrl: "/short-drama-styles/real-life.jpg",
    },
];

const legacyStyleUpgrades: Partial<Record<string, ProjectStyleSelection>> = {
    "urban-live-action": { world: "urban", tone: "romantic", medium: "live-action", character: "realistic" },
    "period-live-action": { world: "historical", tone: "epic", medium: "live-action", character: "realistic" },
    "suspense-noir": { world: "suspense", tone: "dark", medium: "live-action", character: "realistic" },
    "chinese-2d": { world: "xianxia", tone: "epic", medium: "2d-guoman", character: "semi-real" },
    "ink-narrative": { world: "xianxia", tone: "healing", medium: "ink", character: "semi-real" },
    "three-d-cartoon": { world: "urban", tone: "light-comedy", medium: "3d-cartoon", character: "stylized" },
    "fantasy-3d": { world: "xianxia", tone: "epic", medium: "3d-anime", character: "semi-real" },
    "future-tech": { world: "science-fiction", tone: "epic", medium: "live-action", character: "realistic" },
    "cyberpunk-neon": { world: "science-fiction", tone: "dark", medium: "live-action", character: "realistic" },
    "space-opera": { world: "science-fiction", tone: "epic", medium: "3d-anime", character: "semi-real" },
    "nature-healing": { world: "pastoral", tone: "healing", medium: "live-action", character: "realistic" },
    "real-life-documentary": { world: "urban", tone: "healing", medium: "live-action", character: "realistic" },
};

const resolvedLegacyCanvasStylePresets = legacyCanvasStylePresets.map((preset) => {
    const upgrade = legacyStyleUpgrades[preset.id];
    if (!upgrade) return preset;
    const compiled = compileCanvasStylePreset(upgrade);
    const upgraded = { ...compiled, id: preset.id, imageUrl: preset.imageUrl };
    return { ...upgraded, profile: createStyleProfileSnapshot({ ...compiled.profile!, presetId: preset.id }) };
});

const resolvableCanvasStylePresets: CanvasStylePreset[] = [...recommendedCanvasStylePresets, ...resolvedLegacyCanvasStylePresets];

// 風格中心不靠重複卡片虛增數量；舊 ID 仍留在解析集合中，保證歷史專案可以恢復。
export const canvasStylePresets: CanvasStylePreset[] = resolvableCanvasStylePresets.filter((preset, index, presets) => presets.findIndex((candidate) => candidate.prompt === preset.prompt) === index);

export function resolveCanvasStylePreset(id?: string) {
    return resolvableCanvasStylePresets.find((preset) => preset.id === id) || customCanvasStylePreset(id);
}

export function resolveProjectCanvasStyle(presetId?: string, profileJson?: string | null): CanvasStylePreset | undefined {
    const preset = resolveCanvasStylePreset(presetId);
    const profile = parseStyleProfile(profileJson);
    if (!profile) return preset;
    return {
        id: profile.presetId,
        title: profile.title,
        category: preset?.category || "專案風格包",
        description: profile.description,
        tags: [...profile.tags],
        prompt: profile.prompt,
        imageUrl: profile.coverUrl || preset?.imageUrl || "/short-drama-styles/real-life.jpg",
        selection: preset?.selection,
        profile,
    };
}

const STYLE_FAVORITES_KEY = "canvas:style-library:favorites";
const STYLE_RECENT_KEY = "canvas:style-library:recent";
const LOCAL_STYLE_PROFILES_KEY = "canvas:style-library:profiles";

type StyleCenterTab = "system" | "mine" | "favorites" | "recent";
type SystemStyleLibraryItem = { kind: "system"; preset: CanvasStylePreset };
type UserStyleLibraryItem = { kind: "user"; preset: CanvasStylePreset; entity: UserStyleProfile };
type StyleLibraryItem = SystemStyleLibraryItem | UserStyleLibraryItem;
type StyleEditorState = { profile: StyleProfileSnapshot; entityId?: string };

export function CanvasStylePickerModal({ open, value, currentProfile, startInEditor = false, applying = false, onClose, onSelect }: {
    open: boolean;
    value?: string;
    currentProfile?: StyleProfileSnapshot | null;
    startInEditor?: boolean;
    applying?: boolean;
    onClose: () => void;
    onSelect: (preset: CanvasStylePreset) => void;
}) {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const theme = canvasThemes[useActiveTheme()];
    const localMode = isLocalWorkspaceMode();
    const [detailPreset, setDetailPreset] = useState<CanvasStylePreset | null>(null);
    const [tab, setTab] = useState<StyleCenterTab>("system");
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("全部");
    const [systemFavoriteIds, setSystemFavoriteIds] = useState<string[]>([]);
    const [recentIds, setRecentIds] = useState<string[]>([]);
    const [editor, setEditor] = useState<StyleEditorState | null>(null);
    const [localProfiles, setLocalProfiles] = useState<UserStyleProfile[]>(readLocalStyleProfiles);
    const profilesQuery = useQuery({ queryKey: ["style-profiles"], queryFn: listStyleProfiles, enabled: open && !localMode });
    const profileEntities = localMode ? localProfiles : profilesQuery.data?.profiles || [];

    useEffect(() => {
        if (!open) return;
        setTab("system");
        setQuery("");
        setCategory("全部");
        setSystemFavoriteIds(readStyleIds(STYLE_FAVORITES_KEY));
        setRecentIds(readStyleIds(STYLE_RECENT_KEY));
        if (localMode) setLocalProfiles(readLocalStyleProfiles());
        setEditor(startInEditor && currentProfile?.source !== "user" && currentProfile ? { profile: editableCopy(currentProfile) } : null);
    }, [currentProfile, localMode, open, startInEditor]);

    const userItems = useMemo<UserStyleLibraryItem[]>(() => profileEntities.flatMap((entity) => {
        const preset = userStylePreset(entity);
        return preset ? [{ kind: "user" as const, preset, entity }] : [];
    }), [profileEntities]);
    const systemItems = useMemo<SystemStyleLibraryItem[]>(() => canvasStylePresets.map((preset) => ({ kind: "system", preset })), []);
    const categories = useMemo(() => ["全部", ...Array.from(new Set(canvasStylePresets.map((preset) => preset.category)))], []);

    useEffect(() => {
        if (!open || !startInEditor || !currentProfile || currentProfile.source !== "user" || editor || (!localMode && (profilesQuery.isFetching || profilesQuery.isError))) return;
        const sourceId = currentProfile.sourceProfileId || currentProfile.presetId;
        const sourceEntity = profileEntities.find((profile) => profile.id === sourceId);
        const sourceProfile = sourceEntity ? parseStyleProfile(sourceEntity.profileJson) : null;
        if (sourceEntity && sourceProfile) {
            setEditor({ profile: editableCopy(sourceProfile, sourceEntity.id), entityId: sourceEntity.id });
            return;
        }
        if (localMode || profilesQuery.isFetched) setEditor({ profile: editableCopy(currentProfile) });
    }, [currentProfile, editor, localMode, open, profileEntities, profilesQuery.isError, profilesQuery.isFetched, profilesQuery.isFetching, startInEditor]);

    const visibleItems = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase("zh-CN");
        let source: StyleLibraryItem[] = tab === "system" ? systemItems : tab === "mine" ? userItems : tab === "favorites"
            ? [...systemItems.filter((item) => systemFavoriteIds.includes(item.preset.id)), ...userItems.filter((item) => item.kind === "user" && item.entity.favorite)]
            : [...userItems.filter((item) => item.kind === "user" && item.entity.lastUsedAt).sort((a, b) => String(b.entity.lastUsedAt).localeCompare(String(a.entity.lastUsedAt))), ...recentIds.flatMap((id) => systemItems.filter((item) => item.preset.id === id))];
        if (tab === "system" && category !== "全部") source = source.filter((item) => item.preset.category === category);
        if (keyword) source = source.filter((item) => `${item.preset.title} ${item.preset.category} ${item.preset.description} ${item.preset.tags.join(" ")}`.toLocaleLowerCase("zh-CN").includes(keyword));
        return source;
    }, [category, query, recentIds, systemFavoriteIds, systemItems, tab, userItems]);

    const saveMutation = useMutation({
        mutationFn: ({ profile, apply }: { profile: StyleProfileSnapshot; apply: boolean }) => {
            if (localMode) {
                const id = editor?.entityId || nanoid();
                const now = new Date().toISOString();
                const existing = localProfiles.find((item) => item.id === id);
                const entity: UserStyleProfile = {
                    id,
                    userId: "local",
                    name: profile.title || "未命名風格",
                    description: profile.description || "",
                    coverUrl: profile.coverUrl || "",
                    tagsJson: JSON.stringify(profile.tags || []),
                    profileJson: serializeStyleProfile(profile),
                    favorite: existing?.favorite ?? false,
                    lastUsedAt: existing?.lastUsedAt,
                    revision: (existing?.revision || 0) + 1,
                    createdAt: existing?.createdAt || now,
                    updatedAt: now,
                };
                const next = [entity, ...localProfiles.filter((item) => item.id !== id)];
                setLocalProfiles(next);
                persistLocalStyleProfiles(next);
                return Promise.resolve({ profile: entity, apply });
            }
            return editor?.entityId
                ? updateStyleProfile(editor.entityId, serializeStyleProfile(profile)).then((result) => ({ ...result, apply }))
                : createStyleProfile(serializeStyleProfile(profile)).then((result) => ({ ...result, apply }));
        },
        onSuccess: async ({ profile, apply }) => {
            await queryClient.invalidateQueries({ queryKey: ["style-profiles"] });
            const preset = userStylePreset(profile);
            setEditor(null);
            setTab("mine");
            message.success("風格已儲存到“我的風格”");
            if (apply && preset) selectItem({ kind: "user", preset, entity: profile });
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "風格儲存失敗"),
    });
    const favoriteMutation = useMutation({
        mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) => {
            if (localMode) {
                const next = localProfiles.map((item) => item.id === id ? { ...item, favorite, updatedAt: new Date().toISOString() } : item);
                setLocalProfiles(next);
                persistLocalStyleProfiles(next);
                return Promise.resolve({ id, favorite });
            }
            return setStyleProfileFavorite(id, favorite);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["style-profiles"] }),
        onError: (error) => message.error(error instanceof Error ? error.message : "收藏狀態更新失敗"),
    });
    const deleteMutation = useMutation({
        mutationFn: (id: string) => {
            if (localMode) {
                const next = localProfiles.filter((item) => item.id !== id);
                setLocalProfiles(next);
                persistLocalStyleProfiles(next);
                return Promise.resolve({ id });
            }
            return deleteStyleProfile(id);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["style-profiles"] }); message.success("風格已刪除"); },
        onError: (error) => message.error(error instanceof Error ? error.message : "風格刪除失敗"),
    });

    function selectItem(item: StyleLibraryItem) {
        if (applying) return;
        const { preset } = item;
        const next = [preset.id, ...recentIds.filter((id) => id !== preset.id)].slice(0, 12);
        setRecentIds(next);
        localStorage.setItem(STYLE_RECENT_KEY, JSON.stringify(next));
        if (item.kind === "user") {
            if (localMode) {
                const nextProfiles = localProfiles.map((entity) => entity.id === item.entity.id ? { ...entity, lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : entity);
                setLocalProfiles(nextProfiles);
                persistLocalStyleProfiles(nextProfiles);
            } else {
                void touchStyleProfile(item.entity.id).then(() => queryClient.invalidateQueries({ queryKey: ["style-profiles"] })).catch((error) => message.warning(error instanceof Error ? error.message : "最近使用記錄更新失敗"));
            }
        }
        onSelect(preset);
    }
    function toggleSystemFavorite(presetId: string) {
        const next = systemFavoriteIds.includes(presetId) ? systemFavoriteIds.filter((id) => id !== presetId) : [presetId, ...systemFavoriteIds];
        setSystemFavoriteIds(next);
        localStorage.setItem(STYLE_FAVORITES_KEY, JSON.stringify(next));
    }
    function createNewStyle() {
        setEditor({ profile: blankUserStyle() });
    }
    function copyPreset(preset: CanvasStylePreset) {
        setEditor({ profile: editableCopy(preset.profile || createStyleProfileSnapshot(preset), undefined, `${preset.title} 副本`, preset.imageUrl) });
    }
    function confirmDelete(entity: UserStyleProfile) {
        modal.confirm({ title: `刪除“${entity.name}”？`, content: "專案中已經儲存的快照不會被刪除，但該風格將從“我的風格”中移除。", okText: "刪除", cancelText: "取消", okButtonProps: { danger: true }, onOk: () => deleteMutation.mutateAsync(entity.id) });
    }

    return (
        <>
            <AppModal rootClassName="canvas-style-picker-modal" open={open} title={null} footer={null} centered width="min(1240px, calc(100vw - 24px))" onCancel={onClose} flush>
                <div className="canvas-style-center-shell flex min-h-0 flex-col overflow-hidden" style={{ color: theme.node.text, background: theme.node.panel }}>
                    <header className="flex min-h-16 flex-col gap-3 border-b px-4 py-3 pr-12 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pr-14" style={{ borderColor: theme.node.stroke }}>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold">風格中心</h2>
                            <p className="mt-0.5 text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}>系統規範 · 個人風格 · 專案快照</p>
                        </div>
                        <div className="flex min-w-0 gap-2 sm:items-center">
                            <Input allowClear className="style-center-search min-w-0 flex-1" prefix={<Search className="size-3.5 text-foreground/35" />} value={query} placeholder="搜尋風格、題材或媒介" onChange={(event) => setQuery(event.target.value)} />
                            <Button type="primary" className="shrink-0" icon={<Plus className="size-3.5" />} onClick={createNewStyle}>新建風格</Button>
                        </div>
                    </header>
                    <div className="style-center-workspace grid min-h-0 flex-1">
                        <aside className="style-center-sidebar thin-scrollbar min-h-0 overflow-auto border-b p-2 sm:p-3 lg:border-b-0 lg:border-r" style={{ borderColor: theme.node.stroke }}>
                            <nav className="style-center-primary-nav flex gap-1 lg:flex-col" aria-label="風格中心檢視">
                                <StyleCenterNavItem active={tab === "system"} icon={<Palette className="size-3.5" />} label="系統風格" count={systemItems.length} onClick={() => setTab("system")} />
                                <StyleCenterNavItem active={tab === "mine"} icon={<UserRound className="size-3.5" />} label="我的風格" count={userItems.length} onClick={() => setTab("mine")} />
                                <StyleCenterNavItem active={tab === "favorites"} icon={<Star className="size-3.5" />} label="收藏" onClick={() => setTab("favorites")} />
                                <StyleCenterNavItem active={tab === "recent"} icon={<Clock3 className="size-3.5" />} label="最近使用" onClick={() => setTab("recent")} />
                            </nav>
                            {tab === "system" ? (
                                <div className="style-center-category-panel mt-2 border-t pt-2 lg:mt-4 lg:pt-3" style={{ borderColor: theme.node.stroke }}>
                                    <div className="hidden px-2 pb-1.5 text-[var(--fs-tiny)] font-medium lg:block" style={{ color: theme.node.muted }}>分類</div>
                                    <nav className="style-center-category-nav flex gap-1 lg:flex-col" aria-label="系統風格分類">
                                        {categories.map((item) => <button key={item} type="button" aria-current={category === item ? "page" : undefined} className={`style-center-category-item h-9 shrink-0 rounded-md px-2.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 ${category === item ? "is-active font-medium" : ""}`} onClick={() => setCategory(item)}>{item}</button>)}
                                    </nav>
                                </div>
                            ) : null}
                        </aside>
                        <main className="flex min-h-0 min-w-0 flex-col">
                            <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-4" style={{ borderColor: theme.node.stroke }}>
                                <div className="min-w-0 truncate text-xs font-medium">{styleCenterViewTitle(tab, category)}</div>
                                <div className="shrink-0 text-[var(--fs-tiny)] tabular-nums" style={{ color: theme.node.muted }}>{visibleItems.length} 個風格</div>
                            </div>
                            <div className="style-center-grid thin-scrollbar min-h-0 flex-1 content-start overflow-y-auto p-3 sm:p-4">
                            {visibleItems.map((item) => (
                                <StyleCenterCard
                                    key={`${item.kind}-${item.preset.id}`}
                                    item={item}
                                    active={item.preset.id === value}
                                    applying={applying}
                                    favorite={item.kind === "user" ? item.entity.favorite : systemFavoriteIds.includes(item.preset.id)}
                                    theme={theme}
                                    onApply={() => selectItem(item)}
                                    onDetail={() => setDetailPreset(item.preset)}
                                    onFavorite={() => item.kind === "user" ? favoriteMutation.mutate({ id: item.entity.id, favorite: !item.entity.favorite }) : toggleSystemFavorite(item.preset.id)}
                                    onCopy={() => copyPreset(item.preset)}
                                    onEdit={item.kind === "user" ? () => setEditor({ profile: editableCopy(item.preset.profile!, item.entity.id), entityId: item.entity.id }) : undefined}
                                    onDelete={item.kind === "user" ? () => confirmDelete(item.entity) : undefined}
                                />
                            ))}
                            {!visibleItems.length ? <EmptyStyleCenter tab={tab} loading={!localMode && profilesQuery.isLoading} failed={!localMode && profilesQuery.isError} color={theme.node.muted} onCreate={createNewStyle} onBrowse={() => { setTab("system"); setQuery(""); }} /> : null}
                            </div>
                        </main>
                    </div>
                </div>
            </AppModal>
            <CanvasStyleDetailModal open={Boolean(detailPreset)} preset={detailPreset} selected={detailPreset?.id === value} onClose={() => setDetailPreset(null)} onSelect={(preset) => { setDetailPreset(null); const item = [...systemItems, ...userItems].find((candidate) => candidate.preset.id === preset.id); if (item) selectItem(item); }} />
            <StyleProfileEditorModal open={Boolean(editor)} initialProfile={editor?.profile || null} saving={saveMutation.isPending} onClose={() => setEditor(null)} onSave={(profile, apply) => saveMutation.mutate({ profile, apply })} />
        </>
    );
}

function readStyleIds(key: string) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 100) : [];
    } catch {
        return [];
    }
}

function readLocalStyleProfiles(): UserStyleProfile[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_STYLE_PROFILES_KEY) || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.filter((value): value is UserStyleProfile => Boolean(value && typeof value === "object" && typeof (value as UserStyleProfile).id === "string" && typeof (value as UserStyleProfile).profileJson === "string")) : [];
    } catch {
        return [];
    }
}

function persistLocalStyleProfiles(profiles: UserStyleProfile[]) {
    try {
        localStorage.setItem(LOCAL_STYLE_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
        // Private browsing or a full local quota should not make system styles unusable.
    }
}

function StyleCenterCard({ item, active, applying, favorite, theme, onApply, onDetail, onFavorite, onCopy, onEdit, onDelete }: { item: StyleLibraryItem; active: boolean; applying: boolean; favorite: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onApply: () => void; onDetail: () => void; onFavorite: () => void; onCopy: () => void; onEdit?: () => void; onDelete?: () => void }) {
    const { preset } = item;
    return (
        <article className={`style-center-card group flex min-w-0 flex-col overflow-hidden rounded-md border ${active ? "is-active" : ""}`} style={{ background: theme.canvas.background, borderColor: active ? theme.node.activeStroke : theme.node.stroke, boxShadow: active ? `inset 0 0 0 1px ${theme.node.activeStroke}` : undefined }}>
            <div className="relative overflow-hidden border-b" style={{ borderColor: theme.node.stroke }}>
                <button type="button" className="style-center-card-cover block w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset" style={{ "--tw-ring-color": theme.node.activeStroke } as CSSProperties} onClick={onDetail} aria-label={`檢視${preset.title}規範`}>
                    <img src={preset.imageUrl} width="640" height="360" alt={`${preset.title}畫風示意`} className="h-full w-full object-cover transition-transform" />
                </button>
                <button type="button" className={`style-center-favorite-action absolute right-2 top-2 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-2 ${favorite ? "is-active" : ""}`} onClick={onFavorite} aria-label={favorite ? "取消收藏" : "收藏"} title={favorite ? "取消收藏" : "收藏"}><Star className="size-3.5" fill={favorite ? "currentColor" : "none"} /></button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-3">
                <div className="flex min-w-0 items-center gap-2 text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}><span className="truncate">{item.kind === "user" ? "我的風格" : preset.category}</span>{active ? <span className="ml-auto flex shrink-0 items-center gap-1 font-medium" style={{ color: theme.node.activeStroke }}><Check className="size-3" />當前</span> : null}</div>
                <h3 className="mt-1.5 truncate text-sm font-semibold">{preset.title}</h3>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5" style={{ color: theme.node.muted }}>{preset.description}</p>
                <div className="mt-2 flex min-h-6 flex-wrap gap-1">{preset.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded bg-foreground/5 px-1.5 py-0.5 text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}>{tag}</span>)}</div>
            </div>
            <footer className="mt-2 flex min-h-11 items-center gap-1 border-t px-2" style={{ borderColor: theme.node.stroke }}>
                <IconAction label="檢視規範" onClick={onDetail}><Eye className="size-3.5" /></IconAction>
                <IconAction label="複製並編輯" onClick={onCopy}><Copy className="size-3.5" /></IconAction>
                {onEdit ? <IconAction label="編輯風格" onClick={onEdit}><Pencil className="size-3.5" /></IconAction> : null}
                {onDelete ? <IconAction label="刪除風格" danger onClick={onDelete}><Trash2 className="size-3.5" /></IconAction> : null}
                <Button type="default" size="small" className={`style-center-apply-button ml-auto ${active ? "is-current" : ""}`} disabled={active || applying} icon={active ? <Check className="size-3.5" /> : <Palette className="size-3.5" />} onClick={onApply}>{active ? "當前" : "應用"}</Button>
            </footer>
        </article>
    );
}

function IconAction({ label, danger = false, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
    return <button type="button" className={`style-center-icon-action grid size-8 place-items-center rounded-md outline-none focus-visible:ring-2 ${danger ? "is-danger" : ""}`} onClick={onClick} aria-label={label} title={label}>{children}</button>;
}

function StyleCenterNavItem({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
    return <button type="button" aria-current={active ? "page" : undefined} className={`style-center-nav-item flex h-11 min-w-fit items-center gap-2 rounded-md px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 lg:w-full ${active ? "is-active font-medium" : ""}`} onClick={onClick}>{icon}<span className="whitespace-nowrap">{label}</span>{count !== undefined ? <span className="ml-auto tabular-nums opacity-55">{count}</span> : null}</button>;
}

function styleCenterViewTitle(tab: StyleCenterTab, category: string) {
    if (tab === "mine") return "我的風格";
    if (tab === "favorites") return "收藏風格";
    if (tab === "recent") return "最近使用";
    return category === "全部" ? "全部系統風格" : category;
}

function EmptyStyleCenter({ tab, loading, failed, color, onCreate, onBrowse }: { tab: StyleCenterTab; loading: boolean; failed: boolean; color: string; onCreate: () => void; onBrowse: () => void }) {
    return <div className="col-span-full grid min-h-64 place-items-center text-center"><div><Search className="mx-auto size-5" style={{ color }} /><p className="mt-2 text-xs font-medium">{loading ? "正在載入風格庫" : failed && tab !== "system" ? "我的風格載入失敗，請檢查登入狀態或後端服務" : tab === "mine" ? "還沒有自己的風格" : tab === "favorites" ? "還沒有收藏風格" : tab === "recent" ? "還沒有使用記錄" : "沒有匹配的系統風格"}</p><div className="mt-3 flex justify-center gap-2">{tab === "mine" && !failed ? <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreate}>新建風格</Button> : null}<Button size="small" onClick={onBrowse}>瀏覽系統風格</Button></div></div></div>;
}

export function userStylePreset(entity: UserStyleProfile): CanvasStylePreset | null {
    const profile = parseStyleProfile(entity.profileJson);
    if (!profile) return null;
    return { id: profile.presetId, title: profile.title, category: "我的風格", description: profile.description, tags: [...profile.tags], prompt: profile.prompt, imageUrl: profile.coverUrl || entity.coverUrl || "/short-drama-styles/real-life.jpg", profile };
}

function blankUserStyle(): StyleProfileSnapshot {
    return createStyleProfileSnapshot({ presetId: `draft-${nanoid()}`, title: "未命名風格", description: "", tags: [], prompt: "", assets: [], source: "user", revision: 1 });
}

function editableCopy(profile: StyleProfileSnapshot, entityId?: string, title?: string, coverUrl?: string): StyleProfileSnapshot {
    return createStyleProfileSnapshot({ ...profile, presetId: entityId || `draft-${nanoid()}`, sourceProfileId: entityId, title: title || profile.title, coverUrl: profile.coverUrl || coverUrl, source: "user", revision: entityId ? profile.revision : 1 });
}

export function CanvasStyleDetailModal({ open, preset, selected = false, onClose, onSelect }: { open: boolean; preset: CanvasStylePreset | null; selected?: boolean; onClose: () => void; onSelect?: (preset: CanvasStylePreset) => void }) {
    const theme = canvasThemes[useActiveTheme()];
    const sections = preset ? parseStyleSections(preset.prompt) : [];
    return (
        <AppModal rootClassName="canvas-style-detail-modal" open={open} title={null} footer={null} centered destroyOnHidden width="min(820px, calc(100vw - 24px))" onCancel={onClose} flush>
            {preset ? <div className="canvas-style-detail-shell flex flex-col overflow-hidden" style={{ color: theme.node.text, background: theme.node.panel }}>
                <div className="flex h-44 shrink-0 items-center justify-center overflow-hidden border-b sm:h-52" style={{ borderColor: theme.node.stroke, background: theme.canvas.background }}>
                    <img src={preset.imageUrl} width="960" height="540" alt={`${preset.title}畫風示意`} className="h-full w-full object-contain" style={preset.id === "black-white-noir" ? { filter: "grayscale(1) contrast(1.08)" } : undefined} />
                </div>
                <header className="border-b px-4 py-3 pr-12 sm:px-5 sm:pr-12" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex items-center gap-2 text-[var(--fs-tiny)] font-medium" style={{ color: theme.node.activeStroke }}><span>{preset.category}</span><span className="flex items-center gap-1" style={{ color: theme.node.muted }}><SlidersHorizontal className="size-3" />{preset.profile?.assets.length ? `${preset.profile.assets.length} 個執行資產` : "Prompt 通用"}</span></div>
                    <h2 className="mt-1 text-base font-semibold">{preset.title}</h2>
                    <p className="mt-1.5 text-xs leading-5" style={{ color: theme.node.muted }}>{preset.description}</p>
                </header>
                <div className="grid shrink-0 grid-cols-3 divide-x border-b text-[var(--fs-tiny)]" style={{ borderColor: theme.node.stroke }}>
                    <StyleDetailMetric label="執行方式" value={preset.profile?.assets.length ? "組合資產" : "Prompt 通用"} muted={theme.node.muted} />
                    <StyleDetailMetric label="執行策略" value={preset.profile?.executionPolicy === "strict-assets" ? "嚴格校驗" : "相容降級"} muted={theme.node.muted} />
                    <StyleDetailMetric label="快照版本" value={`r${preset.profile?.revision || 1}`} muted={theme.node.muted} />
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5">
                    {preset.profile?.assets.length ? <section className="border-b py-3" style={{ borderColor: theme.node.stroke }}><h3 className="text-xs font-semibold">執行資產</h3><div className="mt-2 divide-y" style={{ borderColor: theme.node.stroke }}>{preset.profile.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-medium">{asset.title}</span><span className="mt-0.5 block text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}>{kindOptionsLabel(asset.kind)} · {asset.provider}</span></span><span className="shrink-0 text-[var(--fs-tiny)]" style={{ color: theme.node.muted }}>{asset.status === "validated" ? "已驗證" : asset.status === "unavailable" ? "不可用" : "待驗證"}</span></div>)}</div></section> : null}
                    {sections.map((section) => <section key={section.title} className="border-b py-3 last:border-b-0" style={{ borderColor: theme.node.stroke }}><h3 className="text-xs font-semibold">{section.title}</h3><p className="mt-1.5 text-xs leading-5" style={{ color: theme.node.muted }}>{section.content}</p></section>)}
                    {preset.profile?.negativePrompt ? <section className="border-b py-3 last:border-b-0" style={{ borderColor: theme.node.stroke }}><h3 className="text-xs font-semibold">全域性負面 Prompt</h3><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5" style={{ color: theme.node.muted }}>{preset.profile.negativePrompt}</p></section> : null}
                </div>
                <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-4 py-3 sm:px-5" style={{ borderColor: theme.node.stroke }}><Button onClick={onClose}>關閉</Button>{onSelect ? <Button type="primary" disabled={selected} icon={selected ? <Check className="size-3.5" /> : <Palette className="size-3.5" />} onClick={() => onSelect(preset)}>{selected ? "當前畫風" : "選擇該畫風"}</Button> : null}</footer>
            </div> : null}
        </AppModal>
    );
}

function StyleDetailMetric({ label, value, muted }: { label: string; value: string; muted: string }) {
    return <div className="min-w-0 px-3 py-2.5 text-center"><span className="block" style={{ color: muted }}>{label}</span><span className="mt-0.5 block truncate font-medium">{value}</span></div>;
}

function kindOptionsLabel(kind: string) {
    return kind === "lora" ? "LoRA" : kind === "template" ? "圖片模板" : kind === "reference" ? "參考圖組" : "提示詞模組";
}

function parseStyleSections(prompt: string) {
    return prompt.split("\n").map((line) => {
        const match = line.match(/^【([^】]+)】(.*)$/);
        return match ? { title: match[1], content: match[2] } : { title: "補充規範", content: line };
    }).filter((section) => section.content);
}
