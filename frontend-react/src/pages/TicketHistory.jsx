import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage, listTickets } from '../api/tickets'
import { formatDateTime } from '../utils/formatDateTime'

/**
 * Trang `/lich-su` — danh sách phiếu đã lưu.
 *
 * Bấm vào 1 dòng để mở phiếu đó ở trang in, chọn in lại.
 */
export default function TicketHistory() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)

    listTickets()
      .then((data) => {
        if (cancelled) return
        setTickets(data)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(errorMessage(err, 'Không tải được lịch sử'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(load, [load])

  return (
    <main className="screen">
      <header className="screen__header">
        <h1>Lịch sử phiếu cân</h1>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/tram-can')}>
          Về màn hình cân
        </button>
      </header>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Đang tải lịch sử...</p>}

      {!loading && !error && tickets.length === 0 && (
        <p className="hint">Chưa có phiếu nào được lưu.</p>
      )}

      {!loading && tickets.length > 0 && (
        <table className="records history">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Khách</th>
              <th>Giờ lưu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.ticketUuid}>
                <td className="history__code">{t.ticketCode}</td>
                <td>{t.customerName}</td>
                <td className="history__time">{formatDateTime(t.weighedAt)}</td>
                <td className="records__actions">
                  <button
                    type="button"
                    className="link link--edit"
                    aria-label={`Sửa phiếu ${t.ticketCode}`}
                    onClick={() => navigate(`/chinh-sua/${t.ticketUuid}`)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="link link--print"
                    aria-label={`In phiếu ${t.ticketCode}`}
                    onClick={() => navigate(`/in-phieu/${t.ticketUuid}`)}
                  >
                    In
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}