require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const smapService = require('../services/smapService');
const dataIngestionService = require('../services/dataIngestionService');
const mlBridgeService = require('../services/mlBridgeService');

async function runVerification() {
  console.log('='.repeat(80));
  console.log('  AEGISCORE -- NASA SMAP INTEGRATION END-TO-END VERIFICATION');
  console.log('='.repeat(80));

  const targetDate = '2026-09-26';
  const district = 'Kodagu';

  // 1. Test smapService
  console.log('\n[1/4] Testing smapService.getDistrictSoilMoisture for Kodagu...');
  const smapData = await smapService.getDistrictSoilMoisture(district, targetDate);
  console.log('SMAP Result:', JSON.stringify(smapData, null, 2));

  if (!smapData.available || smapData.soilMoisture === null) {
    throw new Error('smapService failed to retrieve available soil moisture telemetry');
  }

  // 2. Test dataIngestionService.buildLiveSequence
  console.log('\n[2/4] Testing dataIngestionService.buildLiveSequence for Landslide...');
  const sequence = await dataIngestionService.buildLiveSequence(district, 'landslide', targetDate);
  console.log(`Generated Sequence Shape: ${sequence.length} timesteps x ${sequence[0].length} channels`);

  if (sequence.length !== 30 || sequence[0].length !== 15) {
    throw new Error(`Invalid sequence shape: expected (30, 15), got (${sequence.length}, ${sequence[0].length})`);
  }

  // Inspect the target date timestep (last row, index 29)
  const targetRow = sequence[29];
  console.log('\n[3/4] Inspecting Target Date Timestep (t = 2026-09-26):');
  console.log('  Channel 0  (Rainfall mm):             ', targetRow[0]);
  console.log('  Channel 1  (3d sum mm):               ', targetRow[1]);
  console.log('  Channel 2  (7d sum mm):               ', targetRow[2]);
  console.log('  Channel 3  (15d sum mm):              ', targetRow[3]);
  console.log('  Channel 4  (30d sum mm):              ', targetRow[4]);
  console.log('  Channel 5  (causal_smap_age_days):    ', targetRow[5]);
  console.log('  Channel 6  (AM_soil_moisture m3/m3):  ', targetRow[6]);
  console.log('  Channel 7  (PM_soil_moisture m3/m3):  ', targetRow[7]);
  console.log('  Channel 8  (AM_available flag):       ', targetRow[8]);
  console.log('  Channel 9  (PM_available flag):       ', targetRow[9]);
  console.log('  Channel 10 (SMAP_same_day flag):      ', targetRow[10]);
  console.log('  Channel 11 (terrain_elevation):       ', targetRow[11]);
  console.log('  Channel 12 (terrain_slope):           ', targetRow[12]);
  console.log('  Channel 13 (terrain_aspect):          ', targetRow[13]);
  console.log('  Channel 14 (terrain_curvature):       ', targetRow[14]);

  // Inspect an antecedent row (e.g. step 10, ~19 days ago, where SMAP should be unavailable due to causal age > 7)
  const antecedentRow = sequence[10];
  console.log('\nInspecting Antecedent Timestep (step 10, > 7 days prior to observation):');
  console.log('  Channel 5 (causal_smap_age_days):     ', antecedentRow[5]);
  console.log('  Channel 6 (AM_soil_moisture):         ', antecedentRow[6]);
  console.log('  Channel 8 (AM_available flag):       ', antecedentRow[8]);
  console.log('  Channel 10 (SMAP_same_day flag):      ', antecedentRow[10]);

  // 3. Test Full ML Model Inference via mlBridgeService
  console.log('\n[4/4] Executing Live Inference via ML Bridge (Frozen LSTM Model)...');
  const mlResult = await mlBridgeService.predictLandslide(district, {
    target_date: targetDate,
    mode: 'live',
    sequence
  });

  console.log('\n authoritatively returned ML Result:');
  console.log(JSON.stringify(mlResult, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('[SUCCESS] FULL END-TO-END VERIFICATION PASS');
  console.log('='.repeat(80));
}

runVerification().catch((err) => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
