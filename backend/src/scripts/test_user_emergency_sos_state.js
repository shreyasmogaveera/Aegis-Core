const http = require('http');

const API_BASE = 'http://localhost:5000/api/v1';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, text: body });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runStateTest() {
  console.log('===================================================================');
  console.log('  Testing UserEmergencySOS.jsx State & Lifecycle Rule Compliance');
  console.log('===================================================================\n');

  let passed = 0;
  let failed = 0;

  function check(label, condition, detail = '') {
    if (condition) {
      passed++;
      console.log(`✓ ${label}${detail ? ' — ' + detail : ''}`);
    } else {
      failed++;
      console.log(`❌ ${label}${detail ? ' — ' + detail : ''}`);
    }
  }

  // 1. Login as citizen
  console.log('[1] Logging in as citizen...');
  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'citizen@aegis.gov', password: 'citizen123' }
  });
  check('Citizen Login', citizenLogin.status === 200);
  const token = citizenLogin.data.token;

  // 2. Open /user/emergency initial state check (GET /api/v1/user/sos)
  console.log('\n[2] Initial page mount check (GET /user/sos)...');
  const initialFetch = await makeRequest(`${API_BASE}/user/sos`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const initialActive = initialFetch.data.sosRequests?.find(
    (s) => s.status === 'PENDING' || s.status === 'RESPONDING' || s.status === 'IN_PROGRESS'
  );

  check('GET /user/sos responds with HTTP 200', initialFetch.status === 200);
  check('No active SOS initially on mount', !initialActive, `activeCount: ${initialFetch.data.activeCount}`);

  // 3. User explicitly clicks SOS button -> POST /api/v1/user/sos
  console.log('\n[3] Citizen explicitly clicks SOS button...');
  const clickSosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: {
      latitude: 12.9716,
      longitude: 77.5946,
      emergencyType: 'FLOOD_TRAPPED',
      details: 'User explicitly clicked SOS button test',
      address: 'Current GPS Location',
      district: 'Karnataka'
    }
  });

  check('POST /user/sos responds with HTTP 201', clickSosRes.status === 201);
  check('New SOS returned with status PENDING', clickSosRes.data.sos?.status === 'PENDING', `ID: ${clickSosRes.data.sos?.id}`);
  const createdId = clickSosRes.data.sos?.id;

  // 4. User clicks CANCEL -> PATCH /api/v1/user/sos/:id/cancel
  console.log('\n[4] Citizen clicks CANCEL button...');
  const cancelRes = await makeRequest(`${API_BASE}/user/sos/${createdId}/cancel`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  check('PATCH /user/sos/:id/cancel responds with HTTP 200', cancelRes.status === 200);
  check('Returned SOS status is CANCELLED', cancelRes.data.sos?.status === 'CANCELLED');

  // 5. Page Refresh -> GET /api/v1/user/sos
  console.log('\n[5] Simulating page refresh (GET /user/sos)...');
  const refreshFetch = await makeRequest(`${API_BASE}/user/sos`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const refreshActive = refreshFetch.data.sosRequests?.find(
    (s) => s.status === 'PENDING' || s.status === 'RESPONDING' || s.status === 'IN_PROGRESS'
  );

  const refreshCancelledItem = refreshFetch.data.sosRequests?.find((s) => s.id === createdId);

  check('GET /user/sos responds with HTTP 200 on refresh', refreshFetch.status === 200);
  check('No active PENDING/RESPONDING/IN_PROGRESS SOS found on refresh', !refreshActive);
  check('Cancelled SOS remains CANCELLED in database', refreshCancelledItem?.status === 'CANCELLED');

  console.log('\n===================================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log('===================================================================');

  process.exit(failed === 0 ? 0 : 1);
}

runStateTest().catch(console.error);
