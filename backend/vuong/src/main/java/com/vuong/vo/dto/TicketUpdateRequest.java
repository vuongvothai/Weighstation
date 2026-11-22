package com.vuong.vo.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Payload {@code PUT /api/tickets/{ticketUuid}} — ghi đè toàn bộ phiếu.
 *
 * <p>Không có {@code ticketUuid} trong body vì nó đã nằm trên path.
 */
public record TicketUpdateRequest(
		@NotBlank(message = "customerName is required")
		@Size(min = 1, max = 150, message = "customerName must be between 1 and 150 characters") String customerName,
		@NotEmpty(message = "records must contain at least 1 weigh record") List<@Valid WeighRecordRequest> records) {
}