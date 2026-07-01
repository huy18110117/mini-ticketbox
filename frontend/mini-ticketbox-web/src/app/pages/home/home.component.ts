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
          'Kết nối thời gian thực không khả dụng. Dữ liệu sẽ cập nhật sau khi có thao tác.'
        )
      );
  }

  private loadLegacyTicketTypesFallback(): void {
    this.api.getTicketTypes().subscribe({
      next: (tickets) => {
        this.fallbackSnapshot.set(this.createSnapshotFromTicketTypes(tickets));
        this.error.set(
          'API tồn kho thời gian thực chưa khả dụng. Đang hiển thị tồn kho vé từ API cơ bản.'
        );
        this.loading.set(false);
      },
      error: () => {
        this.error.set(
          'Không thể tải tồn kho vé. Vui lòng thử lại sau ít phút.'
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
