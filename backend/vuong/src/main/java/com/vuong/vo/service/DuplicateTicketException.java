package com.vuong.vo.service;

/**
 * Phiếu đã tồn tại — controller map sang HTTP 409.
 */
public class DuplicateTicketException extends RuntimeException {

	public DuplicateTicketException(String ticketUuid) {
		super("Ticket " + ticketUuid + " already exists");
	}
}