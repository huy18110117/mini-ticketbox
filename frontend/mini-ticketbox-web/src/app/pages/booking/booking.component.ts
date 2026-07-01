import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { ReserveTicketResponse, TicketType } from '../../core/ticket.models';

@Component({
  selector: 'app-booking',
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
      : 'Please enter your full name.';
  });
  readonly customerEmailError = computed(() => {
    if (!this.submittedPayment()) {
      return '';
    }

    return this.isValidEmail(this.trimmedCustomerEmail())
      ? ''
      : 'Please enter a valid email address.';
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
        this.error.set('Realtime connection failed; booking still works.')
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
      error: () => this.error.set('Cannot load ticket types.'),
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
            'Ticket is held for 5 minutes. Complete payment before countdown ends.'
          );
        },
        error: (err) => {
          this.error.set(
            err?.error?.message ??
              'Reserve failed. Please try another ticket type.'
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
      this.error.set('Please enter your name and a valid email before payment.');
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
        this.message.set(`Payment success. Order: ${payment.orderCode}`);
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
          err?.error?.message ?? 'Payment failed or hold expired.'
        );
        this.busy.set(false);
      },
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
          'Hold expired. Tickets are being released back to inventory.'
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
        'Ticket is still held. Complete payment before countdown ends.'
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
