import type { CreationMode } from "./creation-types";

export type CreationInspiration = { title: string; description: string; image: string; mode: CreationMode; prompt: string; featured?: boolean; source?: string };

export const creationFeaturedWorks: CreationInspiration[] = [
    {
        title: "雨夜霓虹 · 電影感開場",
        description: "寬銀幕構圖、環境反光與緩慢推進鏡頭",
        image: "/short-drama-styles/cyberpunk-neon.jpg",
        mode: "video",
        prompt: "雨夜城市街口，霓虹燈倒映在溼潤路面，主角撐傘穿過人群，鏡頭從遠景緩慢推進到側臉特寫，電影感光影，16:9",
        featured: true,
    },
    {
        title: "港風天台重逢",
        description: "復古色彩與剋制的人物情緒",
        image: "/short-drama-styles/retro-hong-kong.jpg",
        mode: "video",
        prompt: "九十年代港風天台，黃昏逆光，兩位多年未見的舊友隔著晾衣繩對望，風吹動衣角，鏡頭輕微手持並緩慢靠近",
    },
    {
        title: "暗巷懸疑追逐",
        description: "高反差黑色電影與緊張節奏",
        image: "/short-drama-styles/suspense-noir.jpg",
        mode: "video",
        prompt: "黑白懸疑電影風格，偵探在狹窄暗巷中追逐神秘人，路燈切割出強烈明暗，低機位跟拍，節奏逐漸加快",
    },
    {
        title: "東方幻想角色設定",
        description: "角色概念圖與細膩材質表達",
        image: "/short-drama-styles/fantasy-3d.jpg",
        mode: "image",
        prompt: "東方幻想世界的年輕女劍客角色設定，銀白髮飾、層疊輕甲與紅色披風，山霧背景，細膩材質，電影級概念設計",
    },
    {
        title: "溫暖室內對話",
        description: "生活化場景與柔和敘事氛圍",
        image: "/welcome/wing-it/barn.webp",
        mode: "text",
        prompt: "請幫我寫一場發生在暖色燈光客廳裡的母女對話戲：女兒準備離開家鄉，母親表面平靜但一直在整理舊物，用動作和潛臺詞推進情緒。",
    },
    { title: "森林裡的最後一封信", description: "童話敘事 · 從角色願望建立衝突", image: "/short-drama-styles/storybook-fantasy.jpg", mode: "text", source: "Storyteller", prompt: "作為故事講述者，為親子觀眾寫一個關於堅持的森林童話。主角是一隻替動物送信的小狐狸，它必須在第一場雪之前送出一封沒有地址的信。先給出角色的願望與阻礙，再設計三個遞進的事件，最後用一個可見的行動完成情緒轉折。避免說教。" },
    { title: "末班車上的陌生人", description: "短劇編劇 · 讓對白藏住真正目的", image: "/short-drama-styles/urban-live-action.jpg", mode: "text", source: "Screenwriter", prompt: "作為編劇，設計一段發生在末班公交車上的三分鐘短劇。兩位陌生人都聲稱自己丟失了一本筆記，但只有一人說真話。先定義人物動機、場景限制和各自隱瞞的資訊，再寫動作、對白與反轉結尾。全劇限制兩個角色、一個場景，適合低成本實拍。" },
    { title: "未來城市的記憶修補師", description: "科幻大綱 · 世界規則與人物代價", image: "/short-drama-styles/future-tech.jpg", mode: "text", source: "Novelist", prompt: "作為小說家，構思一部關於記憶修補師的未來都市短篇。城市居民能刪除痛苦記憶，但主角發現每次刪除都會遺失一種顏色。建立三條世界規則、主人公的核心缺陷、五個轉折和付出代價的結局。先交付故事大綱，不直接鋪寫長篇。" },
    { title: "把告別寫成一場雨", description: "詩性旁白 · 少解釋，多感官細節", image: "/short-drama-styles/nature-healing.jpg", mode: "text", source: "Poet", prompt: "作為詩人，為一段雨中離鄉的影像寫四組中文旁白，每組不超過四十字。分別使用氣味、觸感、聲音與光線表達告別，不直接使用悲傷、不捨或想念等情緒詞。用樸素、可朗讀的語言，給每組留一個停頓。" },
    { title: "一瓶飲料的夏日故事", description: "廣告策劃 · 人群、主張與三個鏡頭", image: "/short-drama-styles/real-life.jpg", mode: "text", source: "Advertiser", prompt: "作為廣告策劃，為面向年輕通勤者的無糖氣泡飲料設計十五秒廣告。定義目標人群、核心場景和一句傳播主張，再給出三個鏡頭的畫面、時長、音效與字幕。不要虛構營養或功效資料，用下班後一口清爽的體驗講故事。" },
    { title: "獨立咖啡店的視覺語言", description: "品牌創意 · 讓配色和語氣講同一件事", image: "/short-drama-styles/retro-hong-kong.jpg", mode: "text", source: "Creative Branding Strategist", prompt: "作為品牌策略師，為社群裡一家安靜的獨立咖啡店提出三種視覺方向。品牌重視慢節奏、鄰裡關係和手作。每種方向包含色彩、攝影氛圍、文字語氣、三條社交內容主題和差異化理由。不要模仿已有連鎖品牌的標識。" },
    { title: "給劇本做一次鏡頭診斷", description: "創作復盤 · 從敘事到聲音提出修改", image: "/short-drama-styles/black-white-noir.jpg", mode: "text", source: "Film Critic", prompt: "請以電影評論者的視角審閱我接下來提供的劇本或分鏡，從敘事、人物、構圖、運鏡和聲音五個維度提出反饋。每條意見都引用我提供的片段，並給出一個能實際拍攝的修改方案。還沒有收到材料時，先向我索取，不要假裝看過影片。" },
    { title: "舊城街景的時代考據", description: "歷史場景 · 區分史實、推測和虛構", image: "/short-drama-styles/period-live-action.jpg", mode: "text", source: "Historian", prompt: "作為歷史研究者，協助我設計民國早期城市街景的影視場景。先問清具體年份、地點和人物階層，再列出服飾、交通、招牌、建築和日常用語的考據清單。明確區分有來源的史實、合理推測與戲劇性虛構，不編造文獻。" },
    { title: "月面獨行", description: "遠景到特寫 · 太空探索的孤獨感", image: "/short-drama-styles/space-opera.jpg", mode: "video", prompt: "月球背面的荒原，宇航員獨自走向一座廢棄天線。鏡頭從極遠景緩慢推進，低角度陽光在月塵上拉出長影，步伐沉重，頭盔反射星光，剋製冷色，寬銀幕電影構圖，無字幕。" },
    { title: "手作星球早餐", description: "定格動畫 · 柔軟材質與小動作", image: "/short-drama-styles/clay-stop-motion.jpg", mode: "video", prompt: "黏土定格動畫風格，一位小小宇航員在圓形廚房煎一顆星星形狀的雞蛋，雞蛋輕輕跳起。手作指紋質感、暖奶油色、柔和側光，固定中景，動作簡短連續，可愛但不誇張。" },
    { title: "山水之間的一葉舟", description: "水墨留白 · 橫向移鏡與輕霧", image: "/short-drama-styles/ink-narrative.jpg", mode: "video", prompt: "中國水墨動畫，一葉小舟緩緩穿過層疊遠山，薄霧留白，舟上人抬手觸碰落下的花瓣。鏡頭平穩橫移，墨色有自然暈染，少量硃紅點綴，畫面安靜，動作節奏舒緩。" },
    { title: "雨後的玻璃花房", description: "治癒場景 · 前景水滴與逆光", image: "/short-drama-styles/nature-healing.jpg", mode: "video", prompt: "清晨雨後的玻璃花房，鏡頭透過掛著水滴的葉片緩緩推向盛開的白花，陽光從側後方進入，淺景深，真實植物紋理，空氣中薄薄水汽，寧靜自然，無人物和文字。" },
    { title: "都市少女角色轉面", description: "角色概念 · 統一服裝與形體比例", image: "/short-drama-styles/chinese-2d.jpg", mode: "image", prompt: "原創二維動畫都市少女角色設定，短髮、寬鬆工裝夾克和帆布包，正面、側面與背面三檢視，服裝細節和身高比例一致，乾淨線稿配平塗陰影，暖灰背景，不新增文字，不模仿已有動漫角色。" },
    { title: "夢境裡的倒置房間", description: "超現實概念 · 重力反轉與柔光", image: "/short-drama-styles/surreal-dream.jpg", mode: "image", prompt: "超現實電影場景概念圖，一間漂浮在雲海中的倒置臥室，床和書桌懸在天花板上，一扇門通向淺粉色天空。低飽和奶油與霧藍色，柔和漫反射，精確透視，細膩材質，無人物，無文字。" },
    { title: "海邊旅店的黃昏", description: "實拍場景 · 用道具留下人物痕跡", image: "/short-drama-styles/urban-live-action.jpg", mode: "image", prompt: "沿海小城舊旅店房間的電影置景概念圖，窗外是黃昏海面，風吹動米白窗簾，桌上有兩杯沒有喝完的茶和一本翻開的書。暖橙與淺藍對比，自然膠片顆粒，眼平中廣角，沒有人物和可讀文字。" },
    { title: "鮮亮漫畫封面", description: "平面構成 · 大色塊與戲劇性透視", image: "/short-drama-styles/comic-pop.jpg", mode: "image", prompt: "原創漫畫封面插畫，一位騎單車的城市信使躍過雨後積水，戲劇性低角度透視，青藍、珊瑚紅與暖黃色大色塊，半調網點，清晰黑色輪廓，背景簡潔，為頂部標題留白但不生成文字。" },
    { title: "烘焙店的秘密幫手", description: "三維角色 · 柔和材質與親切表情", image: "/short-drama-styles/three-d-cartoon.jpg", mode: "image", prompt: "原創三維動畫角色概念圖，一隻穿著麵粉圍裙的小浣熊站在烘焙臺前，鼻尖沾著麵粉，手裡舉著剛烤好的麵包。柔軟毛髮、溫暖側光、自然可愛的比例，橘棕色和奶油白配色，背景輕微虛化。" },
];

export const inspirationSource = {
    repository: "https://github.com/f/awesome-chatgpt-prompts",
    revision: "f78a1c5136fa080155d928e0d7e2b4a41ddef03e",
    license: "CC0-1.0",
    notice: "8 條文本模板依據公開領域提示詞翻譯改編；其餘為本專案編寫。封面複用專案已有示意圖，不代表實際生成結果。",
};
