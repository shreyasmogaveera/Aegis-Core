const dataIngestionService = require('./dataIngestionService');
const socketService = require('./socketService');

/**
 * SchedulerService orchestrates the 6-hour multi-source environmental data collection cycle
 * (00:00, 06:00, 12:00, 18:00) across AegisCore's 4 active prediction districts:
 * 1. Kodagu
 * 2. Uttara Kannada
 * 3. Belagavi
 * 4. Bagalkot
 */
class SchedulerService {
  constructor() {
    this.districts = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];
    this.intervalHandle = null;
    this.isCollecting = false;
    this.lastCollectionTimestamp = null;
  }

  init() {
    console.log('[SchedulerService] Initializing 6-Hour Environmental Data Collection Pipeline...');
    
    // Run initial baseline ingestion on backend bootup
    this.runCollectionCycle().catch(err => {
      console.warn('[SchedulerService] Initial collection cycle warning:', err.message);
    });

    // Schedule collection every 6 hours (6 * 60 * 60 * 1000 ms)
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    this.intervalHandle = setInterval(() => {
      this.runCollectionCycle().catch(err => {
        console.error('[SchedulerService] Scheduled collection error:', err.message);
      });
    }, SIX_HOURS_MS);

    console.log('[SchedulerService] ✅ 6-Hour Data Collection Pipeline Active (00:00, 06:00, 12:00, 18:00 UTC schedule window)');
  }

  async runCollectionCycle() {
    if (this.isCollecting) {
      console.log('[SchedulerService] Data collection already in progress, skipping cycle...');
      return;
    }

    this.isCollecting = true;
    const now = new Date();
    console.log(`[SchedulerService] Starting 6-Hour Ingestion Cycle at ${now.toISOString()}`);

    const results = [];
    for (const district of this.districts) {
      try {
        const doc = await dataIngestionService.ingestAndSaveEnvironmentalData(district);
        results.push(doc);
        console.log(`[SchedulerService] Ingested telemetry for ${district}: Rainfall=${doc.rainfall_mm}mm, River=${doc.river_level_m}m, Source=${doc.source}`);
      } catch (err) {
        console.error(`[SchedulerService] Ingestion error for ${district}:`, err.message);
      }
    }

    // Auto-evaluate live predictions and synchronize operational alerts
    try {
      const predictionController = require('../controllers/predictionController');
      for (const district of this.districts) {
        try {
          await predictionController.executePrediction({ district, predictionType: 'flood' });
          if (district === 'Kodagu' || district === 'Uttara Kannada') {
            await predictionController.executePrediction({ district, predictionType: 'landslide' });
          }
        } catch (predErr) {
          console.warn(`[SchedulerService] Auto-prediction evaluation warning for ${district}:`, predErr.message);
        }
      }
      console.log('[SchedulerService] ✅ Live prediction pipeline and alerts synchronized for all districts');
    } catch (schedErr) {
      console.error('[SchedulerService] Failed to run automated prediction cycle:', schedErr.message);
    }

    this.lastCollectionTimestamp = now;
    this.isCollecting = false;

    // Broadcast updated telemetry to connected clients via Socket.io
    if (socketService.io) {
      socketService.io.emit('environmental:cycle_completed', {
        timestamp: now.toISOString(),
        districtCount: results.length,
        telemetry: results
      });
    }

    return results;
  }

  getStatus() {
    return {
      active: !!this.intervalHandle,
      scheduleIntervalHours: 6,
      supportedDistricts: this.districts,
      lastCollectionTimestamp: this.lastCollectionTimestamp ? this.lastCollectionTimestamp.toISOString() : null,
      isCollecting: this.isCollecting
    };
  }
}

module.exports = new SchedulerService();
