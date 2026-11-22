package com.vuong.vo.entity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Một lần cân. Một phiếu cân gồm nhiều bản ghi, nhóm bằng {@code ticketUuid}.
 *
 * <p>Mapper 1-1 với bảng {@code weigh_record} trong {@code db/init.sql}.
 */
@Entity
@Table(
		name = "weigh_record",
		uniqueConstraints = @UniqueConstraint(
				name = "uq_ticket_seq",
				columnNames = { "ticket_uuid", "weigh_sequence" }))
public class WeighRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "ticket_uuid", nullable = false, length = 36)
	private String ticketUuid;

	@Column(name = "ticket_code", nullable = false, length = 30)
	private String ticketCode;

	@Column(name = "customer_name", nullable = false, length = 150)
	private String customerName;

	@Column(name = "weigh_sequence", nullable = false)
	private Integer weighSequence;

	@Column(name = "bag_count", nullable = false)
	private Integer bagCount = DEFAULT_BAG_COUNT;

	@Column(name = "weight_kg", nullable = false, precision = 10, scale = 2)
	private BigDecimal weightKg;

	@Column(name = "operator_name", length = 150)
	private String operatorName;

	@Column(name = "weighed_at", nullable = false)
	private LocalDateTime weighedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	public static final int DEFAULT_BAG_COUNT = 2;

	protected WeighRecord() {
		// cho JPA
	}

	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now();
		if (createdAt == null) {
			createdAt = now;
		}
		updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now();
	}

	public WeighRecord(
			String ticketUuid,
			String ticketCode,
			String customerName,
			Integer weighSequence,
			Integer bagCount,
			BigDecimal weightKg,
			String operatorName,
			LocalDateTime weighedAt) {
		this.ticketUuid = ticketUuid;
		this.ticketCode = ticketCode;
		this.customerName = customerName;
		this.weighSequence = weighSequence;
		this.bagCount = bagCount;
		this.weightKg = weightKg;
		this.operatorName = operatorName;
		this.weighedAt = weighedAt;
	}

	public Long getId() {
		return id;
	}

	public String getTicketUuid() {
		return ticketUuid;
	}

	public void setTicketUuid(String ticketUuid) {
		this.ticketUuid = ticketUuid;
	}

	public String getTicketCode() {
		return ticketCode;
	}

	public void setTicketCode(String ticketCode) {
		this.ticketCode = ticketCode;
	}

	public String getCustomerName() {
		return customerName;
	}

	public void setCustomerName(String customerName) {
		this.customerName = customerName;
	}

	public Integer getWeighSequence() {
		return weighSequence;
	}

	public void setWeighSequence(Integer weighSequence) {
		this.weighSequence = weighSequence;
	}

	public Integer getBagCount() {
		return bagCount;
	}

	public void setBagCount(Integer bagCount) {
		this.bagCount = bagCount;
	}

	public BigDecimal getWeightKg() {
		return weightKg;
	}

	public void setWeightKg(BigDecimal weightKg) {
		this.weightKg = weightKg;
	}

	public String getOperatorName() {
		return operatorName;
	}

	public void setOperatorName(String operatorName) {
		this.operatorName = operatorName;
	}

	public LocalDateTime getWeighedAt() {
		return weighedAt;
	}

	public void setWeighedAt(LocalDateTime weighedAt) {
		this.weighedAt = weighedAt;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}