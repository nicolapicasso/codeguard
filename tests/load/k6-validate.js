/**
 * k6 Load Test — CodeGuard Validation Endpoint
 *
 * Prerequisites:
 *   - CodeGuard running on localhost:3000
 *   - Database seeded (npm run db:seed)
 *   - Install k6: https://k6.io/docs/get-started/installation/
 *
 * Usage:
 *   k6 run tests/load/k6-validate.js
 *   k6 run --vus 50 --duration 60s tests/load/k6-validate.js
 *
 * Environment variables:
 *   BASE_URL     - Server URL (default: http://localhost:3000)
 *   API_KEY      - Tenant API key
 *   API_SECRET   - Tenant API secret
 *   PROJECT_ID   - Project UUID
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'SET_YOUR_API_KEY';
const API_SECRET = __ENV.API_SECRET || 'SET_YOUR_API_SECRET';
const PROJECT_ID = __ENV.PROJECT_ID || 'SET_YOUR_PROJECT_ID';

const errorRate = new Rate('validation_errors');
const validationDuration = new Trend('validation_duration');

export const options = {
  stages: [
    { duration: '10s', target: 10 },  // Ramp up
    { duration: '30s', target: 50 },   // Peak load
    { duration: '10s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'],    // 95% of requests under 100ms
    validation_errors: ['rate<0.1'],     // Less than 10% errors
  },
};

function generateCode() {
  // Generate a random 10-digit numeric code with Luhn check
  const payload = Math.floor(Math.random() * 9000000000 + 1000000000).toString();

  // Luhn calculate
  const digits = payload.split('').map(Number).reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = ((10 - (sum % 10)) % 10).toString();
  return payload + check;
}

export default function () {
  const code = generateCode();
  const body = JSON.stringify({
    code: code,
    project_id: PROJECT_ID,
    ow_user_id: `load-test-user-${__VU}`,
    ow_transaction_id: `txn-${__VU}-${__ITER}`,
  });

  const timestamp = new Date().toISOString();
  const signature = crypto.hmac('sha256', API_SECRET, body, 'hex');

  const res = http.post(`${BASE_URL}/api/v1/validate`, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    tags: { name: 'validate' },
  });

  validationDuration.add(res.timings.duration);

  const isSuccess = check(res, {
    'status is 200 or 409': (r) => r.status === 200 || r.status === 409,
    'response has status field': (r) => {
      const body = JSON.parse(r.body);
      return body.status === 'OK' || body.status === 'KO';
    },
  });

  errorRate.add(!isSuccess);
  sleep(0.1);
}
