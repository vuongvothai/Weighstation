/**
 * Cấu hình endpoint.
 *
 * Agent chạy ở `127.0.0.1:5000`, BE ở `:8079`. Khi FE chạy qua nginx thì
 * `/api` cùng origin nên `VITE_API_BASE_URL` để trống là đủ.
 */
export const AGENT_BASE_URL = import.meta.env.VITE_AGENT_BASE_URL ?? 'http://127.0.0.1:5000'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8079'

/** Tần suất FE hỏi agent, khớp với `docs/01-architecture.md`. */
export const POLL_INTERVAL_MS = 100

/** Khoảng cách tối thiểu giữa 2 lần ghi (chống bấm phím `t` 2 lần liên tiếp). */
export const WEIGH_DEBOUNCE_MS = 1000

/** Số bao mặc định cho mỗi lần cân. */
export const DEFAULT_BAG_COUNT = 1

/** Số lần cân cuối cùng hiện ở màn hình cân khi chưa bật "Xem tất cả". */
export const RECENT_RECORD_LIMIT = 3

/** Khoá lưu draft trong localStorage. */
export const DRAFT_STORAGE_KEY = 'weighstation.ticketDraft.v1'

/** Khoá lưu chế độ nhập (auto / manual) trong localStorage. */
export const CAPTURE_MODE_STORAGE_KEY = 'weighstation.captureMode.v1'

/**
 * Ngưỡng coi là "cân về 0" — dưới mức này thì reset peak để chờ mẻ mới.
 * Cân YH-T7E nhiễu ±0.1kg quanh 0 nên dùng 0.2kg.
 */
export const ZERO_THRESHOLD_KG = 0.2

/** Số vòng poll liên tiếp phải thấy cân ở 0 trước khi reset peak. */
export const ZERO_CONFIRM_POLLS = 3

/**
 * Cửa sổ lấy số cân auto: trong [đỉnh_ổn_định - 5, đỉnh_ổn_định], lấy giá trị
 * ổn định nhỏ nhất. Giảm nhiễu và tránh ghi giá trị đỉnh "đè tay".
 */
export const AUTO_TARE_WINDOW_KG = 5