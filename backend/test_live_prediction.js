const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dataIngestionService = require('./src/services/dataIngestionService');
const mlBridgeService = require('./src/services/mlBridgeService');

async function testLivePrediction() {
  console.log('====================================================');
  console.log('TEST 1: Ingesting Live Data for Kodagu (Current Date)');
  console.log('====================================================');
  const envData = await dataIngestionService.getEnvironmentalData('Kodagu');
  console.log('District:', envData.district);
  console.log('Source:', envData.source);
  console.log('Rainfall (mm):', envData.rainfall_mm);
  console.log('River Level (m MSL):', envData.river_level_m);
  console.log('Soil Moisture (%):', envData.soil_moisture_pct);
  console.log('Temperature (°C):', envData.temperature_c);
  console.log('Humidity (%):', envData.humidity_pct);

  console.log('\n====================================================');
  console.log('TEST 2: Building Live 15x15 Sequence for Kodagu (Current Date)');
  console.log('====================================================');
  const liveSeq = await dataIngestionService.buildLiveSequence('Kodagu', 'flood');
  console.log('Live Sequence Shape:', liveSeq.length, 'x', liveSeq[0].length);
  console.log('Day 15 Features (Rain, AM_Soil, PM_Soil, WL_1..12):');
  console.log(liveSeq[14].slice(0, 15).map(v => (v !== null ? Number(v.toFixed(2)) : null)));

  console.log('\n====================================================');
  console.log('TEST 3: Calling ML Service (Flask Port 5001) with Live Sequence');
  console.log('====================================================');
  const mlRes = await mlBridgeService.predictFlood('Kodagu', { sequence: liveSeq });
  console.log('Live Prediction Result:');
  console.log(JSON.stringify(mlRes, null, 2));

  console.log('\n====================================================');
  console.log('TEST 4: Historical Validation (2023-07-05 Confirmed Flood Event)');
  console.log('====================================================');
  const histSeq = await dataIngestionService.buildLiveSequence('Kodagu', 'flood', '2023-07-05');
  console.log('Historical Sequence Shape:', histSeq.length, 'x', histSeq[0].length);
  const histRes = await mlBridgeService.predictFlood('Kodagu', { sequence: histSeq, target_date: '2023-07-05' });
  console.log('2023-07-05 Prediction Result:');
  console.log('  Event Probability:', histRes.event_probability);
  console.log('  Status:', histRes.prediction_status);

  console.log('\n====================================================');
  console.log('TEST 5: Landslide Live Sequence (30x15 Shape)');
  console.log('====================================================');
  const lsSeq = await dataIngestionService.buildLiveSequence('Kodagu', 'landslide');
  console.log('Landslide Sequence Shape:', lsSeq.length, 'x', lsSeq[0].length);
  const lsRes = await mlBridgeService.predictLandslide('Kodagu', { sequence: lsSeq });
  console.log('Landslide Prediction Result:');
  console.log('  Event Probability:', lsRes.event_probability);
  console.log('  Status:', lsRes.prediction_status);

  console.log('\nALL TESTS COMPLETED SUCCESSFULLY!');
}

testLivePrediction().catch(err => {
  console.error('Test failed with error:', err.response?.data || err.message);
  process.exit(1);
});
