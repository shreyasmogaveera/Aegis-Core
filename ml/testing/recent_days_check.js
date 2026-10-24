/**
 * recent_days_check.js
 *
 * Standalone Read-Only Historical 15-Day Ingestion & Prediction Audit
 * Date Range: 2026-09-27 through 2026-10-11 (15 days ending today)
 *
 * STRICT READ-ONLY:
 *  - Zero writes to MongoDB
 *  - No calls to backend /predictions/trigger
 *  - Only GET calls to weather/SMAP and POST calls to Flask ML service (port 5001)
 *  - Paced requests (~1.1s) to avoid Open-Meteo 503 rate-limiting
 *  - Output saved to ml/testing/recent_days_check_2026-10-11.csv (preserving previous CSV)
 */

const fs = require('fs');
const path = require('path');

// Ensure modules can resolve from backend/node_modules
module.paths.push(path.resolve(__dirname, '../../backend/node_modules'));

const dataIngestionService = require('../../backend/src/services/dataIngestionService');
const calibrationService = require('../../backend/src/services/calibrationService');

const FLASK_ML_BASE = process.env.ML_SERVICE_URL || 'http://localhost:5001/api/v1';

const DEFAULT_DATES = [
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11'
];

const DATES = process.env.AUDIT_DATES
  ? process.env.AUDIT_DATES.split(',').map((s) => s.trim())
  : DEFAULT_DATES;

const CSV_FILENAME = process.env.CSV_FILENAME || 'recent_days_check_2026-10-11.csv';

const EVAL_TARGETS = [
  { district: 'Kodagu', hazard: 'flood' },
  { district: 'Kodagu', hazard: 'landslide' },
  { district: 'Uttara Kannada', hazard: 'flood' },
  { district: 'Uttara Kannada', hazard: 'landslide' },
  { district: 'Belagavi', hazard: 'flood' },
  { district: 'Bagalkot', hazard: 'flood' }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callFlaskML(endpoint, body) {
  const url = `${FLASK_ML_BASE}/${endpoint}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Flask ML HTTP ${resp.status} on ${endpoint}: ${text}`);
  }
  return await resp.json();
}

async function runAudit() {
  console.log('================================================================================');
  console.log('       AegisCore 15-Day Standalone Ingestion & ML Prediction Audit');
  console.log('       Target Dates: 2026-09-27 to 2026-10-11 (15 days ending today)');
  console.log('       Flask ML Service Target:', FLASK_ML_BASE);
  console.log('       Output CSV Target:', CSV_FILENAME);
  console.log('================================================================================\n');

  const rows = [];

  for (const dateStr of DATES) {
    console.log(`>>> Processing Date: ${dateStr}`);

    for (const target of EVAL_TARGETS) {
      const { district, hazard } = target;

      let rain_mm = 'no data';
      let raw_prob = 'no data';
      let calibrated_prob = 'no data';
      let riskLevel = 'no data';

      try {
        // 1. Build live sequence using existing dataIngestionService logic
        const sequence = await dataIngestionService.buildLiveSequence(
          district,
          hazard,
          dateStr
        );

        // Extract target date rainfall from sequence row 0 of the last day
        if (sequence && sequence.length > 0) {
          const lastRow = sequence[sequence.length - 1];
          const rVal = lastRow[0];
          rain_mm = (rVal !== null && rVal !== undefined && Number.isFinite(rVal))
            ? Number(rVal).toFixed(1)
            : '0.0';
        }

        // 2. Call Flask ML service
        const mlEndpoint = hazard === 'landslide' ? 'predict/landslide' : 'predict/flood';
        const mlRes = await callFlaskML(mlEndpoint, {
          district,
          sequence,
          target_date: dateStr,
          mode: 'live'
        });

        // 3. Extract probabilities
        const rawNum = mlRes.raw_probability !== undefined && mlRes.raw_probability !== null
          ? mlRes.raw_probability
          : mlRes.event_probability;

        const calNum = mlRes.calibrated_probability !== undefined && mlRes.calibrated_probability !== null
          ? mlRes.calibrated_probability
          : null;

        if (rawNum !== null && rawNum !== undefined && Number.isFinite(rawNum)) {
          raw_prob = Number(rawNum).toFixed(4);
        }

        if (calNum !== null && calNum !== undefined && Number.isFinite(calNum)) {
          calibrated_prob = Number(calNum).toFixed(4);
        }

        // 4. Classify risk level using calibration service
        const calib = calibrationService.classifyRisk(
          hazard,
          district,
          rawNum,
          calNum
        );

        riskLevel = calib?.riskLevel || 'LOW';

      } catch (err) {
        console.warn(`  [WARN] Failed ${district} - ${hazard} on ${dateStr}:`, err.message);
      }

      const row = {
        date: dateStr,
        district,
        hazard: hazard.toUpperCase(),
        rain_mm,
        raw_prob,
        calibrated_prob,
        riskLevel
      };
      rows.push(row);

      console.log(`  [${dateStr}] [${district.padEnd(14)}] [${hazard.toUpperCase().padEnd(9)}] Rain: ${String(rain_mm).padStart(5)}mm | Raw: ${String(raw_prob).padStart(6)} | Cal: ${String(calibrated_prob).padStart(7)} | Tier: ${riskLevel}`);

      // Pacing delay between calls to prevent Open-Meteo burst 503 throttling
      await sleep(1100);
    }
    console.log('');
  }

  // Save new CSV without overwriting previous CSV
  const csvPath = path.resolve(__dirname, CSV_FILENAME);
  const csvHeaders = 'date,district,hazard,rain_mm,raw_prob,calibrated_prob,riskLevel';
  const csvLines = [csvHeaders];
  for (const r of rows) {
    csvLines.push(`${r.date},${r.district},${r.hazard},${r.rain_mm},${r.raw_prob},${r.calibrated_prob},${r.riskLevel}`);
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
  console.log(`\n✅ Results saved to new CSV: ${csvPath}\n`);

  return rows;
}

if (require.main === module) {
  runAudit().catch((err) => {
    console.error('Audit failed with fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runAudit };
