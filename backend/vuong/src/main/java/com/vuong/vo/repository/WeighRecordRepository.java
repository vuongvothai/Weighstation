package com.vuong.vo.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.vuong.vo.entity.WeighRecord;

public interface WeighRecordRepository extends JpaRepository<WeighRecord, Long> {

	/**
	 * Toàn bộ lần cân của 1 phiếu, sắp xếp theo thứ tự lần cân tăng dần.
	 */
	List<WeighRecord> findByTicketUuidOrderByWeighSequenceAsc(String ticketUuid);

	/**
	 * Kiểm tra phiếu đã tồn tại — dùng để trả 409 khi FE gửi lại phiếu đã lưu.
	 */
	boolean existsByTicketUuid(String ticketUuid);

	/**
	 * Lần cân lớn nhất của 1 phiếu, dùng khi ghi thêm lần cân mới.
	 */
	Optional<WeighRecord> findTopByTicketUuidOrderByWeighSequenceDesc(String ticketUuid);
}