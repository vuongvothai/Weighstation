import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScaleWeight, useSpaceToWeigh } from './useScaleWeight'

describe('useScaleWeight', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('poll agent và trả về value/stable/connected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: 124.5, stable: true, raw: 'ST,GS,+000124.5kg', ts: '2026-11-21T19:55:12+07:00' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useScaleWeight())

    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(result.current.value).toBe(124.5)
    expect(result.current.stable).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('connected=false khi agent lỗi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const { result } = renderHook(() => useScaleWeight())

    await waitFor(() => expect(result.current.connected).toBe(false))
    expect(result.current.value).toBeNull()
    expect(result.current.stable).toBe(false)
  })

  it('value=null khi agent trả null (cân tắt/mất cáp)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ value: null, stable: false, raw: null, ts: null }) }),
    )

    const { result } = renderHook(() => useScaleWeight())

    await waitFor(() => expect(result.current.connected).toBe(true))
    expect(result.current.value).toBeNull()
    expect(result.current.stable).toBe(false)
  })

  it('poll lại định kỳ', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ value: 1, stable: true, raw: null, ts: null }) })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useScaleWeight(100))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})

describe('useSpaceToWeigh', () => {
  it('gọi callback khi nhấn Space và preventDefault', () => {
    const onCapture = vi.fn()
    renderHook(() => useSpaceToWeigh(onCapture, true, 0))

    const event = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })
    window.dispatchEvent(event)

    expect(onCapture).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('debounce chặn 2 lần nhấn liên tiếp', () => {
    const onCapture = vi.fn()
    renderHook(() => useSpaceToWeigh(onCapture, true, 500))

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }))

    expect(onCapture).toHaveBeenCalledTimes(1)
  })

  it('không gọi khi enabled=false', () => {
    const onCapture = vi.fn()
    renderHook(() => useSpaceToWeigh(onCapture, false, 0))

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }))

    expect(onCapture).not.toHaveBeenCalled()
  })

  it('bỏ qua khi đang gõ trong input', () => {
    const onCapture = vi.fn()
    renderHook(() => useSpaceToWeigh(onCapture, true, 0))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }))

    expect(onCapture).not.toHaveBeenCalled()
    input.remove()
  })
})