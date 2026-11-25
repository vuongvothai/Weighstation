import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_BAG_COUNT, DRAFT_STORAGE_KEY } from '../config'

/**
 * Draft phiếu cân: `ticketUuid` + tên khách + danh sách lần cân.
 *
 * FE giữ toàn bộ state tạm ở đây và chỉ gọi BE khi operator nhấn "Lưu phiếu".
 * Draft được mirror vào `localStorage` để không mất khi reload (mất điện giữa ca).
 */

const EMPTY_DRAFT = { ticketUuid: null, ticketCode: null, customerName: '', records: [] }

function newTicketUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback cho môi trường không có crypto.randomUUID (http, browser cũ).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function readStoredDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw)
    return {
      ticketUuid: typeof parsed.ticketUuid === 'string' ? parsed.ticketUuid : null,
      ticketCode: typeof parsed.ticketCode === 'string' ? parsed.ticketCode : null,
      customerName: typeof parsed.customerName === 'string' ? parsed.customerName : '',
      records: Array.isArray(parsed.records) ? parsed.records : [],
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/**
 * @returns {{
 *   ticketUuid: string|null,
 *   ticketCode: string|null,
 *   customerName: string,
 *   records: Array<{weighSequence:number, bagCount:number, weightKg:number, weighedAt:string}>,
 *   setCustomerName: (name: string) => void,
 *   addRecord: (weightKg: number, bagCount?: number) => void,
 *   updateRecord: (weighSequence: number, patch: object) => void,
 *   removeRecord: (weighSequence: number) => void,
 *   loadTicket: (ticket: object) => void,
 *   reset: () => void,
 *   totalBags: number,
 *   totalWeightKg: number,
 * }}
 */
export function useTicketDraft() {
  // Sinh ticketUuid ngay trong initializer để mọi lần cân dùng chung 1 khóa,
  // và draft đã lưu vẫn giữ uuid cũ sau reload.
  const [draft, setDraft] = useState(() => {
    const stored = readStoredDraft()
    return stored.ticketUuid ? stored : { ...stored, ticketUuid: newTicketUuid() }
  })
  // Giữ bản draft mới nhất để addRecord tính weighSequence đồng bộ.
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      // localStorage đầy hoặc bị chặn — draft vẫn còn trong memory.
    }
    draftRef.current = draft
  }, [draft])

  const setCustomerName = useCallback((customerName) => {
    setDraft((prev) => ({ ...prev, customerName }))
  }, [])

  const addRecord = useCallback((weightKg, bagCount = DEFAULT_BAG_COUNT) => {
    // Tính record đồng bộ từ ref (đã cập nhật atomic ở mọi thay đổi) để trả về
    // ngay cho FE đẩy BE; setDraft chỉ append.
    const created = {
      weighSequence: draftRef.current.records.reduce((max, r) => Math.max(max, r.weighSequence), 0) + 1,
      bagCount,
      weightKg,
      weighedAt: new Date().toISOString(),
    }
    setDraft((p) => {
      const next = { ...p, records: [...p.records, created] }
      draftRef.current = next
      return next
    })
    return created
  }, [])

  /**
   * Hiện/ghi đè 1 dòng "đang cân" realtime trong mẻ (chưa về 0). Nếu đã có
   * dòng active thì cập nhật đỉnh mới, chưa có thì tạo mới. Trả về record.
   */
  const setActiveRecord = useCallback((weightKg, bagCount = DEFAULT_BAG_COUNT) => {
    const prev = draftRef.current
    const active = prev.records.find((r) => r.activeDraft)
    if (active) {
      const updated = { ...active, weightKg, bagCount }
      setDraft((p) => {
        const next = {
          ...p,
          records: p.records.map((r) => (r.weighSequence === active.weighSequence ? updated : r)),
        }
        draftRef.current = next
        return next
      })
      return updated
    }
    const created = {
      weighSequence: prev.records.reduce((max, r) => Math.max(max, r.weighSequence), 0) + 1,
      bagCount,
      weightKg,
      weighedAt: new Date().toISOString(),
      activeDraft: true,
    }
    setDraft((p) => {
      const next = { ...p, records: [...p.records, created] }
      draftRef.current = next
      return next
    })
    return created
  }, [])

  /**
   * Chốt mẻ: xóa dòng active (nếu có) và thêm dòng chốt trong CÙNG một lần
   * setDraft (atomic) — tránh race khiến sót dòng active làm nhảy weighSequence.
   */
  const commitActive = useCallback((weightKg, bagCount = DEFAULT_BAG_COUNT) => {
    const kept = draftRef.current.records.filter((r) => !r.activeDraft)
    const created = {
      weighSequence: kept.reduce((max, r) => Math.max(max, r.weighSequence), 0) + 1,
      bagCount,
      weightKg,
      weighedAt: new Date().toISOString(),
    }
    setDraft((p) => {
      const next = { ...p, records: [...kept, created] }
      draftRef.current = next
      return next
    })
    return created
  }, [])

  const updateRecord = useCallback((weighSequence, patch) => {
    setDraft((prev) => ({
      ...prev,
      records: prev.records.map((r) => (r.weighSequence === weighSequence ? { ...r, ...patch } : r)),
    }))
  }, [])

  const removeRecord = useCallback((weighSequence) => {
    setDraft((prev) => ({
      ...prev,
      records: prev.records.filter((r) => r.weighSequence !== weighSequence),
    }))
  }, [])

  /**
   * Nạp 1 phiếu đã lưu vào draft để chỉnh sửa.
   *
   * Giữ nguyên `ticketUuid` nên khi bấm "Lưu phiếu" screen sẽ gọi `PUT` thay vì
   * `POST` — không tạo phiếu trùng.
   */
  const loadTicket = useCallback((ticket) => {
    setDraft({
      ticketUuid: ticket.ticketUuid,
      ticketCode: ticket.ticketCode ?? null,
      customerName: ticket.customerName ?? '',
      records: Array.isArray(ticket.records) ? ticket.records : [],
    })
  }, [])

  const reset = useCallback(() => {
    setDraft({ ticketUuid: newTicketUuid(), ticketCode: null, customerName: '', records: [] })
  }, [])

  const totals = useMemo(() => {
    const totalBags = draft.records.reduce((sum, r) => sum + (Number(r.bagCount) || 0), 0)
    const totalWeightKg = draft.records.reduce((sum, r) => sum + (Number(r.weightKg) || 0), 0)
    return { totalBags, totalWeightKg: Math.round(totalWeightKg * 100) / 100 }
  }, [draft.records])

  return {
    ticketUuid: draft.ticketUuid,
    ticketCode: draft.ticketCode,
    customerName: draft.customerName,
    records: draft.records,
    setCustomerName,
    addRecord,
    setActiveRecord,
    commitActive,
    updateRecord,
    removeRecord,
    loadTicket,
    reset,
    totalBags: totals.totalBags,
    totalWeightKg: totals.totalWeightKg,
  }
}