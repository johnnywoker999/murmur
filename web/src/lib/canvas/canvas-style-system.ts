import type { StyleProfileSnapshot } from "@/lib/canvas/style-profile";

export type ProjectStyleWorldId = "xianxia" | "urban" | "historical" | "suspense" | "science-fiction" | "pastoral";
export type ProjectStyleToneId = "epic" | "dark" | "light-comedy" | "romantic" | "healing";
export type ProjectStyleMediumId = "live-action" | "3d-anime" | "3d-cartoon" | "2d-guoman" | "ink";
export type ProjectStyleCharacterId = "realistic" | "semi-real" | "anime" | "stylized";

export type ProjectStyleSelection = {
    world: ProjectStyleWorldId;
    tone: ProjectStyleToneId;
    medium: ProjectStyleMediumId;
    character: ProjectStyleCharacterId;
};

export type CanvasStylePreset = {
    id: string;
    title: string;
    category: string;
    description: string;
    tags: string[];
    prompt: string;
    imageUrl: string;
    selection?: ProjectStyleSelection;
    profile?: StyleProfileSnapshot;
};

type StyleOption<T extends string> = {
    id: T;
    label: string;
    description: string;
    prompt: string;
    palette?: string;
    wardrobe?: string;
    environment?: string;
    motion?: string;
    forbidden: string;
};

