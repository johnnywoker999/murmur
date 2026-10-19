/**
 * 動效配置（對應 #99 動效系統）
 *
 * JS 側 duration（秒）與 CSS token（毫秒）對映關係：
 *   instant  0.12s ≈ --motion-dur-fast   (150ms)
 *   state    0.20s ≈ --motion-dur-fast   (150ms)
 *   panel    0.32s ≈ --motion-dur-base   (250ms)
 *
 * easing 與 CSS token 對映：
 *   enter  [0.2, 0.85, 0.18, 1] ≈ --motion-ease-out
 *   exit   [0.4, 0, 1, 1]       ≈ --motion-ease-in
 *
 * prefers-reduced-motion 由元件層 useReducedMotion() 控制，
 * CSS 層由 --motion-scale 聯動（L0=1 / L1=0.3 / L2=0）。
 */
export const aceternityMotion = {
    duration: {
        instant: 0.12,
        state: 0.2,
        panel: 0.32,
    },
    spring: {
        dock: { mass: 0.12, stiffness: 220, damping: 18 },
        surface: { mass: 0.32, stiffness: 280, damping: 26 },
        panel: { mass: 0.42, stiffness: 320, damping: 28 },
    },
    easing: {
        enter: [0.2, 0.85, 0.18, 1] as const,
        exit: [0.4, 0, 1, 1] as const,
    },
} as const;
