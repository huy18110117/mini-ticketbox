import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { TicketInventorySnapshot, TicketType } from '../../core/ticket.models';

@Component({
  selector: 'app-home',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  readonly fallbackSnapshot = signal<TicketInventorySnapshot | null>(null);
  readonly snapshot = computed(
    () => this.realtime.snapshot() ?? this.fallbackSnapshot()
  );
  readonly loading = signal(true);
  readonly error = signal('');

  constructor(
    public readonly realtime: TicketRealtimeService,
    private readonly api: TicketApiService
  ) {}

  ngOnInit(): void {
    this.api.getSnapshot().subscribe({
      next: (snapshot) => {
        this.fallbackSnapshot.set(snapshot);
        this.loading.set(false);
      },
      error: () => {
        this.loadLegacyTicketTypesFallback();
      },
    });

    this.realtime
      .connect()
      .catch(() =>
        this.error.set(
          'Realtime connection is unavailable. Data will refresh after actions.'
        )
      );
  }

  private loadLegacyTicketTypesFallback(): void {
    this.api.getTicketTypes().subscribe({
      next: (tickets) => {
        this.fallbackSnapshot.set(this.createSnapshotFromTicketTypes(tickets));
        this.error.set(
          'Realtime snapshot endpoint is not available yet. Showing ticket inventory from the basic API.'
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set(
          'Cannot load ticket inventory. Please retry in a moment.'
        );
        this.loading.set(false);
      },
    });
  }

  private createSnapshotFromTicketTypes(
    ticketTypes: TicketType[]
  ): TicketInventorySnapshot {
    return {
      serverTimeUtc: new Date().toISOString(),
      ticketTypes,
      totalAvailable: ticketTypes.reduce(
        (sum, ticket) => sum + ticket.availableQuantity,
        0
      ),
      totalSold: 0,
      totalHolding: 0,
      revenue: 0,
    };
  }
}
