package com.vuong.vo.dto;

import java.time.LocalDateTime;

/**
 * Một dòng trong danh sách lịch sử phiếu cân.
 *
 * <p>Chỉ gồm thông tin hiển thị ở cột lịch sử — không kèm danh sách lần cân,
 * FE gọi {@code GET /api/tickets/{ticketUuid}} khi cần chi tiết.
 *
 * <p>{@code weighedAt} dùng {@link LocalDateTime} để dùng được trong JPQL
 * projection constructor; Jackson serialize ra ISO-8601 kèm offset như các
 * response khác.
 */
public record TicketSummaryResponse(
		String ticketUuid,
		String ticketCode,
		String customerName,
		LocalDateTime weighedAt) {
}