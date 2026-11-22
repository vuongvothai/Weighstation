package com.vuong.vo.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Một lần cân trong payload request.
 *
 * <p>{@code weightKg} dùng {@code @DecimalMin} chứ không phải {@code @Min} vì
 * ràng buộc là {@code > 0} trên số thực, không phải số nguyên.
 */
public record WeighRecordRequest(
		@NotNull(message = "weighSequence is required")
		@Min(value = 1, message = "weighSequence must be >= 1") Integer weighSequence,
		@NotNull(message = "bagCount is required")
		@Min(value = 1, message = "bagCount must be >= 1") Integer bagCount,
		@NotNull(message = "weightKg is required")
		@DecimalMin(value = "0.01", message = "weightKg must be greater than 0")
		@DecimalMax(value = "9999999.99", message = "weightKg is out of range") BigDecimal weightKg,
		@NotNull(message = "weighedAt is required") OffsetDateTime weighedAt) {
}