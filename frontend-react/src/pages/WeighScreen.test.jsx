import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WeighScreen from './WeighScreen'

vi.mock('../api/tickets', () => ({
  createTicket: vi.fn(),
  fetchTicket: vi.fn(),
  updateTicket: vi.fn(),
  errorMessage: (err, fallback) => err?.message ?? fallback,
}))

vi.mock('../hooks/useScaleWeight', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useScaleWeight: vi.fn() }
})

import { createTicket, fetchTicket, updateTicket } from '../api/tickets'
import { useScaleWeight } from '../hooks/useScaleWeight'

function renderScreen(path = '/tram-can') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tram-can" element={<WeighScreen />} />
        <Route path="/chinh-sua/:ticketUuid" element={<WeighScreen />} />
        <Route path="/lich-su" element={<div>PRINT PAGE</div>} />
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
    expect(screen.getByText(/có thể thêm thủ công bên dưới/)).toBeTruthy()
    expect(screen.getByText('––.–')).toBeTruthy()
  })

  it('hiển thị badge ổn định và số cân khi agent trả value', () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })

    renderScreen()

    expect(screen.getByText(/Ổn định/)).toBeTruthy()
    expect(screen.getByText(/Nhấn/)).toBeTruthy()
    expect(screen.getByText('t')).toBeTruthy()
    expect(screen.getByText('124.5')).toBeTruthy()
  })

  it('hiển thị badge dao động khi chưa stable', () => {
    useScaleWeight.mockReturnValue({ value: 130.2, stable: false, connected: true })

    renderScreen()

    expect(screen.getByText(/Đang dao động/)).toBeTruthy()
  })

  it('phím t ghi 1 lần cân vào bảng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    expect(await screen.findByLabelText(/Số bao lần 1/)).toBeTruthy()
    expect(screen.queryByText('Chưa có lần cân nào')).toBeNull()
  })

  it('không cho ghi khi chưa stable', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: false, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    expect(screen.getByText('Chưa có lần cân nào')).toBeTruthy()
  })

  it('báo lỗi khi lưu phiếu chưa có lần cân nào', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

      expect(await screen.findByText(/Chưa có lần cân nào\. Nhấn phím t/)).toBeTruthy()
    expect(createTicket).not.toHaveBeenCalled()
  })

    it('phím t không ghi khi chưa có lần cân nào được nhập', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    expect(screen.getByText('Chưa có lần cân nào')).toBeTruthy()
  })

  it('thêm lần cân thủ công khi không kết nối cân', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
    await user.type(screen.getByLabelText('Số cân thủ công (kg)'), '85.5')
    await user.click(screen.getByRole('button', { name: 'Thêm lần cân' }))

    expect(await screen.findByLabelText(/Số bao lần 1/)).toBeTruthy()
    expect(screen.getAllByText('85.5')).toHaveLength(2)
  })

  it('báo lỗi khi thêm số cân thủ công không hợp lệ', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Thêm lần cân' }))

    expect(await screen.findByText('Nhập số cân lớn hơn 0 kg.')).toBeTruthy()
  })

  it('báo lỗi khi chưa nhập tên khách', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/Chưa nhập tên khách/)).toBeTruthy()
    expect(createTicket).not.toHaveBeenCalled()
  })

  it('gửi cả phiếu và nhận ticketCode khi lưu thành công', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    createTicket.mockResolvedValue({ ticketCode: 'CF-0001', totalBags: 2, totalWeightKg: 124.5 })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')
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
      await user.keyboard('t')
    await user.type(screen.getByLabelText(/Tên khách/), 'Anh Ba')
    await user.click(screen.getByRole('button', { name: 'Lưu phiếu' }))

    expect(await screen.findByText(/already exists/)).toBeTruthy()
  })

  it('nút Lịch sử chuyển sang trang lịch sử', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Lịch sử' }))

    expect(await screen.findByText('PRINT PAGE')).toBeTruthy()
  })

  it('sửa số bao tại dòng cập nhật tổng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    const bagInput = await screen.findByLabelText(/Số bao lần 1/)
    await user.clear(bagInput)
    await user.type(bagInput, '5')

    expect(screen.getByText(/5\s*bao/)).toBeTruthy()
  })

  it('bấm vào số cân là sửa được ngay, không cần nút Sửa', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    expect(await screen.findByRole('button', { name: 'Sửa số cân lần 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Xoá lần cân 1' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Sửa số cân lần 1' }))

    expect(screen.getByLabelText('Số cân lần 1')).toHaveProperty('value', '124.5')
  })

  it('sửa số cân tại dòng rồi cập nhật tổng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    await user.click(await screen.findByRole('button', { name: 'Sửa số cân lần 1' }))
    const editInput = screen.getByLabelText('Số cân lần 1')
    await user.clear(editInput)
    await user.type(editInput, '200')
    await user.keyboard('{Enter}')

    expect(screen.queryByLabelText('Số cân lần 1')).toBeNull()
    expect(screen.getAllByText('200.0')).toHaveLength(2)
  })

  it('huỷ sửa số cân bằng Escape, giữ nguyên số cũ', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    await user.click(await screen.findByRole('button', { name: 'Sửa số cân lần 1' }))
    const editInput = screen.getByLabelText('Số cân lần 1')
    await user.clear(editInput)
    await user.type(editInput, '999')
    await user.keyboard('{Escape}')

    expect(screen.queryByLabelText('Số cân lần 1')).toBeNull()
    expect(screen.getAllByText('124.5').length).toBeGreaterThan(0)
  })

  it('báo lỗi khi sửa số cân không hợp lệ', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
      await user.keyboard('t')

    await user.click(await screen.findByRole('button', { name: 'Sửa số cân lần 1' }))
    const editInput = screen.getByLabelText('Số cân lần 1')
    await user.clear(editInput)
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Số cân phải lớn hơn 0 kg.')).toBeTruthy()
    expect(screen.getByLabelText('Số cân lần 1')).toBeTruthy()
  })

  it('ẩn ô nhập thủ công khi cân đang hoạt động', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })

    renderScreen()

    expect(screen.queryByLabelText('Số cân thủ công (kg)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thêm lần cân' })).toBeNull()
  })

  it('nút Thêm thủ công mở ô nhập khi cân đang hoạt động', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: /Thêm thủ công/ }))

    expect(screen.getByLabelText('Số cân thủ công (kg)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thêm lần cân' })).toBeTruthy()
  })

  it('nút Thêm thủ công đóng lại ô nhập', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Thêm thủ công' }))
    await user.click(screen.getByRole('button', { name: 'Thu gọn' }))

    expect(screen.queryByLabelText('Số cân thủ công (kg)')).toBeNull()
  })

  it('nạp phiếu cần sửa và lưu bằng PUT thay vì POST', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    fetchTicket.mockResolvedValue({
      ticketUuid: 'uuid-1',
      ticketCode: 'CF-0007',
      customerName: 'Khách Cũ',
      records: [{ weighSequence: 1, bagCount: 2, weightKg: 100, weighedAt: '2026-11-21T19:55:12+07:00' }],
    })
    updateTicket.mockResolvedValue({})
    const user = userEvent.setup()

    renderScreen('/chinh-sua/uuid-1')

    expect(await screen.findByDisplayValue('Khách Cũ')).toBeTruthy()
    expect(screen.getByText(/Chỉnh sửa phiếu CF-0007/)).toBeTruthy()

    await user.clear(screen.getByLabelText(/Tên khách/))
    await user.type(screen.getByLabelText(/Tên khách/), 'Khách Mới')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(updateTicket).toHaveBeenCalledTimes(1))
    expect(createTicket).not.toHaveBeenCalled()
    expect(updateTicket.mock.calls[0][0]).toBe('uuid-1')
    expect(updateTicket.mock.calls[0][1].customerName).toBe('Khách Mới')
  })

  it('báo lỗi khi không tải được phiếu cần sửa', async () => {
    useScaleWeight.mockReturnValue({ value: null, stable: false, connected: false })
    fetchTicket.mockRejectedValue(new Error('Không tải được phiếu'))

    renderScreen('/chinh-sua/uuid-1')

    expect(await screen.findByText('Không tải được phiếu')).toBeTruthy()
  })

  it('xoá 1 lần cân bằng nút Xoá ở dòng', async () => {
    useScaleWeight.mockReturnValue({ value: 124.5, stable: true, connected: true })
    const user = userEvent.setup()

    renderScreen()
    await user.keyboard('t')
    expect(await screen.findByLabelText(/Số bao lần 1/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Xoá lần cân 1' }))

    expect(screen.getByText('Chưa có lần cân nào')).toBeTruthy()
  })
})
