/**
 * Cấu hình endpoint.
 *
 * Agent chạy ở `127.0.0.1:5000`, BE ở `:8080`. Khi FE chạy qua nginx thì
 * `/api` cùng origin nên `VITE_API_BASE_URL` để trống là đủ.
 */
export const AGENT_BASE_URL = import.meta.env.VITE_AGENT_BASE_URL ?? 'http://127.0.0.1:5000'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

/** Tần suất FE hỏi agent, khớp với `docs/01-architecture.md`. */
export const POLL_INTERVAL_MS = 100

/** Khoảng cách tối thiểu giữa 2 lần ghi (chống bấm Space 2 lần liên tiếp). */
export const WEIGH_DEBOUNCE_MS = 500

/** Số bao mặc định cho mỗi lần cân. */
export const DEFAULT_BAG_COUNT = 2

/** Khoá lưu draft trong localStorage. */
export const DRAFT_STORAGE_KEY = 'weighstation.ticketDraft.v1'