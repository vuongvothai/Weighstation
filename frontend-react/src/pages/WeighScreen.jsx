import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createTicket, errorMessage, fetchTicket, insertRecord, updateTicket } from '../api/tickets'
import { DEFAULT_BAG_COUNT, RECENT_RECORD_LIMIT } from '../config'
import { useScaleWeight, useSpaceToWeigh } from '../hooks/useScaleWeight'
import { useAutoCapture, useCaptureMode } from '../hooks/useAutoCapture'
import { useTicketDraft } from '../hooks/useTicketDraft'

/**
 * Nối thêm 1 mốc truy vết vào ghi chú của lần cân (giữ lại ghi chú cũ).
 */
function appendNote(existing, marker) {
  const base = (existing ?? '').trim()
  return base ? `${base} · ${marker}` : marker
}

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
  const { isAuto, toggle: toggleCaptureMode } = useCaptureMode()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedCode, setSavedCode] = useState(null)
  const [manualWeight, setManualWeight] = useState('')
  // Cảnh báo khi có lần cân chưa đẩy được xuống BE (mất mạng) — draft vẫn còn
  // ở localStorage và sẽ đồng bộ lại khi "Lưu phiếu".
  const [unsynced, setUnsynced] = useState(false)
  // Số bao tự điền cho lần cân kế tiếp; để trống thì dùng DEFAULT_BAG_COUNT.
  const [defaultBagCount, setDefaultBagCount] = useState(String(DEFAULT_BAG_COUNT))
  // Mặc định chỉ hiện 3 lần cân cuối; bật cờ này để xem toàn bộ.
  const [showAllRecords, setShowAllRecords] = useState(false)
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
  // Ô nhập tay mặc định thu gọn; operator mở/đóng bằng nút "nhập tay".
  const [manualOpen, setManualOpen] = useState(false)
  const showManualEntry = manualOpen

  // Số bao cho lần cân kế tiếp: ô chọn ở đầu bảng, rỗng thì nhận mặc định.
  const nextBagCount = useMemo(() => {
    const parsed = Number.parseInt(defaultBagCount, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BAG_COUNT
  }, [defaultBagCount])

  // Đẩy 1 lần cân vừa ghi xuống BE ngay (INSERT realtime) để không mất khi
  // cúp điện giữa chừng. Lỗi đẩy (mất mạng) thì báo operator biết — draft vẫn
  // còn ở FE và sẽ được đồng bộ lại khi "Lưu phiếu".
  const pushRecord = useCallback(
    (record, customerName) => {
      if (!record) return
      insertRecord(draft.ticketUuid, {
        customerName: (customerName ?? draft.customerName ?? '').trim() || 'Khách',
        record,
      })
        .then(() => setUnsynced(false))
        .catch(() => setUnsynced(true))
    },
    [draft.ticketUuid, draft.customerName],
  )

  const capture = useCallback(() => {
    if (!canCapture) return
    setError(null)
    setSavedCode(null)
    const record = draft.addRecord(value, nextBagCount)
    pushRecord(record)
  }, [canCapture, value, nextBagCount, draft, pushRecord])

  const addManualRecord = useCallback((event) => {
    event.preventDefault()
    const weight = Number.parseFloat(manualWeight)
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Nhập số cân lớn hơn 0 kg.')
      return
    }
    setError(null)
    setSavedCode(null)
    const record = draft.addRecord(weight, nextBagCount)
    pushRecord(record)
    setManualWeight('')
  }, [manualWeight, nextBagCount, draft, pushRecord])

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
    const rounded = Math.round(weight * 10) / 10
    const current = draft.records.find((r) => r.weighSequence === weighSequence)
    const note = appendNote(current?.note, `đã sửa số cân ${current?.weightKg?.toFixed?.(1) ?? ''} → ${rounded.toFixed(1)}`)
    draft.updateRecord(weighSequence, { weightKg: rounded, note })
    cancelEdit()
  }, [editWeight, draft, cancelEdit])

  // Ô nhập đang mở: focus + chọn hết để gõ đè ngay, Enter lưu, Esc huỷ.
  useEffect(() => {
    if (editingSequence === null) return
    editInputRef.current?.focus()
    editInputRef.current?.select()
  }, [editingSequence])

  useSpaceToWeigh(capture, canCapture)

  // Auto-capture: tự ghi 1 lần cân khi mẻ cân kết thúc (số tụt từ đỉnh đã ổn định).
  // Chỉ bật ở chế độ auto, khi đang tạo phiếu mới và chưa lưu.
  useAutoCapture({ value, stable, connected }, capture, isAuto && canCapture && !editingUuid)

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
        setUnsynced(false)
        navigate('/lich-su')
      } else {
        const saved = await createTicket({ ticketUuid: draft.ticketUuid, ...payload })
        setSavedCode(saved.ticketCode)
        setUnsynced(false)
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

  // Chỉ render 3 lần cân cuối để bảng gọn; nút bên dưới mở ra toàn bộ.
  const hiddenRecordCount = Math.max(0, draft.records.length - RECENT_RECORD_LIMIT)
  const visibleRecords = useMemo(
    () => (showAllRecords ? draft.records : draft.records.slice(-RECENT_RECORD_LIMIT)),
    [draft.records, showAllRecords],
  )

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
          <div className="screen__status">
            <button
              type="button"
              className={`mode-toggle ${isAuto ? 'is-auto' : 'is-manual'}`}
              aria-pressed={isAuto}
              title={
                isAuto
                  ? 'Đang tự động ghi khi mẻ cân kết thúc — bấm để chuyển sang nhập tay'
                  : 'Đang nhập tay bằng phím t — bấm để chuyển sang tự động'
              }
              onClick={toggleCaptureMode}
            >
              {isAuto ? '⚙ Auto' : '⌨ Thủ công'}
            </button>
            <span className={`badge ${status.cls}`}>
              {status.icon} {status.label}
            </span>
          </div>
        )}
      </header>

      <section className="weight-display" aria-live="polite">
        <span className="weight-display__value">{value === null ? '––.–' : value.toFixed(1)}</span>
        <span className="weight-display__unit">kg</span>
      </section>

      <p className="hint" role="status">
        {canCapture ? (
          isAuto ? (
            <>
              Tự động ghi khi mẻ cân kết thúc
              {draft.records.length > 0 && <> · đã ghi {draft.records.length} lần</>}
            </>
          ) : (
            <>
              Nhấn <kbd>t</kbd> để ghi 1 lần cân
              {draft.records.length > 0 && <> · đã ghi {draft.records.length} lần</>}
            </>
          )
        ) : connected ? (
          isAuto ? (
            <>Chờ số cân ổn định — hệ thống tự ghi khi mẻ cân kết thúc</>
          ) : (
            <>Chờ số cân ổn định, sau đó nhấn <kbd>t</kbd> để ghi</>
          )
        ) : (
          <>Cân chưa kết nối — có thể nhập tay bên dưới</>
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
              <th>
                <label className="records__bag-default">
                  <span>Số bao</span>
                  <input
                    type="number"
                    min={1}
                    value={defaultBagCount}
                    placeholder={String(DEFAULT_BAG_COUNT)}
                    aria-label="Số bao mặc định cho lần cân kế tiếp"
                    onChange={(e) => setDefaultBagCount(e.target.value)}
                  />
                </label>
              </th>
              <th>Số cân (kg)</th>
              <th>Ghi chú</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.records.length === 0 && (
              <tr>
                <td colSpan={5} className="records__empty">
                  Chưa có lần cân nào
                </td>
              </tr>
            )}
            {visibleRecords.map((r) => (
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
                <td className="records__note">
                  <input
                    type="text"
                    maxLength={200}
                    value={r.note ?? ''}
                    placeholder="—"
                    aria-label={`Ghi chú lần ${r.weighSequence}`}
                    onChange={(e) => draft.updateRecord(r.weighSequence, { note: e.target.value })}
                  />
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
              <td>Tổng</td>
              <td>{draft.totalBags} bao</td>
              <td className="records__kg">{draft.totalWeightKg.toFixed(1)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>

        {hiddenRecordCount > 0 && (
          <div className="records-toggle-bar">
            <button
              type="button"
              className="records-toggle"
              aria-expanded={showAllRecords}
              onClick={() => setShowAllRecords((prev) => !prev)}
            >
              {showAllRecords ? 'Thu gọn' : 'Xem tất cả'}
            </button>
          </div>
        )}

        <div className="manual-entry-bar">
          <button
            type="button"
            className="manual-entry-bar__toggle"
            aria-expanded={showManualEntry}
            onClick={() => setManualOpen(!showManualEntry)}
          >
            {showManualEntry ? 'Thu gọn' : 'nhập tay'}
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
        {unsynced && !error && (
          <p className="error">
            Chưa đồng bộ được xuống máy chủ (mất kết nối). Dữ liệu vẫn còn trên máy này — bấm “Lưu phiếu” để thử đẩy lại.
          </p>
        )}
        {savedCode && <p className="success">Đã lưu phiếu {savedCode}</p>}

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Đang lưu...' : editingUuid ? 'Lưu thay đổi' : 'Lưu phiếu'}
          </button>
          {!editingUuid && (
            <>
              <button type="button" className="btn" onClick={() => navigate('/lich-su')}>
                Lịch sử
              </button>
              <button type="button" className="btn btn--ghost" onClick={draft.reset}>
                Phiếu mới
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}