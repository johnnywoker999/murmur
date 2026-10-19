/**
 * Professional cinematography prompt library for the Camera Control panel.
 *
 * Ported from open-storyboard-canvas, simplified for the web project.
 * The output prompt is a comma-joinable fragment appended to the user's
 * generation prompt so the image model treats it as camera direction.
 */

export interface CameraProfile {
    id: string;
    label: string;
    zhName: string;
    shortTag: string;
    profilePrompt: string;
    bodyColor: string;
    accentColor: string;
    useCase: string;
    description: string;
}

export interface LensProfile {
    id: string;
    label: string;
    zhName: string;
    shortTag: string;
    profilePrompt: string;
    lensColor: string;
    ringColor: string;
    useCase: string;
    description: string;
}

export interface CameraControlOptions {
    enabled: boolean;
    camera: string;
    lens: string;
    focalLength: number;
    aperture: number;
}

export const CAMERA_PROFILES: CameraProfile[] = [
    {
        id: "panavision_dxl2",
        label: "Panavision DXL2",
        zhName: "潘那維申 DXL2",
        shortTag: "Panavision DXL2",
        profilePrompt: "shot on Panavision DXL2 with Panavision DXL color science, large-format Monstro 8K VV sensor, signature organic highlight rolloff, rich filmic texture, premium modern cinema look",
        bodyColor: "#2a2a2a",
        accentColor: "#e2a84f",
        description: "好萊塢頂級院線電影機，8K 大畫幅感測器，質感油潤。",
        useCase: "劇情長片、奢華廣告、頂級商業片",
    },
    {
        id: "arri_alexa_mini_lf",
        label: "ARRI Alexa Mini LF",
        zhName: "阿萊 Mini LF",
        shortTag: "ARRI Alexa Mini LF",
        profilePrompt: "shot on ARRI Alexa Mini LF with ARRI Wide Gamut color science, ALEV III large-format sensor, gorgeous skin-tone rendering, buttery highlight rolloff, industry-standard feature-film look",
        bodyColor: "#3a3a3a",
        accentColor: "#d4d4d4",
        description: "行業基準院線電影機，膚色渲染公認最佳。",
        useCase: "劇情片、人像敘事、品牌廣告",
    },
    {
        id: "red_komodo_6k",
        label: "RED Komodo 6K",
        zhName: "RED 科莫多 6K",
        shortTag: "RED Komodo 6K",
        profilePrompt: "shot on RED Komodo 6K with RED IPP2 color pipeline, Super35 global-shutter sensor, crisp modern digital detail, clean shadows, crisp action-movie look",
        bodyColor: "#8b2b2b",
        accentColor: "#ff3b3b",
        description: "緊湊全域性快門 6K，無果凍效應，動作片首選。",
        useCase: "動作片、FPV、穿越機、無人機",
    },
    {
        id: "red_v_raptor_8k",
        label: "RED V-Raptor 8K",
        zhName: "RED V-Raptor 8K",
        shortTag: "RED V-Raptor 8K",
        profilePrompt: "shot on RED V-Raptor 8K VV, RED IPP2 color pipeline, 8K Vista Vision sensor, razor-sharp resolution, vivid yet natural color",
        bodyColor: "#701f1f",
        accentColor: "#ff5555",
        description: "RED 旗艦 8K Vista Vision，極致清晰度。",
        useCase: "科幻大片、高解析度 VFX 場景",
    },
    {
        id: "sony_venice_2",
        label: "Sony Venice 2",
        zhName: "索尼 Venice 2",
        shortTag: "Sony Venice 2",
        profilePrompt: "shot on Sony Venice 2 with Sony S-Gamut3.Cine / S-Log3, dual native ISO full-frame cinema sensor, clean shadows, highly refined modern color science",
        bodyColor: "#2d3a4d",
        accentColor: "#4d90d0",
        description: "全畫幅雙原生 ISO，弱光表現極佳。",
        useCase: "高階廣告、紀錄片、夜景戲劇",
    },
    {
        id: "sony_fx6",
        label: "Sony FX6",
        zhName: "索尼 FX6",
        shortTag: "Sony FX6",
        profilePrompt: "shot on Sony FX6, Sony Venice-derived color science, full-frame cinema sensor, clean low-light performance, documentary-friendly modern look",
        bodyColor: "#2d2d36",
        accentColor: "#ff9000",
        description: "輕量全畫幅 Cinema Line，手持紀錄片常用。",
        useCase: "紀錄片、單兵採訪、輕量劇情",
    },
    {
        id: "blackmagic_ursa_12k",
        label: "Blackmagic URSA 12K",
        zhName: "黑魔法 URSA 12K",
        shortTag: "Blackmagic URSA 12K",
        profilePrompt: "shot on Blackmagic URSA Cine 12K with Blackmagic Generation 5 color science, Super35 12K sensor, rich filmic tones, indie-cinema aesthetic",
        bodyColor: "#2e2e2e",
        accentColor: "#ffb820",
        description: "獨立電影人寵兒，12K 高解析度價效比機。",
        useCase: "獨立電影、音樂短片、實驗影像",
    },
    {
        id: "canon_c500_mk2",
        label: "Canon C500 Mk II",
        zhName: "佳能 C500 Mk II",
        shortTag: "Canon C500 Mk II",
        profilePrompt: "shot on Canon C500 Mark II with Canon Cinema Gamut, full-frame cinema sensor, warm natural skin tones, premium broadcast and feature-film character",
        bodyColor: "#332a22",
        accentColor: "#e8c070",
        description: "佳能色彩科學，暖調膚色，廣播級電影機。",
        useCase: "廣告、電視劇、婚禮電影",
    },
];

