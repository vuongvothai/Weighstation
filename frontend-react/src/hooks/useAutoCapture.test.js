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

  it('chốt giá trị nhỏ nhất trong cửa sổ [đỉnh-5, đỉnh] khi về 0', () => {
    const onCapture = vi.fn()
    const { result, rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true), {
      initialProps: { s: { value: 100, stable: false, connected: true } },
    })

    // Ổn định: 158, 160 (đỉnh), 156 → cửa sổ [155,160], nhỏ nhất = 156.
    push(rerender, { value: 158, stable: true, connected: true })
    push(rerender, { value: 160, stable: true, connected: true })
    push(rerender, { value: 156, stable: true, connected: true })
    expect(result.current.phase).toBe('weighing')
    expect(onCapture).not.toHaveBeenCalled()
    // Về 0 đủ nhịp → chốt 156.
    push(rerender, { value: 0, stable: true, connected: true })
    push(rerender, { value: 0, stable: true, connected: true })
    push(rerender, { value: 0, stable: true, connected: true })

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture).toHaveBeenCalledWith(156)
  })

  it('2 bao 1 lần: đỉnh ổn định 160, chốt 1 dòng ~160 khi về 0', () => {
    const onCapture = vi.fn()
    const { rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true), {
      initialProps: { s: { value: 80, stable: true, connected: true } },
    })

    // Bao 2: đỉnh ổn định tăng lên 160 (cửa sổ dịch lên, min = 160).
    push(rerender, { value: 160, stable: true, connected: true })
    expect(onCapture).not.toHaveBeenCalled()
    push(rerender, { value: 0, stable: true, connected: true })
    push(rerender, { value: 0, stable: true, connected: true })
    push(rerender, { value: 0, stable: true, connected: true })

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(onCapture).toHaveBeenCalledWith(160)
  })

  it('báo onUpdate giá trị nhỏ nhất trong cửa sổ mỗi lần ổn định', () => {
    const onCapture = vi.fn()
    const onUpdate = vi.fn()
    const { rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true, onUpdate), {
      initialProps: { s: { value: 160, stable: true, connected: true } },
    })

    push(rerender, { value: 156, stable: true, connected: true })

    expect(onUpdate).toHaveBeenLastCalledWith(156)
    expect(onCapture).not.toHaveBeenCalled()
  })

  it('3 mẻ liên tiếp: mỗi lần về 0 chốt 1 lần, không ghi đè', () => {
    const onCapture = vi.fn()
    const { rerender } = renderHook(({ s }) => useAutoCapture(s, onCapture, true), {
      initialProps: { s: { value: 100, stable: true, connected: true } },
    })

    const zero = () => {
      push(rerender, { value: 0, stable: true, connected: true })
      push(rerender, { value: 0, stable: true, connected: true })
      push(rerender, { value: 0, stable: true, connected: true })
    }

    push(rerender, { value: 160, stable: true, connected: true })
    zero()
    push(rerender, { value: 90, stable: true, connected: true })
    zero()
    push(rerender, { value: 120, stable: true, connected: true })
    zero()

    expect(onCapture).toHaveBeenCalledTimes(3)
    expect(onCapture.mock.calls.map((c) => c[0])).toEqual([160, 90, 120])
  })

  it('tắt enabled thì reset và không ghi', () => {
    const onCapture = vi.fn()
    const { rerender } = renderHook(({ s, on }) => useAutoCapture(s, onCapture, on), {
      initialProps: { s: { value: 100, stable: false, connected: true }, on: true },
    })

    push(rerender, { value: 124.5, stable: true, connected: true })
    act(() => {
      rerender({ s: { value: 0, stable: true, connected: true }, on: false })
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