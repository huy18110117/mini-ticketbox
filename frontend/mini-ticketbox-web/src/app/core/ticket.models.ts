export interface TicketType {
  id: string;
  name: string;
  price: number;
  totalQuantity: number;
  availableQuantity: number;
}

export interface TicketInventorySnapshot {
  serverTimeUtc: string;
  ticketTypes: TicketType[];
  totalAvailable: number;
  totalSold: number;
  totalHolding: number;
  revenue: number;
}

export interface ReserveTicketRequest {
  ticketTypeId: string;
  quantity: number;
}

export interface ReserveTicketResponse {
  holdCode: string;
  expiredAt: string;
  serverTimeUtc: string;
}

export interface PaymentRequest {
  holdCode: string;
  customerName: string;
  customerEmail: string;
}

export interface CancelTicketHoldRequest {
  holdCode: string;
}

export interface PaymentResponse {
  orderCode: string;
  totalAmount: number;
  status: string;
}

export interface ApiErrorResponse {
  success: false;
  code?: string;
  message?: string;
}

export interface ActiveTicketHold {
  id: string;
  holdCode: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  expiredAt: string;
}

export interface AdminDashboard {
  totalSold: number;
  totalHolding: number;
  revenue: number;
  serverTimeUtc: string;
  activeHolds: ActiveTicketHold[];
}
