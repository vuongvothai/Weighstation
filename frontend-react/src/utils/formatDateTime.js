/**
 * Format ISO-8601 string -> "dd/MM/yy HH:mm" theo giờ VN.
 *
 * Dùng chung cho TicketHistory và PrintTicket để tránh lặp code.
 * Cache Intl.DateTimeFormat instance để tránh tạo mới mỗi lần gọi.
 *
 * @param {string|null|undefined} iso
 * @returns {string}
 */
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(iso) {
  if (!iso) return '––'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = dateTimeFormatter.formatToParts(d)
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
}