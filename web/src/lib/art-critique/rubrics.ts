import { ART_CRITIQUE_RUBRIC_VERSION, type ArtCritiqueCategory, type ArtCritiqueImageType } from "./contracts";

export type RubricCategory = Exclude<ArtCritiqueCategory, "other">;

export type ArtCritiqueRubricPromptOptions = {
    /** Restrict the prompt to one or more reviewer-owned categories. */
    categories?: readonly RubricCategory[];
    /** Full prompts keep the research mapping; narrow reviewer prompts omit it to reduce distraction. */
    includeReferenceMapping?: boolean;
};

export type ArtCritiqueRubricCheck = {
    id: string;
    label: string;
    check: string;
    flagWhen: string;
    applicableImageTypes?: readonly ArtCritiqueImageType[];
    evidenceRequired?: boolean;
    minConfidence?: number;
    mergeKeys?: readonly string[];
};

export type ArtCritiqueRubricSection = {
    category: RubricCategory;
    label: string;
    references: readonly string[];
    checks: readonly ArtCritiqueRubricCheck[];
};

/**
 * 這些專案只作為方法論來源，不作為執行時依賴。模型仍然通過當前專案的雲端渠道呼叫。
 */
export const ART_CRITIQUE_RUBRIC: readonly ArtCritiqueRubricSection[] = [
    {
        category: "composition",
        label: "構圖與視覺層級",
        references: ["CADB / SAMP-Net", "CG-IAA", "PhotoFramer-Assessment"],
        checks: [
            { id: "subject-placement", label: "主體位置", check: "主體位置是否服務於畫面意圖和敘事方向", flagWhen: "主體位置讓畫面失去方向感，或明顯削弱了主題表達", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.55, mergeKeys: ["subject", "placement"] },
            { id: "visual-balance", label: "視覺平衡", check: "左右、上下和前後景的視覺重量是否合理", flagWhen: "一側重量明顯壓住另一側，且不是有意製造的不平衡", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.55, mergeKeys: ["balance", "weight"] },
            { id: "negative-space", label: "留白與呼吸", check: "留白是否提供呼吸感、方向感或敘事空間", flagWhen: "留白擠壓主體、切斷動作方向，或空白區域沒有發揮作用", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.55, mergeKeys: ["negative-space", "space"] },
            { id: "visual-flow", label: "視覺動線", check: "第一視覺焦點、第二焦點和視線移動路徑是否清楚", flagWhen: "背景或區域性高對比搶走主體注意力，視線無法自然進入畫面", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.55, mergeKeys: ["flow", "focus"] },
            { id: "composition-pattern", label: "構圖模式", check: "當前畫面更接近居中、三分、黃金比例、三角、水平、垂直、對角、對稱、曲線、放射、消失點、pattern 或 fill-frame 中的哪一種", flagWhen: "構圖模式與畫面意圖衝突（不能僅因沒有使用三分法就報告）", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.6, mergeKeys: ["pattern", "intent"] },
            { id: "crop-and-depth", label: "裁切與景深", check: "裁切、遮擋和前中後景是否強化主體關係", flagWhen: "裁切破壞主體結構，或空間層次讓畫面關係難以理解", applicableImageTypes: ["portrait", "landscape", "product", "illustration", "concept-art", "architecture", "still-life", "other"], evidenceRequired: true, minConfidence: 0.55, mergeKeys: ["crop", "depth"] },
        ],
    },
    {
        category: "color",
        label: "色彩",
        references: ["CG-IAA", "AesExpert"],
        checks: [
            { id: "palette", label: "色彩關係", check: "主色、輔色和強調色是否形成清楚的色彩關係", flagWhen: "顏色彼此爭奪注意力，或主色關係混亂到削弱主題" },
            { id: "temperature", label: "冷暖與和諧", check: "冷暖關係、色相關係和整體氛圍是否一致", flagWhen: "區域性冷暖或色相突然跳出，且沒有敘事或焦點上的理由" },
            { id: "value-and-saturation", label: "明度與飽和度", check: "明度層次和飽和度分佈是否支援視覺層級", flagWhen: "主體與背景明度接近、顏色發灰髮髒，或次要區域過度鮮豔" },
            { id: "color-separation", label: "色彩分離", check: "主體與背景、相鄰形體之間是否有足夠的色彩區分", flagWhen: "關鍵形體融入背景，導致輪廓、情緒或資訊無法被讀出" },
        ],
    },
    {
        category: "lighting",
        label: "光線",
        references: ["CG-IAA", "AesExpert", "HumanAesExpert"],
        checks: [
            { id: "light-direction", label: "光源方向", check: "主光源方向、高光和陰影方向是否一致", flagWhen: "同一畫面不同物件的光照方向互相矛盾" },
            { id: "exposure", label: "曝光與對比", check: "曝光、區域性對比和高光陰影是否保留了重要資訊", flagWhen: "主體關鍵區域過曝、死黑，或區域性對比不足以建立焦點" },
            { id: "volume", label: "體積與空間", check: "光線是否幫助形體、距離和空間深度被理解", flagWhen: "形體變平、空間關係混亂，或光線沒有服務於主體" },
            { id: "subject-separation", label: "主體分離", check: "主體是否通過光線與環境建立清楚的層次", flagWhen: "主體與背景的亮度或光質接近，導致主體被吞沒" },
        ],
    },
    {
        category: "proportion",
        label: "比例、結構與透視",
        references: ["HumanAesExpert", "PhotoFramer-Assessment", "CG-IAA"],
        checks: [
            { id: "human-proportion", label: "人物比例", check: "人物的臉部、五官、手腳、肢體長度和頭身關係是否自然", flagWhen: "可見的結構異常影響可信度（不要把正常透視變化誤判為畸形）", applicableImageTypes: ["portrait"], evidenceRequired: true, minConfidence: 0.7, mergeKeys: ["human", "proportion"] },
            { id: "object-scale", label: "物體相對尺寸", check: "物體之間的相對大小是否符合場景關係", flagWhen: "關鍵物體大小關係破壞空間或敘事邏輯" },
            { id: "perspective", label: "透視與遮擋", check: "消失方向、近大遠小、地面關係和遮擋順序是否一致", flagWhen: "透視線索互相沖突，或遮擋關係讓空間無法成立" },
            { id: "detail-consistency", label: "細節一致性", check: "關鍵邊緣、紋理、清晰度和風格是否保持一致", flagWhen: "區域性明顯崩壞、重複、異常，且會影響主體閱讀" },
        ],
    },
];

