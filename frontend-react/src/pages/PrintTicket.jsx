import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { errorMessage, fetchTicket } from '../api/tickets'
import './PrintTicket.css'

/**
 * Trang `/in-phieu/:ticketUuid` — render lại phiếu từ dữ liệu BE.
 *
 * Giữ nguyên khối in từ `docs/designs/printed_slip.html`: khổ 70mm (1/3 A4
 * đứng), `@page { size: A4 portrait; margin: 3mm }`, và ẩn nút khi in.
 */
export default function PrintTicket() {
  const { ticketUuid } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetchTicket(ticketUuid)
      .then((data) => {
        if (!cancelled) setTicket(data)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Không tải được phiếu'))
      })

    return () => {
      cancelled = true
    }
  }, [ticketUuid])

  if (error) {
    return (
      <main className="print-page">
        <p className="error">{error}</p>
        <button type="button" className="btn" onClick={() => navigate('/tram-can')}>
          Về màn hình cân
        </button>
      </main>
    )
  }

  if (!ticket) {
    return <main className="print-page">Đang tải phiếu...</main>
  }

  const issuedAt = ticket.records[0]?.weighedAt
  const dateLabel = issuedAt ? formatDateTime(issuedAt) : '––'

  return (
    <main className="print-page">
      <button type="button" className="btn-print" onClick={() => window.print()}>
        In Phiếu Cân (1/3 A4)
      </button>

      <div className="receipt">
        <div className="header">
          <h2>ĐẠI LÝ THU MUA CÀ PHÊ</h2>
          <p>Ea Na, Krông Ana, Đắk Lắk</p>
          <p>SĐT: 0914.xxx.xxx</p>
        </div>

        <div className="title">PHIẾU CÂN CÀ PHÊ</div>

        <div className="info">
          <div className="info-row">
            <span>Mã phiếu:</span>
            <span>#{ticket.ticketCode}</span>
          </div>
          <div className="info-row">
            <span>Ngày giờ:</span>
            <span>{dateLabel}</span>
          </div>
          <div className="info-row">
            <span>Khách:</span>
            <span>{ticket.customerName}</span>
          </div>
          <div className="info-row">
            <span>Loại:</span>
            <span>Cà phê tươi</span>
          </div>
        </div>

        <table className="weigh-table">
          <thead>
            <tr>
              <th style={{ width: '24%' }}>Lần</th>
              <th style={{ width: '26%' }}>Số bao</th>
              <th style={{ width: '50%' }}>Số cân (kg)</th>
            </tr>
          </thead>
          <tbody>
            {ticket.records.map((r) => (
              <tr key={r.weighSequence}>
                <td>{r.weighSequence}</td>
                <td>{r.bagCount}</td>
                <td className="kg-col">{r.weightKg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="summary">
          <div className="sum-row">
            <span>Tổng bao:</span>
            <strong>{ticket.totalBags} bao</strong>
          </div>
          <div className="total-kg">
            <span>TỔNG CÂN:</span>
            <span>{ticket.totalWeightKg.toFixed(1)} kg</span>
          </div>
        </div>

        <div className="signatures">
          <div className="sig-col">Người bán</div>
          <div className="sig-col">Người cân</div>
        </div>

        <div className="cut-line">✂ Cắt theo đường này</div>
      </div>
    </main>
  )
}

/**
 * `2026-11-21T19:55:12+07:00` → `21/11/26 19:55` (giờ VN).
 */
function formatDateTime(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}