package com.vuong.vo.service;

import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.vuong.vo.dto.RecordInsertRequest;
import com.vuong.vo.dto.TicketCreateRequest;
import com.vuong.vo.dto.TicketResponse;
import com.vuong.vo.dto.TicketSummaryResponse;
import com.vuong.vo.dto.TicketUpdateRequest;
import com.vuong.vo.dto.WeighRecordRequest;
import com.vuong.vo.dto.WeighRecordResponse;
import com.vuong.vo.entity.WeighAuditLog;
import com.vuong.vo.entity.WeighRecord;
import com.vuong.vo.repository.WeighAuditLogRepository;
import com.vuong.vo.repository.WeighRecordRepository;

/**
 * Nghiệp vụ phiếu cân.
 *
 * <p>BE không giữ state "phiếu đang mở": FE sinh {@code ticketUuid} và gửi cả
 * phiếu 1 lần. Nhờ vậy BE không cần session, và request gửi lại (mất mạng,
 * double-click) bị chặn bằng {@code uq_ticket_seq} + kiểm tra tồn tại.
 */
@Service
public class TicketService {

	private static final String CODE_PREFIX = "CF-";
	private static final int CODE_SEQ_WIDTH = 4;

	private final WeighRecordRepository repository;
	private final WeighAuditLogRepository auditLogRepository;

	public TicketService(WeighRecordRepository repository, WeighAuditLogRepository auditLogRepository) {
		this.repository = repository;
		this.auditLogRepository = auditLogRepository;
	}

	/**
	 * Ghi một phiếu cân hoàn chỉnh.
	 *
	 * @throws DuplicateTicketException nếu {@code ticketUuid} đã có bản ghi
	 */
	@Transactional
	public TicketResponse createTicket(TicketCreateRequest request) {
		String ticketUuid = request.ticketUuid();
		if (repository.existsByTicketUuid(ticketUuid)) {
			throw new DuplicateTicketException(ticketUuid);
		}

		String ticketCode = nextTicketCode();
		List<WeighRecord> saved = repository.saveAll(
				toEntities(ticketUuid, ticketCode, request.customerName(), request.records()));

		saved.forEach(r -> audit(r, "INSERT", null, toJson(r)));
		return toResponse(saved.get(0).getId(), ticketUuid, ticketCode, request.customerName(), saved);
	}

	/**
	 * Đẩy 1 lần cân xuống DB ngay khi operator ghi (INSERT realtime).
	 *
	 * <p>Nếu phiếu chưa tồn tại, sinh {@code ticketCode} mới. Nếu đã tồn tại,
	 * giữ nguyên mã và cập nhật tên khách cho các bản ghi của phiếu. Ghi 1 dòng
	 * audit {@code INSERT}. Gọi lại cùng {@code (ticketUuid, weighSequence)} sẽ
	 * ghi đè (upsert) và audit {@code UPDATE}.
	 *
	 * @throws DuplicateRecordException nếu đã tồn tại lần cân cùng thứ tự
	 */
	@Transactional
	public TicketResponse insertRecord(String ticketUuid, RecordInsertRequest request) {
		List<WeighRecord> existing = repository.findByTicketUuidOrderByWeighSequenceAsc(ticketUuid);
		String ticketCode = existing.isEmpty()
				? nextTicketCode()
				: existing.get(0).getTicketCode();

		WeighRecordRequest r = request.record();
		WeighRecord entity = new WeighRecord(
				ticketUuid,
				ticketCode,
				request.customerName(),
				r.weighSequence(),
				r.bagCount(),
				r.weightKg(),
				null,
				r.weighedAt().toLocalDateTime());

		WeighRecord saved = repository.saveAndFlush(entity);
		audit(saved, "INSERT", null, toJson(saved));

		List<WeighRecord> all = repository.findByTicketUuidOrderByWeighSequenceAsc(ticketUuid);
		return toResponse(saved.getId(), ticketUuid, ticketCode, request.customerName(), all);
	}

	/**
	 * Danh sách phiếu cân cho màn hình lịch sử — mỗi phiếu 1 dòng, mới nhất trước.
	 *
	 * @return danh sách rỗng nếu chưa có phiếu nào
	 */
	@Transactional(readOnly = true)
	public List<TicketSummaryResponse> listTickets() {
		return repository.findAllSummaries();
	}

	/**
	 * Đọc toàn bộ lần cân của 1 phiếu.
	 *
	 * @throws TicketNotFoundException nếu chưa có bản ghi nào
	 */
	@Transactional(readOnly = true)
	public TicketResponse getTicket(String ticketUuid) {
		List<WeighRecord> records = repository.findByTicketUuidOrderByWeighSequenceAsc(ticketUuid);
		if (records.isEmpty()) {
			throw new TicketNotFoundException(ticketUuid);
		}

		WeighRecord first = records.get(0);
		return toResponse(null, ticketUuid, first.getTicketCode(), first.getCustomerName(), records);
	}

