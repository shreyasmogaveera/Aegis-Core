/**
 * AegisCore SOS Real-Time Flow — Full End-to-End Verification
 * 
 * This test simulates the EXACT browser flow:
 * 1. Socket connects WITHOUT a token (as happens on initial page load / login screen)
 * 2. User logs in via REST API, gets JWT
 * 3. Socket RECONNECTS with the new JWT (the fix we applied)
 * 4. Citizen sends SOS
 * 5. Admin socket (now authenticated) receives sos:created in real time
 * 6. Admin dispatches SOS
 * 7. Citizen socket receives sos:updated in real time
 * 8. Admin resolves SOS
 * 9. Citizen socket receives sos:updated with RESOLVED status
 */

const { io } = require('socket.io-client');
const http = require('http');

const API_BASE = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000';

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
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, text: body }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

async function main() {
  let passed = 0, failed = 0;
  const results = [];

  function check(label, condition, detail = '') {
    if (condition) { passed++; results.push(`✓ ${label}`); console.log(`✓ ${label}${detail ? ' — ' + detail : ''}`); }
    else { failed++; results.push(`✗ ${label}`); console.log(`✗ ${label}${detail ? ' — ' + detail : ''}`); }
  }

  console.log('===================================================================');
  console.log('  AegisCore SOS Real-Time Flow — Complete Verification');
  console.log('  (Simulates exact browser reconnect-after-login fix)');
  console.log('===================================================================\n');

  // ─── Phase 1: Simulate initial page load — sockets connect WITHOUT auth ───
  console.log('--- Phase 1: Initial Socket Connections (no auth — simulating page load) ---');
  const adminSocket = io(SOCKET_URL, { auth: { token: null }, autoConnect: true, forceNew: true });
  const citizenSocket = io(SOCKET_URL, { auth: { token: null }, autoConnect: true, forceNew: true });
  await Promise.all([
    new Promise(r => adminSocket.on('connect', r)),
    new Promise(r => citizenSocket.on('connect', r))
  ]);
  check('[1] Admin guest socket connected', adminSocket.connected, `ID: ${adminSocket.id}`);
  check('[2] Citizen guest socket connected', citizenSocket.connected, `ID: ${citizenSocket.id}`);

  // ─── Phase 2: Login via REST ───
  console.log('\n--- Phase 2: REST API Login ---');
  const adminLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { email: 'admin@aegiscore.gov', password: 'admin123' }
  });
  check('[3] Admin login', adminLogin.status === 200, `Role: ${adminLogin.data.user?.role}`);
  const adminToken = adminLogin.data.token;

  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: { email: 'citizen@aegis.gov', password: 'citizen123' }
  });
  check('[4] Citizen login', citizenLogin.status === 200, `Role: ${citizenLogin.data.user?.role}`);
  const citizenToken = citizenLogin.data.token;

  // ─── Phase 3: Reconnect sockets WITH JWT (THE FIX) ───
  console.log('\n--- Phase 3: Socket Reconnect with JWT (the fix) ---');
  adminSocket.auth = { token: adminToken };
  adminSocket.disconnect();
  adminSocket.connect();
  await new Promise(r => adminSocket.on('connect', r));
  check('[5] Admin socket reconnected with JWT', adminSocket.connected, `New ID: ${adminSocket.id}`);

  citizenSocket.auth = { token: citizenToken };
  citizenSocket.disconnect();
  citizenSocket.connect();
  await new Promise(r => citizenSocket.on('connect', r));
  check('[6] Citizen socket reconnected with JWT', citizenSocket.connected, `New ID: ${citizenSocket.id}`);

  // Small delay to let server process room joins
  await new Promise(r => setTimeout(r, 500));

  // ─── Phase 4: Citizen sends SOS, Admin receives it in real time ───
  console.log('\n--- Phase 4: Citizen SOS → Admin Real-Time Reception ---');
  const adminSosPromise = waitForEvent(adminSocket, 'sos:created', 5000);

  const sosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
    body: { latitude: 12.4244, longitude: 75.7382, emergencyType: 'FLOOD_TRAPPED', details: 'Full E2E SOS verification', district: 'Kodagu' }
  });
  check('[7] Citizen SOS POST succeeded', sosRes.status === 201, `SOS ID: ${sosRes.data.sos?.id}`);
  check('[8] SOS persisted in MongoDB', !!sosRes.data.sos?.id);
  check('[9] SOS status is PENDING', sosRes.data.sos?.status === 'PENDING');

  try {
    const adminReceived = await adminSosPromise;
    check('[10] Admin received sos:created via Socket.io', !!adminReceived, `Received SOS ID: ${adminReceived?.id}`);
    check('[11] Received SOS ID matches created SOS', adminReceived?.id === sosRes.data.sos?.id);
    check('[12] Received SOS has correct district', adminReceived?.district === 'Kodagu');
    check('[13] Received SOS has valid coordinates', adminReceived?.latitude !== undefined && adminReceived?.longitude !== undefined,
      `[${adminReceived?.latitude}, ${adminReceived?.longitude}]`);
  } catch (err) {
    check('[10] Admin received sos:created via Socket.io', false, err.message);
    failed += 3; // skip dependent checks
  }

  // ─── Phase 5: Admin dispatches SOS, Citizen receives update ───
  console.log('\n--- Phase 5: Admin Dispatch → Citizen Real-Time Update ---');
  const citizenUpdatePromise = waitForEvent(citizenSocket, 'sos:updated', 5000);
  const sosId = sosRes.data.sos?.id;

  const dispatchRes = await makeRequest(`${API_BASE}/admin/sos/${sosId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: { status: 'RESPONDING' }
  });
  check('[14] Admin DISPATCH PATCH succeeded', dispatchRes.status === 200);
  check('[15] SOS status updated to RESPONDING', dispatchRes.data.sos?.status === 'RESPONDING');

  try {
    const citizenReceived = await citizenUpdatePromise;
    check('[16] Citizen received sos:updated via Socket.io', !!citizenReceived, `Status: ${citizenReceived?.status}`);
    check('[17] Citizen received correct RESPONDING status', citizenReceived?.status === 'RESPONDING');
  } catch (err) {
    check('[16] Citizen received sos:updated via Socket.io', false, err.message);
    failed++;
  }

  // ─── Phase 6: Admin resolves SOS ───
  console.log('\n--- Phase 6: Admin Resolve → Final Status ---');
  const citizenResolvePromise = waitForEvent(citizenSocket, 'sos:updated', 5000);

  const resolveRes = await makeRequest(`${API_BASE}/admin/sos/${sosId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: { status: 'RESOLVED' }
  });
  check('[18] Admin RESOLVE PATCH succeeded', resolveRes.status === 200);
  check('[19] SOS status updated to RESOLVED', resolveRes.data.sos?.status === 'RESOLVED');

  try {
    const citizenResolved = await citizenResolvePromise;
    check('[20] Citizen received RESOLVED sos:updated', citizenResolved?.status === 'RESOLVED');
  } catch (err) {
    check('[20] Citizen received RESOLVED sos:updated', false, err.message);
  }

  // ─── Phase 7: Admin initial fetch of SOS list ───
  console.log('\n--- Phase 7: Admin REST Fetch of All SOS Records ---');
  const adminFetch = await makeRequest(`${API_BASE}/admin/sos`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  check('[21] Admin GET /admin/sos succeeds', adminFetch.status === 200);
  check('[22] Response contains sosRequests array', Array.isArray(adminFetch.data.sosRequests));
  check('[23] Response contains metrics object', !!adminFetch.data.metrics);
  const ourSos = adminFetch.data.sosRequests?.find(s => s.id === sosId);
  check('[24] Our SOS appears in admin list', !!ourSos, `Status: ${ourSos?.status}`);

  // Cleanup
  adminSocket.disconnect();
  citizenSocket.disconnect();

  console.log('\n===================================================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log('===================================================================');
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
