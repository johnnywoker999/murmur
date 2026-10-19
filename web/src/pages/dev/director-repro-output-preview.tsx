/** Local-only preview of the exact blobs sent through the real workbench output callback. */
export function DirectorReproOutputPreview({ beautyUrl, clayVideoUrl }: { beautyUrl: string; clayVideoUrl: string | null }) {
    return (
        <section aria-label="最近生成的參考素材" className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-sm font-medium">最近生成的參考素材</h2>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="min-w-0">
                    <img src={beautyUrl} alt="活動機位參考構圖" className="max-h-72 w-full rounded-lg bg-black object-contain" />
                    <a href={beautyUrl} download="導演臺參考圖.png" className="mt-2 inline-block text-xs text-blue-400">下載參考圖</a>
                </div>
                {clayVideoUrl ? <div className="min-w-0">
                    <video src={clayVideoUrl} controls playsInline preload="metadata" aria-label="白膜參考影片" className="max-h-72 w-full rounded-lg bg-black" />
                    <a href={clayVideoUrl} download="導演臺白膜影片.webm" className="mt-2 inline-block text-xs text-blue-400">下載白膜影片</a>
                </div> : null}
            </div>
        </section>
    );
}
