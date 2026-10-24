const { io } = require('socket.io-client');
const http = require('http');

const API_BASE = 'http://localhost:5000/api/v1';
const FLASK_BASE = 'http://localhost:5001/api/v1';
const SOCKET_URL = 'http://localhost:5000';

const results = [];

function recordTest(section, testName, pass, details = '') {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ section, testName, pass, status, details });
  const icon = pass ? '✓' : '❌';
  console.log(`${icon} [${section}] ${testName} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

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

async function executeFullRegressionSuite() {
  console.log('===================================================================');
  console.log('       AegisCore Complete End-to-End Regression Test Suite');
  console.log('===================================================================\n');

  // -------------------------------------------------------------
  // 1. Service Health & Connectivity
  // -------------------------------------------------------------
  console.log('--- 1. Service Health Checks ---');
  const expHealth = await makeRequest(`${API_BASE}/health`);
  recordTest('1. Health', 'Express Backend Server (Port 5000)', expHealth.status === 200, `Status: ${expHealth.status}`);

  const flaskHealth = await makeRequest(`${FLASK_BASE}/health`);
  recordTest('1. Health', 'Flask ML Service (Port 5001)', flaskHealth.status === 200, `Status: ${flaskHealth.status}`);

  // -------------------------------------------------------------
  // 2. Authentication & Authorization (JWT & Role Guards)
  // -------------------------------------------------------------
  console.log('\n--- 2. Auth & Role Security ---');
  const timestamp = Date.now();
  const adminEmail = `admin_reg_${timestamp}@aegiscore.gov`;
  const citizenEmail = `citizen_reg_${timestamp}@aegis.gov`;

  const adminReg = await makeRequest(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fullname: 'E2E Admin', email: adminEmail, password: 'AdminPassword123!', role: 'admin' }
  });
  recordTest('2. Auth', 'Admin Registration', adminReg.status === 201);

  const citizenReg = await makeRequest(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fullname: 'E2E Citizen', email: citizenEmail, password: 'CitizenPassword123!', role: 'user' }
  });
  recordTest('2. Auth', 'Citizen Registration', citizenReg.status === 201);

  const adminLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: adminEmail, password: 'AdminPassword123!' }
  });
  const adminToken = adminLogin.data.token;
  recordTest('2. Auth', 'Admin Login JWT Issuance', Boolean(adminToken));

  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: citizenEmail, password: 'CitizenPassword123!' }
  });
  const citizenToken = citizenLogin.data.token;
  recordTest('2. Auth', 'Citizen Login JWT Issuance', Boolean(citizenToken));

  const unauthReq = await makeRequest(`${API_BASE}/user/sos`);
  recordTest('2. Security', 'Unauthenticated Access Block (401)', unauthReq.status === 401);

  const roleGuardReq = await makeRequest(`${API_BASE}/admin/alerts`, {
    headers: { Authorization: `Bearer ${citizenToken}` }
  });
  recordTest('2. Security', 'Citizen Restricted Admin Endpoint (403)', roleGuardReq.status === 403);

  // -------------------------------------------------------------
  // 3. Environmental Telemetry Data (4 Districts Scope)
  // -------------------------------------------------------------
  console.log('\n--- 3. Environmental Telemetry (4 Districts) ---');
  const targetDistricts = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];

  for (const d of targetDistricts) {
    const envRes = await makeRequest(`${API_BASE}/environmental/latest?district=${encodeURIComponent(d)}`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    const valid = envRes.status === 200 && envRes.data.district === d && envRes.data.source === 'mock' && typeof envRes.data.rainfall_mm === 'number';
    recordTest('3. Environmental', `Latest Telemetry for ${d}`, valid, `Rainfall: ${envRes.data.rainfall_mm}mm, River: ${envRes.data.river_level_m}m`);
  }

  const envHistory = await makeRequest(`${API_BASE}/environmental/history?district=Kodagu`, {
    headers: { Authorization: `Bearer ${citizenToken}` }
  });
  recordTest('3. Environmental', 'Telemetry History Query', envHistory.status === 200 && envHistory.data.history.length > 0);

  // -------------------------------------------------------------
  // 4. AI/ML Risk Prediction Pipeline & District Capability Rules
  // -------------------------------------------------------------
  console.log('\n--- 4. AI/ML Risk Prediction Pipeline ---');

  // Direct Flask endpoints
  const flaskFlood = await makeRequest(`${FLASK_BASE}/predict/flood`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { district: 'Uttara Kannada', time_window_hours: 72, data: { rainfall_mm: 135, river_level_m: 5.2, soil_moisture_pct: 91 } }
  });
  recordTest('4. Flask ML', 'Direct Flask Flood Prediction (Uttara Kannada)', flaskFlood.status === 200 && flaskFlood.data.risk_level === 'CRITICAL');

  const flaskLandslide = await makeRequest(`${FLASK_BASE}/predict/landslide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { district: 'Kodagu', time_window_hours: 72, data: { rainfall_mm: 145, river_level_m: 5.8, soil_moisture_pct: 94 } }
  });
  recordTest('4. Flask ML', 'Direct Flask Landslide Prediction (Kodagu)', flaskLandslide.status === 200 && flaskLandslide.data.prediction_type === 'landslide');

  // Express 4-Layer Trigger for Flood across all 4 districts
  for (const d of targetDistricts) {
    const triggerRes = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: { district: d, predictionType: 'flood', timeWindowHours: 72 }
    });
    recordTest('4. Pipeline', `Express 4-Layer Flood Prediction (${d})`, triggerRes.status === 201 && triggerRes.data.prediction.source === 'mock');
  }

  // Express 4-Layer Trigger for Landslide (Kodagu & Uttara Kannada PASS)
  for (const d of ['Kodagu', 'Uttara Kannada']) {
    const triggerRes = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: { district: d, predictionType: 'landslide', timeWindowHours: 72 }
    });
    recordTest('4. Pipeline', `Express 4-Layer Landslide Prediction Allowed (${d})`, triggerRes.status === 201 && triggerRes.data.prediction.predictionType === 'LANDSLIDE');
  }

  // Express 4-Layer Trigger for Landslide (Belagavi & Bagalkot HTTP 400 Validation Error)
  for (const d of ['Belagavi', 'Bagalkot']) {
    const triggerRes = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
      body: { district: d, predictionType: 'landslide', timeWindowHours: 72 }
    });
    const isValidError = triggerRes.status === 400 && triggerRes.data.error.includes('Landslide risk prediction is not supported');
    recordTest('4. Pipeline Rules', `Landslide Prediction Restricted 400 Error (${d})`, isValidError, `Error: "${triggerRes.data.error}"`);
  }

  // -------------------------------------------------------------
  // 5. Emergency SOS Beacon Lifecycle & Socket.io Events
  // -------------------------------------------------------------
  console.log('\n--- 5. Emergency SOS Lifecycle & Sockets ---');
  const citizenSocket = io(SOCKET_URL, { auth: { token: citizenToken } });
  const adminSocket = io(SOCKET_URL, { auth: { token: adminToken } });

  await new Promise((res) => {
    let count = 0;
    citizenSocket.on('connect', () => { if (++count === 2) res(); });
    adminSocket.on('connect', () => { if (++count === 2) res(); });
  });
  recordTest('5. Sockets', 'Citizen & Admin Socket JWT Handshake', citizenSocket.connected && adminSocket.connected);

  let sosCreatedReceived = null;
  const sosCreatedPromise = new Promise((res) => {
    adminSocket.once('sos:created', (data) => {
      sosCreatedReceived = data;
      res(data);
    });
  });

  const createSosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${citizenToken}` },
    body: {
      latitude: 12.4244,
      longitude: 75.7382,
      emergencyType: 'FLOOD_TRAPPED',
      details: 'E2E Regression SOS Beacon',
      district: 'Kodagu',
      source: 'test',
      isTest: true
    }
  });
  recordTest('5. SOS API', 'Citizen SOS Transmission', createSosRes.status === 201);

  await sosCreatedPromise;
  recordTest('5. SOS Sockets', 'Admin Received [sos:created] Socket Event', sosCreatedReceived.id === createSosRes.data.sos.id);

  let sosUpdatedReceived = null;
  const sosUpdatedPromise = new Promise((res) => {
    citizenSocket.once('sos:updated', (data) => {
      sosUpdatedReceived = data;
      res(data);
    });
  });

  const dispatchRes = await makeRequest(`${API_BASE}/admin/sos/${createSosRes.data.sos.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: { status: 'RESPONDING' }
  });
  recordTest('5. SOS API', 'Admin SOS Dispatch Status Update', dispatchRes.status === 200 && dispatchRes.data.sos.status === 'RESPONDING');

  await sosUpdatedPromise;
  recordTest('5. SOS Sockets', 'Citizen Received [sos:updated] Socket Event', sosUpdatedReceived.status === 'RESPONDING');

  // Clean up synthetic test SOS via DELETE API so it never lingers in operational records
  await makeRequest(`${API_BASE}/admin/sos/${createSosRes.data.sos.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // -------------------------------------------------------------
  // 6. Emergency Alerts Broadcast Lifecycle & Sockets
  // -------------------------------------------------------------
  console.log('\n--- 6. Emergency Alerts & Sockets ---');
  let alertCreatedReceived = null;
  const alertCreatedPromise = new Promise((res) => {
    citizenSocket.once('alert:created', (data) => {
      alertCreatedReceived = data;
      res(data);
    });
  });

  const createAlertRes = await makeRequest(`${API_BASE}/admin/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: { title: 'E2E Flash Flood Evacuation Alert', description: 'Immediate evacuation notice for riverbank residents', hazardType: 'FLOOD', riskLevel: 'CRITICAL', district: 'Bagalkot', affectedPopulation: 3500, source: 'test' }
  });
  recordTest('6. Alerts API', 'Admin Issue Alert Creation', createAlertRes.status === 201);

  await alertCreatedPromise;
  recordTest('6. Alerts Sockets', 'Citizen Received [alert:created] Socket Event', alertCreatedReceived.id === createAlertRes.data.alert.id);

  let alertUpdatedReceived = null;
  const alertUpdatedPromise = new Promise((res) => {
    citizenSocket.once('alert:updated', (data) => {
      alertUpdatedReceived = data;
      res(data);
    });
  });

  const resolveAlertRes = await makeRequest(`${API_BASE}/admin/alerts/${createAlertRes.data.alert.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: { status: 'RESOLVED' }
  });
  recordTest('6. Alerts API', 'Admin Alert Status Resolution', resolveAlertRes.status === 200);

  await alertUpdatedPromise;
  recordTest('6. Alerts Sockets', 'Citizen Received [alert:updated] Socket Event', alertUpdatedReceived.status === 'RESOLVED');

  // Clean up synthetic test alert via DELETE API so it never lingers in operational records
  await makeRequest(`${API_BASE}/admin/alerts/${createAlertRes.data.alert.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // -------------------------------------------------------------
  // 7. Relief Shelter Management Lifecycle & Sockets
  // -------------------------------------------------------------
  console.log('\n--- 7. Shelter Management & Sockets ---');
  let shelterUpdatedReceived = null;
  const shelterUpdatedPromise = new Promise((res) => {
    citizenSocket.once('shelter:updated', (data) => {
      shelterUpdatedReceived = data;
      res(data);
    });
  });

  const createShelterRes = await makeRequest(`${API_BASE}/admin/shelters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: {
      name: 'E2E Jamkhandi Relief Camp',
      address: 'Main Stadium Grounds, Jamkhandi',
      district: 'Bagalkot',
      capacity: 500,
      occupied: 100,
      status: 'OPEN',
      contactPhone: '+91 8354111222',
      source: 'test',
      isTest: true
    }
  });
  recordTest('7. Shelters API', 'Admin Create Shelter', createShelterRes.status === 201);

  await shelterUpdatedPromise;
  recordTest('7. Shelters Sockets', 'Citizen Received [shelter:updated] Socket Event', shelterUpdatedReceived.id === createShelterRes.data.shelter.id);

  // Clean up synthetic test shelter via DELETE API so it never lingers in operational records
  await makeRequest(`${API_BASE}/admin/shelters/${createShelterRes.data.shelter.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  // -------------------------------------------------------------
  // 8. Dashboards Dynamic Integration
  // -------------------------------------------------------------
  console.log('\n--- 8. Admin & User Dashboards ---');
  const adminDashRes = await makeRequest(`${API_BASE}/admin/dashboard/summary`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  recordTest('8. Admin Dashboard', 'Tactical Summary Overview', adminDashRes.status === 200 && typeof adminDashRes.data.activeSosCount === 'number');

  const userDashRes = await makeRequest(`${API_BASE}/user/dashboard/summary`, {
    headers: { Authorization: `Bearer ${citizenToken}` }
  });
  recordTest('8. User Dashboard', 'Citizen Safety Index & Nearest Shelter', userDashRes.status === 200 && typeof userDashRes.data.safetyScore === 'number');

  // Disconnect sockets cleanly
  citizenSocket.disconnect();
  adminSocket.disconnect();
  recordTest('9. Socket Cleanup', 'Socket Unmount / Disconnection', !citizenSocket.connected && !adminSocket.connected);

  // Clean up synthetic test users registered during step 2
  if (adminReg.data?.user?.id) {
    await makeRequest(`${API_BASE}/admin/users/${adminReg.data.user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  }
  if (citizenReg.data?.user?.id) {
    await makeRequest(`${API_BASE}/admin/users/${citizenReg.data.user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
  }

  // -------------------------------------------------------------
  // 10. Failure Handling Simulation
  // -------------------------------------------------------------
  console.log('\n--- 10. Failure Handling Simulation ---');
  const mlBridgeService = require('../services/mlBridgeService');
  const originalUrl = mlBridgeService.mlServiceUrl;
  mlBridgeService.mlServiceUrl = 'http://localhost:59999/api/v1';

  let handledGracefully = false;
  try {
    await mlBridgeService.predictRisk('Kodagu', { rainfall_mm: 50 }, 72, 'flood');
  } catch (err) {
    handledGracefully = (err.status === 503 || err.message.includes('unreachable') || err.message.includes('fetch failed') || err.message.includes('connection failed'));
  }
  mlBridgeService.mlServiceUrl = originalUrl;
  recordTest('10. Failure Resilience', 'Flask Offline 503 Graceful Handling', handledGracefully, 'Caught unreachable exception cleanly');

  // -------------------------------------------------------------
  // Summary Calculation
  // -------------------------------------------------------------
  console.log('\n===================================================================');
  console.log('             AegisCore Regression Test Summary');
  console.log('===================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`Total Scenarios Tested : ${total}`);
  console.log(`Passed Scenarios      : ${passed}`);
  console.log(`Failed Scenarios      : ${failed}`);
  console.log(`Final Result          : ${failed === 0 ? 'ALL SCENARIOS PASSED (100%)' : 'SOME SCENARIOS FAILED'}`);
  console.log('===================================================================\n');
}

executeFullRegressionSuite().catch((err) => {
  console.error('[REGRESSION SUITE ERROR]', err);
  process.exit(1);
});