export const LENS_PROFILES: LensProfile[] = [
    {
        id: "arri_signature_prime",
        label: "ARRI Signature Prime",
        zhName: "阿萊大師定焦",
        shortTag: "ARRI Signature Prime",
        profilePrompt: "ARRI Signature Prime lens, large-format coverage, creamy organic bokeh, gentle contrast, smooth highlight rolloff, soft flattering flares",
        lensColor: "#2a2a2a",
        ringColor: "#c4a060",
        description: "頂級大畫幅定焦頭，奶油虛化，溫潤對比。",
        useCase: "人物敘事、頂級商業片",
    },
    {
        id: "cooke_s7i",
        label: "Cooke S7/i",
        zhName: "庫克 S7/i",
        shortTag: "Cooke S7/i",
        profilePrompt: "Cooke S7/i lens, legendary \"Cooke Look\", warm color bias, gentle contrast, soft rounded bokeh, classic flattering skin rendering",
        lensColor: "#26231d",
        ringColor: "#d0a060",
        description: "傳奇「Cooke Look」，暖調偏紅，討喜膚色。",
        useCase: "古典人像、時代感敘事",
    },
    {
        id: "zeiss_supreme_prime",
        label: "Zeiss Supreme Prime",
        zhName: "蔡司至尊定焦",
        shortTag: "Zeiss Supreme Prime",
        profilePrompt: "Zeiss Supreme Prime lens, neutral modern color, high micro-contrast, sharp yet refined detail, clean bokeh with subtle cat-eye near edges",
        lensColor: "#1e1e22",
        ringColor: "#4d90d0",
        description: "中性現代色彩，微反差銳利而不硬。",
        useCase: "科技感廣告、現代劇情",
    },
    {
        id: "canon_sumire_prime",
        label: "Canon Sumire Prime",
        zhName: "佳能 Sumire 定焦",
        shortTag: "Canon Sumire Prime",
        profilePrompt: "Canon Sumire Prime lens, soft organic character, warm gentle color rendering, dreamy rounded bokeh, cinematic softness for portraits",
        lensColor: "#2c241c",
        ringColor: "#e0b070",
        description: "柔和夢幻膚色鏡，暖調柔焦。",
        useCase: "愛情片、夢境、人物特寫",
    },
    {
        id: "anamorphic_cooke",
        label: "Anamorphic (Cooke)",
        zhName: "Cooke 變形寬銀幕",
        shortTag: "Cooke Anamorphic",
        profilePrompt: "Cooke anamorphic lens, oval bokeh, horizontal blue streaks for flares, wide cinematic framing, subtle focus roll-off, 2.39:1 anamorphic cinematic feel",
        lensColor: "#1a1a24",
        ringColor: "#6a9ed6",
        description: "寬銀幕變形鏡，橢圓虛化 + 水平藍色光暈。",
        useCase: "科幻大片、太空戲、夜戲",
    },
    {
        id: "anamorphic_atlas",
        label: "Anamorphic (Atlas)",
        zhName: "Atlas Orion 變形",
        shortTag: "Atlas Orion Anamorphic",
        profilePrompt: "Atlas Orion anamorphic lens, oval bokeh, cyan horizontal flares, modern anamorphic look with clean center and subtle edge blur",
        lensColor: "#1b2228",
        ringColor: "#40c0e0",
        description: "現代變形鏡，青色光暈，中心清晰邊緣柔。",
        useCase: "音樂 MV、風格化廣告",
    },
    {
        id: "vintage_leica_r",
        label: "Vintage Leica R",
        zhName: "徠卡 R 老鏡",
        shortTag: "Vintage Leica R",
        profilePrompt: "vintage Leica R prime lens, rich color saturation, slight glow on highlights, slightly soft edges, nostalgic 1970s-80s cinema character",
        lensColor: "#3a2f1f",
        ringColor: "#d04040",
        description: "上世紀老鏡，高光微透溢，復古懷舊味。",
        useCase: "年代戲、懷舊 MV、文藝片",
    },
    {
        id: "macro_100mm",
        label: "Macro 100mm",
        zhName: "100mm 微距",
        shortTag: "Macro 100mm",
        profilePrompt: "macro 100mm prime lens, extremely shallow depth of field, razor-thin focus plane, smooth creamy bokeh, detail-rich close-up rendering",
        lensColor: "#1f1f1f",
        ringColor: "#60d090",
        description: "微距特寫專用，細節驚人，景深極淺。",
        useCase: "美食廣告、珠寶、昆蟲、細節",
    },
];

