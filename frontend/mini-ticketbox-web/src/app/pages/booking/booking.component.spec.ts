import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { TicketApiService } from '../../core/ticket-api.service';
import { PaymentRequest, ReserveTicketResponse, TicketType } from '../../core/ticket.models';
import { TicketRealtimeService } from '../../core/ticket-realtime.service';
import { BookingComponent } from './booking.component';

describe('BookingComponent', () => {
  let component: BookingComponent;
  let fixture: ComponentFixture<BookingComponent>;
  let ticketApi: jasmine.SpyObj<Pick<TicketApiService, 'getTicketTypes' | 'reserve' | 'pay'>>;
  let realtime: jasmine.SpyObj<Pick<TicketRealtimeService, 'connect'>> &
    Pick<TicketRealtimeService, 'snapshot'>;

  const ticketTypes: TicketType[] = [
    {
      id: 'vip',
      name: 'VIP',
      price: 1_000_000,
      totalQuantity: 10,
      availableQuantity: 5,
    },
  ];

  beforeEach(async () => {
    localStorage.clear();

    ticketApi = jasmine.createSpyObj<Pick<TicketApiService, 'getTicketTypes' | 'reserve' | 'pay'>>(
      'TicketApiService',
      ['getTicketTypes', 'reserve', 'pay']
    );
    realtime = jasmine.createSpyObj<Pick<TicketRealtimeService, 'connect'>>(
      'TicketRealtimeService',
      ['connect']
    ) as jasmine.SpyObj<Pick<TicketRealtimeService, 'connect'>> &
      Pick<TicketRealtimeService, 'snapshot'>;
    Object.defineProperty(realtime, 'snapshot', { value: signal(null) });

    ticketApi.getTicketTypes.and.returnValue(of(ticketTypes));
    ticketApi.reserve.and.returnValue(
      of({
        holdCode: 'HOLD-1',
        expiredAt: new Date().toISOString(),
        serverTimeUtc: new Date().toISOString(),
      })
    );
    realtime.connect.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [BookingComponent],
      providers: [
        provideRouter([]),
        { provide: TicketApiService, useValue: ticketApi },
        { provide: TicketRealtimeService, useValue: realtime },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  it('should disable reserve button while submitting', () => {
    component.selectedTicketTypeId.set('vip');
    component.busy.set(true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="reserve-button"]'
    ) as HTMLButtonElement;

    expect(button.disabled).toBeTrue();
  });

  it('should show loading text while reserving', () => {
    component.busy.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Đang giữ vé');
  });

  it('should show countdown from backend expiredAt', () => {
    const expiredAt = new Date(Date.now() + (4 * 60 + 59) * 1000).toISOString();
    ticketApi.reserve.and.returnValue(
      of({ holdCode: 'HOLD-1', expiredAt, serverTimeUtc: new Date().toISOString() })
    );

    component.selectedTicketTypeId.set('vip');
    component.reserve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('04:');
  });

  it('should restore active hold after reload', () => {
    const activeHold = {
      holdCode: 'HOLD-RELOAD',
      expiredAt: new Date(Date.now() + (4 * 60 + 59) * 1000).toISOString(),
      serverTimeUtc: new Date().toISOString(),
    };
    localStorage.setItem('mini-ticketbox.activeHold', JSON.stringify(activeHold));

    fixture.destroy();
    fixture = TestBed.createComponent(BookingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="reserve-button"]'
    ) as HTMLButtonElement;

    expect(component.hold()).toEqual(activeHold);
    expect(button.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('HOLD-RELOAD');
    expect(fixture.nativeElement.textContent).toContain('04:');
  });

  it('should show sold out message when reserve returns conflict', fakeAsync(() => {
    ticketApi.reserve.and.returnValue(
      throwError(() => ({
        status: 409,
        error: { message: 'Not enough tickets available.' },
      })) as Observable<ReserveTicketResponse>
    );

    component.selectedTicketTypeId.set('vip');
    component.reserve();
    tick();

    expect(component.error()).toContain('Không đủ vé');
    expect(component.busy()).toBeFalse();
  }));

  it('should require customer info before payment', () => {
    component.hold.set({
      holdCode: 'HOLD-1',
      expiredAt: new Date(Date.now() + 60_000).toISOString(),
      serverTimeUtc: new Date().toISOString(),
    });
    component.remainingSeconds.set(60);

    component.pay();

    expect(component.error()).toContain('họ tên và email hợp lệ');
    expect(ticketApi.pay).not.toHaveBeenCalled();
  });

  it('should send customer info when paying', () => {
    ticketApi.pay.and.returnValue(of({ orderCode: 'ORD-1', totalAmount: 1_000_000, status: 'Paid' }));
    component.hold.set({
      holdCode: 'HOLD-1',
      expiredAt: new Date(Date.now() + 60_000).toISOString(),
      serverTimeUtc: new Date().toISOString(),
    });
    component.remainingSeconds.set(60);
    component.customerName.set(' Nguyen Van A ');
    component.customerEmail.set(' Buyer@Example.com ');

    component.pay();

    expect(ticketApi.pay).toHaveBeenCalledWith({
      holdCode: 'HOLD-1',
      customerName: 'Nguyen Van A',
      customerEmail: 'Buyer@Example.com',
    } satisfies PaymentRequest);
  });
});
