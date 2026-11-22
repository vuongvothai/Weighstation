package com.vuong.vo.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Phiếu cân đầy đủ — dùng cho cả {@code POST} và {@code GET}.
 *
 * <p>{@code id} chỉ có ở response {@code POST}; {@code GET} trả {@code null} ở
 * trường này (xem {@link TicketService#getTicket}).
 */
public record TicketResponse(
		Long id,
		String ticketUuid,
		String ticketCode,
		String customerName,
		List<WeighRecordResponse> records,
		Integer totalBags,
		BigDecimal totalWeightKg) {
}