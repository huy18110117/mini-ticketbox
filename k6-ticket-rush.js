import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5141';
const USERS = Number(__ENV.USERS || 5000);
const ITERATIONS = Number(__ENV.ITERATIONS || USERS);
const RUSH_DURATION = __ENV.RUSH_DURATION || '60s';
const SNAPSHOT_SAMPLE_RATE = Number(__ENV.SNAPSHOT_SAMPLE_RATE || 0.05);
const RESERVE_ATTEMPTS = Number(__ENV.RESERVE_ATTEMPTS || 3);
const PAY_RATIO = Number(__ENV.PAY_RATIO || 0.85);
const QUANTITY = Number(__ENV.QUANTITY || 1);
const TICKET_TYPE_ID = __ENV.TICKET_TYPE_ID || '';
const EXPECTED_RESERVE_STATUSES = http.expectedStatuses(200, 409);
const EXPECTED_PAY_STATUSES = http.expectedStatuses(200, 400, 404, 409);

export const reserveSuccess = new Counter('reserve_success');
export const reserveSoldOut = new Counter('reserve_sold_out_or_conflict');
export const reserveFailed = new Counter('reserve_failed');
export const paymentSuccess = new Counter('payment_success');
export const paymentFailed = new Counter('payment_failed');
export const oversellDetected = new Counter('oversell_detected');
export const reserveSuccessRate = new Rate('reserve_success_rate');
export const paymentSuccessRate = new Rate('payment_success_rate');
export const snapshotLatency = new Trend('snapshot_latency');
export const reserveLatency = new Trend('reserve_latency');
export const paymentLatency = new Trend('payment_latency');

