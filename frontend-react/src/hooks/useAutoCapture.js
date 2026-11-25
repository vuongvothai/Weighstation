import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AUTO_TARE_WINDOW_KG,
  CAPTURE_MODE_STORAGE_KEY,
  ZERO_CONFIRM_POLLS,
  ZERO_THRESHOLD_KG,
} from '../config'

/**
 * Tự động ghi 1 lần cân theo mô hình "1 mẻ = 1 dòng, chốt khi về 0".
 *
 * Trong 1 mẻ (chưa về 0), mỗi lần số **ổn định** ta cập nhật:
 * - `đỉnh` = giá trị ổn định cao nhất,
 * - `minInWindow` = giá trị ổn định nhỏ nhất trong [đỉnh - AUTO_TARE_WINDOW_KG, đỉnh].
 *
 * `onUpdate(minInWindow)` được gọi mỗi lần ổn định để FE hiện/ghi đè 1 dòng
 * draft realtime. Khi cân **về 0** đủ `ZERO_CONFIRM_POLLS` nhịp, `onCapture`
 * chạy đúng 1 lần với `minInWindow` để chốt dòng đó xuống BE, rồi reset chờ mẻ
 * mới. Nhờ vậy 2 bao cân 1 lần chỉ ra 1 dòng.
 *
 * @param {{ value: number|null, stable: boolean, connected: boolean }} scale
 * @param {(weightKg: number) => void} onCapture chốt 1 dòng khi về 0
 * @param {boolean} enabled
 * @param {(weightKg: number) => void} [onUpdate] ghi đè dòng draft mỗi lần ổn định
 */
export function useAutoCapture(scale, onCapture, enabled = true, onUpdate) {
  const { value, stable, connected } = scale
  const [, forceRender] = useState(0)
  // Đỉnh = giá trị ổn định cao nhất; minInWindow = giá trị ổn định nhỏ nhất
  // trong [đỉnh - AUTO_TARE_WINDOW_KG, đỉnh].
  const stablePeakRef = useRef(null)
  const minInWindowRef = useRef(null)
  const [zeroCount, setZeroCount] = useState(0)
  const committedRef = useRef(false)
  const handlerRef = useRef(onCapture)
  const updateHandlerRef = useRef(onUpdate)

  useEffect(() => {
    handlerRef.current = onCapture
    updateHandlerRef.current = onUpdate
  }, [onCapture, onUpdate])

  const reset = useCallback(() => {
    stablePeakRef.current = null
    minInWindowRef.current = null
    setZeroCount(0)
    committedRef.current = false
    forceRender((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!enabled || !connected || typeof value !== 'number') {
      reset()
      return
    }

    // Cân về 0: xác nhận vài nhịp rồi chốt giá trị nhỏ nhất trong cửa sổ.
    if (value <= ZERO_THRESHOLD_KG) {
      if (stablePeakRef.current === null || committedRef.current) {
        setZeroCount(0)
        return
      }
      const next = zeroCount + 1
      setZeroCount(next)
      if (next >= ZERO_CONFIRM_POLLS) {
        const result = minInWindowRef.current ?? stablePeakRef.current
        reset()
        committedRef.current = true
        if (result !== null && result > 0) handlerRef.current?.(result)
      }
      return
    }
    setZeroCount(0)
    // Mẻ mới bắt đầu (số đã vượt 0) → cho phép chốt lại ở lần về 0 sau.
    committedRef.current = false

    // Trong mẻ: chỉ xử lý khi số ổn định.
    if (stable) {
      const peak = stablePeakRef.current
      if (peak === null || value > peak) {
        // Đỉnh ổn định mới → cửa sổ dịch lên, lấy chính giá trị này làm min.
        stablePeakRef.current = value
        minInWindowRef.current = value
      } else if (value >= peak - AUTO_TARE_WINDOW_KG) {
        // Nằm trong cửa sổ → cập nhật giá trị nhỏ nhất.
        minInWindowRef.current = Math.min(minInWindowRef.current ?? value, value)
      }
      const result = minInWindowRef.current ?? stablePeakRef.current
      forceRender((n) => n + 1)
      updateHandlerRef.current?.(result)
    }
  }, [value, stable, connected, enabled, zeroCount, reset])

  return {
    phase: stablePeakRef.current === null ? 'idle' : 'weighing',
    peak: minInWindowRef.current ?? stablePeakRef.current,
    reset,
  }
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