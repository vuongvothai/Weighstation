import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAPTURE_MODE_STORAGE_KEY, ZERO_CONFIRM_POLLS, ZERO_THRESHOLD_KG } from '../config'

/**
 * Theo dõi đỉnh của một mẻ cân để tự động ghi khi mẻ kết thúc.
 *
 * Ý tưởng: xe chở hàng lên bàn cân → số tăng dần tới giá trị cao nhất (peak),
 * hàng được dỡ → số bắt đầu giảm. Khi peak đã ổn định (đứng yên đủ lâu) và số
 * hiện tại tụt xuống dưới peak, coi như mẻ cân đã xong và ghi 1 lần.
 *
 * Máy trạng thái:
 *
 * ```mermaid
 * stateDiagram-v2
 *   [*] --> Idle
 *   Idle --> Rising: value > ZERO_THRESHOLD
 *   Rising --> Rising: value tăng / chưa stable
 *   Rising --> PeakStable: value == peak && stable
 *   PeakStable --> PeakStable: value == peak
 *   PeakStable --> Falling: value < peak
 *   Falling --> Falling: chưa stable
 *   Falling --> [*]: stable → onCapture(peak)
 *   PeakStable --> Idle: value ≈ 0 (reset)
 *   Falling --> Idle: value ≈ 0 (reset)
 * ```
 *
 * @param {{ value: number|null, stable: boolean, connected: boolean }} scale
 * @param {(weightKg: number) => void} onCapture
 * @param {boolean} enabled
 */
export function useAutoCapture(scale, onCapture, enabled = true) {
  const { value, stable, connected } = scale
  const [phase, setPhase] = useState('idle')
  const peakRef = useRef(null)
  const zeroCountRef = useRef(0)
  const handlerRef = useRef(onCapture)

  useEffect(() => {
    handlerRef.current = onCapture
  }, [onCapture])

  const reset = useCallback(() => {
    peakRef.current = null
    zeroCountRef.current = 0
    setPhase('idle')
  }, [])

  useEffect(() => {
    if (!enabled) {
      reset()
      return
    }

    // Chưa kết nối hoặc chưa có số: coi như idle, không làm gì.
    if (!connected || typeof value !== 'number') {
      reset()
      return
    }

    // Cân đã về 0: xác nhận vài vòng rồi reset để chờ mẻ mới.
    if (value <= ZERO_THRESHOLD_KG) {
      zeroCountRef.current += 1
      if (zeroCountRef.current >= ZERO_CONFIRM_POLLS) reset()
      return
    }
    zeroCountRef.current = 0

    if (phase === 'idle') {
      peakRef.current = value
      setPhase('rising')
      return
    }

    if (phase === 'rising') {
      if (value > peakRef.current) {
        peakRef.current = value
        return
      }
      if (value === peakRef.current && stable) setPhase('peakStable')
      return
    }

    if (phase === 'peakStable') {
      if (value === peakRef.current) return
      if (value > peakRef.current) {
        // Số tiếp tục tăng: cập nhật đỉnh mới.
        peakRef.current = value
        setPhase('rising')
        return
      }
      setPhase('falling')
      return
    }

    if (phase === 'falling') {
      if (!stable) return
      const peak = peakRef.current
      reset()
      if (peak !== null && peak > 0) handlerRef.current?.(peak)
    }
  }, [value, stable, connected, enabled, phase, reset])

  return { phase, peak: peakRef.current, reset }
}

function readStoredMode() {
  try {
    return localStorage.getItem(CAPTURE_MODE_STORAGE_KEY) === 'manual' ? 'manual' : 'auto'
  } catch {
    return 'auto'
  }
}

/**
 * Chế độ nhập: `auto` (tự ghi khi mẻ cân kết thúc) hoặc `manual` (chỉ ghi khi
 * nhấn phím `t`). Mặc định `auto` khi mở app; lựa chọn được nhớ qua reload.
 *
 * @returns {{ mode: 'auto'|'manual', isAuto: boolean, setMode: (m: 'auto'|'manual') => void, toggle: () => void }}
 */
export function useCaptureMode() {
  const [mode, setModeState] = useState(readStoredMode)

  useEffect(() => {
    try {
      localStorage.setItem(CAPTURE_MODE_STORAGE_KEY, mode)
    } catch {
      // localStorage bị chặn — mode vẫn còn trong memory.
    }
  }, [mode])

  const setMode = useCallback((next) => {
    setModeState(next === 'manual' ? 'manual' : 'auto')
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => (prev === 'auto' ? 'manual' : 'auto'))
  }, [])

  return useMemo(() => ({ mode, isAuto: mode === 'auto', setMode, toggle }), [mode, setMode, toggle])
}