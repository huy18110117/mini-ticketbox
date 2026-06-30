import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminDashboard,
  PaymentResponse,
  ReserveTicketRequest,
  ReserveTicketResponse,
  TicketInventorySnapshot,
  TicketType,
} from './ticket.models';

@Injectable({ providedIn: 'root' })
export class TicketApiService {
  private readonly apiUrl = 'http://localhost:5141/api/tickets';

  constructor(private readonly http: HttpClient) {}

  getTicketTypes(): Observable<TicketType[]> {
    return this.http.get<TicketType[]>(this.apiUrl);
  }

  getSnapshot(): Observable<TicketInventorySnapshot> {
    return this.http.get<TicketInventorySnapshot>(`${this.apiUrl}/snapshot`);
  }

  reserve(request: ReserveTicketRequest): Observable<ReserveTicketResponse> {
    return this.http.post<ReserveTicketResponse>(
      `${this.apiUrl}/reserve`,
      request
    );
  }

  pay(holdCode: string): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>(`${this.apiUrl}/pay`, { holdCode });
  }

  getAdminDashboard(): Observable<AdminDashboard> {
    return this.http.get<AdminDashboard>(`${this.apiUrl}/admin/dashboard`);
  }
}
