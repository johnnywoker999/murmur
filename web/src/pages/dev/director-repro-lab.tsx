import { useCallback, useMemo, useState } from "react";
import { Button, Table } from "antd";
import { Switch } from "@/components/ui/base/switch";

import { CanvasDirectorWorkbench } from "@/components/canvas/director/canvas-director-workbench";
import { generateDirectorPanorama } from "@/lib/canvas/director/director-panorama-generation";
import { DIRECTOR_REPRO_MATRIX, createDirectorReproScene, directorReproSceneIsOffline, injectDirectorReproModel, type DirectorReproModelVariant } from "@/lib/canvas/director/director-repro-fixture";
import { readDirectorReproSnapshot, type DirectorReproSnapshot } from "@/lib/canvas/director/director-repro-runtime";
import { resetDirectorDiagnosticDedupe } from "@/lib/canvas/director/director-diagnostics-recorder";
import { getClientDiagnosticEvents } from "@/services/diagnostics/client-diagnostics";
import { StatusBadge } from "@/components/ui/base/badges";
import { useAssetStore } from "@/stores/use-asset-store";
import type { DirectorScene, DirectorSceneOutput } from "@/types/director";

type DirectorOutputSummary = { beauty: string; clayVideo: string };
const panoramaFixtureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e33"/><rect x="400" width="400" height="400" fill="#38f"/></svg>';
const panoramaFixtureUrl = `data:image/svg+xml;base64,${btoa(panoramaFixtureSvg)}`;

/** The repro page must never submit a paid model task; production keeps the real task service. */
const generatePanoramaFixture: typeof generateDirectorPanorama = async ({ file, sceneId, onTaskUpdate }) => {
    onTaskUpdate?.({ id: "director-repro-panorama", status: "running", progress: 50 } as never);
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    const svg = panoramaFixtureSvg;
    const url = panoramaFixtureUrl;
    const name = `AI 全景圖 · ${file.name}`;
    const id = useAssetStore.getState().addAsset({ kind: "image", title: name, coverUrl: url, tags: ["全景圖", "AI生成"], source: "導演臺復現臺", data: { dataUrl: url, width: 800, height: 400, bytes: svg.length, mimeType: "image/svg+xml" }, metadata: { source: "director-panorama-fixture", sceneId } });
    return { id, name, url, storageKey: "", width: 800, height: 400 };
};

async function readDirectorVideoSize(blob: Blob): Promise<string> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    try {
        video.src = url;
        return await new Promise<string>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error("白膜影片後設資料讀取超時")), 4000);
            video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(`${video.videoWidth}×${video.videoHeight} · ${blob.size} B`); };
            video.onerror = () => { window.clearTimeout(timeout); reject(new Error("白膜影片無法解碼")); };
        });
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
    }
}

/**
 * P0 手工復現入口（僅 DEV 註冊）。
 *
 * 渲染真實 CanvasDirectorWorkbench + 確定性 fixture，不是靜態 mock。
 * 本頁自己的 callback 都是本地確定性實現，不呼叫任何 API：
 * onChange 只寫本頁 state，onFlush 只在「強制失敗」開關開啟時拋錯，
 * onApply 只累加本地計數。
 *
 * 範圍宣告：只有「初始 fixture + 本頁 callback」保證不髮網。
 * 真實工作臺自帶的新增控制元件（預設演員 GLB、上傳模型、畫布圖片立牌）
 * 仍可能聯網，這是刻意保留的真實行為 —— 不要據此宣稱整個工作臺永不髮網。
 */
