package com.vuong.vo.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.vuong.vo.dto.TicketSummaryResponse;
import com.vuong.vo.entity.WeighRecord;

public interface WeighRecordRepository extends JpaRepository<WeighRecord, Long> {

	/**
	 * Toàn bộ lần cân của 1 phiếu, sắp xếp theo thứ tự lần cân tăng dần.
	 */
	List<WeighRecord> findByTicketUuidOrderByWeighSequenceAsc(String ticketUuid);

	/**
	 * Danh sách phiếu cân cho màn hình lịch sử — mỗi phiếu 1 dòng, mới nhất trước.
	 *
	 * <p>Dùng projection constructor để không kéo toàn bộ lần cân của mọi phiếu.
	 */
	@Query("""
			select new com.vuong.vo.dto.TicketSummaryResponse(
				w.ticketUuid,
				w.ticketCode,
				w.customerName,
				max(w.weighedAt))
			from WeighRecord w
			group by w.ticketUuid, w.ticketCode, w.customerName
			order by max(w.weighedAt) desc
			""")
	List<TicketSummaryResponse> findAllSummaries();

	/**
	 * Kiểm tra phiếu đã tồn tại — dùng để trả 409 khi FE gửi lại phiếu đã lưu.
	 */
	boolean existsByTicketUuid(String ticketUuid);

	/**
	 * Lần cân lớn nhất của 1 phiếu, dùng khi ghi thêm lần cân mới.
	 */
	Optional<WeighRecord> findTopByTicketUuidOrderByWeighSequenceDesc(String ticketUuid);
}