import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { TicketInventorySnapshot, TicketType } from '../../core/ticket.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  readonly fallbackSnapshot = signal<TicketInventorySnapshot | null>(null);
  readonly snapshot = computed(
    () => this.realtime.snapshot() ?? this.fallbackSnapshot()
  );
  readonly currentServerTimeUtc = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  private serverClockBaseMs = 0;
  private localClockBaseMs = 0;
  private clockIntervalId?: number;

  constructor(
    public readonly realtime: TicketRealtimeService,
    private readonly api: TicketApiService
  ) {
    effect(
      () => {
        const serverTimeUtc = this.snapshot()?.serverTimeUtc;

        if (serverTimeUtc) {
          this.syncServerClock(serverTimeUtc);
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.startServerClock();

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

  ngOnDestroy(): void {
    if (this.clockIntervalId !== undefined) {
      window.clearInterval(this.clockIntervalId);
    }
  }

  private startServerClock(): void {
    this.clockIntervalId = window.setInterval(() => {
      if (!this.serverClockBaseMs) {
        return;
      }

      const elapsedMs = Date.now() - this.localClockBaseMs;
      this.currentServerTimeUtc.set(
        new Date(this.serverClockBaseMs + elapsedMs).toISOString()
      );
    }, 1000);
  }

  private syncServerClock(serverTimeUtc: string): void {
    const serverTimeMs = Date.parse(serverTimeUtc);

    if (Number.isNaN(serverTimeMs)) {
      return;
    }

    this.serverClockBaseMs = serverTimeMs;
    this.localClockBaseMs = Date.now();
    this.currentServerTimeUtc.set(new Date(serverTimeMs).toISOString());
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
