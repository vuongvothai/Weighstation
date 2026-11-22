import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_BASE_URL, POLL_INTERVAL_MS } from '../config'

const INITIAL_STATE = { value: null, stable: false, connected: false, raw: null, ts: null }

/**
 * Poll `GET /weight` của agent mỗi 100ms.
 *
 * Agent không trả 4xx/5xx cho lỗi phần cứng — `connected=false` + `value=null`
 * là trạng thái bình thường khi cân tắt hoặc mất cáp, nên hook chỉ cần bắt lỗi
 * fetch và coi như mất kết nối.
 *
 * @returns {{ value: number|null, stable: boolean, connected: boolean, raw: string|null, ts: string|null }}
 */
export function useScaleWeight(intervalMs = POLL_INTERVAL_MS) {
  const [state, setState] = useState(INITIAL_STATE)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`${AGENT_BASE_URL}/weight`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`agent ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setState({
          value: typeof data.value === 'number' ? data.value : null,
          stable: data.stable === true,
          connected: true,
          raw: data.raw ?? null,
          ts: data.ts ?? null,
        })
      } catch {
        if (cancelled) return
        setState((prev) => (prev.connected ? { ...prev, connected: false, stable: false } : prev))
      }
    }

    poll()
    timerRef.current = setInterval(poll, intervalMs)

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
    }
  }, [intervalMs])

  return state
}

/**
 * Bọc `useScaleWeight` để lấy đúng 3 trạng thái FE cần hiển thị.
 */
export function useScaleStatus() {
  const { value, stable, connected } = useScaleWeight()
  return { value, stable, connected }
}

/**
 * Ghi 1 lần cân vào state tạm khi operator nhấn Space.
 *
 * `preventDefault` để Space không scroll trang. Có debounce để chặn double-tap.
 *
 * @param {(weight: number) => void} onCapture
 * @param {boolean} enabled
 * @param {number} debounceMs
 */
export function useSpaceToWeigh(onCapture, enabled = true, debounceMs = 500) {
  const lastFiredRef = useRef(0)

  const handlerRef = useRef(onCapture)
  handlerRef.current = onCapture

  useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

      event.preventDefault()

      const now = Date.now()
      if (now - lastFiredRef.current < debounceMs) return
      lastFiredRef.current = now

      handlerRef.current?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, debounceMs])

  return useCallback(() => {
    lastFiredRef.current = 0
  }, [])
}