export function findArtCritiqueRubricCheck(checkId: string) {
    for (const section of ART_CRITIQUE_RUBRIC) {
        const check = section.checks.find((item) => item.id === checkId);
        if (check) return { ...check, category: section.category };
    }
    return undefined;
}

export const ART_CRITIQUE_REFERENCE_METHODS = [
    "用 CG-IAA / AesExpert 的維度化 critique 思路組織評價，不把審美壓成單一分數。",
    "用 CADB 的構圖模式作為參考，但先判斷畫面意圖，不把三分法等幾何規則當成絕對答案。",
    "用 HumanAesExpert 的人物維度補充人像模式，只有看得清且確實影響畫面時才指出結構問題。",
    "用 PhotoFramer 的 shift、zoom/crop、view change 思路組織修改動作，建議必須能轉成下一輪提示詞。",
    "用 Grounding-IQA 的描述與區域繫結思路表達 target；無法可靠定位時使用 global。",
] as const;

export function buildArtCritiqueRubricPrompt(options: ArtCritiqueRubricPromptOptions = {}) {
    const selectedCategories = options.categories?.length ? new Set(options.categories) : undefined;
    const sectionsToRender = selectedCategories ? ART_CRITIQUE_RUBRIC.filter((section) => selectedCategories.has(section.category)) : ART_CRITIQUE_RUBRIC;
    const sections = sectionsToRender.map((section) => {
        const checks = section.checks.map((item) => `- ${item.label}（規則 ID：${item.id}；適用圖片：${(item.applicableImageTypes || ["所有圖片"]).join("、")}；最低置信度：${item.minConfidence ?? 0.55}；需要證據：${item.evidenceRequired !== false ? "是" : "否"}；合併關鍵詞：${(item.mergeKeys || []).join("、")}）：檢查${item.check}；只有在${item.flagWhen}時才報告。`).join("\n");
        return [`【${section.label}｜${section.category}】`, `方法參考：${section.references.join("、")}`, checks].join("\n");
    }).join("\n\n");
    const includeReferenceMapping = options.includeReferenceMapping ?? !selectedCategories;

    return [
        `審美 Rubric 版本：${ART_CRITIQUE_RUBRIC_VERSION}`,
        "以下是當前創作工作臺採用的內部審美檢查標準。參考專案提供的是任務定義和方法論，不是需要引用的答案，也不是必須部署的模型。",
        selectedCategories ? `本次 Reviewer 只負責以下維度：${[...selectedCategories].join("、")}。不要評價其他維度，也不要重複其他 Reviewer 的職責。` : "先判斷圖片型別、主體、視覺意圖和當前構圖策略，再應用檢查項。",
        "審美偏好不等於結構性錯誤；只有有畫面證據、會影響表達、且能給出動作時才生成問題。允許沒有問題，不要為了覆蓋檢查項、滿足數量或顯得有幫助而湊數。",
        ...(includeReferenceMapping ? [`參考方法對映：\n${ART_CRITIQUE_REFERENCE_METHODS.map((method) => `- ${method}`).join("\n")}`] : []),
        sections,
        "每個候選必須填寫命中的規則 ID（checkId），只能選擇當前 Reviewer 負責維度中的規則。規則不適用當前圖片型別時不要報告；沒有具體證據時不要報告；置信度低於規則最低值時不要報告。",
        "規則 ID 只用於本地校驗和聚合去重，不要把規則 ID 當作問題標題展示給使用者。",
        "修改建議優先使用可執行動作：移動主體（shift）、裁切或縮放（zoom/crop）、調整視角或空間關係（view change）、調整顏色/光線、區域性重繪或重生成。寫清楚修改目標、具體動作、需要保留的內容和預期效果。",
        "定位必須服從問題描述：連續的一塊區域性區域（例如臉部、人物、前景、桌面、頭部周邊）優先用 box；box 只允許左上角和右下角兩個角點，且左右、上下跨度都至少為圖片尺寸的 2.5%，不能返回同一條水平線或豎線。單一離散位置用 point，多個互不相連的位置用 points，沿輪廓的區域才用 polygon，整體問題用 global。所有座標為原圖左上角 0,0、右下角 1,1 的歸一化座標。無法可靠定位時寧可使用 global，不要猜測一個框。",
    ].join("\n\n");
}
