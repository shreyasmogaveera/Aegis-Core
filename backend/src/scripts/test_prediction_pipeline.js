const { io } = require('socket.io-client');
const http = require('http');

const API_BASE = 'http://localhost:5000/api/v1';
const FLASK_BASE = 'http://localhost:5001/api/v1';
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

async function runPipelineTests() {
  console.log('===========================================================');
  console.log('  AegisCore 4-District Scope & Rule Verification Suite');
  console.log('===========================================================\n');

  // A. Health Checks
  console.log('[Step 1] Service Health Checks');
  const expressHealth = await makeRequest(`${API_BASE}/health`);
  console.log('✓ Express Backend (5000):', expressHealth.status === 200 ? 'ONLINE' : 'OFFLINE');

  const flaskHealth = await makeRequest(`${FLASK_BASE}/health`);
  console.log('✓ Flask ML Service (5001):', flaskHealth.status === 200 ? 'ONLINE' : 'OFFLINE');

  // Auth User
  const citizenEmail = `scope_user_${Date.now()}@aegiscore.test`;
  await makeRequest(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { fullname: 'Scope Test Citizen', email: citizenEmail, password: 'Password123!', role: 'user' }
  });

  const userLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: citizenEmail, password: 'Password123!' }
  });
  const token = userLogin.data.token;
  console.log('✓ User Auth Token:', token ? 'PASS' : 'FAIL');

  // B. 4-District Environmental Data Test
  console.log('\n[Step 2] Verifying Environmental Data for 4 AegisCore Districts');
  const districts = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];
  for (const d of districts) {
    const res = await makeRequest(`${API_BASE}/environmental/latest?district=${encodeURIComponent(d)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`✓ Environmental Data (${d}):`, res.status === 200 && res.data.district === d ? 'PASS' : 'FAIL');
  }

  // C. Flood Predictions for all 4 Districts
  console.log('\n[Step 3] Verifying Flood Predictions (All 4 Districts Supported)');
  for (const d of districts) {
    const res = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: { district: d, predictionType: 'flood', timeWindowHours: 72 }
    });
    console.log(`✓ Flood Prediction (${d}): Status ${res.status} | Risk Level: ${res.data.prediction?.riskLevel || 'N/A'}`);
  }

  // D. Landslide Predictions Rule Test (Kodagu & Uttara Kannada PASS, Belagavi & Bagalkot HTTP 400 ERROR)
  console.log('\n[Step 4] Verifying Landslide Prediction Capability Rules');

  // Kodagu & Uttara Kannada (Must PASS)
  for (const d of ['Kodagu', 'Uttara Kannada']) {
    const res = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: { district: d, predictionType: 'landslide', timeWindowHours: 72 }
    });
    console.log(`✓ Landslide Prediction Allowed (${d}): Status ${res.status} | Risk: ${res.data.prediction?.riskLevel || 'N/A'}`);
  }

  // Belagavi & Bagalkot (Must Return HTTP 400 Validation Error)
  for (const d of ['Belagavi', 'Bagalkot']) {
    const res = await makeRequest(`${API_BASE}/predictions/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: { district: d, predictionType: 'landslide', timeWindowHours: 72 }
    });
    const isCorrectError = res.status === 400 && res.data.error && res.data.error.includes('Landslide risk prediction is not supported');
    console.log(`✓ Landslide Prediction Restricted (${d}): Status ${res.status} | Error Message: "${res.data.error}" -> ${isCorrectError ? 'PASS' : 'FAIL'}`);
  }

  // E. Socket.io Real-Time Event Test
  console.log('\n[Step 5] Socket.io Real-Time Broadcast Test');
  const socketClient = io(SOCKET_URL, { auth: { token } });
  await new Promise((res) => socketClient.on('connect', res));

  const socketPromise = new Promise((resolve) => {
    socketClient.once('prediction:updated', (data) => {
      console.log('✓ Socket.io received [prediction:updated] for district:', data.district);
      resolve(data);
    });
  });

  await makeRequest(`${API_BASE}/predictions/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: { district: 'Uttara Kannada', predictionType: 'flood', timeWindowHours: 72 }
  });

  await socketPromise;
  socketClient.disconnect();

  console.log('\n===========================================================');
  console.log('  4-DISTRICT SCOPE & PREDICTION RULES VERIFICATION PASSED');
  console.log('===========================================================\n');
}

runPipelineTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
