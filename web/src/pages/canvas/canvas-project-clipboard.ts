import { getCachedResourceBlob } from "@/services/resource-blob-cache";

export async function copyImageToSystemClipboard(source: string, storageKey?: string) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("當前瀏覽器不支援複製圖片");
    if (typeof window !== "undefined") window.focus();

    const fetchPNG = async (): Promise<Blob> => {
        let sourceBlob: Blob | null = null;
        if (storageKey) {
            sourceBlob = await getCachedResourceBlob(storageKey).catch(() => null);
        }
        if (!sourceBlob) {
            const response = await fetch(source);
            if (!response.ok) throw new Error(`圖片讀取失敗（HTTP ${response.status}）`);
            sourceBlob = await response.blob();
        }
        return sourceBlob.type === "image/png" ? sourceBlob : await convertClipboardImageToPNG(sourceBlob);
    };

    // 優先嚐試將 Promise 直接傳給 ClipboardItem（現代瀏覽器標準），在使用者啟用手勢內立即宣告寫入，
    // 避免因 fetch / 格式轉換耗時導致手勢過期或視窗失焦丟擲 "Document is not focused" 錯誤。
    try {
        const item = new ClipboardItem({ "image/png": fetchPNG() });
        await navigator.clipboard.write([item]);
        return;
    } catch {
        // 部分瀏覽器環境不支援延遲 Promise，回退到先取 Blob 再寫入
    }

    const blob = await fetchPNG();
    if (typeof window !== "undefined") window.focus();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function convertClipboardImageToPNG(blob: Blob) {
    if (typeof createImageBitmap !== "function") throw new Error("當前瀏覽器無法轉換這張圖片的格式");
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("當前瀏覽器無法處理這張圖片");
        context.drawImage(bitmap, 0, 0);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("圖片格式轉換失敗"))), "image/png"));
    } finally {
        bitmap.close();
    }
}
