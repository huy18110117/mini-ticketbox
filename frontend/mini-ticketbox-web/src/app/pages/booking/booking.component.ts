import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { ReserveTicketResponse, TicketType } from '../../core/ticket.models';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './booking.component.html',
})
export class BookingComponent implements OnInit, OnDestroy {
  private readonly activeHoldStorageKey = 'mini-ticketbox.activeHold';

  readonly tickets = signal<TicketType[]>([]);
  readonly selectedTicketTypeId = signal('');
  readonly quantity = signal(1);
  readonly hold = signal<ReserveTicketResponse | null>(null);
  readonly remainingSeconds = signal(0);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly customerName = signal('');
  readonly customerEmail = signal('');
  readonly submittedPayment = signal(false);

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
      'Ticket hold has expired.': 'Lượt giữ vé đã hết hạn.',
    };

    return translations[normalizedMessage] ?? normalizedMessage;
  }

  private startCountdown(expiredAt: string): void {
    this.timer?.unsubscribe();
    const expires = new Date(expiredAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
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
    const storedHold = localStorage.getItem(this.activeHoldStorageKey);

    if (!storedHold) {
      return;
    }

    try {
      const hold = JSON.parse(storedHold) as ReserveTicketResponse;
      const expires = new Date(hold.expiredAt).getTime();

      if (!hold.holdCode || Number.isNaN(expires) || expires <= Date.now()) {
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
    localStorage.setItem(this.activeHoldStorageKey, JSON.stringify(hold));
  }

  private clearActiveHold(): void {
    localStorage.removeItem(this.activeHoldStorageKey);
  }
}
