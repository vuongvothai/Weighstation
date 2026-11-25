package com.vuong.vo.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload {@code POST /api/tickets/{ticketUuid}/records} — đẩy 1 lần cân xuống
 * DB ngay khi operator ghi (INSERT realtime).
 *
 * <p>{@code customerName} đi kèm để gán cho bản ghi; nếu phiếu đã tồn tại thì
 * giá trị này được dùng để cập nhật tên khách cho các bản ghi còn lại.
 */
public record RecordInsertRequest(
		@NotBlank(message = "customerName is required")
		@Size(min = 1, max = 150, message = "customerName must be between 1 and 150 characters") String customerName,
		@NotNull(message = "record is required")
		@Valid WeighRecordRequest record) {
}