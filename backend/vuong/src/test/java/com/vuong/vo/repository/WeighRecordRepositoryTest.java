package com.vuong.vo.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.vuong.vo.entity.WeighRecord;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class WeighRecordRepositoryTest {

	@Autowired
	private WeighRecordRepository repository;

	private WeighRecord record(String ticketUuid, String ticketCode, int sequence, String weight) {
		return new WeighRecord(
				ticketUuid,
				ticketCode,
				"Nguyen Van A",
				sequence,
				2,
				new BigDecimal(weight),
				null,
				LocalDateTime.of(2026, 11, 21, 19, 55));
	}

	@Test
	void find_by_ticket_uuid_returns_records_ordered_by_sequence() {
		String uuid = "11111111-1111-4111-8111-111111111111";
		repository.save(record(uuid, "CF-0001", 3, "122.80"));
		repository.save(record(uuid, "CF-0001", 1, "124.50"));
		repository.save(record(uuid, "CF-0001", 2, "126.00"));

		List<WeighRecord> found = repository.findByTicketUuidOrderByWeighSequenceAsc(uuid);

		assertThat(found).extracting(WeighRecord::getWeighSequence).containsExactly(1, 2, 3);
		assertThat(found).extracting(r -> r.getWeightKg()).containsExactly(
				new BigDecimal("124.50"), new BigDecimal("126.00"), new BigDecimal("122.80"));
	}

	@Test
	void find_by_ticket_uuid_ignores_other_tickets() {
		String uuid = "22222222-2222-4222-8222-222222222222";
		repository.save(record(uuid, "CF-0002", 1, "100.00"));
		repository.save(record("33333333-3333-4333-8333-333333333333", "CF-0003", 1, "200.00"));

		assertThat(repository.findByTicketUuidOrderByWeighSequenceAsc(uuid)).hasSize(1);
	}

	@Test
	void exists_by_ticket_uuid_detects_duplicate_ticket() {
		String uuid = "44444444-4444-4444-8444-444444444444";
		assertThat(repository.existsByTicketUuid(uuid)).isFalse();

		repository.save(record(uuid, "CF-0004", 1, "50.00"));

		assertThat(repository.existsByTicketUuid(uuid)).isTrue();
	}

	@Test
	void weight_kg_keeps_two_decimals() {
		String uuid = "55555555-5555-4555-8555-555555555555";
		repository.saveAndFlush(record(uuid, "CF-0005", 1, "124.50"));

		WeighRecord reloaded = repository.findByTicketUuidOrderByWeighSequenceAsc(uuid).get(0);

		assertThat(reloaded.getWeightKg()).isEqualByComparingTo("124.50");
		assertThat(reloaded.getWeightKg().scale()).isEqualTo(2);
	}

	@Test
	void default_bag_count_is_two() {
		String uuid = "66666666-6666-4666-8666-666666666666";
		WeighRecord saved = repository.saveAndFlush(record(uuid, "CF-0006", 1, "10.00"));

		assertThat(saved.getBagCount()).isEqualTo(WeighRecord.DEFAULT_BAG_COUNT);
		assertThat(saved.getId()).isNotNull();
	}
}