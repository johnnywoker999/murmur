export function persistedTaskConstraintCopy(message: string) {
    for (const input of ["video_first_frame_ratio_unreadable", "video_first_frame_ratio_unsupported", "video_first_frame_ratio_mismatch", "影片畫幅僅支援 當前傳入 adaptive", "TaskTypeConstraint ratio first-frame", "TaskTypeConstraint duration", "TaskTypeConstraint ratio", "TaskTypeConstraint"]) {
        const copy = taskConstraintCopy(input)!;
        if (message.trim().startsWith(`${copy.reason}。${copy.action}`)) return copy;
    }
    return undefined;
}

export function taskConstraintCopy(message: string) {
    const text = message.toLowerCase();
    if (text.includes("video_first_frame_ratio_unreadable")) return { reason: "無法讀取首幀圖片的尺寸", action: "請重新上傳 PNG、JPEG 或 WebP 圖片後再生成" };
    if (text.includes("video_first_frame_ratio_unsupported")) return { reason: "當前渠道無法保持這張首幀圖的比例", action: "請將首幀調整為 1:1、4:3、3:4、9:16、16:9 或 21:9，或更換模型" };
    if (text.includes("video_first_frame_ratio_mismatch")) return { reason: "輸出比例需要與首幀一致", action: "請使用隨首幀比例，或先調整首幀圖片的尺寸" };
    if (text.includes("影片畫幅僅支援") && text.includes("當前傳入 adaptive")) return { reason: "當前渠道暫不支援自適應畫幅", action: "首幀生成請更換模型；文生影片請指定固定比例後再提交" };
    if (!text.includes("tasktypeconstraint")) return undefined;
    if (text.includes("ratio") && /first[-_]frame/.test(text)) return { reason: "首尾幀模式的畫面比例需跟隨首幀", action: "請選擇自適應比例後重新生成；如需指定比例，請改用參考生成模式" };
    if (text.includes("duration")) return { reason: "當前任務模式不支援指定的影片時長", action: "編輯影片時請使用跟隨原影片的時長；如需生成指定時長，請改用參考生成模式" };
    if (text.includes("ratio")) return { reason: "當前任務模式的畫面比例需跟隨輸入素材", action: "請選擇自適應比例後重新生成；如需指定比例，請改用參考生成模式" };
    return { reason: "生成引數與當前任務模式不相容", action: "請檢查所選模式；首尾幀和延長需跟隨素材比例，編輯還需跟隨原影片時長" };
}
