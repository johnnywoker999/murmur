export type CameraMovePreset = {
    id: string;
    label: string;
    prompt: string;
};

export type TimeSequencePreset = {
    id: string;
    label: string;
    seconds: string;
    prompt: string;
};

export const CAMERA_MOVE_PRESETS: CameraMovePreset[] = [
    { id: "push_in", label: "緩慢推近", prompt: "鏡頭從中景緩慢推近至主體近景，逐步壓縮背景空間，強化情緒聚焦。" },
    { id: "pull_out", label: "緩慢後拉", prompt: "鏡頭從主體近景緩慢後拉至環境中景，逐步顯露空間關係和人物處境。" },
    { id: "pan_left", label: "向左搖鏡", prompt: "鏡頭水平向左平穩搖動，跟隨主體視線或動作方向展開場景資訊。" },
    { id: "pan_right", label: "向右搖鏡", prompt: "鏡頭水平向右平穩搖動，帶出主體與周圍環境的關係。" },
    { id: "tilt_up", label: "向上仰拍", prompt: "鏡頭由低處向上緩慢傾斜，突出主體的高度、壓迫感或神聖感。" },
    { id: "tilt_down", label: "向下俯拍", prompt: "鏡頭由高處向下緩慢傾斜，揭示主體位置和環境佈局。" },
    { id: "truck_left", label: "左移跟拍", prompt: "鏡頭沿水平方向向左移動，與主體保持穩定距離，形成橫向跟拍。" },
    { id: "truck_right", label: "右移跟拍", prompt: "鏡頭沿水平方向向右移動，與主體保持穩定距離，形成流暢側向運動。" },
    { id: "dolly_forward", label: "前移穿入", prompt: "鏡頭向前移動穿入場景，經過前景層次後靠近主體，形成沉浸式進入感。" },
    { id: "dolly_backward", label: "後退撤離", prompt: "鏡頭向後移動遠離主體，空間逐漸擴大，製造疏離或揭示全域性。" },
    { id: "crane_up", label: "升起俯視", prompt: "鏡頭從人物高度緩慢升起，轉為俯視視角，展示環境規模。" },
    { id: "crane_down", label: "下降貼近", prompt: "鏡頭從高位緩慢下降至主體高度，逐步進入人物情緒空間。" },
    { id: "orbit_left", label: "左環繞", prompt: "鏡頭圍繞主體向左半環繞運動，保持主體居中，展示輪廓和空間層次。" },
    { id: "orbit_right", label: "右環繞", prompt: "鏡頭圍繞主體向右半環繞運動，保持主體清晰，增強戲劇張力。" },
    { id: "handheld", label: "手持微晃", prompt: "鏡頭帶輕微手持晃動，保留真實攝影的不穩定呼吸感，但主體始終清晰。" },
    { id: "steadicam", label: "穩定跟隨", prompt: "鏡頭以穩定器方式跟隨主體移動，運動平滑連續，保持電影感節奏。" },
    { id: "tracking_forward", label: "正面跟拍", prompt: "鏡頭在主體正前方後退跟拍，主體朝鏡頭方向移動，表情和動作保持穩定可見。" },
    { id: "tracking_behind", label: "背後跟拍", prompt: "鏡頭在主體背後跟隨前進，觀眾與主體同向進入場景。" },
    { id: "whip_pan", label: "甩鏡轉場", prompt: "鏡頭快速水平甩動形成運動模糊，並在動作結束時重新穩定到新構圖。" },
    { id: "rack_focus", label: "焦點轉移", prompt: "鏡頭焦點從前景緩慢轉移到主體，或從主體轉移到關鍵道具，景深變化自然。" },
    { id: "zoom_in", label: "光學變焦推進", prompt: "鏡頭進行輕微光學變焦推進，畫面壓縮感增強，但機位保持穩定。" },
    { id: "zoom_out", label: "光學變焦後退", prompt: "鏡頭進行輕微光學變焦後退，逐步展現更多環境資訊。" },
    { id: "low_angle_push", label: "低角度推近", prompt: "低機位鏡頭緩慢推近主體，增強力量感、壓迫感和戲劇性。" },
    { id: "top_down_reveal", label: "俯拍揭示", prompt: "鏡頭從垂直俯拍角度緩慢移動或下降，揭示人物與場景佈局。" },
    { id: "foreground_pass", label: "前景掠過", prompt: "鏡頭移動時有前景物體從畫面邊緣掠過，增加空間深度和電影遮擋感。" },
    { id: "static_hold", label: "定鏡凝視", prompt: "鏡頭保持穩定不移動，只讓主體動作和環境細節產生變化，形成凝視感。" },
];

export const TIME_SEQUENCE_PRESETS: TimeSequencePreset[] = [
    {
        id: "short_6s",
        label: "6秒",
        seconds: "6",
        prompt: `[0s] 主體處於起始畫面，交代動作、景別和空間關係
[2s] 鏡頭運動或主體動作發生明顯變化
[4s] 情緒、動作或構圖進入結果階段
[6s] 動作落點，保持角色、服裝和場景一致`,
    },
    {
        id: "short_9s",
        label: "9秒",
        seconds: "9",
        prompt: `[0s] 起始畫面，明確主體、景別和環境關係
[3s] 主體動作展開，鏡頭保持連續
[6s] 動作或情緒進入轉折與收束階段
[9s] 結束畫面，動作自然落點並保持角色與場景一致`,
    },
    {
        id: "standard_10s",
        label: "10秒",
        seconds: "10",
        prompt: `[0s] 起始畫面，明確主體位置、景別和環境
[2s] 主體開始動作或表情變化，鏡頭保持連貫
[4s] 鏡頭推進、橫移或環繞，展示關鍵細節
[6s] 動作進入轉折點，人物與場景關係發生變化
[8s] 情緒或視覺重點收束到主體
[10s] 結束畫面，動作自然停住並保持一致性`,
    },
    {
        id: "seedance_15s",
        label: "15秒",
        seconds: "15",
        prompt: `[0s] 起始畫面，交代主體、景別、機位和環境氛圍
[3s] 主體開始主要動作，表情和身體姿態發生變化
[6s] 鏡頭運動進入第二階段，展示空間層次或關鍵道具
[9s] 動作出現轉折，主體與場景互動增強
[12s] 鏡頭收束到情緒重點或敘事結果
[15s] 結束畫面，動作自然完成，角色、服裝、場景和光線保持一致`,
    },
];

export const TIME_SEQUENCE_TEMPLATE = TIME_SEQUENCE_PRESETS[2].prompt;

export function appendPromptSnippet(prompt: string, snippet: string) {
    const base = prompt.trimEnd();
    if (!base) return snippet;
    return `${base}\n${snippet}`;
}