export const projectStyleWorlds: Array<StyleOption<ProjectStyleWorldId>> = [
    {
        id: "xianxia",
        label: "仙俠",
        description: "宗門、仙城、洞府、雲海與法術規則共同構成東方修行世界。",
        prompt: "東方仙俠世界以宗門、境界、法器、靈獸和因果秩序為基礎；奇觀從中式山水、木構建築、道家意象和修行體系演化，所有地點共享明確的時代、地理與力量規則。",
        palette: "雲霧白、黛青、青玉、硃砂、古銅與陣營能量色",
        wardrobe: "袍服、勁裝、甲冑、宗門紋樣、發冠、腰封和法器按身份與陣營建立穩定資產層級",
        environment: "山門、殿宇、樓閣、洞府、仙城、雲海、古戰場和凡間城鎮採用中式結構與東方山水空間",
        motion: "御劍、身法、法術和衣袍運動必須有起勢、蓄力、受力與落點，力量等級通過規模和環境反饋表達",
        forbidden: "歐洲城堡、哥特教堂、日式鳥居、西式魔法陣、隨機遊戲 UI、宗門與法術規則漂移",
    },
    {
        id: "urban",
        label: "當代都市",
        description: "以可信中國城市、職業身份與生活關係組織現代短劇。",
        prompt: "當代中國都市世界以職業、家庭、收入、社群和城市公共生活為基礎；人物行動、空間功能、中文標識與生活設施必須符合明確城市和社會語境。",
        palette: "中性白、霧灰、淺木、水泥色與剋制的角色識別色",
        wardrobe: "服裝按職業、收入、季節和性格建立衣櫥，固定配飾承擔角色識別",
        environment: "辦公室、公寓、學校、醫院、商場、街區、社群和公共交通保持本地尺度與使用痕跡",
        motion: "表演貼近日常重心、停頓和微表情，鏡頭運動服務人物關係與資訊揭示",
        forbidden: "歐美城市替代、空洞樣板間、錯誤中文、無職業邏輯服裝、網紅濾鏡和廣告擺拍",
    },
    {
        id: "historical",
        label: "古裝歷史",
        description: "先鎖定單一時代，再統一禮制、服化道、器物與建築。",
        prompt: "歷史世界必須先依據故事鎖定唯一朝代或年代子型別，人物制度、禮儀、服飾、兵器、器物、交通與建築全部服從同一考據基線。",
        palette: "米白、黛灰、木褐、土黃、靛青、竹青與有限硃砂金色",
        wardrobe: "襟形、袖型、腰帶、冠帽、鞋履和紋樣按時代、階層與身份建立制度",
        environment: "木構、院落、迴廊、城鎮、宮署、鄉野和道路遵循所選時代的結構與材料",
        motion: "人物動作考慮禮制、服裝重量、兵器慣性和具體生活勞動",
        forbidden: "朝代混搭、現代拉鏈傢俱、日式或歐式建築、塑膠飾品和現代偶像妝",
    },
    {
        id: "suspense",
        label: "懸疑犯罪",
        description: "真實城市紋理、線索系統和心理壓力構成可讀的懸疑世界。",
        prompt: "現代懸疑世界以案件、秘密、身份關係和可追蹤線索構成，地點佈局、關鍵道具、傷痕與時間線必須穩定，資訊隱藏不能犧牲畫面可讀性。",
        palette: "炭灰、冷水泥、舊木、髒黃實景燈與少量危險強調色",
        wardrobe: "職業服飾、制服、便裝和關鍵隨身物按身份與時間線建立版本",
        environment: "舊居民樓、辦公空間、街巷、倉儲、地下空間和城郊設施保持同一城市地域",
        motion: "觀察、跟隨、遮擋和反應鏡頭服務線索揭示，避免把晃動當作懸疑",
        forbidden: "黑成不可讀、霓虹燈海、過量煙霧、血漿獵奇、反派臉譜化和線索資產變形",
    },
    {
        id: "science-fiction",
        label: "未來科幻",
        description: "技術規則、社會結構與功能性空間共同支撐未來敘事。",
        prompt: "未來世界必須先確定技術水平、能源、交通、通訊和社會組織規則；科技資產具有可理解的功能、介面與使用限制，奇觀必須反映文明尺度而非隨機堆砌發光物。",
        palette: "深空黑、冷灰、銀白、艙體白與單一陣營或能源強調色",
        wardrobe: "工作服、制服、航天或防護裝備按功能與陣營模組化設計",
        environment: "艦船、空間站、未來城市、實驗設施和居住空間遵循結構、維護與照明邏輯",
        motion: "運動體現裝置重量、慣性、空間限制和技術反饋",
        forbidden: "無功能 HUD、隨機霓虹、現實品牌、技術規則漂移、裝備介面變化和無尺度參照",
    },
    {
        id: "pastoral",
        label: "自然鄉野",
        description: "地域、季節、生活勞動和自然環境共同參與敘事。",
        prompt: "自然鄉野世界以明確地域、季節、家庭關係和生活勞動為基礎；植物、天氣、住宅、工具與集市不是裝飾，而是持續參與人物行動和關係變化的真實環境。",
        palette: "葉綠、苔蘚綠、土色、舊木、天空色、米白與季節性角色點色",
        wardrobe: "棉麻、針織、舊牛仔、工作服、雨具和手作物保留褶皺與使用痕跡",
        environment: "村鎮住宅、林間小屋、農場、河岸、菜園、集市和小城邊緣具有地域證據",
        motion: "風、雨、植物、動物和細小生活動作形成自然節奏",
        forbidden: "商業民宿廣告感、歐美鄉村替代、隨機換季、無生活痕跡和過度航拍空鏡",
    },
];