export const FOCAL_LENGTHS = [14, 18, 24, 35, 40, 50, 65, 85, 100, 135, 200] as const;
export const APERTURES = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

export const FOCAL_LENGTH_META: Record<number, { zhName: string; description: string; useCase: string }> = {
    14: { zhName: "超廣角", description: "14mm 極致廣角，空間被極度拉伸", useCase: "建築內景、風景全景、沉浸視角" },
    18: { zhName: "超廣角", description: "18mm 超廣角，強烈空間縱深", useCase: "街頭攝影、室內、建築" },
    24: { zhName: "廣角", description: "24mm 廣角，環境感強烈", useCase: "風光、大場面、新聞紀實" },
    35: { zhName: "小廣角", description: "35mm 經典敘事焦段，接近人眼", useCase: "紀實、人物環境敘事" },
    40: { zhName: "準標準", description: "40mm 準標準，構圖平衡", useCase: "人像敘事、文藝片" },
    50: { zhName: "標準", description: "50mm 標準，空間感自然", useCase: "人像、日常、街拍" },
    65: { zhName: "中焦", description: "65mm 中焦，輕微壓縮，討喜膚色", useCase: "半身人像、對話戲" },
    85: { zhName: "中長焦", description: "85mm 經典人像焦段", useCase: "特寫人像、婚禮" },
    100: { zhName: "長焦", description: "100mm 長焦，背景壓縮明顯", useCase: "特寫、微距、體育" },
    135: { zhName: "長焦", description: "135mm 電影專用長焦", useCase: "劇情特寫、舞臺" },
    200: { zhName: "超長焦", description: "200mm 超長焦，極致背景壓縮", useCase: "體育、野生動物、戲劇感特寫" },
};

export const APERTURE_META: Record<number, { zhName: string; description: string; useCase: string }> = {
    1.2: { zhName: "極大光圈", description: "f/1.2 虛化極致，景深刀削般薄", useCase: "夢幻人像、高光溢位效果" },
    1.4: { zhName: "大光圈", description: "f/1.4 強烈虛化，電影感十足", useCase: "夜景人像、暗光" },
    1.8: { zhName: "大光圈", description: "f/1.8 明顯背景虛化", useCase: "半身人像、街頭弱光" },
    2: { zhName: "大光圈", description: "f/2 柔和虛化與充足銳度", useCase: "人像、文藝日常" },
    2.8: { zhName: "標準大光圈", description: "f/2.8 景深適中、虛化柔和", useCase: "群像、敘事" },
    4: { zhName: "中光圈", description: "f/4 主體清晰，背景有輕微虛化", useCase: "群像、婚禮、電視劇" },
    5.6: { zhName: "中光圈", description: "f/5.6 背景可辨，環境感強", useCase: "紀實、日常、小品" },
    8: { zhName: "小光圈", description: "f/8 畫質最佳區，前後皆清晰", useCase: "風光、建築、全景" },
    11: { zhName: "小光圈", description: "f/11 超大景深，幾乎全清晰", useCase: "大場景、產品擺拍" },
    16: { zhName: "極小光圈", description: "f/16 星芒出現，需高光源", useCase: "日光風光、星芒特效" },
};

