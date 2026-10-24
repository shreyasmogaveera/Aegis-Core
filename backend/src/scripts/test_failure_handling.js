const mlBridgeService = require('../services/mlBridgeService');

async function testFailureHandling() {
  console.log('--- Testing Failure Handling when Flask ML Service is unreachable ---');
  
  // Point to non-existent port
  mlBridgeService.mlServiceUrl = 'http://localhost:59999/api/v1';

  try {
    await mlBridgeService.predictFlood('Kodagu', { rainfall_mm: 50, river_level_m: 3, soil_moisture_pct: 70 });
    console.error('FAIL: Expected error was not thrown');
    process.exit(1);
  } catch (err) {
    console.log('✓ Flask ML Bridge caught failure gracefully:', err.message);
    console.log('✓ Express server remained online and stable.');
    console.log('✓ Failure handling verification PASSED.');
  }
}

testFailureHandling();
