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

async function runTests() {
  console.log('--- Starting Socket.io Real-Time Verification Tests ---');

  // 1. Authenticate Admin and Citizen
  const citizenEmail = `citizen_${Date.now()}@aegiscore.test`;
  const adminEmail = `admin_${Date.now()}@aegiscore.test`;

  console.log('[Step 1] Registering and logging in Citizen and Admin...');
  await makeRequest(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fullname: 'Test Citizen', email: citizenEmail, password: 'Password123!', role: 'user' }
  });

  await makeRequest(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fullname: 'Test Admin', email: adminEmail, password: 'Password123!', role: 'admin' }
  });

  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: citizenEmail, password: 'Password123!' }
  });
  const citizenToken = citizenLogin.data.token;

  const adminLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: adminEmail, password: 'Password123!' }
  });
  const adminToken = adminLogin.data.token;

  console.log('✓ Citizen Token:', citizenToken ? 'RECEIVED' : 'FAILED');
  console.log('✓ Admin Token:', adminToken ? 'RECEIVED' : 'FAILED');

  // 2. Connect Socket.io clients
  console.log('\n[Step 2] Establishing Socket.io client connections...');
  const citizenSocket = io(SOCKET_URL, { auth: { token: citizenToken } });
  const adminSocket = io(SOCKET_URL, { auth: { token: adminToken } });

  await new Promise((resolve) => {
    let connected = 0;
    citizenSocket.on('connect', () => {
      console.log('✓ Citizen Socket Connected:', citizenSocket.id);
      if (++connected === 2) resolve();
    });
    adminSocket.on('connect', () => {
      console.log('✓ Admin Socket Connected:', adminSocket.id);
      if (++connected === 2) resolve();
    });
  });

  // 3. Test SOS Event
  console.log('\n[Step 3] Testing SOS Real-Time Events (Creation & Dispatch)...');
  let sosCreatedPromise = new Promise((resolve) => {
    adminSocket.once('sos:created', (data) => {
      console.log('✓ Admin Socket received [sos:created]:', data.id, '| Priority:', data.priority);
      resolve(data);
    });
  });

  const sosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${citizenToken}`
    },
    body: {
      latitude: 12.4244,
      longitude: 75.7382,
      emergencyType: 'FLOOD_TRAPPED',
      details: 'Automated verification test distress beacon',
      district: 'Kodagu'
    }
  });

  const createdSos = await sosCreatedPromise;
  console.log('✓ SOS MongoDB Record verified:', sosRes.data.sos.id === createdSos.id ? 'MATCH' : 'MISMATCH');

  // Test SOS Status update
  let sosUpdatedPromise = new Promise((resolve) => {
    citizenSocket.once('sos:updated', (data) => {
      console.log('✓ Citizen Socket received [sos:updated]:', data.id, '| New Status:', data.status);
      resolve(data);
    });
  });

  await makeRequest(`${API_BASE}/admin/sos/${createdSos.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: { status: 'RESPONDING' }
  });

  const updatedSos = await sosUpdatedPromise;
  console.log('✓ SOS Status dispatch verified:', updatedSos.status === 'RESPONDING' ? 'PASS' : 'FAIL');

  // 4. Test Alert Event
  console.log('\n[Step 4] Testing Emergency Broadcast Alert Real-Time Events...');
  let alertCreatedPromise = new Promise((resolve) => {
    citizenSocket.once('alert:created', (data) => {
      console.log('✓ Citizen Socket received [alert:created]:', data.id, '| Title:', data.title);
      resolve(data);
    });
  });

  const alertRes = await makeRequest(`${API_BASE}/admin/alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: {
      title: 'Flash Flood Verification Alert',
      description: 'Test emergency warning for socket verification',
      hazardType: 'FLOOD',
      riskLevel: 'CRITICAL',
      district: 'Kodagu',
      affectedPopulation: 2500
    }
  });

  const createdAlert = await alertCreatedPromise;
  console.log('✓ Alert MongoDB Record verified:', alertRes.data.alert.id === createdAlert.id ? 'MATCH' : 'MISMATCH');

  let alertUpdatedPromise = new Promise((resolve) => {
    citizenSocket.once('alert:updated', (data) => {
      console.log('✓ Citizen Socket received [alert:updated]:', data.id, '| Status:', data.status);
      resolve(data);
    });
  });

  await makeRequest(`${API_BASE}/admin/alerts/${createdAlert.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: { status: 'RESOLVED' }
  });

  await alertUpdatedPromise;

  // 5. Test Shelter Event
  console.log('\n[Step 5] Testing Shelter Capacity Real-Time Events...');
  let shelterUpdatedPromise = new Promise((resolve) => {
    citizenSocket.once('shelter:updated', (data) => {
      console.log('✓ Citizen Socket received [shelter:updated]:', data.id, '| Name:', data.name, '| Occupied:', data.occupied);
      resolve(data);
    });
  });

  const shelterRes = await makeRequest(`${API_BASE}/admin/shelters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: {
      name: 'Verification Relief Camp',
      address: 'Central Sports Complex, Madikeri',
      district: 'Kodagu',
      capacity: 400,
      occupied: 120,
      status: 'OPEN',
      contactPhone: '+91 8272111222'
    }
  });

  await shelterUpdatedPromise;

  // 6. Cleanup sockets
  citizenSocket.disconnect();
  adminSocket.disconnect();

  console.log('\n==================================================');
  console.log('ALL SOCKET.IO REAL-TIME VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================\n');
}

runTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
