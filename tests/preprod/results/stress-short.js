
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  stages: [
    { duration: '20s', target: 30 },
    { duration: '20s', target: 80 },
    { duration: '20s', target: 0 }
  ],
  thresholds: { http_req_failed: ['rate<0.2'] }
};
const BASE = __ENV.BASE_URL;
export default function () {
  const res = http.get(BASE + '/health');
  check(res, { ok: (r) => r.status === 200 });
  sleep(0.3);
}
