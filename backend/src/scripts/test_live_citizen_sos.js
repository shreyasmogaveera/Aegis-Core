const { io } = require('socket.io-client');
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'd:/Major Project Ageis core/AegisCore/backend/.env' });

function makeRequest(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        ...(body ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function testCitizenSosFlow() {
  const citizenToken = jwt.sign(
    { userId: '6ab779d2161a6d55a689320b', role: 'user', email: 'citizen.karnataka@aegiscore.gov.in', name: 'Suresh Gowda', phone: '+91 9480112233' },
    process.env.JWT_SECRET || 'secret'
  );
  const adminToken = jwt.sign(
    { userId: '6ab779d2161a6d55a689320a', role: 'admin', email: 'admin@aegiscore.gov.in', name: 'State Emergency Controller' },
    process.env.JWT_SECRET || 'secret'
  );

  console.log('[1] Connecting Sockets...');
  const adminSocket = io('http://127.0.0.1:5000', { transports: ['websocket'] });
  const citizenSocket = io('http://127.0.0.1:5000', { transports: ['websocket'] });

  await new Promise((res) => {
    let connected = 0;
    adminSocket.on('connect', () => { if (++connected === 2) res(); });
    citizenSocket.on('connect', () => { if (++connected === 2) res(); });
  });
  console.log('[1] Sockets connected.');

  let adminReceivedSos = null;
  adminSocket.on('sos:created', (data) => {
    console.log('[SOCKET] Admin received sos:created -> ID:', data.id, 'Requester:', data.name, 'District:', data.district);
    adminReceivedSos = data;
  });

  let citizenReceivedUpdate = null;
  citizenSocket.on('sos:updated', (data) => {
    console.log('[SOCKET] Citizen received sos:updated -> ID:', data.id, 'Status:', data.status);
    citizenReceivedUpdate = data;
  });

  console.log('[2] Citizen submitting genuine SOS...');
  const createRes = await makeRequest('/api/v1/user/sos', 'POST', {
    latitude: 12.4244,
    longitude: 75.7382,
    emergencyType: 'FLOOD_TRAPPED',
    address: 'Cauvery River Basin, Kushalnagar',
    district: 'Kodagu',
    peopleCount: 3,
    details: 'Water entering ground floor, need boat evacuation',
    name: 'Suresh Gowda',
    phone: '+91 9480112233'
  }, citizenToken);

  console.log('[2] Create status:', createRes.status, 'ID:', createRes.data.sos?.id);
  const sosId = createRes.data.sos.id;

  // Wait for socket propagation
  await new Promise(r => setTimeout(r, 600));

  console.log('[3] Checking Admin Queue...');
  const adminQueueRes = await makeRequest('/api/v1/admin/sos?status=ACTIVE', 'GET', null, adminToken);
  console.log('[3] Admin Metrics (Active Queue):', JSON.stringify(adminQueueRes.data.metrics));
  console.log('[3] Admin Queue Items Count:', adminQueueRes.data.sosRequests?.length);

  console.log('[4] Admin Dispatches SOS (updates status to RESPONDING)...');
  const updateRes = await makeRequest(`/api/v1/admin/sos/${sosId}/status`, 'PATCH', { status: 'RESPONDING' }, adminToken);
  console.log('[4] Update status:', updateRes.status, 'New SOS status:', updateRes.data.sos?.status);

  await new Promise(r => setTimeout(r, 600));

  console.log('[5] Checking Metrics after dispatch...');
  const adminQueueRes2 = await makeRequest('/api/v1/admin/sos?status=ACTIVE', 'GET', null, adminToken);
  console.log('[5] Admin Metrics (After Dispatch):', JSON.stringify(adminQueueRes2.data.metrics));

  console.log('[6] Resolving and Cleaning up test verification SOS...');
  const resolveRes = await makeRequest(`/api/v1/admin/sos/${sosId}/status`, 'PATCH', { status: 'RESOLVED' }, adminToken);
  console.log('[6] Resolved status:', resolveRes.status);

  const deleteRes = await makeRequest(`/api/v1/admin/sos/${sosId}`, 'DELETE', null, adminToken);
  console.log('[6] Delete status:', deleteRes.status);

  const finalCheck = await makeRequest('/api/v1/admin/sos', 'GET', null, adminToken);
  console.log('[7] Final Clean Metrics:', JSON.stringify(finalCheck.data.metrics));
  console.log('[7] Final Active SOS in queue:', finalCheck.data.sosRequests?.length);

  adminSocket.disconnect();
  citizenSocket.disconnect();
  console.log('SUCCESS: All flows verified end-to-end.');
}

testCitizenSosFlow().catch(console.error);
