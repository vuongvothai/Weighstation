package com.vuong.vo.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.json.JsonMapper;
import com.vuong.vo.dto.TicketCreateRequest;
import com.vuong.vo.dto.TicketUpdateRequest;
import com.vuong.vo.dto.WeighRecordRequest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class TicketControllerTest {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private JsonMapper json;

	private static final OffsetDateTime T1 = OffsetDateTime.parse("2026-11-21T19:55:12+07:00");
	private static final OffsetDateTime T2 = OffsetDateTime.parse("2026-11-21T19:56:30+07:00");

	private TicketCreateRequest sample(String uuid) {
		return new TicketCreateRequest(
				uuid,
				"Anh Ba (Buôn Trấp)",
				List.of(
						new WeighRecordRequest(1, 2, new BigDecimal("124.50"), T1),
						new WeighRecordRequest(2, 2, new BigDecimal("126.00"), T2)));
	}

	@Test
	void post_ticket_returns_201_with_code_and_totals() throws Exception {
		String uuid = "aaaaaaaa-0000-4000-8000-000000000001";

		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.ticketUuid").value(uuid))
				.andExpect(jsonPath("$.ticketCode").value(org.hamcrest.Matchers.startsWith("CF-")))
				.andExpect(jsonPath("$.records.length()").value(2))
				.andExpect(jsonPath("$.totalBags").value(4))
				.andExpect(jsonPath("$.totalWeightKg").value(250.50));
	}

	@Test
	void post_ticket_twice_returns_409() throws Exception {
		String uuid = "aaaaaaaa-0000-4000-8000-000000000002";
		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isCreated());

		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.status").value(409))
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(uuid)));
	}

	@Test
	void post_ticket_with_zero_weight_returns_400() throws Exception {
		String body = """
				{
				  "ticketUuid": "aaaaaaaa-0000-4000-8000-000000000003",
				  "customerName": "Khách",
				  "records": [
				    { "weighSequence": 1, "bagCount": 2, "weightKg": 0, "weighedAt": "2026-11-21T19:55:12+07:00" }
				  ]
				}
				""";

		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("weightKg")));
	}

	@Test
	void post_ticket_with_empty_records_returns_400() throws Exception {
		String body = """
				{
				  "ticketUuid": "aaaaaaaa-0000-4000-8000-000000000004",
				  "customerName": "Khách",
				  "records": []
				}
				""";

		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest());
	}

	@Test
	void get_ticket_returns_200_with_records() throws Exception {
		String uuid = "aaaaaaaa-0000-4000-8000-000000000005";
		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isCreated());

		mvc.perform(get("/api/tickets/" + uuid))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.ticketUuid").value(uuid))
				.andExpect(jsonPath("$.records.length()").value(2))
				.andExpect(jsonPath("$.records[0].weighSequence").value(1))
				.andExpect(jsonPath("$.totalWeightKg").value(250.50));
	}

	@Test
	void get_ticket_unknown_uuid_returns_404() throws Exception {
		mvc.perform(get("/api/tickets/aaaaaaaa-0000-4000-8000-00000000dead"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.status").value(404));
	}

	@Test
	void put_ticket_replaces_records() throws Exception {
		String uuid = "aaaaaaaa-0000-4000-8000-000000000006";
		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isCreated());

		TicketUpdateRequest update = new TicketUpdateRequest(
				"Khách mới",
				List.of(new WeighRecordRequest(1, 1, new BigDecimal("58.50"), T1)));

		mvc.perform(put("/api/tickets/" + uuid).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(update)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.customerName").value("Khách mới"))
				.andExpect(jsonPath("$.records.length()").value(1))
				.andExpect(jsonPath("$.totalBags").value(1))
				.andExpect(jsonPath("$.totalWeightKg").value(58.50));
	}

	@Test
	void put_ticket_unknown_uuid_returns_404() throws Exception {
		TicketUpdateRequest update = new TicketUpdateRequest(
				"Khách",
				List.of(new WeighRecordRequest(1, 2, new BigDecimal("10.00"), T1)));

		mvc.perform(put("/api/tickets/aaaaaaaa-0000-4000-8000-00000000dead")
				.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(update)))
				.andExpect(status().isNotFound());
	}

	@Test
	void delete_ticket_returns_204_then_404() throws Exception {
		String uuid = "aaaaaaaa-0000-4000-8000-000000000007";
		mvc.perform(post("/api/tickets").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(sample(uuid))))
				.andExpect(status().isCreated());

		mvc.perform(delete("/api/tickets/" + uuid)).andExpect(status().isNoContent());
		mvc.perform(get("/api/tickets/" + uuid)).andExpect(status().isNotFound());
	}

	@Test
	void delete_ticket_unknown_uuid_returns_404() throws Exception {
		mvc.perform(delete("/api/tickets/aaaaaaaa-0000-4000-8000-00000000dead"))
				.andExpect(status().isNotFound());
	}
}
