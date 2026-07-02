import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TicketApiService } from '../../core/ticket-api.service';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { AdminDashboard } from '../../core/ticket.models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, RouterLinkActive],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit {
  readonly dashboard = signal<AdminDashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor(
    public readonly realtime: TicketRealtimeService,
    private readonly api: TicketApiService
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.realtime
      .connect()
      .then(() => this.refresh())
      .catch(() => this.error.set('Kết nối thời gian thực không khả dụng.'));
  }

  refresh(): void {
    this.api.getAdminDashboard().subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Không thể tải bảng quản trị.');
        this.loading.set(false);
      },
    });
  }
}
