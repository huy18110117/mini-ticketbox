import { Component, computed, effect, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { ApiErrorResponse, ReserveTicketResponse, TicketType } from '../../core/ticket.models';

const HOLD_DURATION_SECONDS = 5 * 60;

const ERROR_MESSAGES: Record<string, string> = {
  TICKET_TYPE_REQUIRED: 'Vui lòng chọn loại vé.',
  QUANTITY_INVALID: 'Số lượng vé không hợp lệ.',
  TICKET_TYPE_NOT_FOUND: 'Không tìm thấy loại vé.',
  NOT_ENOUGH_TICKETS: 'Không đủ vé còn lại.',
  HOLD_CODE_REQUIRED: 'Thiếu mã giữ vé.',
  CUSTOMER_NAME_REQUIRED: 'Vui lòng nhập họ và tên.',
  CUSTOMER_EMAIL_INVALID: 'Vui lòng nhập email hợp lệ.',
  TICKET_HOLD_NOT_FOUND: 'Không tìm thấy lượt giữ vé.',
  TICKET_HOLD_PAYMENT_UNAVAILABLE: 'Lượt giữ vé không còn khả dụng để thanh toán.',
  TICKET_HOLD_CANCELLATION_UNAVAILABLE: 'Lượt giữ vé không còn khả dụng để hủy.',
  TICKET_HOLD_EXPIRED: 'Lượt giữ vé đã hết hạn.',
  SYSTEM_ERROR: 'Lỗi hệ thống. Vui lòng thử lại sau.',
};

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink,RouterLinkActive],
  templateUrl: './booking.component.html',
})
export class BookingComponent implements OnInit, OnDestroy {
  private readonly activeHoldStorageKey = 'mini-ticketbox.activeHold';
  private serverClockOffsetMs = 0;

  readonly tickets = signal<TicketType[]>([]);
  readonly heldTicket = signal<TicketType | null>(null);
  readonly selectedTicketTypeId = signal('');
  readonly quantity = signal(1);
  readonly hold = signal<ReserveTicketResponse | null>(null);
  readonly remainingSeconds = signal(0);
  readonly busy = signal(false);
  readonly cancellingHold = signal(false);
  readonly loadingTickets = signal(false);
  readonly showCancelConfirm = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly customerName = signal('');
  readonly customerEmail = signal('');
  readonly submittedPayment = signal(false);
  readonly showDropdown = signal(false);

  readonly selectedTicket = computed(() => {
    const id = this.selectedTicketTypeId();
    const liveTicket = this.tickets().find((t) => t.id === id);
    const heldTicket = this.heldTicket();

    return liveTicket || (heldTicket?.id === id ? heldTicket : null);
  });

  readonly holdDurationSeconds = HOLD_DURATION_SECONDS;
  readonly hasTickets = computed(() => this.tickets().length > 0);
  readonly hasAvailableTickets = computed(() =>
    this.tickets().some((ticket) => ticket.availableQuantity > 0)
  );

  readonly maxQuantity = computed(() => {
    const ticket = this.selectedTicket();
    return ticket ? Math.min(ticket.availableQuantity, 10) : 0;
  });

  readonly canReserve = computed(
    () =>
      !!this.selectedTicketTypeId() &&
      !!this.selectedTicket() &&
      this.maxQuantity() > 0 &&
      this.quantity() <= this.maxQuantity() &&
      !this.busy() &&
      !this.loadingTickets() &&
      !this.hold()
  );
  readonly countdown = computed(() => {
    const seconds = this.remainingSeconds();
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const rest = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
  });
  readonly trimmedCustomerName = computed(() => this.customerName().trim());
  readonly trimmedCustomerEmail = computed(() => this.customerEmail().trim());
  readonly customerNameError = computed(() => {
    if (!this.submittedPayment()) {
      return '';
    }

    return this.trimmedCustomerName().length >= 2
      ? ''
      : 'Vui lòng nhập họ và tên.';
  });
  readonly customerEmailError = computed(() => {
    if (!this.submittedPayment()) {
      return '';
    }

    return this.isValidEmail(this.trimmedCustomerEmail())
      ? ''
      : 'Vui lòng nhập địa chỉ email hợp lệ.';
  });
  readonly isCustomerInfoValid = computed(
    () =>
      this.trimmedCustomerName().length >= 2 &&
      this.isValidEmail(this.trimmedCustomerEmail())
  );