export const projectStyleTones: Array<StyleOption<ProjectStyleToneId>> = [
    {
        id: "epic",
        label: "宏大敘事",
        description: "用尺度、秩序與人物命運建立史詩感，不靠全程陰暗和特效堆積。",
        prompt: "敘事氣質莊重、開闊、有歷史與命運重量；宏大場面負責建立空間和力量關係，人物鏡頭負責承接選擇與代價，奇觀和表演之間保持清晰主次。",
        palette: "高明度空間層次、穩定陣營色與少量高亮奇觀色，暗部保留細節",
        motion: "建立鏡頭剋制而有尺度，高潮運動有明確起止，人物反應獲得停頓",
        forbidden: "全片低照度、無休止慢動作、每鏡航拍、特效蓋住人物、只有規模沒有情緒落點",
    },
    {
        id: "dark",
        label: "暗黑詭譎",
        description: "以未知、禁忌和心理壓力形成黑暗氣質，同時保持資訊可讀。",
        prompt: "敘事氣質危險、剋制、帶未知感；恐懼來自空間、規則和人物反應，不依賴血漿、全黑畫面或持續尖叫。",
        palette: "低調但可讀的冷暖分割槽，危險色只用于禁忌、敵意或線索",
        motion: "更多觀察、遮擋、緩慢揭示和反應停頓，爆發運動只用於關鍵破局",
        forbidden: "黑成不可讀、血腥獵奇、廉價紅黑濾鏡、全屏煙霧、無來源閃光和持續鏡頭抖動",
    },
    {
        id: "light-comedy",
        label: "輕喜劇",
        description: "宏觀處境與人物一本正經的反應形成反差，畫面明快但不幼稚。",
        prompt: "敘事氣質輕鬆、機敏、有人情味；笑點依靠人物關係、反應、停頓和處境反差，允許宏大世界承載小人物式幽默，不把喜劇等同於誇張鬼臉。",
        palette: "清晰明快的中高明度色彩，角色與背景保持穩定分離，危險場面也避免恐怖化壓黑",
        motion: "動作有清楚預備、落點和喜劇停頓，反應鏡頭與正經表演優先於炫技運鏡",
        forbidden: "陰森恐怖基調、兒童節目式糖果色、所有角色做鬼臉、連續快切和笑點被特效淹沒",
    },
    {
        id: "romantic",
        label: "唯美浪漫",
        description: "以人物距離、光線和環境細節表達關係變化，避免濾鏡化糖水感。",
        prompt: "敘事氣質細膩、含蓄、具有關係張力；浪漫來自視線、距離、觸碰、環境變化和未說出口的情緒，不依賴隨機花瓣與持續柔焦。",
        palette: "自然膚色、柔和冷暖關係與剋制的情緒點色",
        motion: "鏡頭靠近人物和細節，運動緩慢而有情緒動機，保留呼吸與停頓",
        forbidden: "全程柔焦、過曝膚色、隨機花瓣、MV 式空鏡、無表演的慢動作和濾鏡漂移",
    },
    {
        id: "healing",
        label: "溫暖治癒",
        description: "通過生活行動、環境觸感和關係修復形成溫暖，而不是泛化柔光。",
        prompt: "敘事氣質溫暖、鬆弛、具體；治癒來自可見的照料、勞動、陪伴和關係變化，環境材質與自然聲音參與情緒表達。",
        palette: "自然中高明度、溫暖但不過黃，保留木、布、植物和膚色的真實層次",
        motion: "觀察細小動作、呼吸、眼神和環境響應，節奏舒展但不空洞",
        forbidden: "全片奶油濾鏡、過度暖黃、無劇情自然空鏡、廣告式精緻和人物永遠微笑",
    },
];

