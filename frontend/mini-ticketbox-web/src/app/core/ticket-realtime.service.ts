import { Injectable, NgZone, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { TicketInventorySnapshot } from './ticket.models';

@Injectable({ providedIn: 'root' })
export class TicketRealtimeService {
  private readonly hubUrl = 'http://localhost:5141/hubs/tickets';
  private connection?: signalR.HubConnection;

  readonly snapshot = signal<TicketInventorySnapshot | null>(null);
  readonly status = signal<'disconnected' | 'connecting' | 'connected'>(
    'disconnected'
  );
  readonly lastReason = signal('initial');

  constructor(private readonly zone: NgZone) {}

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.status.set('connecting');
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .configureLogging(signalR.LogLevel.None)
      .withAutomaticReconnect()
      .build();

    this.connection.on(
      'inventoryChanged',
      (reason: string, snapshot: TicketInventorySnapshot) => {
        this.zone.run(() => {
          this.lastReason.set(reason);
          this.snapshot.set(snapshot);
        });
      }
    );

    this.connection.onreconnecting(() =>
      this.zone.run(() => this.status.set('connecting'))
    );
    this.connection.onreconnected(() =>
      this.zone.run(() => this.status.set('connected'))
    );
    this.connection.onclose(() =>
      this.zone.run(() => this.status.set('disconnected'))
    );

    await this.connection.start();
    this.status.set('connected');
    await this.connection.invoke('GetSnapshot');
  }
}
