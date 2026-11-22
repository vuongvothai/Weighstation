package com.vuong.vo.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

/**
 * Payload {@code POST /api/tickets} — gửi cả phiếu (nhiều lần cân) trong 1 request.
 */
public record TicketCreateRequest(
		@NotBlank(message = "ticketUuid is required") String ticketUuid,
		@NotBlank(message = "customerName is required")
		@Size(min = 1, max = 150, message = "customerName must be between 1 and 150 characters") String customerName,
		@NotEmpty(message = "records must contain at least 1 weigh record") @Valid List<WeighRecordRequest> records) {
}