export const projectStyleMedia: Array<StyleOption<ProjectStyleMediumId> & { characters: ProjectStyleCharacterId[] }> = [
    {
        id: "live-action",
        label: "真人實拍",
        description: "真實演員、可信光學、服化道和物理環境。",
        prompt: "採用真人影視拍攝媒介：真實人物比例、自然皮膚與髮絲、可信鏡頭光學和現場光源，服裝、建築、道具與特效保持真實材質響應。",
        motion: "動作遵循真實重心、慣性、衣料重量和攝影機物理運動",
        forbidden: "動畫角色、遊戲 CG、塑膠皮膚、過度磨皮、虛假棚拍和無物理依據的材質",
        characters: ["realistic", "semi-real"],
    },
    {
        id: "3d-anime",
        label: "3D 動漫",
        description: "高品質三維動畫、東方動漫造型與電影化場景。",
        prompt: "採用高品質 3D 動漫媒介：清晰三維體積、統一 PBR 或風格化 PBR 材質、受控次表面散射、穩定拓撲和電影級燈光；保持動畫角色的設計感，不滑向真人恐怖谷或廉價遊戲過場。",
        motion: "動畫具備明確關鍵姿勢、預備動作、跟隨、受力和停頓，特效與角色動作共享同一空間和光照",
        forbidden: "廉價手遊 CG、塑膠手辦反光、僵硬待機動作、真人毛孔皮膚、角色與背景渲染體系不一致",
        characters: ["semi-real", "anime"],
    },
    {
        id: "3d-cartoon",
        label: "3D 卡通",
        description: "風格化比例、清晰剪影、柔和材質和可讀表情。",
        prompt: "採用風格化 3D 卡通動畫媒介：簡練幾何、清晰剪影、半啞光材質、柔和次表面散射和可讀表情；場景與角色使用同一圓角、粗糙度和細節密度體系。",
        motion: "角色運動使用適度擠壓拉伸、跟隨、緩入緩出和清晰停頓，誇張建立在穩定骨架與關節結構上",
        forbidden: "塑膠公仔、所有角色同臉、過大玻璃眼、僵硬 T Pose、關節穿模和寫實資產混入",
        characters: ["stylized"],
    },
    {
        id: "2d-guoman",
        label: "國漫 2D",
        description: "穩定線稿、賽璐璐角色與東方繪景體系。",
        prompt: "採用國漫 2D 動畫媒介：有粗細變化的穩定線稿、兩至三階賽璐璐明暗、清晰角色剪影和東方繪景層次；全專案保持二維繪畫語言。",
        motion: "使用明確關鍵姿勢、有限但準確的二維運動，口型、髮絲、衣襬與特效遵循統一幀間節奏",
        forbidden: "三維塑膠質感、真人照片、線寬漂移、角色轉面失真、背景與角色畫法不一致",
        characters: ["semi-real", "anime", "stylized"],
    },
    {
        id: "ink",
        label: "水墨動畫",
        description: "宣紙、墨階、筆勢與留白構成可識別的東方敘事。",
        prompt: "採用中國水墨動畫媒介：宣紙纖維、乾溼筆觸、飛白、積墨、破墨與有限工筆勾線；留白、墨階和固定點色共同塑造空間與人物身份。",
        motion: "輪廓先行、筆勢跟隨、墨跡生長與消散遵循統一規則，人物結構在變化中保持可識別",
        forbidden: "隨機潑墨、角色五官消失、西式水彩、全屏髒灰、廉價紙紋濾鏡和隨機文字印章",
        characters: ["semi-real", "stylized"],
    },
];

export const projectStyleCharacters: Array<StyleOption<ProjectStyleCharacterId>> = [
    {
        id: "realistic",
        label: "寫實人物",
        description: "真實骨相、年齡、皮膚和身體比例。",
        prompt: "角色採用真實東亞骨相、自然年齡和真實身體比例，通過臉型、五官、髮型、體型、姿態與生活痕跡建立差異；保留自然皮膚和微表情。",
        forbidden: "網紅同臉、過度磨皮、幼態大眼、年齡漂移、歐美預設臉和誇張動漫比例",
    },
    {
        id: "semi-real",
        label: "半寫實模擬人",
        description: "東方骨相與理想化造型平衡，保留可信結構。",
        prompt: "角色採用半寫實東方造型：可信骨骼、肌肉和關節結構，五官適度理想化但保留年齡與身份差異；髮絲、皮膚和服裝細節服從所選媒介，不進入恐怖谷。",
        forbidden: "真人掃描僵硬感、統一偶像臉、毛孔級過度寫實、假睫毛模板和身體比例漂移",
    },
    {
        id: "anime",
        label: "動漫角色",
        description: "修長比例、清晰五官設計和穩定角色剪影。",
        prompt: "角色採用東方動漫造型：約 7 至 8 頭身，五官、髮束、眼形和服裝結構高度可識別；誇張集中在設計語言和表情，不破壞身體結構與身份穩定性。",
        forbidden: "低幼大頭、過大玻璃眼、隨機發色、所有角色同一臉型、五官在轉面中漂移",
    },
    {
        id: "stylized",
        label: "風格化卡通",
        description: "誇張比例與可讀表情服務喜劇和輕鬆敘事。",
        prompt: "角色採用統一的風格化卡通比例：成人約 5 至 6 頭身，兒童約 3.5 至 4.5 頭身，頭手可適度誇張；通過眼鼻嘴比例、髮型、體型和剪影建立顯著差異。",
        forbidden: "所有角色同臉、頭身隨機變化、過大玻璃眼、關節結構錯誤、塑膠玩具感和僵硬表情",
    },
];

