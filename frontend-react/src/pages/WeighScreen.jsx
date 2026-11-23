import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createTicket, errorMessage, fetchTicket, updateTicket } from '../api/tickets'
import { useScaleWeight, useSpaceToWeigh } from '../hooks/useScaleWeight'
import { useTicketDraft } from '../hooks/useTicketDraft'

/**
 * Màn hình `/tram-can` — hiển thị số cân realtime, ghi lần cân bằng phím `t`,
 * rồi gửi cả phiếu 1 lần khi operator nhấn "Lưu phiếu".
 *
 * Khi URL có `?sua={ticketUuid}` thì nạp phiếu đó vào draft và lưu bằng `PUT`
 * — dùng cho nút "Sửa" ở màn hình lịch sử.
 */
export default function WeighScreen() {
  const navigate = useNavigate()
  const { ticketUuid: editingUuid } = useParams()
  const { value, stable, connected } = useScaleWeight()
  const draft = useTicketDraft()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedCode, setSavedCode] = useState(null)
  const [manualWeight, setManualWeight] = useState('')
  const [editingSequence, setEditingSequence] = useState(null)
  const [editWeight, setEditWeight] = useState('')
  const [loadingTicket, setLoadingTicket] = useState(Boolean(editingUuid))
  const editInputRef = useRef(null)

  // Nạp phiếu cần sửa 1 lần khi vào trang. `loadTicket` là hàm ổn định nên
  // chỉ chạy lại khi đổi phiếu.
  useEffect(() => {
    if (!editingUuid) return undefined
    let cancelled = false
    setLoadingTicket(true)

    fetchTicket(editingUuid)
      .then((ticket) => {
        if (cancelled) return
        draft.loadTicket(ticket)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(errorMessage(err, 'Không tải được phiếu'))
      })
      .finally(() => {
        if (!cancelled) setLoadingTicket(false)
      })

    return () => {
      cancelled = true
    }
  }, [editingUuid, draft.loadTicket])

  const canCapture = connected && stable && value !== null && value > 0 && !saving
  // Ô nhập tay mặc định chỉ hiện khi cân không dùng được (phím `t` không ghi được);
  // operator vẫn mở/đóng được bằng nút "Thêm thủ công".
  const [manualOpen, setManualOpen] = useState(null)
  const showManualEntry = manualOpen ?? !canCapture

  const capture = useCallback(() => {
    if (!canCapture) return
    setError(null)
    setSavedCode(null)
    draft.addRecord(value)
  }, [canCapture, value, draft])

  const addManualRecord = useCallback((event) => {
    event.preventDefault()
    const weight = Number.parseFloat(manualWeight)
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Nhập số cân lớn hơn 0 kg.')
      return
    }
    setError(null)
    setSavedCode(null)
    draft.addRecord(weight)
    setManualWeight('')
  }, [manualWeight, draft])

  const startEdit = useCallback((record) => {
    setEditingSequence(record.weighSequence)
    setEditWeight(record.weightKg.toFixed(1))
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingSequence(null)
    setEditWeight('')
  }, [])

  const saveEdit = useCallback((weighSequence) => {
    const weight = Number.parseFloat(editWeight)
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Số cân phải lớn hơn 0 kg.')
      return
    }
    setError(null)
    setSavedCode(null)
    draft.updateRecord(weighSequence, { weightKg: Math.round(weight * 10) / 10 })
    cancelEdit()
  }, [editWeight, draft, cancelEdit])

  // Ô nhập đang mở: focus + chọn hết để gõ đè ngay, Enter lưu, Esc huỷ.
  useEffect(() => {
    if (editingSequence === null) return
    editInputRef.current?.focus()
    editInputRef.current?.select()
  }, [editingSequence])

  useSpaceToWeigh(capture, canCapture)

  const handleSave = useCallback(async () => {
    if (draft.records.length === 0) {
      setError('Chưa có lần cân nào. Nhấn phím t khi số cân ổn định để ghi.')
      return
    }
    if (!draft.customerName.trim()) {
      setError('Chưa nhập tên khách.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        customerName: draft.customerName.trim(),
        records: draft.records,
      }

      if (editingUuid) {
        await updateTicket(editingUuid, payload)
        setSavedCode(draft.ticketCode ?? null)
        navigate('/lich-su')
      } else {
        const saved = await createTicket({ ticketUuid: draft.ticketUuid, ...payload })
        setSavedCode(saved.ticketCode)
        draft.reset()
      }
    } catch (err) {
      setError(errorMessage(err, 'Lưu phiếu thất bại'))
    } finally {
      setSaving(false)
    }
  }, [draft, editingUuid, navigate])

  const status = useMemo(() => {
    if (!connected) return { icon: '⚫', label: 'Mất kết nối cân', cls: 'is-off' }
    if (stable) return { icon: '🟢', label: 'Ổn định', cls: 'is-stable' }
    return { icon: '🔴', label: 'Đang dao động', cls: 'is-unstable' }
  }, [connected, stable])

  if (loadingTicket) {
    return <main className="screen">Đang tải phiếu cần sửa...</main>
  }

  return (
    <main className="screen">
      <header className="screen__header">
        <h1>{editingUuid ? `Chỉnh sửa phiếu ${draft.ticketCode ?? ''}` : 'Trạm cân'}</h1>
        {editingUuid ? (
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/lich-su')}>
            Về lịch sử
          </button>
        ) : (
          <span className={`badge ${status.cls}`}>
            {status.icon} {status.label}
          </span>
        )}
      </header>

      <section className="weight-display" aria-live="polite">
        <span className="weight-display__value">{value === null ? '––.–' : value.toFixed(1)}</span>
        <span className="weight-display__unit">kg</span>
      </section>

      <p className="hint" role="status">
        {canCapture ? (
          <>
            Nhấn <kbd>t</kbd> để ghi 1 lần cân
            {draft.records.length > 0 && <> · đã ghi {draft.records.length} lần</>}
          </>
        ) : connected ? (
                      <>Chờ số cân ổn định, sau đó nhấn <kbd>t</kbd> để ghi</>
        ) : (
          <>Cân chưa kết nối — có thể thêm thủ công bên dưới</>
        )}
      </p>

      <section className="panel">
        <label className="field">
          <span>Tên khách</span>
          <input
            type="text"
            value={draft.customerName}
            maxLength={150}
            placeholder="VD: Nguyen Van A"
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
                <td className="records__kg">
                  {editingSequence === r.weighSequence ? (
                    <input
                      ref={editInputRef}
                      className="records__edit"
                      type="number"
                      min="0.1"
                      step="0.1"
                      inputMode="decimal"
                      value={editWeight}
                      aria-label={`Số cân lần ${r.weighSequence}`}
                      onChange={(e) => setEditWeight(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveEdit(r.weighSequence)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelEdit()
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="records__edit-btn"
                      title="Bấm để sửa số cân"
                      aria-label={`Sửa số cân lần ${r.weighSequence}`}
                      onClick={() => startEdit(r)}
                    >
                      {r.weightKg.toFixed(1)}
                    </button>
                  )}
                </td>
                <td className="records__actions">
                  {editingSequence === r.weighSequence && (
                    <button
                      type="button"
                      className="link link--muted"
                      onClick={cancelEdit}
                      title="Bỏ thay đổi"
                    >
                      Huỷ
                    </button>
                  )}
                  <button
                    type="button"
                    className="link link--danger"
                    title="Xoá lần cân này"
                    aria-label={`Xoá lần cân ${r.weighSequence}`}
                    onClick={() => draft.removeRecord(r.weighSequence)}
                  >
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

        <div className="manual-entry-bar">
          <button
            type="button"
            className="manual-entry-bar__toggle"
            aria-expanded={showManualEntry}
            onClick={() => setManualOpen(!showManualEntry)}
          >
            {showManualEntry ? 'Thu gọn' : 'Thêm thủ công'}
          </button>
        </div>

        {showManualEntry && (
          <form className="manual-entry" onSubmit={addManualRecord}>
            <input
              className="manual-entry__weight"
              type="number"
              min="0.1"
              step="0.1"
              inputMode="decimal"
              value={manualWeight}
              placeholder="Số cân (kg)"
              aria-label="Số cân thủ công (kg)"
              onChange={(event) => setManualWeight(event.target.value)}
            />
            <button type="submit" className="btn" disabled={saving}>
              Thêm lần cân
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
        {savedCode && <p className="success">Đã lưu phiếu {savedCode}</p>}

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Đang lưu...' : editingUuid ? 'Lưu thay đổi' : 'Lưu phiếu'}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/lich-su')}>
            Lịch sử
          </button>
          <button type="button" className="btn btn--ghost" onClick={draft.reset}>
            Phiếu mới
          </button>
        </div>
      </section>
    </main>
  )
}