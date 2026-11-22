package com.vuong.vo.controller;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.vuong.vo.dto.TicketCreateRequest;
import com.vuong.vo.dto.TicketResponse;
import com.vuong.vo.dto.TicketUpdateRequest;
import com.vuong.vo.service.TicketService;

import jakarta.validation.Valid;

/**
 * 4 endpoint nghiệp vụ phiếu cân theo {@code docs/03-api-contract.md}.
 */
@RestController
@RequestMapping("/api/tickets")
public class TicketController {

	private final TicketService service;

	public TicketController(TicketService service) {
		this.service = service;
	}

	@PostMapping
	public ResponseEntity<TicketResponse> create(@Valid @RequestBody TicketCreateRequest request) {
		TicketResponse created = service.createTicket(request);
		return ResponseEntity
				.created(URI.create("/api/tickets/" + created.ticketUuid()))
				.body(created);
	}

	@GetMapping("/{ticketUuid}")
	public TicketResponse get(@PathVariable String ticketUuid) {
		return service.getTicket(ticketUuid);
	}

	@PutMapping("/{ticketUuid}")
	public TicketResponse replace(
			@PathVariable String ticketUuid,
			@Valid @RequestBody TicketUpdateRequest request) {
		return service.replaceTicket(ticketUuid, request);
	}

	@DeleteMapping("/{ticketUuid}")
	public ResponseEntity<Void> delete(@PathVariable String ticketUuid) {
		service.deleteTicket(ticketUuid);
		return ResponseEntity.noContent().build();
	}
}