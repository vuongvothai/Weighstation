import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPTURE_MODE_STORAGE_KEY } from '../config'
import { useAutoCapture, useCaptureMode } from './useAutoCapture'

/**
 * Đẩy 1 trạng thái cân vào hook và flush effect.
 *
 * Dùng `act` đồng bộ: mỗi lần gọi là 1 nhịp poll, React flush state ngay.
 */
function push(rerender, scale) {
  act(() => {
    rerender({ s: scale })
  })
}

describe('useAutoCapture', () => {
  it('không ghi khi chưa kết nối', () => {
    const onCapture = vi.fn()
    const { result } = renderHook(() =>
      useAutoCapture({ value: null, stable: false, connected: false }, onCapture, true),
    )

    expect(result.current.phase).toBe('idle')
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('ghi đỉnh khi số tụt từ đỉnh đã ổn định', () => {
    const onCapture = vi.fn()
    const { result, rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true), {
      initialProps: { s: { value: 100, stable: false, connected: true } },
    })

    // Hàng lên: số tăng dần, chưa ổn định.
    push(rerender, { value: 120, stable: false, connected: true })
    push(rerender, { value: 124.5, stable: false, connected: true })
    // Đỉnh ổn định.
    push(rerender, { value: 124.5, stable: true, connected: true })
    expect(result.current.phase).toBe('peakStable')
    // Hàng dỡ: số tụt nhưng chưa ổn định.
    push(rerender, { value: 120, stable: false, connected: true })
    expect(onCapture).not.toHaveBeenCalled()
    // Ổn định ở mức thấp hơn → ghi đỉnh 124.5.
    push(rerender, { value: 120, stable: true, connected: true })

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture).toHaveBeenCalledWith(124.5)
  })

  it('không ghi khi đỉnh chưa từng ổn định', () => {
    const onCapture = vi.fn()
    const { rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true), {
      initialProps: { s: { value: 100, stable: false, connected: true } },
    })

    push(rerender, { value: 130, stable: false, connected: true })
    push(rerender, { value: 125, stable: true, connected: true })

    expect(onCapture).not.toHaveBeenCalled()
  })

  it('tắt enabled thì reset và không ghi', () => {
    const onCapture = vi.fn()
    const { rerender } = renderHook(({ s, on }) => useAutoCapture(s, onCapture, on), {
      initialProps: { s: { value: 100, stable: false, connected: true }, on: true },
    })

    push(rerender, { value: 124.5, stable: true, connected: true })
    act(() => {
      rerender({ s: { value: 120, stable: true, connected: true }, on: false })
    })

    expect(onCapture).not.toHaveBeenCalled()
  })
})

describe('useCaptureMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('mặc định là auto khi mở app', () => {
    const { result } = renderHook(() => useCaptureMode())

    expect(result.current.mode).toBe('auto')
    expect(result.current.isAuto).toBe(true)
  })

  it('toggle đổi auto ↔ manual và lưu vào localStorage', () => {
    const { result } = renderHook(() => useCaptureMode())

    act(() => result.current.toggle())
    expect(result.current.mode).toBe('manual')

    act(() => result.current.toggle())
    expect(result.current.mode).toBe('auto')
    expect(localStorage.getItem(CAPTURE_MODE_STORAGE_KEY)).toBe('auto')
  })

  it('khôi phục mode đã lưu sau reload', () => {
    localStorage.setItem(CAPTURE_MODE_STORAGE_KEY, 'manual')

    const { result } = renderHook(() => useCaptureMode())

    expect(result.current.mode).toBe('manual')
  })
})