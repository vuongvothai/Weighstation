package com.vuong.vo.service;

/**
 * Không tìm thấy phiếu theo {@code ticketUuid} — controller map sang HTTP 404.
 */
public class TicketNotFoundException extends RuntimeException {

	public TicketNotFoundException(String ticketUuid) {
		super("Ticket " + ticketUuid + " not found");
	}
}