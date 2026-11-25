package com.vuong.vo.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.vuong.vo.entity.WeighAuditLog;

public interface WeighAuditLogRepository extends JpaRepository<WeighAuditLog, Long> {

	/**
	 * Nhật ký truy vết của 1 phiếu, mới nhất trước.
	 */
	List<WeighAuditLog> findByTicketUuidOrderByChangedAtDesc(String ticketUuid);
}