import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DRAFT_STORAGE_KEY } from '../config'
import { useTicketDraft } from './useTicketDraft'

describe('useTicketDraft', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sinh ticketUuid khi khởi tạo', () => {
    const { result } = renderHook(() => useTicketDraft())

    expect(result.current.ticketUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(result.current.records).toEqual([])
  })

  it('addRecord đánh số thứ tự tăng dần và mặc định 2 bao', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.addRecord(124.5))
    act(() => result.current.addRecord(126))

    expect(result.current.records).toHaveLength(2)
    expect(result.current.records[0]).toMatchObject({ weighSequence: 1, bagCount: 2, weightKg: 124.5 })
    expect(result.current.records[1]).toMatchObject({ weighSequence: 2, bagCount: 2, weightKg: 126 })
  })

  it('addRecord cho phép sửa số bao tại dòng', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.addRecord(58.5, 1))

    expect(result.current.records[0].bagCount).toBe(1)
  })

  it('tính totalBags và totalWeightKg', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.addRecord(124.5, 2))
    act(() => result.current.addRecord(126, 2))
    act(() => result.current.addRecord(122.8, 2))
    act(() => result.current.addRecord(58.5, 1))

    expect(result.current.totalBags).toBe(7)
    expect(result.current.totalWeightKg).toBe(431.8)
  })

  it('updateRecord sửa số bao của 1 lần cân', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.addRecord(126, 2))
    act(() => result.current.updateRecord(1, { bagCount: 1 }))

    expect(result.current.records[0].bagCount).toBe(1)
    expect(result.current.totalBags).toBe(1)
  })

  it('removeRecord xoá đúng lần cân', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.addRecord(124.5))
    act(() => result.current.addRecord(126))
    act(() => result.current.removeRecord(1))

    expect(result.current.records).toHaveLength(1)
    expect(result.current.records[0].weighSequence).toBe(2)
  })

  it('lưu draft vào localStorage', () => {
    const { result } = renderHook(() => useTicketDraft())

    act(() => result.current.setCustomerName('Anh Ba (Buôn Trấp)'))
    act(() => result.current.addRecord(124.5))

    const stored = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY))
    expect(stored.customerName).toBe('Anh Ba (Buôn Trấp)')
    expect(stored.records).toHaveLength(1)
  })

  it('khôi phục draft từ localStorage sau reload', () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        ticketUuid: '550e8400-e29b-41d4-a716-446655440000',
        customerName: 'Khách cũ',
        records: [{ weighSequence: 1, bagCount: 2, weightKg: 100, weighedAt: '2026-11-21T19:55:12+07:00' }],
      }),
    )

    const { result } = renderHook(() => useTicketDraft())

    expect(result.current.ticketUuid).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.current.customerName).toBe('Khách cũ')
    expect(result.current.records).toHaveLength(1)
  })

  it('reset xoá trắng và sinh ticketUuid mới', () => {
    const { result } = renderHook(() => useTicketDraft())
    const firstUuid = result.current.ticketUuid

    act(() => result.current.addRecord(124.5))
    act(() => result.current.reset())

    expect(result.current.records).toEqual([])
    expect(result.current.customerName).toBe('')
    expect(result.current.ticketUuid).not.toBe(firstUuid)
  })
})