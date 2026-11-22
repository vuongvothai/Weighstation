package com.vuong.vo.service;

import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.vuong.vo.dto.TicketCreateRequest;
import com.vuong.vo.dto.TicketResponse;
import com.vuong.vo.dto.TicketSummaryResponse;
import com.vuong.vo.dto.TicketUpdateRequest;
import com.vuong.vo.dto.WeighRecordRequest;
import com.vuong.vo.dto.WeighRecordResponse;
import com.vuong.vo.entity.WeighRecord;
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

	public TicketService(WeighRecordRepository repository) {
		this.repository = repository;
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

		return toResponse(saved.get(0).getId(), ticketUuid, ticketCode, request.customerName(), saved);
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
		repository.deleteAll(existing);
		repository.flush();

		List<WeighRecord> saved = repository.saveAll(
				toEntities(ticketUuid, ticketCode, request.customerName(), request.records()));

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