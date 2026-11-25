import { useCallback, useRef } from 'react'

/**
 * Phát tiếng "ting" xác nhận bằng Web Audio API (tổng hợp, không cần file).
 *
 * Trình duyệt chặn audio tới khi có tương tác người dùng; `unlock` được gọi ở
 * lần bấm/phím đầu tiên để "mở khóa" AudioContext.
 */
export function useFeedbackSound() {
  const ctxRef = useRef(null)

  const getCtx = useCallback(() => {
    if (typeof window === 'undefined') return null
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    if (!ctxRef.current) ctxRef.current = new Ctx()
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {})
    return ctxRef.current
  }, [])

  /** Gọi ở tương tác đầu tiên để mở khóa audio. */
  const unlock = useCallback(() => {
    getCtx()
  }, [getCtx])

  /**
   * Phát 1 tiếng "ting" 2 tone.
   *
   * @param {{ freq?: number, durationMs?: number, gain?: number }} [opts]
   */
  const ting = useCallback(
    ({ freq = 880, durationMs = 220, gain = 0.18 } = {}) => {
      const ctx = getCtx()
      if (!ctx) return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + durationMs / 1000)
      vol.gain.setValueAtTime(gain, now)
      vol.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
      osc.connect(vol).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + durationMs / 1000)
    },
    [getCtx],
  )

  return { ting, unlock }
}