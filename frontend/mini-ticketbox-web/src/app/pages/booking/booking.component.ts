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
  readonly tickets = signal<TicketType[]>([]);
  readonly selectedTicketTypeId = signal('');
  readonly quantity = signal(1);
  readonly hold = signal<ReserveTicketResponse | null>(null);
  readonly remainingSeconds = signal(0);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

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

  private timer?: Subscription;

  constructor(
    public readonly realtime: TicketRealtimeService,
    private readonly api: TicketApiService
  ) {}

  ngOnInit(): void {
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
    if (!hold || this.busy()) {
      return;
    }

    this.busy.set(true);
    this.api.pay(hold.holdCode).subscribe({
      next: (payment) => {
        this.message.set(`Payment success. Order: ${payment.orderCode}`);
        this.hold.set(null);
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

  private startCountdown(expiredAt: string): void {
    this.timer?.unsubscribe();
    const expires = new Date(expiredAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
      this.remainingSeconds.set(remaining);
      if (remaining === 0) {
        this.hold.set(null);
        this.message.set(
          'Hold expired. Tickets are being released back to inventory.'
        );
        this.timer?.unsubscribe();
      }
    };
    tick();
    this.timer = interval(1000).subscribe(tick);
  }
}