export const defaultProjectStyleSelection: ProjectStyleSelection = {
    world: "xianxia",
    tone: "epic",
    medium: "3d-anime",
    character: "semi-real",
};

const STYLE_SCOPE = "【使用邊界】本規範鎖定專案級題材世界、敘事氣質、視覺媒介、角色造型、資產材質與影像基線。單鏡頭的劇情動作、構圖、景別、機位、運鏡、光源位置和天氣由分鏡按本規範創作，不得機械複製專案級描述。";

export function compatibleProjectStyleCharacters(mediumId: ProjectStyleMediumId) {
    const allowed = projectStyleMedia.find((item) => item.id === mediumId)?.characters || [];
    return projectStyleCharacters.filter((item) => allowed.includes(item.id));
}

export function compileCanvasStylePreset(selection: ProjectStyleSelection): CanvasStylePreset {
    const world = requiredOption(projectStyleWorlds, selection.world);
    const tone = requiredOption(projectStyleTones, selection.tone);
    const medium = requiredOption(projectStyleMedia, selection.medium);
    const compatibleCharacters = compatibleProjectStyleCharacters(selection.medium);
    const character = compatibleCharacters.find((item) => item.id === selection.character) || compatibleCharacters[0];
    const resolvedSelection = { ...selection, character: character.id };
    const title = `${world.label} · ${tone.label} · ${medium.label}`;
    const preset = {
        id: styleSelectionId(resolvedSelection),
        title,
        category: `${world.label} / ${medium.label}`,
        description: `${world.description}${tone.description}${medium.description}`,
        tags: [world.label, tone.label, medium.label, character.label],
        imageUrl: stylePreviewImage(resolvedSelection),
        selection: resolvedSelection,
        prompt: [
            `【風格組合】題材世界：${world.label}；敘事氣質：${tone.label}；視覺媒介：${medium.label}；角色造型：${character.label}。以下四項必須同時成立，後續角色、場景、分鏡和影片不得擅自替換其中任一維度。`,
            `【專案定位】面向“${world.label}”題材的${tone.label}${medium.label}專案，以統一世界規則、角色資產和視覺媒介支撐連續敘事；專案規範只定義長期穩定的美術基線，不代替單鏡頭導演設計。`,
            `【題材世界觀】${world.prompt}`,
            `【敘事氣質】${tone.prompt}`,
            `【視覺媒介】${medium.prompt} 成片保持高畫質可讀的主體輪廓、穩定材質和受控高光；高畫質不等於過度銳化、磨皮或無來源泛光。`,
            `【角色設計系統】${character.prompt}`,
            `【專案色彩與光影】基礎色彩來自${world.palette}；本專案採用${tone.palette}。色彩按角色、陣營、地點和敘事功能分配，保證人物與環境具有穩定的明度和色相分離。`,
            `【服飾、材質與場景】${world.wardrobe}；${world.environment}。所有材質和細節密度遵循“${medium.label}”媒介，不混入其他渲染體系。`,
            `【影像與動態基線】${tone.motion}；${medium.motion}；${world.motion}。分鏡必須先確定鏡頭敘事意圖，再選擇景別與運鏡。`,
            "【資產一致性】角色固定臉型、五官比例、髮型、頭身、服裝、道具和陣營色；主要場景固定空間佈局、建築模組、材質與照明基線；換裝、受損、升級和時間變化必須形成明確資產版本。",
            `【全域性停用】${world.forbidden}；${tone.forbidden}；${medium.forbidden}；${character.forbidden}。`,
            STYLE_SCOPE,
        ].join("\n"),
    } satisfies CanvasStylePreset;
    return { ...preset, profile: createBuiltinStyleProfile(preset) };
}

