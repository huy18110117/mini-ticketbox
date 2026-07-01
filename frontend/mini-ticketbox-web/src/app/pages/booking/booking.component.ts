import { Component, computed, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { ReserveTicketResponse, TicketType } from '../../core/ticket.models';

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
  readonly selectedTicketTypeId = signal('');
  readonly quantity = signal(1);
  readonly hold = signal<ReserveTicketResponse | null>(null);
  readonly remainingSeconds = signal(0);
  readonly busy = signal(false);
  readonly cancellingHold = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly customerName = signal('');
  readonly customerEmail = signal('');
  readonly submittedPayment = signal(false);
  readonly showDropdown = signal(false);

  readonly selectedTicket = computed(() => {
    const id = this.selectedTicketTypeId();
    return this.tickets().find((t) => t.id === id) || null;
  });

  readonly maxQuantity = computed(() => {
    const ticket = this.selectedTicket();
    return ticket ? Math.min(ticket.availableQuantity, 10) : 10;
  });

  readonly canReserve = computed(
    () => !!this.selectedTicketTypeId() && !this.busy() && !this.hold()
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
  ) {}

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
    this.api.getTicketTypes().subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        if (!this.selectedTicketTypeId() && tickets.length) {
          this.selectedTicketTypeId.set(tickets[0].id);
        }
      },
      error: () => this.error.set('Không thể tải danh sách loại vé.'),
    });
  }

  toggleDropdown(): void {
    if (this.busy() || this.hold()) {
      return;
    }
    this.showDropdown.set(!this.showDropdown());
  }

  selectTicketType(id: string): void {
    this.selectedTicketTypeId.set(id);
    this.showDropdown.set(false);
  }

  incrementQuantity(): void {
    if (this.busy() || this.hold()) return;
    const ticket = this.selectedTicket();
    if (!ticket) return;
    const maxVal = Math.min(ticket.availableQuantity, 10);
    this.quantity.set(Math.min(maxVal, this.quantity() + 1));
  }

  decrementQuantity(): void {
    if (this.busy() || this.hold()) return;
    this.quantity.set(Math.max(1, this.quantity() - 1));
  }

  onQuantityChange(value: number): void {
    const ticket = this.selectedTicket();
    const maxVal = ticket ? Math.min(ticket.availableQuantity, 10) : 10;
    const val = Math.max(1, Math.min(maxVal, value));
    this.quantity.set(val);
  }

  reserve(): void {
    if (!this.canReserve()) {
      return;
    }

    this.busy.set(true);
    this.error.set('');
    this.message.set('');

    this.api
      .reserve({
        ticketTypeId: this.selectedTicketTypeId(),
        quantity: this.quantity(),
      })
      .subscribe({
        next: (hold) => {
          this.syncServerClock(hold.serverTimeUtc);
          this.hold.set(hold);
          this.saveActiveHold(hold);
          this.startCountdown(hold.expiredAt);
          this.busy.set(false);
          this.message.set(
            'Vé đã được giữ trong 5 phút. Vui lòng hoàn tất thanh toán trước khi hết thời gian.'
          );
        },
        error: (err) => {
          this.error.set(
            this.toVietnameseErrorMessage(err?.error?.message) ??
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
        this.customerName.set('');
        this.customerEmail.set('');
        this.submittedPayment.set(false);
        this.clearActiveHold();
        this.remainingSeconds.set(0);
        this.timer?.unsubscribe();
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(
          this.toVietnameseErrorMessage(err?.error?.message) ?? 'Thanh toán thất bại hoặc vé đã hết thời gian giữ.'
        );
        this.busy.set(false);
      },
    });
  }

  cancelHold(): void {
    const hold = this.hold();

    if (!hold || this.busy() || this.cancellingHold()) {
      return;
    }

    this.cancellingHold.set(true);
    this.error.set('');
    this.message.set('');

    this.api.cancelHold({ holdCode: hold.holdCode }).subscribe({
      next: () => {
        this.hold.set(null);
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
          this.toVietnameseErrorMessage(err?.error?.message) ??
            'Hủy giữ vé thất bại. Vui lòng thử lại.'
        );
        this.cancellingHold.set(false);
      },
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private toVietnameseErrorMessage(message?: string): string | null {
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
      this.startCountdown(hold.expiredAt);
      this.message.set(
        'Vé vẫn đang được giữ. Vui lòng hoàn tất thanh toán trước khi hết thời gian.'
      );
    } catch {
      this.clearActiveHold();
    }
  }

  private saveActiveHold(hold: ReserveTicketResponse): void {
    const stored: StoredActiveHold = {
      ...hold,
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
}

interface StoredActiveHold extends ReserveTicketResponse {
  serverClockOffsetMs?: number;
  savedAtClientMs?: number;
}
