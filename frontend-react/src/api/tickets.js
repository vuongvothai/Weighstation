import axios from 'axios'
import { API_BASE_URL } from '../config'

const http = axios.create({ baseURL: API_BASE_URL, timeout: 10000 })

/**
 * Gửi cả phiếu lên BE.
 *
 * @param {{ticketUuid:string, customerName:string, records:Array}} payload
 * @returns {Promise<object>} phiếu đã lưu (có ticketCode, totalBags, totalWeightKg)
 */
export async function createTicket(payload) {
  const res = await http.post('/api/tickets', payload)
  return res.data
}

/**
 * Đẩy 1 lần cân xuống DB ngay khi operator ghi (INSERT realtime).
 *
 * @param {string} ticketUuid
 * @param {{customerName:string, record:object}} payload
 * @returns {Promise<object>} phiếu sau khi thêm (có ticketCode, records, totals)
 */
export async function insertRecord(ticketUuid, payload) {
  const res = await http.post(`/api/tickets/${ticketUuid}/records`, payload)
  return res.data
}

/**
 * Danh sách phiếu đã lưu — dùng cho màn hình lịch sử.
 *
 * @returns {Promise<Array<{ticketUuid:string, ticketCode:string, customerName:string, weighedAt:string}>>}
 */
export async function listTickets() {
  const res = await http.get('/api/tickets')
  return res.data
}

/**
 * @param {string} ticketUuid
 * @returns {Promise<object>}
 */
export async function fetchTicket(ticketUuid) {
  const res = await http.get(`/api/tickets/${ticketUuid}`)
  return res.data
}

/**
 * @param {string} ticketUuid
 * @param {{customerName:string, records:Array}} payload
 * @returns {Promise<object>}
 */
export async function updateTicket(ticketUuid, payload) {
  const res = await http.put(`/api/tickets/${ticketUuid}`, payload)
  return res.data
}

/**
 * @param {string} ticketUuid
 */
export async function deleteTicket(ticketUuid) {
  await http.delete(`/api/tickets/${ticketUuid}`)
}

/**
 * Rút message lỗi từ envelope `{timestamp,status,error,message}` của BE.
 */
export function errorMessage(error, fallback = 'Có lỗi xảy ra') {
  return error?.response?.data?.message ?? error?.message ?? fallback
}