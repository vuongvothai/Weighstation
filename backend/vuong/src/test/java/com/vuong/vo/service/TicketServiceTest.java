package com.vuong.vo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import com.vuong.vo.dto.TicketCreateRequest;
import com.vuong.vo.dto.TicketResponse;
import com.vuong.vo.dto.TicketUpdateRequest;
import com.vuong.vo.dto.WeighRecordRequest;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class TicketServiceTest {

	@Autowired
	private TicketService service;

	private static final OffsetDateTime T1 = OffsetDateTime.parse("2026-11-21T19:55:12+07:00");
	private static final OffsetDateTime T2 = OffsetDateTime.parse("2026-11-21T19:56:30+07:00");
	private static final OffsetDateTime T3 = OffsetDateTime.parse("2026-11-21T19:57:45+07:00");

	private TicketCreateRequest sampleRequest(String uuid) {
		return new TicketCreateRequest(
				uuid,
				"Nguyen Van A",
				List.of(
						new WeighRecordRequest(1, 2, new BigDecimal("124.50"), T1),
						new WeighRecordRequest(2, 2, new BigDecimal("126.00"), T2),
						new WeighRecordRequest(3, 2, new BigDecimal("122.80"), T3)));
	}

	@Test
	void create_ticket_returns_code_and_totals() {
		String uuid = "aaaaaaaa-1111-4111-8111-111111111111";

		TicketResponse response = service.createTicket(sampleRequest(uuid));

		assertThat(response.ticketUuid()).isEqualTo(uuid);
		assertThat(response.ticketCode()).startsWith("CF-");
		assertThat(response.records()).hasSize(3);
		assertThat(response.totalBags()).isEqualTo(6);
		assertThat(response.totalWeightKg()).isEqualByComparingTo("373.30");
	}

	@Test
	void create_ticket_rejects_duplicate_uuid() {
		String uuid = "bbbbbbbb-2222-4222-8222-222222222222";
		service.createTicket(sampleRequest(uuid));

		assertThatThrownBy(() -> service.createTicket(sampleRequest(uuid)))
				.isInstanceOf(DuplicateTicketException.class)
				.hasMessageContaining(uuid);
	}

	@Test
	void get_ticket_returns_records_ordered_by_sequence() {
		String uuid = "cccccccc-3333-4333-8333-333333333333";
		service.createTicket(sampleRequest(uuid));

		TicketResponse response = service.getTicket(uuid);

		assertThat(response.records()).extracting(r -> r.weighSequence()).containsExactly(1, 2, 3);
		assertThat(response.totalWeightKg()).isEqualByComparingTo("373.30");
	}

	@Test
	void get_ticket_missing_uuid_throws_not_found() {
		assertThatThrownBy(() -> service.getTicket("dddddddd-4444-4444-8444-444444444444"))
				.isInstanceOf(TicketNotFoundException.class);
	}

	@Test
	void replace_ticket_overwrites_records_and_keeps_code() {
		String uuid = "eeeeeeee-5555-4555-8555-555555555555";
		String originalCode = service.createTicket(sampleRequest(uuid)).ticketCode();

		TicketResponse updated = service.replaceTicket(
				uuid,
				new TicketUpdateRequest(
						"Nguyen Van A",
						List.of(
								new WeighRecordRequest(1, 2, new BigDecimal("124.50"), T1),
								new WeighRecordRequest(2, 1, new BigDecimal("126.00"), T2))));

		assertThat(updated.ticketCode()).isEqualTo(originalCode);
		assertThat(updated.records()).hasSize(2);
		assertThat(updated.totalBags()).isEqualTo(3);
		assertThat(updated.totalWeightKg()).isEqualByComparingTo("250.50");
	}

	@Test
	void replace_ticket_missing_uuid_throws_not_found() {
		assertThatThrownBy(() -> service.replaceTicket(
				"ffffffff-6666-4666-8666-666666666666",
				new TicketUpdateRequest("Khách", List.of(new WeighRecordRequest(1, 2, new BigDecimal("10.00"), T1)))))
				.isInstanceOf(TicketNotFoundException.class);
	}

	@Test
	void delete_ticket_removes_all_records() {
		String uuid = "99999999-7777-4777-8777-777777777777";
		service.createTicket(sampleRequest(uuid));

		service.deleteTicket(uuid);

		assertThatThrownBy(() -> service.getTicket(uuid)).isInstanceOf(TicketNotFoundException.class);
	}

	@Test
	void delete_ticket_missing_uuid_throws_not_found() {
		assertThatThrownBy(() -> service.deleteTicket("12345678-8888-4888-8888-888888888888"))
				.isInstanceOf(TicketNotFoundException.class);
	}
}