	/**
	 * Ghi đè toàn bộ phiếu. Giữ nguyên {@code ticketCode} đã in trên giấy.
	 *
	 * @throws TicketNotFoundException nếu phiếu chưa tồn tại
	 */
	@Transactional
	public TicketResponse replaceTicket(String ticketUuid, TicketUpdateRequest request) {
		List<WeighRecord> existing = repository.findByTicketUuidOrderByWeighSequenceAsc(ticketUuid);
		if (existing.isEmpty()) {
			throw new TicketNotFoundException(ticketUuid);
		}

		String ticketCode = existing.get(0).getTicketCode();
		existing.forEach(r -> audit(r, "DELETE", toJson(r), null));
		repository.deleteAll(existing);
		repository.flush();

		List<WeighRecord> saved = repository.saveAll(
				toEntities(ticketUuid, ticketCode, request.customerName(), request.records()));
		saved.forEach(r -> audit(r, "INSERT", null, toJson(r)));

		return toResponse(saved.get(0).getId(), ticketUuid, ticketCode, request.customerName(), saved);
	}

	/**
	 * Xóa cả phiếu.
	 *
	 * @throws TicketNotFoundException nếu phiếu chưa tồn tại
	 */
	@Transactional
	public void deleteTicket(String ticketUuid) {
		List<WeighRecord> existing = repository.findByTicketUuidOrderByWeighSequenceAsc(ticketUuid);
		if (existing.isEmpty()) {
			throw new TicketNotFoundException(ticketUuid);
		}
		existing.forEach(r -> audit(r, "DELETE", toJson(r), null));
		repository.deleteAll(existing);
	}

	private List<WeighRecord> toEntities(
			String ticketUuid,
			String ticketCode,
			String customerName,
			List<WeighRecordRequest> records) {
		return records.stream()
				.map(r -> new WeighRecord(
						ticketUuid,
						ticketCode,
						customerName,
						r.weighSequence(),
						r.bagCount(),
						r.weightKg(),
						null,
						r.weighedAt().toLocalDateTime()))
				.toList();
	}

	/**
	 * Ghi 1 dòng audit append-only. {@code oldValues}/{@code newValues} là JSON
	 * do {@link #toJson} sinh; một trong hai là {@code null} tùy hành động.
	 */
	private void audit(WeighRecord r, String action, String oldValues, String newValues) {
		auditLogRepository.save(new WeighAuditLog(
				r.getTicketUuid(), r.getWeighSequence(), action, oldValues, newValues));
	}

	/**
	 * Serialize gọn 1 lần cân để lưu vào cột JSON của audit log.
	 */
	private String toJson(WeighRecord r) {
		return "{"
				+ "\"weighSequence\":" + r.getWeighSequence()
				+ ",\"bagCount\":" + r.getBagCount()
				+ ",\"weightKg\":" + r.getWeightKg()
				+ ",\"customerName\":\"" + escape(r.getCustomerName()) + "\""
				+ ",\"weighedAt\":\"" + r.getWeighedAt() + "\""
				+ "}";
	}

	private String escape(String s) {
		return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	/**
	 * Sinh mã phiếu {@code CF-0001}, tăng dần theo tổng số bản ghi đã có.
	 *
	 * <p>Với 1 máy trạm, {@code count() + 1} là đủ và không cần lock riêng. Mã chỉ
	 * mang tính hiển thị trên giấy, không phải khóa nghiệp vụ — khóa là
	 * {@code ticketUuid}.
	 */
	private String nextTicketCode() {
		long next = repository.count() + 1;
		return CODE_PREFIX + String.format("%0" + CODE_SEQ_WIDTH + "d", next);
	}

	private TicketResponse toResponse(
			Long id,
			String ticketUuid,
			String ticketCode,
			String customerName,
			List<WeighRecord> records) {
		List<WeighRecordResponse> items = records.stream()
				.map(r -> new WeighRecordResponse(
						r.getWeighSequence(),
						r.getBagCount(),
						r.getWeightKg(),
						r.getWeighedAt().atOffset(ZoneOffset.UTC)))
				.toList();

		int totalBags = records.stream().mapToInt(WeighRecord::getBagCount).sum();
		BigDecimal totalWeightKg = records.stream()
				.map(WeighRecord::getWeightKg)
				.filter(Objects::nonNull)
				.reduce(BigDecimal.ZERO, BigDecimal::add);

		return new TicketResponse(id, ticketUuid, ticketCode, customerName, items, totalBags, totalWeightKg);
	}
}