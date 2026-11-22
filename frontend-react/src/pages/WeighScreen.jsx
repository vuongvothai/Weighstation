import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTicket, errorMessage } from '../api/tickets'
import { useScaleWeight, useSpaceToWeigh } from '../hooks/useScaleWeight'
import { useTicketDraft } from '../hooks/useTicketDraft'

/**
 * Màn hình `/tram-can` — hiển thị số cân realtime, ghi lần cân bằng Space,
 * rồi gửi cả phiếu 1 lần khi operator nhấn "Lưu phiếu".
 */
export default function WeighScreen() {
  const navigate = useNavigate()
  const { value, stable, connected } = useScaleWeight()
  const draft = useTicketDraft()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedCode, setSavedCode] = useState(null)

  const canCapture = connected && stable && value !== null && value > 0 && !saving

  const capture = useCallback(() => {
    if (!canCapture) return
    setError(null)
    setSavedCode(null)
    draft.addRecord(value)
  }, [canCapture, value, draft])

  useSpaceToWeigh(capture, canCapture)

  const handleSave = async () => {
    if (draft.records.length === 0) {
      setError('Chưa có lần cân nào. Nhấn Space khi số cân ổn định để ghi.')
      return
    }
    if (!draft.customerName.trim()) {
      setError('Chưa nhập tên khách.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const saved = await createTicket({
        ticketUuid: draft.ticketUuid,
        customerName: draft.customerName.trim(),
        records: draft.records,
      })
      setSavedCode(saved.ticketCode)
      draft.reset()
    } catch (err) {
      setError(errorMessage(err, 'Lưu phiếu thất bại'))
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = () => {
    if (!savedCode) return
    navigate(`/in-phieu/${draft.ticketUuid}`)
  }

  const status = !connected
    ? { icon: '⚫', label: 'Mất kết nối cân', cls: 'is-off' }
    : stable
      ? { icon: '🟢', label: 'Ổn định', cls: 'is-stable' }
      : { icon: '🔴', label: 'Đang dao động', cls: 'is-unstable' }

  return (
    <main className="screen">
      <header className="screen__header">
        <h1>Trạm cân cà phê</h1>
        <span className={`badge ${status.cls}`}>
          {status.icon} {status.label}
        </span>
      </header>

      <section className="weight-display" aria-live="polite">
        <span className="weight-display__value">{value === null ? '––.–' : value.toFixed(1)}</span>
        <span className="weight-display__unit">kg</span>
      </section>

      <p className="hint">
        {canCapture ? 'Nhấn Space để ghi 1 lần cân' : 'Chờ số cân ổn định để ghi'}
      </p>

      <section className="panel">
        <label className="field">
          <span>Tên khách</span>
          <input
            type="text"
            value={draft.customerName}
            maxLength={150}
            placeholder="VD: Anh Ba (Buôn Trấp)"
            onChange={(e) => draft.setCustomerName(e.target.value)}
          />
        </label>

        <table className="records">
          <thead>
            <tr>
              <th>Lần</th>
              <th>Số bao</th>
              <th>Số cân (kg)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.records.length === 0 && (
              <tr>
                <td colSpan={4} className="records__empty">
                  Chưa có lần cân nào
                </td>
              </tr>
            )}
            {draft.records.map((r) => (
              <tr key={r.weighSequence}>
                <td>{r.weighSequence}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={r.bagCount}
                    aria-label={`Số bao lần ${r.weighSequence}`}
                    onChange={(e) => {
                      const bagCount = Math.max(1, Number.parseInt(e.target.value, 10) || 1)
                      draft.updateRecord(r.weighSequence, { bagCount })
                    }}
                  />
                </td>
                <td className="records__kg">{r.weightKg.toFixed(1)}</td>
                <td>
                  <button type="button" className="link" onClick={() => draft.removeRecord(r.weighSequence)}>
                    Xoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Tổng</td>
              <td className="records__kg">{draft.totalWeightKg.toFixed(1)}</td>
              <td>{draft.totalBags} bao</td>
            </tr>
          </tfoot>
        </table>

        {error && <p className="error">{error}</p>}
        {savedCode && <p className="success">Đã lưu phiếu {savedCode}</p>}

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Đang lưu...' : 'Lưu phiếu'}
          </button>
          <button type="button" className="btn" disabled={!savedCode} onClick={handlePrint}>
            In phiếu
          </button>
          <button type="button" className="btn btn--ghost" onClick={draft.reset}>
            Phiếu mới
          </button>
        </div>
      </section>
    </main>
  )
}