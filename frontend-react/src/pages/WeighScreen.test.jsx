import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WeighScreen from './WeighScreen'

vi.mock('../api/tickets', () => ({
  createTicket: vi.fn(),
  errorMessage: (err, fallback) => err?.message ?? fallback,
}))

vi.mock('../hooks/useScaleWeight', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useScaleWeight: vi.fn() }
})

import { createTicket } from '../api/tickets'
import { useScaleWeight } from '../hooks/useScaleWeight'

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/tram-can']}>
      <Routes>
        <Route path="/tram-can" element={<WeighScreen />} />
        <Route path="/in-phieu/:ticketUuid" element={<div>PRINT PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WeighScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('hiển thị badge mất kết nối khi agent offline', () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })

    renderScreen()

    expect(screen.getByText(/Mất kết nối cân/)).toBeTruthy()
    expect(screen.getByText('––.–')).toBeTruthy()
  })

  it('hiển thị badge ổn định và số cân khi agent trả value', () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })

    renderScreen()

    expect(screen.getByText(/Ổn định/)).toBeTruthy()
    expect(screen.getByText('124.5')).toBeTruthy()
  })

  it('hiển thị badge dao động khi chưa stable', () => {
    useScaleWeight.mockReturnValue({ value: 130.2, stable: false, connected: true })

    renderScreen()

    expect(screen.getByText(/Đang dao động/)).toBeTruthy()
  })

  it('Space ghi 1 lần cân vào bảng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')

    expect(await screen.findByLabelText(/Số bao lần 1/)).toBeTruthy()
    expect(screen.queryByText('Chưa có lần cân nào')).toBeNull()
  })

  it('không cho ghi khi chưa stable', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: false, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')

    expect(screen.getByText('Chưa có lần cân nào')).toBeTruthy()
  })

  it('báo lỗi khi lưu phiếu chưa có lần cân nào', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/Chưa có lần cân nào\. Nhấn Space/)).toBeTruthy()
    expect(createTicket).not.toHaveBeenCalled()
  })

  it('Space không ghi khi chưa có lần cân nào được nhập', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')

    expect(screen.getByText('Chưa có lần cân nào')).toBeTruthy()
  })

  it('báo lỗi khi chưa nhập tên khách', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/Chưa nhập tên khách/)).toBeTruthy()
    expect(createTicket).not.toHaveBeenCalled()
  })

  it('gửi cả phiếu và nhận ticketCode khi lưu thành công', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    createTicket.mockResolvedValue({ ticketCode: 'CF-0001', totalBags: 2, totalWeightKg: 124.5 })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')
    await user.type(screen.getByLabelText(/Tên khách/), 'Anh Ba')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/Đã lưu phiếu CF-0001/)).toBeTruthy()
    expect(createTicket).toHaveBeenCalledTimes(1)

    const payload = createTicket.mock.calls[0][0]
    expect(payload.customerName).toBe('Anh Ba')
    expect(payload.records).toHaveLength(1)
    expect(payload.records[0]).toMatchObject({ weighSequence: 1, bagCount: 2, weightKg: 124.5 })
    expect(typeof payload.ticketUuid).toBe('string')
  })

  it('hiện thông báo lỗi từ BE khi lưu thất bại', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    createTicket.mockRejectedValue(new Error('Ticket ... already exists'))
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')
    await user.type(screen.getByLabelText(/Tên khách/), 'Anh Ba')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/already exists/)).toBeTruthy()
  })

  it('nút In phiếu chỉ bật sau khi lưu thành công', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    createTicket.mockResolvedValue({ ticketCode: 'CF-0001' })
    const user = userEvent.setup()

    renderScreen()
    const printBtn = screen.getByRole('button', { name: 'In phiếu' })
    expect(printBtn.disabled).toBe(true)

    await user.keyboard(' ')
    await user.type(screen.getByLabelText(/Tên khách/), 'Anh Ba')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'In phiếu' }).disabled).toBe(false))
  })

  it('sửa số bao tại dòng cập nhật tổng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard(' ')

    const bagInput = await screen.findByLabelText(/Số bao lần 1/)
    await user.clear(bagInput)
    await user.type(bagInput, '5')

    expect(screen.getByText(/5\s*bao/)).toBeTruthy()
  })
})