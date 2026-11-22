import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrintTicket from './PrintTicket'

vi.mock('../api/tickets', () => ({
  fetchTicket: vi.fn(),
  errorMessage: (err, fallback) => err?.message ?? fallback,
}))

import { fetchTicket } from '../api/tickets'

const TICKET = {
  ticketUuid: '550e8400-e29b-41d4-a716-446655440000',
  ticketCode: 'CF-0042',
  customerName: 'Anh Ba (Buôn Trấp)',
  records: [
    { weighSequence: 1, bagCount: 2, weightKg: 124.5, weighedAt: '2026-11-21T19:55:12+07:00' },
    { weighSequence: 2, bagCount: 2, weightKg: 126.0, weighedAt: '2026-11-21T19:56:30+07:00' },
    { weighSequence: 3, bagCount: 2, weightKg: 122.8, weighedAt: '2026-11-21T19:57:45+07:00' },
    { weighSequence: 4, bagCount: 1, weightKg: 58.5, weighedAt: '2026-11-21T19:58:50+07:00' },
  ],
  totalBags: 7,
  totalWeightKg: 431.8,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/in-phieu/550e8400-e29b-41d4-a716-446655440000']}>
      <Routes>
        <Route path="/in-phieu/:ticketUuid" element={<PrintTicket />} />
        <Route path="/tram-can" element={<div>WEIGH SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PrintTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('render phiếu từ dữ liệu BE', async () => {
    fetchTicket.mockResolvedValue(TICKET)

    renderPage()

    expect(await screen.findByText('#CF-0042')).toBeTruthy()
    expect(screen.getByText('Anh Ba (Buôn Trấp)')).toBeTruthy()
    expect(screen.getByText('431.8 kg')).toBeTruthy()
    expect(screen.getByText('7 bao')).toBeTruthy()
  })

  it('render đủ 4 dòng lần cân', async () => {
    fetchTicket.mockResolvedValue(TICKET)

    renderPage()

    await screen.findByText('#CF-0042')
    expect(screen.getByText('124.5')).toBeTruthy()
    expect(screen.getByText('126.0')).toBeTruthy()
    expect(screen.getByText('122.8')).toBeTruthy()
    expect(screen.getByText('58.5')).toBeTruthy()
  })

  it('định dạng ngày giờ theo giờ VN', async () => {
    fetchTicket.mockResolvedValue(TICKET)

    renderPage()

    expect(await screen.findByText('21/11/26 19:55')).toBeTruthy()
  })

  it('gọi đúng endpoint theo ticketUuid trên URL', async () => {
    fetchTicket.mockResolvedValue(TICKET)

    renderPage()

    await screen.findByText('#CF-0042')
    expect(fetchTicket).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
  })

  it('hiện lỗi khi BE trả 404', async () => {
    fetchTicket.mockRejectedValue(new Error('Ticket ... not found'))

    renderPage()

    expect(await screen.findByText(/not found/)).toBeTruthy()
  })

  it('có nút In và khối receipt khổ 70mm', async () => {
    fetchTicket.mockResolvedValue(TICKET)

    const { container } = renderPage()

    await screen.findByText('#CF-0042')
    expect(screen.getByRole('button', { name: /In Phiếu Cân/ })).toBeTruthy()
    expect(container.querySelector('.receipt')).toBeTruthy()
  })
})