package com.vuong.vo.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Một dòng nhật ký truy vết (append-only) cho mỗi lần cân bị thêm/sửa/xóa.
 *
 * <p>Mapper 1-1 với bảng {@code weigh_audit_log} trong {@code db/init.sql}.
 * Bảng này chỉ được INSERT — không UPDATE/DELETE — để phục vụ truy vết.
 */
@Entity
@Table(name = "weigh_audit_log")
public class WeighAuditLog {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "ticket_uuid", nullable = false, length = 36)
	private String ticketUuid;

	@Column(name = "weigh_sequence", nullable = false)
	private Integer weighSequence;

	@Column(name = "action", nullable = false, length = 20)
	private String action;

	@Column(name = "old_values", columnDefinition = "JSON")
	private String oldValues;

	@Column(name = "new_values", columnDefinition = "JSON")
	private String newValues;

	@Column(name = "changed_at", nullable = false)
	private LocalDateTime changedAt;

	protected WeighAuditLog() {
		// cho JPA
	}

	public WeighAuditLog(
			String ticketUuid,
			Integer weighSequence,
			String action,
			String oldValues,
			String newValues) {
		this.ticketUuid = ticketUuid;
		this.weighSequence = weighSequence;
		this.action = action;
		this.oldValues = oldValues;
		this.newValues = newValues;
	}

	@PrePersist
	void onCreate() {
		if (changedAt == null) {
			changedAt = LocalDateTime.now();
		}
	}

	public Long getId() {
		return id;
	}

	public String getTicketUuid() {
		return ticketUuid;
	}

	public Integer getWeighSequence() {
		return weighSequence;
	}

	public String getAction() {
		return action;
	}

	public String getOldValues() {
		return oldValues;
	}

	public String getNewValues() {
		return newValues;
	}

	public LocalDateTime getChangedAt() {
		return changedAt;
	}
}