const CAMERA_PROMPT_TEMPLATE = [
    "the following parameters describe the virtual camera, lens, and exposure used to render this image",
    "they are camera direction, NOT objects to add inside the frame",
    "do not add any physical camera, lens, tripod, viewfinder, or photography equipment into the image",
    "{{cameraProfilePrompt}}, {{lensProfilePrompt}}, {{focalLengthPrompt}}, {{aperturePrompt}}",
    "keep the subjects, scene, and action unchanged — apply these as optical and sensor characteristics only",
    "[camera body: {{cameraBody}} · lens: {{lens}} · focal: {{focalLengthMm}}mm · aperture: f/{{apertureF}}]",
].join(", ");

export function describeFocalLength(mm: number): string {
    if (mm <= 16) return `${mm}mm ultra-wide-angle perspective, strong spatial depth, pronounced edge distortion, immersive wide coverage`;
    if (mm <= 24) return `${mm}mm wide-angle perspective, exaggerated depth, strong foreground/background separation, environment-forward framing`;
    if (mm <= 35) return `${mm}mm slight-wide cinematic perspective, natural environmental context, balanced depth, classic story-telling framing`;
    if (mm <= 50) return `${mm}mm standard/normal perspective, close to natural human eye perspective, neutral spatial compression, flattering portrait framing`;
    if (mm <= 85) return `${mm}mm short-telephoto portrait perspective, mild background compression, flattering facial rendering, subject isolation`;
    if (mm <= 135) return `${mm}mm telephoto perspective, moderate compression, strong subject isolation from background, cinematic close-up`;
    return `${mm}mm long-telephoto perspective, strong background compression, highly isolated subject on compressed flat background, powerful dramatic framing`;
}

export function describeAperture(f: number): string {
    if (f <= 1.4) return `shot wide open at f/${f}, extremely shallow depth of field, strong creamy bokeh, razor-thin focus plane, dreamy background separation`;
    if (f <= 2) return `shot at f/${f}, very shallow depth of field, smooth cinematic bokeh, clear subject-from-background separation`;
    if (f <= 2.8) return `shot at f/${f}, shallow depth of field, soft bokeh, natural subject isolation`;
    if (f <= 4) return `shot at f/${f}, moderate depth of field, gentle falloff, clean background blur without over-smoothing`;
    if (f <= 5.6) return `shot at f/${f}, balanced depth of field, background retains context while subject remains clearly in focus`;
    if (f <= 8) return `shot at f/${f}, wide depth of field, environment and subject both sharp, documentary / landscape style`;
    return `shot at f/${f}, very wide depth of field, extensive sharpness from foreground to background, wide-open environmental feel`;
}

function applyTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
}

export interface CameraPromptInput {
    cameraId: string;
    lensId: string;
    focalLengthMm: number;
    apertureF: number;
}

export function buildCameraPrompt(input: CameraPromptInput): string {
    // 鏡頭引數會進入圖片生成寫路徑，未知列舉不能靜默退回首項，否則持久化配置與實際生成語義會不一致。
    const camera = CAMERA_PROFILES.find((item) => item.id === input.cameraId);
    if (!camera) throw new Error(`不支援的相機配置：${input.cameraId}`);
    const lens = LENS_PROFILES.find((item) => item.id === input.lensId);
    if (!lens) throw new Error(`不支援的鏡頭配置：${input.lensId}`);
    if (!FOCAL_LENGTHS.includes(input.focalLengthMm as (typeof FOCAL_LENGTHS)[number])) throw new Error(`不支援的焦距：${input.focalLengthMm}mm`);
    if (!APERTURES.includes(input.apertureF as (typeof APERTURES)[number])) throw new Error(`不支援的光圈：f/${input.apertureF}`);
    return applyTemplate(CAMERA_PROMPT_TEMPLATE, {
        cameraProfilePrompt: camera.profilePrompt,
        lensProfilePrompt: lens.profilePrompt,
        focalLengthPrompt: describeFocalLength(input.focalLengthMm),
        aperturePrompt: describeAperture(input.apertureF),
        cameraBody: camera.shortTag,
        lens: lens.shortTag,
        focalLengthMm: String(input.focalLengthMm),
        apertureF: String(input.apertureF),
    });
}