export default function DirectorReproLab() {
    const [scene, setScene] = useState<DirectorScene>(() => createDirectorReproScene());
    // workbench 是 fixed inset-0 全屏浮層，會完全遮住本頁。預設關閉，
    // 讓環境快照 / 事件列表 / 復現矩陣先可讀，再由使用者顯式開啟進入復現。
    const [workbenchOpen, setWorkbenchOpen] = useState(false);
    const [forceSaveFailure, setForceSaveFailure] = useState(false);
    const [appliedCount, setAppliedCount] = useState(0);
    const [lastOutput, setLastOutput] = useState<DirectorOutputSummary | null>(null);
    const [flushCount, setFlushCount] = useState(0);
    const [events, setEvents] = useState(() => readDirectorEvents());
    const snapshot = useMemo(() => readDirectorReproSnapshot(), []);

    const refreshEvents = useCallback(() => setEvents(readDirectorEvents()), []);

    /** 本地確定性儲存：只寫本頁 state，不觸碰專案 store，也不發請求。 */
    const onChange = useCallback((next: DirectorScene) => setScene(next), []);

    /** 強制失敗開關用於復現「儲存失敗 / 關閉恢復」，拋錯後由 coordinator 走真實 error 語義。 */
    const onFlush = useCallback(() => {
        setFlushCount((count) => count + 1);
        if (forceSaveFailure) throw new Error("repro forced flush failure");
    }, [forceSaveFailure]);

    const onApply = useCallback(async (output: DirectorSceneOutput) => {
        const bitmap = await createImageBitmap(output.beauty);
        const beauty = `${bitmap.width}×${bitmap.height} · ${output.beauty.size} B`;
        bitmap.close();
        const clayVideo = output.clayVideo ? await readDirectorVideoSize(output.clayVideo) : "無";
        setLastOutput({ beauty, clayVideo });
        setAppliedCount((count) => count + 1);
    }, []);

    const reset = useCallback(() => {
        resetDirectorDiagnosticDedupe();
        setScene(createDirectorReproScene());
        setForceSaveFailure(false);
        setAppliedCount(0);
        setLastOutput(null);
        setFlushCount(0);
        setWorkbenchOpen(false);
        refreshEvents();
    }, [refreshEvents]);

    /** 顯式注入模型物件：固定 id，重複點選替換同一物件而不是堆疊。 */
    const injectModel = useCallback((variant: DirectorReproModelVariant) => {
        setScene((current) => injectDirectorReproModel(current, variant));
    }, []);

    return (
        <div className="min-h-dvh overflow-y-auto p-5" style={{ background: "var(--bg)", color: "var(--fg)" }}>
            <header className="mb-4 flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-semibold">導演臺 P0 復現臺</h1>
                <StatusBadge tone={directorReproSceneIsOffline(scene) ? "error" : "success"} data-testid="offline-tag" label={directorReproSceneIsOffline(scene) ? "fixture 無網路資產" : "已注入模型資產"} />
                <span className="text-[var(--fs-tiny)] opacity-70" data-testid="object-count">
                    物件數 {scene.objects.length}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Button size="small" data-testid="inject-local-model" onClick={() => injectModel("local")}>
                        注入本地模型
                    </Button>
                    <Button size="small" data-testid="inject-missing-model" onClick={() => injectModel("missing")}>
                        注入缺失模型
                    </Button>
                    <Button size="small" data-testid="inject-panorama" onClick={() => setScene((current) => ({ ...current, panorama: { url: panoramaFixtureUrl, name: "本地雙色全景", rotation: current.panoramaRotation ?? 0 } }))}>
                        注入本地全景
                    </Button>
                    <span className="text-[var(--fs-tiny)] opacity-70">強制儲存失敗</span>
                    <Switch checked={forceSaveFailure} onChange={setForceSaveFailure} data-testid="force-save-failure" />
                    <Button size="small" data-testid="toggle-workbench" onClick={() => setWorkbenchOpen((open) => !open)}>
                        {workbenchOpen ? "關閉導演臺" : "開啟導演臺"}
                    </Button>
                    <Button size="small" data-testid="refresh-events" onClick={refreshEvents}>
                        重新整理事件
                    </Button>
                    <Button size="small" data-testid="reset-lab" onClick={reset}>
                        重置
                    </Button>
                </span>
            </header>

            <EnvironmentSnapshot snapshot={snapshot} appliedCount={appliedCount} lastOutput={lastOutput} flushCount={flushCount} sceneRevisionHint={scene.updatedAt} />
            <DiagnosticEventList events={events} />
            <ReproMatrix />

            {workbenchOpen ? (
                <CanvasDirectorWorkbench open scene={scene} imageNodes={[]} onboardingScope="director-repro-lab" onClose={() => setWorkbenchOpen(false)} onChange={onChange} onApply={onApply} onDeleteImageNode={() => undefined} onFlush={onFlush} generatePanorama={generatePanoramaFixture} />
            ) : null}
        </div>
    );
}

type DirectorEventRow = { id: string; timestamp: string; level: string; code: string; message: string };

/** 只顯示導演臺自己的穩定碼事件，避免整條診斷流噪聲淹沒復現現場。 */
function readDirectorEvents(): DirectorEventRow[] {
    return getClientDiagnosticEvents()
        .filter((event) => (event.code || "").startsWith("DIRECTOR_"))
        .map((event) => ({ id: event.id, timestamp: event.timestamp, level: event.level, code: event.code || "", message: event.message }))
        .reverse();
}

