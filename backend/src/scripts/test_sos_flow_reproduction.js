const { io } = require('socket.io-client');
const http = require('http');

const API_BASE = 'http://localhost:5000/api/v1';
const SOCKET_URL = 'http://localhost:5000';

async function makeRequest(url, options = {}) {
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
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
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

async function testSosFlowReproduction() {
  console.log('===================================================================');
  console.log('  Reproducing SOS Flow & Admin Room Token Disconnect Bug');
  console.log('===================================================================\n');

  // Step 1: Connect Socket as Guest (simulating initial page load before login)
  console.log('[Step 1] Connecting Socket.io client as GUEST (no auth token)...');
  const guestSocket = io(SOCKET_URL, {
    auth: { token: null },
    autoConnect: true
  });
  await new Promise((res) => guestSocket.on('connect', res));
  console.log('✓ Guest Socket Connected. Socket ID:', guestSocket.id);

  // Step 2: Admin Logs In via REST API
  console.log('\n[Step 2] Admin logging in to obtain JWT...');
  const adminLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'admin@aegiscore.gov', password: 'admin123' }
  });
  const adminToken = adminLogin.data.token;
  console.log('✓ Admin Logged In. Role:', adminLogin.data.user.role);

  // Simulate existing socket behavior: reusing guestSocket without reconnecting
  let guestReceivedSos = false;
  guestSocket.on('sos:created', (data) => {
    console.log('❌ GUEST SOCKET RECEIVED SOS:', data.id);
    guestReceivedSos = true;
  });

  // Step 3: Citizen Logs In & Submits SOS Distress Call
  console.log('\n[Step 3] Citizen logging in & triggering SOS distress call...');
  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'citizen@aegis.gov', password: 'citizen123' }
  });
  const citizenToken = citizenLogin.data.token;

  const sosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
    body: { latitude: 12.4244, longitude: 75.7382, emergencyType: 'FLOOD_TRAPPED', details: 'Test SOS flow reproduction', district: 'Kodagu' }
  });
  console.log('✓ Citizen SOS Sent. Status:', sosRes.status, 'ID:', sosRes.data.sos?.id);

  // Wait 1.5 seconds to see if guest socket receives sos:created
  await new Promise((r) => setTimeout(r, 1500));

  if (!guestReceivedSos) {
    console.log('\n❌ REPRODUCED PROBLEM: Guest Socket (connected before login) DID NOT receive [sos:created] because it never joined the "admins" room!');
  }

  guestSocket.disconnect();

  // Step 4: Now test proper Admin Socket connected WITH Admin JWT Token
  console.log('\n[Step 4] Now connecting Socket WITH Admin JWT Token...');
  const authenticatedAdminSocket = io(SOCKET_URL, {
    auth: { token: adminToken },
    autoConnect: true
  });
  await new Promise((res) => authenticatedAdminSocket.on('connect', res));
  console.log('✓ Admin Socket Connected WITH JWT. Socket ID:', authenticatedAdminSocket.id);

  let adminReceivedSos = null;
  const adminPromise = new Promise((resolve) => {
    authenticatedAdminSocket.once('sos:created', (data) => {
      adminReceivedSos = data;
      resolve(data);
    });
  });

  // Citizen sends second SOS
  const sosRes2 = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
    body: { latitude: 12.4244, longitude: 75.7382, emergencyType: 'LANDSLIDE_BLOCKED', details: 'Test SOS 2 for authenticated admin socket', district: 'Kodagu' }
  });
  console.log('✓ Citizen Second SOS Sent. Status:', sosRes2.status, 'ID:', sosRes2.data.sos?.id);

  await Promise.race([adminPromise, new Promise((r) => setTimeout(r, 2000))]);

  if (adminReceivedSos && adminReceivedSos.id === sosRes2.data.sos.id) {
    console.log('✓ VERIFIED: Authenticated Admin Socket joined "admins" room and received [sos:created] event successfully!');
  } else {
    console.log('❌ Authenticated Admin Socket failed to receive event');
  }

  authenticatedAdminSocket.disconnect();
}

testSosFlowReproduction().catch(console.error);