export const options = {
  scenarios: {
    ticket_rush: {
      executor: 'shared-iterations',
      vus: USERS,
      iterations: ITERATIONS,
      maxDuration: RUSH_DURATION,
      gracefulStop: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{type:snapshot}': ['p(95)<1000', 'p(99)<2500'],
    'http_req_duration{type:reserve}': ['p(95)<3000', 'p(99)<7000'],
    'http_req_duration{type:pay}': ['p(95)<3000', 'p(99)<7000'],
    reserve_failed: ['count<50'],
    payment_failed: ['count<50'],
    oversell_detected: ['count==0'],
  },
};

export function setup() {
  const response = http.get(`${BASE_URL}/api/tickets/snapshot`, {
    tags: { type: 'snapshot', phase: 'setup' },
  });

  if (response.status !== 200) {
    throw new Error(`Cannot load inventory snapshot. Status=${response.status}, body=${response.body}`);
  }

  const snapshot = response.json();
  const ticketTypes = snapshot.ticketTypes || snapshot.TicketTypes || [];
  const selectedTicketType = TICKET_TYPE_ID
    ? ticketTypes.find((ticketType) => String(ticketType.id || ticketType.Id) === TICKET_TYPE_ID)
    : ticketTypes
      .filter((ticketType) => Number(ticketType.availableQuantity ?? ticketType.AvailableQuantity ?? 0) > 0)
      .sort((left, right) => Number(right.availableQuantity ?? right.AvailableQuantity ?? 0) - Number(left.availableQuantity ?? left.AvailableQuantity ?? 0))[0];

  if (!selectedTicketType) {
    throw new Error('No available ticket type found. Seed/reset inventory before running this test.');
  }

  return {
    ticketTypeId: selectedTicketType.id || selectedTicketType.Id,
    initialTotalAvailable: Number(snapshot.totalAvailable ?? snapshot.TotalAvailable ?? 0),
    initialTotalSold: Number(snapshot.totalSold ?? snapshot.TotalSold ?? 0),
    initialTotalHolding: Number(snapshot.totalHolding ?? snapshot.TotalHolding ?? 0),
  };
}

export default function (data) {
  const userId = exec.vu.idInTest;
  const headers = { 'Content-Type': 'application/json' };
  let holdCode = null;

  if (Math.random() < SNAPSHOT_SAMPLE_RATE) {
    group('sampled inventory snapshot', () => {
      const response = http.get(`${BASE_URL}/api/tickets/snapshot`, {
        tags: { type: 'snapshot' },
      });

      snapshotLatency.add(response.timings.duration);
      check(response, {
        'snapshot is ok': (res) => res.status === 200,
        'snapshot quantity is never negative': (res) => {
          if (res.status !== 200) return false;
          const snapshot = res.json();
          const totalAvailable = Number(snapshot.totalAvailable ?? snapshot.TotalAvailable ?? 0);
          const ticketTypes = snapshot.ticketTypes || snapshot.TicketTypes || [];
          const hasNegativeType = ticketTypes.some((ticketType) => Number(ticketType.availableQuantity ?? ticketType.AvailableQuantity ?? 0) < 0);
          const valid = totalAvailable >= 0 && !hasNegativeType;
          if (!valid) oversellDetected.add(1);
          return valid;
        },
      });
    });
  }

  group('simultaneous reserve click', () => {
    for (let attempt = 1; attempt <= RESERVE_ATTEMPTS && !holdCode; attempt += 1) {
      const response = http.post(
        `${BASE_URL}/api/tickets/reserve`,
        JSON.stringify({ ticketTypeId: data.ticketTypeId, quantity: QUANTITY }),
        { headers, tags: { type: 'reserve' }, responseCallback: EXPECTED_RESERVE_STATUSES },
      );

      reserveLatency.add(response.timings.duration);

      if (response.status === 200) {
        const payload = response.json();
        holdCode = payload.holdCode || payload.HoldCode;
        reserveSuccess.add(1);
        reserveSuccessRate.add(true);
        break;
      }

      reserveSuccessRate.add(false);

      if (response.status === 409) {
        reserveSoldOut.add(1);
        break;
      }

      reserveFailed.add(1);
      sleep(0.05 + Math.random() * 0.2);
    }
  });

  if (holdCode && Math.random() <= PAY_RATIO) {
    group('payment after winning hold', () => {
      const response = http.post(
        `${BASE_URL}/api/tickets/pay`,
        JSON.stringify({
          holdCode,
          customerName: `K6 User ${userId}`,
          customerEmail: `k6-user-${userId}-${Date.now()}@loadtest.local`,
        }),
        { headers, tags: { type: 'pay' }, responseCallback: EXPECTED_PAY_STATUSES },
      );

      paymentLatency.add(response.timings.duration);

      if (response.status === 200) {
        paymentSuccess.add(1);
        paymentSuccessRate.add(true);
      } else {
        paymentFailed.add(1);
        paymentSuccessRate.add(false);
      }
    });
  }
}

export function teardown(data) {
  const response = http.get(`${BASE_URL}/api/tickets/snapshot`, {
    tags: { type: 'snapshot', phase: 'teardown' },
  });

  if (response.status !== 200) {
    oversellDetected.add(1);
    return;
  }

  const snapshot = response.json();
  const totalAvailable = Number(snapshot.totalAvailable ?? snapshot.TotalAvailable ?? 0);
  const totalSold = Number(snapshot.totalSold ?? snapshot.TotalSold ?? 0);
  const totalHolding = Number(snapshot.totalHolding ?? snapshot.TotalHolding ?? 0);
  const ticketTypes = snapshot.ticketTypes || snapshot.TicketTypes || [];
  const hasNegativeType = ticketTypes.some((ticketType) => Number(ticketType.availableQuantity ?? ticketType.AvailableQuantity ?? 0) < 0);
  const inventoryCreated = (totalAvailable + totalSold + totalHolding) - (data.initialTotalAvailable + data.initialTotalSold + data.initialTotalHolding);

  if (totalAvailable < 0 || totalSold < 0 || totalHolding < 0 || hasNegativeType || inventoryCreated > QUANTITY) {
    oversellDetected.add(1);
  }
}
