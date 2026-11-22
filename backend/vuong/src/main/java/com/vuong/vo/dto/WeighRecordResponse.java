package com.vuong.vo.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Một lần cân trong payload phản hồi.
 */
public record WeighRecordResponse(
		Integer weighSequence,
		Integer bagCount,
		BigDecimal weightKg,
		OffsetDateTime weighedAt) {
}