function createBuiltinStyleProfile(preset: Omit<CanvasStylePreset, "profile">): StyleProfileSnapshot {
    return {
        schemaVersion: 1,
        presetId: preset.id,
        title: preset.title,
        description: preset.description,
        tags: [...preset.tags],
        prompt: preset.prompt,
        selection: preset.selection ? { ...preset.selection } : undefined,
        assets: [],
        executionPolicy: "compatible-fallback",
        source: "builtin",
        revision: 1,
    };
}

export function parseCanvasStyleSelection(id?: string): ProjectStyleSelection | null {
    if (!id?.startsWith("v2-")) return null;
    const parts = id.slice(3).split("--");
    if (parts.length !== 4) return null;
    const selection = { world: parts[0], tone: parts[1], medium: parts[2], character: parts[3] } as ProjectStyleSelection;
    if (!projectStyleWorlds.some((item) => item.id === selection.world)
        || !projectStyleTones.some((item) => item.id === selection.tone)
        || !projectStyleMedia.some((item) => item.id === selection.medium)
        || !projectStyleCharacters.some((item) => item.id === selection.character)) return null;
    return selection;
}

export function customCanvasStylePreset(id?: string) {
    const selection = parseCanvasStyleSelection(id);
    return selection ? compileCanvasStylePreset(selection) : undefined;
}

const recommendedSelections: ProjectStyleSelection[] = [
    { world: "xianxia", tone: "epic", medium: "3d-anime", character: "semi-real" },
    { world: "xianxia", tone: "dark", medium: "3d-anime", character: "semi-real" },
    { world: "xianxia", tone: "light-comedy", medium: "3d-cartoon", character: "stylized" },
    { world: "xianxia", tone: "epic", medium: "live-action", character: "realistic" },
    { world: "urban", tone: "light-comedy", medium: "live-action", character: "realistic" },
    { world: "suspense", tone: "dark", medium: "live-action", character: "realistic" },
    { world: "pastoral", tone: "healing", medium: "3d-cartoon", character: "stylized" },
    { world: "historical", tone: "romantic", medium: "2d-guoman", character: "semi-real" },
];

export const recommendedCanvasStylePresets = recommendedSelections.map(compileCanvasStylePreset);

function styleSelectionId(selection: ProjectStyleSelection) {
    return `v2-${selection.world}--${selection.tone}--${selection.medium}--${selection.character}`;
}

function stylePreviewImage(selection: ProjectStyleSelection) {
    if (selection.world === "xianxia") {
        if (selection.medium === "live-action") return "/short-drama-styles/period-live-action.jpg";
        if (selection.medium === "3d-cartoon") return "/short-drama-styles/three-d-cartoon.jpg";
        if (selection.medium === "2d-guoman") return "/short-drama-styles/chinese-2d.jpg";
        if (selection.medium === "ink") return "/short-drama-styles/ink-narrative.jpg";
        return "/short-drama-styles/fantasy-3d.jpg";
    }
    if (selection.world === "suspense") return "/short-drama-styles/suspense-noir.jpg";
    if (selection.world === "science-fiction") return "/short-drama-styles/future-tech.jpg";
    if (selection.world === "pastoral") return "/short-drama-styles/nature-healing.jpg";
    if (selection.world === "historical") return selection.medium === "2d-guoman" ? "/short-drama-styles/chinese-2d.jpg" : "/short-drama-styles/period-live-action.jpg";
    return selection.medium === "3d-cartoon" ? "/short-drama-styles/three-d-cartoon.jpg" : "/short-drama-styles/urban-live-action.jpg";
}

function requiredOption<T extends string>(options: Array<StyleOption<T>>, id: T) {
    const option = options.find((item) => item.id === id);
    if (!option) throw new Error(`未知專案畫風選項：${id}`);
    return option;
}