  private timer?: Subscription;

  private get activeHoldStorage(): Storage | null {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  constructor(
    public readonly realtime: TicketRealtimeService,
    private readonly api: TicketApiService
  ) {
    effect(() => {
      const snapshot = this.realtime.snapshot();

      if (snapshot) {
        this.applyTickets(snapshot.ticketTypes);
      }
    });
  }

  ngOnInit(): void {
    this.restoreActiveHold();
    this.loadTickets();
    this.realtime
      .connect()
      .catch(() =>
        this.error.set('Kết nối thời gian thực thất bại; bạn vẫn có thể đặt vé.')
      );
  }

  ngOnDestroy(): void {
    this.timer?.unsubscribe();
  }

  loadTickets(): void {
    this.loadingTickets.set(true);
    this.api.getTicketTypes().subscribe({
      next: (tickets) => {
        this.applyTickets(tickets);
        this.loadingTickets.set(false);
      },
      error: () => {
        this.error.set('Không thể tải danh sách loại vé.');
        this.loadingTickets.set(false);
      },
    });
  }

  toggleDropdown(): void {
    if (this.busy() || this.hold() || this.loadingTickets() || !this.hasAvailableTickets()) {
      return;
    }
    this.showDropdown.set(!this.showDropdown());
  }

  selectTicketType(id: string): void {
    const ticket = this.tickets().find((t) => t.id === id);

    if (!ticket || ticket.availableQuantity <= 0 || this.busy() || this.hold() || this.loadingTickets()) {
      return;
    }

    this.selectedTicketTypeId.set(id);
    this.clampQuantityToAvailable();
    this.showDropdown.set(false);
  }

  incrementQuantity(): void {
    if (this.busy() || this.hold()) return;
    const maxVal = this.maxQuantity();
    if (maxVal <= 0) return;
    this.quantity.set(Math.min(maxVal, this.quantity() + 1));
  }

  decrementQuantity(): void {
    if (this.busy() || this.hold()) return;
    this.quantity.set(Math.max(1, this.quantity() - 1));
  }

  onQuantityChange(value: number): void {
    const maxVal = this.maxQuantity();
    const val = maxVal > 0 ? Math.max(1, Math.min(maxVal, value)) : 1;
    this.quantity.set(val);
  }

  reserve(): void {
    if (!this.canReserve()) {
      return;
    }

    const reservedTicket = this.selectedTicket();
    const reservedQuantity = this.quantity();

    this.busy.set(true);
    this.error.set('');
    this.message.set('');

    this.api
      .reserve({
        ticketTypeId: this.selectedTicketTypeId(),
        quantity: reservedQuantity,
      })
      .subscribe({
        next: (hold) => {
          this.syncServerClock(hold.serverTimeUtc);
          this.hold.set(hold);
          this.heldTicket.set(reservedTicket);
          this.quantity.set(reservedQuantity);
          this.saveActiveHold(hold, reservedTicket, reservedQuantity);
          this.startCountdown(hold.expiredAt);
          this.busy.set(false);
          this.message.set(
            'Vé đã được giữ trong 5 phút. Vui lòng hoàn tất thanh toán trước khi hết thời gian.'
          );
        },
        error: (err) => {
          this.error.set(
            this.toVietnameseErrorMessage(err?.error) ??
              'Giữ vé thất bại. Vui lòng thử loại vé khác.'
          );
          this.busy.set(false);
        },
      });
  }

  pay(): void {
    const hold = this.hold();
    this.submittedPayment.set(true);

    if (!hold || this.busy()) {
      return;
    }

    if (!this.isCustomerInfoValid()) {
      this.error.set('Vui lòng nhập họ tên và email hợp lệ trước khi thanh toán.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.api.pay({
      holdCode: hold.holdCode,
      customerName: this.trimmedCustomerName(),
      customerEmail: this.trimmedCustomerEmail(),
    }).subscribe({
      next: (payment) => {
        this.message.set(`Thanh toán thành công. Mã đơn hàng: ${payment.orderCode}`);
        this.hold.set(null);
        this.heldTicket.set(null);
        this.customerName.set('');
        this.customerEmail.set('');
        this.submittedPayment.set(false);
        this.clearActiveHold();
        this.remainingSeconds.set(0);
        this.timer?.unsubscribe();
        this.busy.set(false);
        this.loadTickets();
      },
      error: (err) => {
        this.error.set(
          this.toVietnameseErrorMessage(err?.error) ?? 'Thanh toán thất bại hoặc vé đã hết thời gian giữ.'
        );
        this.busy.set(false);
      },
    });
  }

  requestCancelHold(): void {
    if (!this.hold() || this.busy() || this.cancellingHold() || this.remainingSeconds() === 0) {
      return;
    }

    this.showCancelConfirm.set(true);
  }

  dismissCancelConfirm(): void {
    if (this.cancellingHold()) {
      return;
    }

    this.showCancelConfirm.set(false);
  }

  cancelHold(): void {
    const hold = this.hold();

    if (!hold || this.busy() || this.cancellingHold()) {
      return;
    }

    this.cancellingHold.set(true);
    this.showCancelConfirm.set(false);
    this.error.set('');
    this.message.set('');

    this.api.cancelHold({ holdCode: hold.holdCode }).subscribe({
      next: () => {
        this.hold.set(null);
        this.heldTicket.set(null);
        this.customerName.set('');
        this.customerEmail.set('');
        this.submittedPayment.set(false);
        this.clearActiveHold();
        this.remainingSeconds.set(0);
        this.timer?.unsubscribe();
        this.cancellingHold.set(false);
        this.message.set('Đã hủy giữ vé. Vé đã được trả lại vào kho.');
        this.loadTickets();
      },
      error: (err) => {
        this.error.set(
          this.toVietnameseErrorMessage(err?.error) ??
            'Hủy giữ vé thất bại. Vui lòng thử lại.'
        );
        this.cancellingHold.set(false);
      },
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private applyTickets(tickets: TicketType[]): void {
    this.tickets.set(tickets);

    if (this.hold()) {
      const selectedTicket = tickets.find((t) => t.id === this.selectedTicketTypeId());

      if (selectedTicket) {
        this.heldTicket.set(selectedTicket);
      }

      return;
    }

    this.heldTicket.set(null);

    const selectedTicket = tickets.find((t) => t.id === this.selectedTicketTypeId());

    if (!selectedTicket || selectedTicket.availableQuantity <= 0) {
      this.selectedTicketTypeId.set(this.firstAvailableTicketId(tickets));
    }

    this.clampQuantityToAvailable();
  }

  private firstAvailableTicketId(tickets: TicketType[]): string {
    return tickets.find((ticket) => ticket.availableQuantity > 0)?.id ?? '';
  }

  private clampQuantityToAvailable(): void {
    const maxVal = this.maxQuantity();

    if (maxVal <= 0) {
      this.quantity.set(1);
      return;
    }

    this.quantity.set(Math.max(1, Math.min(maxVal, this.quantity())));
  }

  private toVietnameseErrorMessage(error?: ApiErrorResponse | string): string | null {
    const code = typeof error === 'object' ? error?.code : undefined;

    if (code && ERROR_MESSAGES[code]) {
      return ERROR_MESSAGES[code];
    }

    const message = typeof error === 'string' ? error : error?.message;

    if (!message) {
      return null;
    }

    const normalizedMessage = message.trim();
    const translations: Record<string, string> = {
      'Ticket type id is required.': 'Vui lòng chọn loại vé.',
      'Not enough tickets available.': 'Không đủ vé còn lại.',
      'Hold code is required.': 'Thiếu mã giữ vé.',
      'Customer name is required.': 'Vui lòng nhập họ và tên.',
      'A valid customer email is required.': 'Vui lòng nhập email hợp lệ.',
      'Ticket hold not found.': 'Không tìm thấy lượt giữ vé.',
      'Ticket hold is not available for payment.': 'Lượt giữ vé không còn khả dụng để thanh toán.',
      'Ticket hold is not available for cancellation.': 'Lượt giữ vé không còn khả dụng để hủy.',
      'Ticket hold has expired.': 'Lượt giữ vé đã hết hạn.',
      'Lượt giữ vé không khả dụng để thanh toán.': 'Lượt giữ vé không còn khả dụng để thanh toán.',
      'Lượt giữ vé không còn khả dụng để hủy.': 'Lượt giữ vé không còn khả dụng để hủy.',
    };

    return translations[normalizedMessage] ?? normalizedMessage;
  }

  private startCountdown(expiredAt: string): void {
    this.timer?.unsubscribe();
    const expires = new Date(expiredAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expires - this.nowMs()) / 1000));
      this.remainingSeconds.set(remaining);
      if (remaining === 0) {
        this.hold.set(null);
        this.heldTicket.set(null);
        this.clearActiveHold();
        this.message.set(
          'Đã hết thời gian giữ vé. Vé đang được trả lại vào kho.'
        );
        this.timer?.unsubscribe();
      }
    };
    tick();
    this.timer = interval(1000).subscribe(tick);
  }

  private restoreActiveHold(): void {
    const storedHold = this.activeHoldStorage?.getItem(this.activeHoldStorageKey);

    if (!storedHold) {
      return;
    }

    try {
      const stored = JSON.parse(storedHold) as StoredActiveHold;
      const hold = this.toReserveTicketResponse(stored);
      const storedOffsetMs = stored.serverClockOffsetMs;
      this.serverClockOffsetMs =
        typeof storedOffsetMs === 'number' && Number.isFinite(storedOffsetMs)
          ? storedOffsetMs
          : 0;
      const expires = this.parseUtcDateMs(hold.expiredAt);

      if (!hold.holdCode || Number.isNaN(expires) || expires <= this.nowMs()) {
        this.clearActiveHold();
        return;
      }

      this.hold.set(hold);
      this.selectedTicketTypeId.set(stored.selectedTicketTypeId ?? stored.ticket?.id ?? '');
      this.quantity.set(this.toStoredQuantity(stored.quantity));
      this.heldTicket.set(stored.ticket ?? null);
      this.startCountdown(hold.expiredAt);
      this.message.set(
        'Vé vẫn đang được giữ. Vui lòng hoàn tất thanh toán trước khi hết thời gian.'
      );
    } catch {
      this.clearActiveHold();
    }
  }

  private saveActiveHold(
    hold: ReserveTicketResponse,
    ticket: TicketType | null,
    quantity: number
  ): void {
    const stored: StoredActiveHold = {
      ...hold,
      selectedTicketTypeId: ticket?.id ?? this.selectedTicketTypeId(),
      quantity,
      ticket: ticket ? { ...ticket } : null,
      serverClockOffsetMs: this.serverClockOffsetMs,
      savedAtClientMs: Date.now(),
    };

    this.activeHoldStorage?.setItem(this.activeHoldStorageKey, JSON.stringify(stored));
  }

  private clearActiveHold(): void {
    this.activeHoldStorage?.removeItem(this.activeHoldStorageKey);
  }

  private syncServerClock(serverTimeUtc?: string): void {
    if (!serverTimeUtc) {
      this.serverClockOffsetMs = 0;
      return;
    }

    const serverTime = new Date(serverTimeUtc).getTime();
    this.serverClockOffsetMs = Number.isNaN(serverTime) ? 0 : serverTime - Date.now();
  }

  private nowMs(): number {
    return Date.now() + this.serverClockOffsetMs;
  }

  private parseUtcDateMs(value: string): number {
    if (!value) {
      return Number.NaN;
    }

    const normalized = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
    return new Date(normalized).getTime();
  }

  private toReserveTicketResponse(stored: StoredActiveHold): ReserveTicketResponse {
    return {
      holdCode: stored.holdCode,
      expiredAt: stored.expiredAt,
      serverTimeUtc: stored.serverTimeUtc,
    };
  }

  private toStoredQuantity(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 1;
  }
}

interface StoredActiveHold extends ReserveTicketResponse {
  selectedTicketTypeId?: string;
  quantity?: number;
  ticket?: TicketType | null;
  serverClockOffsetMs?: number;
  savedAtClientMs?: number;
}