function EnvironmentSnapshot({ snapshot, appliedCount, lastOutput, flushCount, sceneRevisionHint }: { snapshot: DirectorReproSnapshot; appliedCount: number; lastOutput: DirectorOutputSummary | null; flushCount: number; sceneRevisionHint: string }) {
    const { runtime, webgl } = snapshot;
    const rows: Array<[string, string]> = [
        ["應用版本", runtime.appVersion],
        ["構建提交", runtime.buildCommit],
        ["瀏覽器", runtime.browser || "(不可用)"],
        ["作業系統", runtime.os || "(不可用)"],
        ["時區", runtime.timezone || "(不可用)"],
        ["DPR", String(runtime.devicePixelRatio)],
        ["本地 onApply 次數", String(appliedCount)],
        ["最近構圖 PNG", lastOutput?.beauty || "無"],
        ["最近白膜影片", lastOutput?.clayVideo || "無"],
        ["本地 onFlush 次數", String(flushCount)],
        ["場景 updatedAt", sceneRevisionHint],
    ];

    if (webgl.available) {
        rows.push(
            ["WebGL 版本", webgl.version || "(空)"],
            ["WebGL vendor", webgl.vendor || "(空)"],
            ["WebGL renderer", webgl.renderer || "(空)"],
            ["最大紋理尺寸", String(webgl.maxTextureSize)],
            ["最大 renderbuffer", String(webgl.maxRenderbufferSize)],
            ["最大視口", webgl.maxViewportWidth + "×" + webgl.maxViewportHeight],
        );
    } else {
        rows.push(["WebGL", webgl.reason === "unsupported" ? "不支援（已穩定降級）" : "上下文建立失敗（已穩定降級）"]);
    }

    return (
        <section className="mb-4">
            <h2 className="mb-2 text-[var(--fs-label)] font-semibold opacity-75">環境快照</h2>
            <p className="mb-2 text-[var(--fs-tiny)] opacity-60">僅本地展示，不上報；字串已限長並剝離 URL query/hash 與憑證片段。</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 gap-2 text-[var(--fs-tiny)]">
                        <span className="shrink-0 opacity-55">{label}</span>
                        <span className="min-w-0 flex-1 truncate font-mono" title={value}>
                            {value}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function DiagnosticEventList({ events }: { events: DirectorEventRow[] }) {
    return (
        <section className="mb-4">
            <h2 className="mb-2 text-[var(--fs-label)] font-semibold opacity-75">結構化事件（{events.length}）</h2>
            <p className="mb-2 text-[var(--fs-tiny)] opacity-60">來自統一 client-diagnostics 緩衝區，只篩選 DIRECTOR_ 穩定碼；不含 stack、URL 與業務正文。</p>
            {events.length ? (
                <Table
                    size="small"
                    rowKey="id"
                    dataSource={events}
                    pagination={false}
                    scroll={{ y: 220 }}
                    columns={[
                        { title: "時間", dataIndex: "timestamp", width: 200, render: (value: string) => <span className="font-mono text-[var(--fs-tiny)]">{value}</span> },
                        { title: "級別", dataIndex: "level", width: 96, render: (value: string) => <StatusBadge size="sm" tone={value === "error" ? "error" : value === "warning" ? "warning" : "neutral"} label={value} /> },
                        { title: "穩定碼", dataIndex: "code", render: (value: string) => <span className="font-mono text-[var(--fs-tiny)]">{value}</span> },
                        { title: "訊息", dataIndex: "message" },
                    ]}
                />
            ) : (
                <p className="text-[var(--fs-tiny)] opacity-55">暫無導演臺事件。觸發下方矩陣中的失敗場景後點選「重新整理事件」。</p>
            )}
        </section>
    );
}

function ReproMatrix() {
    return (
        <section className="mb-4">
            <h2 className="mb-2 text-[var(--fs-label)] font-semibold opacity-75">P0 手工復現矩陣（{DIRECTOR_REPRO_MATRIX.length}）</h2>
            <Table
                size="small"
                rowKey="id"
                dataSource={[...DIRECTOR_REPRO_MATRIX]}
                pagination={false}
                columns={[
                    { title: "分組", dataIndex: "group", width: 108 },
                    { title: "場景", dataIndex: "title", width: 190 },
                    { title: "操作", dataIndex: "steps" },
                    { title: "預期", dataIndex: "expected" },
                ]}
            />
        </section>
    );
}
