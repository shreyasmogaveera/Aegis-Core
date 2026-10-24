const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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

async function runTests() {
  console.log('===================================================================');
  console.log('  Testing 3 Functional Debugging Tasks');
  console.log('===================================================================\n');

  // Connect to MongoDB directly to verify DB persistence
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aegiscore';
  await mongoose.connect(mongoUri);
  const SosRequest = mongoose.model('SosRequest', new mongoose.Schema({}, { strict: false }));

  // Step 1: Login Citizen & Admin
  console.log('[1] Logging in Citizen & Admin...');
  const citizenLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'citizen@aegis.gov', password: 'citizen123' }
  });
  const citizenToken = citizenLogin.data.token;

  const adminLogin = await makeRequest(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'admin@aegiscore.gov', password: 'admin123' }
  });
  const adminToken = adminLogin.data.token;

  // -------------------------------------------------------------------
  // TEST 1: LIVE SOS LOCATION (Exact Bengaluru GPS: 12.9716, 77.5946)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 1: LIVE SOS LOCATION ---');
  const liveLat = 12.9716;
  const liveLng = 77.5946;

  const postSosRes = await makeRequest(`${API_BASE}/user/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${citizenToken}`
    },
    body: {
      latitude: liveLat,
      longitude: liveLng,
      emergencyType: 'FLOOD_TRAPPED',
      details: 'Live Bengaluru coordinates test',
      address: 'Bengaluru MG Road Sector',
      district: 'Karnataka'
    }
  });

  const createdSos = postSosRes.data.sos;
  console.log('✓ POST /api/v1/user/sos Status:', postSosRes.status);
  console.log('✓ Returned Latitude:', createdSos?.latitude, '| Longitude:', createdSos?.longitude);
  console.log('✓ Returned Coords string:', createdSos?.coords);

  // Check MongoDB directly
  const dbSos = await SosRequest.findById(createdSos.id);
  console.log('✓ MongoDB GeoJSON Point:', JSON.stringify(dbSos.location));

  // Query Admin SOS list
  const adminSosRes = await makeRequest(`${API_BASE}/admin/sos`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const adminSosItem = adminSosRes.data.sosRequests.find((s) => s.id === createdSos.id);
  console.log('✓ Admin API Coords:', adminSosItem?.coords, '| Lat:', adminSosItem?.latitude, '| Lng:', adminSosItem?.longitude);

  const locPass =
    createdSos.latitude === liveLat &&
    createdSos.longitude === liveLng &&
    dbSos.location.coordinates[0] === liveLng &&
    dbSos.location.coordinates[1] === liveLat &&
    adminSosItem.latitude === liveLat &&
    adminSosItem.longitude === liveLng;

  console.log(locPass ? '✓ TEST 1 RESULT: PASS' : '❌ TEST 1 RESULT: FAIL');

  // -------------------------------------------------------------------
  // TEST 2: SOS CANCEL PERSISTENCE
  // -------------------------------------------------------------------
  console.log('\n--- TEST 2: SOS CANCEL PERSISTENCE ---');

  console.log('SOS initial status before cancel:', dbSos.status);

  // Call PATCH /api/v1/user/sos/:id/cancel
  const cancelRes = await makeRequest(`${API_BASE}/user/sos/${createdSos.id}/cancel`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${citizenToken}`
    }
  });
  console.log('✓ PATCH /api/v1/user/sos/:id/cancel Status:', cancelRes.status);
  console.log('✓ Returned SOS status:', cancelRes.data.sos?.status);

  // Check MongoDB directly
  const dbSosAfterCancel = await SosRequest.findById(createdSos.id);
  console.log('✓ MongoDB status after cancellation:', dbSosAfterCancel.status);

  // Simulate refresh: GET /api/v1/user/sos
  const userSosFetch = await makeRequest(`${API_BASE}/user/sos`, {
    headers: { Authorization: `Bearer ${citizenToken}` }
  });
  const userSosItemAfterCancel = userSosFetch.data.sosRequests.find((s) => s.id === createdSos.id);
  console.log('✓ Citizen GET /user/sos item status after refresh:', userSosItemAfterCancel?.status);

  // Simulate admin refresh: GET /api/v1/admin/sos
  const adminSosFetch = await makeRequest(`${API_BASE}/admin/sos`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const adminSosItemAfterCancel = adminSosFetch.data.sosRequests.find((s) => s.id === createdSos.id);
  console.log('✓ Admin GET /admin/sos item status after refresh:', adminSosItemAfterCancel?.status);

  const cancelPass =
    cancelRes.status === 200 &&
    cancelRes.data.sos.status === 'CANCELLED' &&
    dbSosAfterCancel.status === 'CANCELLED' &&
    userSosItemAfterCancel?.status === 'CANCELLED' &&
    adminSosItemAfterCancel?.status === 'CANCELLED';

  console.log(cancelPass ? '✓ TEST 2 RESULT: PASS' : '❌ TEST 2 RESULT: FAIL');

  // -------------------------------------------------------------------
  // TEST 3: MAP GEOGRAPHY (GeoJSON Polygon Coordinates Verification)
  // -------------------------------------------------------------------
  console.log('\n--- TEST 3: MAP GEOGRAPHY ---');
  const { KARNATAKA_DISTRICTS_GEOJSON } = require('../../../frontend/src/data/karnatakaDistricts');

  const districts = KARNATAKA_DISTRICTS_GEOJSON.features;
  let geoPass = true;

  districts.forEach((feature) => {
    const name = feature.properties.name;
    const center = feature.properties.center; // [lat, lng]
    const coords = feature.geometry.coordinates[0]; // array of [lng, lat]

    console.log(`Checking ${name}:`);
    console.log(`  Center: [${center[0]}°N, ${center[1]}°E]`);

    // Verify center is inside bounds of polygon coordinates
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    console.log(`  Lng Bounding Box: ${minLng.toFixed(2)}°E to ${maxLng.toFixed(2)}°E`);
    console.log(`  Lat Bounding Box: ${minLat.toFixed(2)}°N to ${maxLat.toFixed(2)}°N`);

    const validCenter = center[0] >= minLat && center[0] <= maxLat && center[1] >= minLng && center[1] <= maxLng;
    if (!validCenter) geoPass = false;
  });

  console.log(geoPass ? '✓ TEST 3 RESULT: PASS' : '❌ TEST 3 RESULT: FAIL');

  await mongoose.disconnect();
  process.exit(locPass && cancelPass && geoPass ? 0 : 1);
}

runTests().catch(console.error);
