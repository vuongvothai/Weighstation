package com.vuong.vo.config;

import java.time.OffsetDateTime;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.vuong.vo.service.DuplicateTicketException;
import com.vuong.vo.service.TicketNotFoundException;

import jakarta.validation.ConstraintViolationException;

/**
 * Map exception nghiệp vụ sang envelope lỗi mặc định của Spring Boot
 * ({@code timestamp/status/error/message}) theo {@code docs/03-api-contract.md}.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(DuplicateTicketException.class)
	public ResponseEntity<ApiError> handleDuplicate(DuplicateTicketException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError.of(HttpStatus.CONFLICT, ex.getMessage()));
	}

	@ExceptionHandler(TicketNotFoundException.class)
	public ResponseEntity<ApiError> handleNotFound(TicketNotFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError.of(HttpStatus.NOT_FOUND, ex.getMessage()));
	}

	/**
	 * Lỗi validate body JSON. Ghép mọi vi phạm thành 1 message dạng
	 * {@code records[0].weightKg must be greater than 0}.
	 */
	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ApiError> handleBodyValidation(MethodArgumentNotValidException ex) {
		String message = ex.getBindingResult().getFieldErrors().stream()
				.map(fe -> fe.getField() + " " + fe.getDefaultMessage())
				.collect(Collectors.joining("; "));
		return ResponseEntity.badRequest().body(ApiError.of(HttpStatus.BAD_REQUEST, message));
	}

	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException ex) {
		return ResponseEntity.badRequest().body(ApiError.of(HttpStatus.BAD_REQUEST, ex.getMessage()));
	}

	/**
	 * Envelope lỗi khớp với response mặc định của Spring Boot.
	 */
	public record ApiError(String timestamp, int status, String error, String message) {

		static ApiError of(HttpStatus status, String message) {
			return new ApiError(
					OffsetDateTime.now().toString(),
					status.value(),
					status.getReasonPhrase(),
					message);
		}
	}
}