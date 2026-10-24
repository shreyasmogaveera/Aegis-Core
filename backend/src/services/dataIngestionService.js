const EnvironmentalData = require('../models/EnvironmentalData');
const smapService = require('./smapService');

/**
 * DataIngestionService
 *
 * Live environmental data ingestion using Open-Meteo Weather Forecast/Archive
 * and GloFAS Flood APIs.
 *
 * Implements:
 * 1. Live Weather (Rainfall, Temperature, Humidity)
 * 2. Hourly Volumetric Soil Moisture (AM 06:00 and PM 18:00 IST)
 * 3. 5-Point River Reach Discharge with Statistical Z-Score Rescaling
 *    mapped to district-specific active channels:
 *      Bagalkot:        Channels 1, 2, 6, 10, 12
 *      Belagavi:        Channels 3, 5, 9, 14
 *      Kodagu:          Channels 4, 7, 8, 11
 *      Uttara Kannada:  Channel 13
 * 4. Automatic Sequence Construction for Flood (15x15) and Landslide (30x15)
 * 5. Full conformance to EnvironmentalData Mongoose schema
 */

const DISTRICT_COORDS = {
  Kodagu: { lat: 12.4244, lon: 75.7382, lngLat: [75.7382, 12.4244] },
  'Uttara Kannada': { lat: 14.8153, lon: 74.6868, lngLat: [74.6868, 14.8153] },
  Belagavi: { lat: 15.8497, lon: 74.4977, lngLat: [74.4977, 15.8497] },
  Bagalkot: { lat: 16.1853, lon: 75.6868, lngLat: [75.6868, 16.1853] }
};

const DISTRICT_RIVER_POINTS = {
  Kodagu: [
    { lat: 12.3900, lon: 75.5300, name: 'Cauvery - Upstream Bhagamandala/Talakaveri' },
    { lat: 12.4244, lon: 75.7382, name: 'Cauvery - Mid-upstream Madikeri Basin' },
    { lat: 12.4550, lon: 75.9600, name: 'Cauvery - Midstream Kushalnagar' },
    { lat: 12.5000, lon: 75.8700, name: 'Harangi Tributary - Somwarpet/Harangi Reservoir' },
    { lat: 12.4700, lon: 76.0100, name: 'Cauvery - Downstream Kudige Border' }
  ],
  Belagavi: [
    { lat: 15.6300, lon: 74.5200, name: 'Malaprabha - Upstream Khanapur Ghats' },
    { lat: 16.5800, lon: 74.5900, name: 'Krishna - Chikkodi/Kallol Confluence' },
    { lat: 16.1500, lon: 74.6300, name: 'Ghataprabha - Hidkal Dam/Hukkeri' },
    { lat: 16.1700, lon: 74.8300, name: 'Ghataprabha - Gokak Falls/Gokak' },
    { lat: 15.7700, lon: 75.1200, name: 'Malaprabha - Saundatti/Navilatirtha Dam' }
  ],
  Bagalkot: [
    { lat: 16.3400, lon: 75.2900, name: 'Ghataprabha - Mudhol Basin' },
    { lat: 16.1853, lon: 75.6868, name: 'Ghataprabha - Bagalkot City/Bilagi Reach' },
    { lat: 16.5100, lon: 75.2900, name: 'Krishna - Jamkhandi Reach' },
    { lat: 16.3300, lon: 75.8900, name: 'Krishna - Almatti Dam Forebay' },
    { lat: 15.9200, lon: 75.6800, name: 'Malaprabha - Badami/Cholachagudda' }
  ],
  'Uttara Kannada': [
    { lat: 15.2400, lon: 74.6200, name: 'Kali - Dandeli/Supa Dam Upstream' },
    { lat: 14.9000, lon: 74.3300, name: 'Kali - Kadra Dam/Mallapur Midstream' },
    { lat: 14.8153, lon: 74.1300, name: 'Kali - Karwar Estuary Downstream' },
    { lat: 14.2800, lon: 74.4500, name: 'Sharavathi - Gersoppa/Honnavar Downstream' },
    { lat: 14.5300, lon: 74.4200, name: 'Aghanashini - Sirsi/Kumta Basin' }
  ]
};

const DISTRICT_ACTIVE_CHANNELS = {
  Bagalkot: [1, 2, 6, 10, 12],
  Belagavi: [3, 5, 9, 14],
  Kodagu: [4, 7, 8, 11],
  'Uttara Kannada': [13]
};

// Training dataset channel statistics in meters MSL (from Flood_Sequences_M7_FROZEN.npz)
const TRAINING_CHANNEL_STATS = {
  1: { mean: 514.54, std: 4.85 },
  2: { mean: 524.87, std: 1.58 },
  3: { mean: 539.51, std: 1.19 },
  4: { mean: 863.89, std: 27.98 },
  5: { mean: 653.68, std: 23.71 },
  6: { mean: 522.67, std: 14.52 },
  7: { mean: 823.06, std: 93.11 },
  8: { mean: 879.74, std: 3.33 },
  9: { mean: 628.32, std: 25.81 },
  10: { mean: 482.64, std: 155.14 },
  11: { mean: 858.78, std: 3.10 },
  12: { mean: 489.89, std: 2.11 },
  13: { mean: 11.69, std: 1.47 },
  14: { mean: 529.37, std: 9.20 }
};

// District terrain representations frozen in M12 contracts
const DISTRICT_TERRAIN = {
  Kodagu: {
    elevation: 809.2864,
    slope: 8.361528,
    aspect: 183.026977,
    curvature: 0.000063
  },
  'Uttara Kannada': {
    elevation: 425.01316,
    slope: 5.729603,
    aspect: 188.525166,
    curvature: 0.000039
  }
};

// Open-Meteo GloFAS baseline discharge statistics per reach (m3/s)
const DISCHARGE_BASELINE_STATS = {
  Bagalkot: [
    { mean: 0.02, std: 0.03 },
    { mean: 42.63, std: 130.52 },
    { mean: 0.04, std: 0.03 },
    { mean: 312.06, std: 914.39 },
    { mean: 0.02, std: 0.02 }
  ],
  Belagavi: [
    { mean: 12.48, std: 35.09 },
    { mean: 268.65, std: 776.66 },
    { mean: 34.72, std: 108.69 },
    { mean: 41.51, std: 128.53 },
    { mean: 0.04, std: 0.06 }
  ],
  Kodagu: [
    { mean: 3.03, std: 4.37 },
    { mean: 0.82, std: 1.41 },
    { mean: 0.09, std: 0.17 },
    { mean: 11.82, std: 20.73 },
    { mean: 0.07, std: 0.11 }
  ],
  'Uttara Kannada': [
    { mean: 24.74, std: 78.83 },
    { mean: 0.81, std: 2.38 },
    { mean: 1.36, std: 2.41 },
    { mean: 108.68, std: 65.17 },
    { mean: 1.07, std: 2.85 }
  ]
};

// Variance floor and clipping guardrails to protect against near-zero variance
// micro-reaches producing artificially massive z-scores across all districts
const MIN_DISCHARGE_STD_FLOOR = 1.0; // m3/s
const MAX_DISCHARGE_Z_BOUND = 3.0; // standard deviations

class DataIngestionService {
  constructor() {
    this.dataSource = (process.env.DATA_SOURCE || 'live').trim().toLowerCase();
    this.allowedDistricts = ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'];
  }

  normalizeDistrict(district = 'Kodagu') {
    const normalized = this.allowedDistricts.find(
      (d) => d.toLowerCase() === String(district).trim().toLowerCase()
    );

    if (!normalized) {
      throw new Error(`Unsupported district: ${district}`);
    }

    return normalized;
  }

  assertRealProviderConfigured() {
    if (this.dataSource === 'mock') {
      throw new Error(
        'Live environmental data unavailable: DATA_SOURCE is set to mock'
      );
    }
    // 'live' or 'open-meteo' are authorised production modes
  }

  async _fetchWithRetry(url, options = {}, retries = 3, delayMs = 1000) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': 'AegisCore/1.0',
            ...(options.headers || {})
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    throw new Error(`Request to ${url} failed after ${retries} attempts: ${lastErr.message}`);
  }

  /**
   * Fetch weather data from Open-Meteo.
   * If targetDate is historical (> 90 days ago), queries the Archive API.
   * Otherwise queries the Forecast API with lookback.
   */
  async fetchLiveWeatherData(district, targetDateStr = null) {
    this.assertRealProviderConfigured();
    const normalized = this.normalizeDistrict(district);
    const coords = DISTRICT_COORDS[normalized];

    const todayStr = new Date().toISOString().split('T')[0];
    const target = targetDateStr || todayStr;

    const diffDays = Math.round(
      (new Date(todayStr) - new Date(target)) / (1000 * 60 * 60 * 24)
    );

    let url;

    if (diffDays > 80 || diffDays < 0) {
      // Historical or Archive query
      const targetDt = new Date(target);
      const startDt = new Date(targetDt);
      startDt.setDate(startDt.getDate() - 35);
      const startStr = startDt.toISOString().split('T')[0];

      url = `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}&start_date=${startStr}&end_date=${target}&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean&hourly=soil_moisture_0_to_7cm&timezone=Asia/Kolkata`;
    } else {
      // Near-real-time / Forecast query with past lookback
      url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean&hourly=soil_moisture_0_to_7cm&past_days=35&forecast_days=1&timezone=Asia/Kolkata`;
    }

    return await this._fetchWithRetry(url);
  }

  /**
   * Fetch river reach discharge from Open-Meteo Flood API.
   */
  async fetchLiveRiverDischarge(district, targetDateStr = null) {
    this.assertRealProviderConfigured();
    const normalized = this.normalizeDistrict(district);
    const reachPoints = DISTRICT_RIVER_POINTS[normalized];

    const todayStr = new Date().toISOString().split('T')[0];
    const target = targetDateStr || todayStr;

    const targetDt = new Date(target);
    const startDt = new Date(targetDt);
    startDt.setDate(startDt.getDate() - 20);

    const startStr = startDt.toISOString().split('T')[0];
    const lats = reachPoints.map((p) => p.lat).join(',');
    const lons = reachPoints.map((p) => p.lon).join(',');

    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lons}&start_date=${startStr}&end_date=${target}&daily=river_discharge`;

    return await this._fetchWithRetry(url);
  }

  /**
   * Get current / latest environmental telemetry matching EnvironmentalData schema.
   */
  async getEnvironmentalData(district = 'Kodagu') {
    const normalized = this.normalizeDistrict(district);
    const coords = DISTRICT_COORDS[normalized];

    const weatherData = await this.fetchLiveWeatherData(normalized);
    const floodData = await this.fetchLiveRiverDischarge(normalized);

    // Latest daily weather values
    const dailyTimes = weatherData.daily.time || [];
    const precipArr = weatherData.daily.precipitation_sum || [];
    const tempArr = weatherData.daily.temperature_2m_max || [];
    const humArr = weatherData.daily.relative_humidity_2m_mean || [];

    const latestIdx = dailyTimes.length - 1;
    const rainfall_mm = precipArr[latestIdx] !== null && precipArr[latestIdx] !== undefined
      ? Number(precipArr[latestIdx])
      : 0.0;
    const temperature_c = tempArr[latestIdx] !== null && tempArr[latestIdx] !== undefined
      ? Number(tempArr[latestIdx])
      : 24.5;
    const humidity_pct = humArr[latestIdx] !== null && humArr[latestIdx] !== undefined
      ? Number(humArr[latestIdx])
      : 80.0;

    // Latest soil moisture: priority NASA SMAP L4 (SPL4SMGP), fallback Open-Meteo
    // Hydrological standard: volumetric soil water content theta (m3/m3) in 0-7cm surface layer.
    // Both NASA SMAP L4 and Open-Meteo report theta in m3/m3.
    // Baseline mean across Karnataka training regions is ~0.352 m3/m3.
    let volumetric_sm = 0.352;
    let smSource = 'open-meteo';
    try {
      const smap = await smapService.getDistrictSoilMoisture(normalized);
      if (smap && smap.available && smap.soilMoisture !== null) {
        volumetric_sm = Number(Number(smap.soilMoisture).toFixed(4));
        smSource = 'NASA SMAP L4';
      } else if (weatherData.hourly && weatherData.hourly.soil_moisture_0_to_7cm) {
        const smArr = weatherData.hourly.soil_moisture_0_to_7cm;
        const validSm = smArr.filter((v) => v !== null && v !== undefined);
        if (validSm.length > 0) {
          volumetric_sm = Number(Number(validSm[validSm.length - 1]).toFixed(4));
        }
      }
    } catch (err) {
      if (weatherData.hourly && weatherData.hourly.soil_moisture_0_to_7cm) {
        const smArr = weatherData.hourly.soil_moisture_0_to_7cm;
        const validSm = smArr.filter((v) => v !== null && v !== undefined);
        if (validSm.length > 0) {
          volumetric_sm = Number(Number(validSm[validSm.length - 1]).toFixed(4));
        }
      }
    }

    // Unified volumetric moisture percentage: theta * 100
    // (Volumetric water content as % of bulk soil volume: e.g. 0.352 m3/m3 = 35.2%)
    // Identical formula for both SMAP and Open-Meteo ensures consistency regardless of active source.
    const soil_moisture_pct = Math.min(100, Math.max(0, Number((volumetric_sm * 100).toFixed(1))));

    // Primary river reach discharge converted to rescaled water level (meters MSL)
    let river_level_m = TRAINING_CHANNEL_STATS[DISTRICT_ACTIVE_CHANNELS[normalized][0]].mean;
    const primaryPtDischarges = Array.isArray(floodData) ? floodData[0] : floodData;
    if (
      primaryPtDischarges &&
      primaryPtDischarges.daily &&
      primaryPtDischarges.daily.river_discharge
    ) {
      const qArr = primaryPtDischarges.daily.river_discharge.filter((v) => v !== null);
      if (qArr.length > 0) {
        const latestQ = qArr[qArr.length - 1];
        const baseStats = DISCHARGE_BASELINE_STATS[normalized][0];
        const primaryChannel = DISTRICT_ACTIVE_CHANNELS[normalized][0];
        const effStd = Math.max(baseStats.std, MIN_DISCHARGE_STD_FLOOR);
        const rawZ = (latestQ - baseStats.mean) / effStd;
        const z = Math.max(-MAX_DISCHARGE_Z_BOUND, Math.min(MAX_DISCHARGE_Z_BOUND, rawZ));
        river_level_m = Number(
          (TRAINING_CHANNEL_STATS[primaryChannel].mean + z * TRAINING_CHANNEL_STATS[primaryChannel].std).toFixed(2)
        );
      }
    }

    return {
      district: normalized,
      location: {
        type: 'Point',
        coordinates: coords.lngLat
      },
      rainfall_mm,
      river_level_m,
      soil_moisture_pct,
      volumetric_sm,
      temperature_c,
      humidity_pct,
      source: smSource === 'NASA SMAP L4' ? 'NASA SMAP / Open-Meteo' : 'open-meteo',
      timestamp: new Date()
    };
  }

  async getWeatherData(district = 'Kodagu') {
    const data = await this.getEnvironmentalData(district);
    return {
      district: data.district,
      rainfall_mm: data.rainfall_mm,
      temperature_c: data.temperature_c,
      humidity_pct: data.humidity_pct,
      source: data.source
    };
  }

  async getRiverData(district = 'Kodagu') {
    const data = await this.getEnvironmentalData(district);
    return {
      district: data.district,
      river_level_m: data.river_level_m,
      source: data.source
    };
  }

  async getSoilData(district = 'Kodagu') {
    const normalized = this.normalizeDistrict(district);
    try {
      const smap = await smapService.getDistrictSoilMoisture(normalized);
      if (smap && smap.available && smap.soilMoisture !== null) {
        const volSm = Number(Number(smap.soilMoisture).toFixed(4));
        return {
          district: normalized,
          volumetric_sm: volSm,
          soil_moisture_pct: Number((volSm * 100).toFixed(1)),
          units: smap.units || 'm3/m3',
          causal_smap_age_days: smap.ageDays,
          smap_status: smap.smapStatus,
          granule_id: smap.granuleId,
          source: smap.source
        };
      }
    } catch (err) {
      console.warn(`[DataIngestionService] SMAP soil retrieval error: ${err.message}`);
    }

    const data = await this.getEnvironmentalData(normalized);
    return {
      district: data.district,
      volumetric_sm: data.volumetric_sm,
      soil_moisture_pct: data.soil_moisture_pct,
      units: 'm3/m3',
      source: data.source
    };
  }

  /**
   * Build the exact standardized M12 sequence tensor for model inference:
   *  - Flood:     (15, 15)
   *  - Landslide: (30, 15)
   */
  async buildLiveSequence(district, hazardType = 'flood', targetDateStr = null) {
    const normalized = this.normalizeDistrict(district);
    const hazard = String(hazardType).toLowerCase();

    const todayStr = new Date().toISOString().split('T')[0];
    const targetDate = targetDateStr || todayStr;
    const targetDt = new Date(targetDate);

    const weatherData = await this.fetchLiveWeatherData(normalized, targetDate);

    // Build date-indexed maps for rainfall and soil moisture
    const dailyRainfall = {};
    if (weatherData.daily && weatherData.daily.time) {
      for (let i = 0; i < weatherData.daily.time.length; i += 1) {
        const d = weatherData.daily.time[i];
        const p = weatherData.daily.precipitation_sum[i];
        dailyRainfall[d] = p !== null && p !== undefined ? Number(p) : 0.0;
      }
    }

    const amSoil = {};
    const pmSoil = {};
    if (weatherData.hourly && weatherData.hourly.time) {
      for (let i = 0; i < weatherData.hourly.time.length; i += 1) {
        const tStr = weatherData.hourly.time[i];
        const smVal = weatherData.hourly.soil_moisture_0_to_7cm[i];
        if (tStr.includes('T06:00')) {
          const dKey = tStr.split('T')[0];
          amSoil[dKey] = smVal !== null ? Number(smVal) : null;
        } else if (tStr.includes('T18:00')) {
          const dKey = tStr.split('T')[0];
          pmSoil[dKey] = smVal !== null ? Number(smVal) : null;
        }
      }
    }

    if (hazard === 'flood') {
      // 15 timesteps x 15 channels
      const floodData = await this.fetchLiveRiverDischarge(normalized, targetDate);

      // Parse multi-point discharge streams
      const pointDischarges = [];
      if (Array.isArray(floodData)) {
        for (const ptItem of floodData) {
          const ptDict = {};
          if (ptItem.daily && ptItem.daily.time) {
            for (let i = 0; i < ptItem.daily.time.length; i += 1) {
              const d = ptItem.daily.time[i];
              const q = ptItem.daily.river_discharge[i];
              ptDict[d] = q !== null && q !== undefined ? Number(q) : null;
            }
          }
          pointDischarges.push(ptDict);
        }
      }

      const activeChannels = DISTRICT_ACTIVE_CHANNELS[normalized];
      const baselineStats = DISCHARGE_BASELINE_STATS[normalized];

      const sequence = [];
      for (let step = 0; step < 15; step += 1) {
        const dayDt = new Date(targetDt);
        dayDt.setDate(dayDt.getDate() - (14 - step));
        const dayStr = dayDt.toISOString().split('T')[0];

        const row = new Array(15).fill(null);

        // Channel 0: Daily Rainfall
        row[0] = dailyRainfall[dayStr] !== undefined ? dailyRainfall[dayStr] : 0.0;

        // Active district channels: statistical z-score rescaling with variance floor & clipping
        for (let i = 0; i < activeChannels.length; i += 1) {
          const channelIdx = activeChannels[i];
          if (i < pointDischarges.length) {
            const rawQ = pointDischarges[i][dayStr];
            if (rawQ !== null && rawQ !== undefined && Number.isFinite(rawQ)) {
              const base = baselineStats[i];
              const effStd = Math.max(base.std, MIN_DISCHARGE_STD_FLOOR);
              const rawZ = (rawQ - base.mean) / effStd;
              const z = Math.max(-MAX_DISCHARGE_Z_BOUND, Math.min(MAX_DISCHARGE_Z_BOUND, rawZ));
              const trainChan = TRAINING_CHANNEL_STATS[channelIdx];
              row[channelIdx] = Number((trainChan.mean + z * trainChan.std).toFixed(4));
            }
          }
        }

        sequence.push(row);
      }

      return sequence;
    }

    if (hazard === 'landslide') {
      // 30 timesteps x 15 channels
      const terrain = DISTRICT_TERRAIN[normalized] || DISTRICT_TERRAIN['Kodagu'];
      const smapTelemetry = await smapService.getDistrictSoilMoisture(normalized, targetDate);

      let obsDt = null;
      if (smapTelemetry && smapTelemetry.observationDate) {
        obsDt = new Date(smapTelemetry.observationDate);
      }

      const sequence = [];
      for (let step = 0; step < 30; step += 1) {
        const dayDt = new Date(targetDt);
        dayDt.setDate(dayDt.getDate() - (29 - step));
        const dayStr = dayDt.toISOString().split('T')[0];

        const row = new Array(15).fill(null);

        // Channel 0: Daily Rainfall
        row[0] = dailyRainfall[dayStr] !== undefined ? dailyRainfall[dayStr] : 0.0;

        // Rolling rainfall helper
        const getRollingSum = (windowDays) => {
          let sum = 0.0;
          for (let w = 0; w < windowDays; w += 1) {
            const prevDt = new Date(dayDt);
            prevDt.setDate(prevDt.getDate() - w);
            const prevStr = prevDt.toISOString().split('T')[0];
            sum += dailyRainfall[prevStr] || 0.0;
          }
          return Number(sum.toFixed(2));
        };

        // Channels 1-4: Rolling sums
        row[1] = getRollingSum(3);
        row[2] = getRollingSum(7);
        row[3] = getRollingSum(15);
        row[4] = getRollingSum(30);

        // Channels 5-10: Causal SMAP Observation Integration
        // Per M12 Contract:
        // - Latest observation on or before dayDt
        // - Maximum causal age: 7 days
        // - Future observations strictly prohibited
        let stepAgeDays = null;
        let smapAvailableForStep = false;

        if (obsDt && smapTelemetry.available && smapTelemetry.soilMoisture !== null) {
          const diffMs = dayDt.getTime() - obsDt.getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays <= 7) {
            stepAgeDays = diffDays;
            smapAvailableForStep = true;
          }
        }

        if (smapAvailableForStep) {
          // Channel 5: Causal observation age in days
          row[5] = Number(stepAgeDays.toFixed(1));
          // Channels 6-7: AM / PM volumetric soil moisture (m3/m3)
          row[6] = smapTelemetry.soilMoisture;
          row[7] = smapTelemetry.soilMoisture;
          // Channels 8-9: Availability indicators
          row[8] = 1.0;
          row[9] = 1.0;
          // Channel 10: Same-day observation indicator
          row[10] = stepAgeDays === 0 ? 1.0 : 0.0;
        } else {
          // Fallback missingness representation per M11/M12 contract
          // row[5..7] = null (captured as missingness and imputed with frozen training medians)
          row[5] = null;
          row[6] = null;
          row[7] = null;
          row[8] = 0.0;
          row[9] = 0.0;
          row[10] = 0.0;
        }

        // Channels 11-14: Static district terrain
        row[11] = terrain.elevation;
        row[12] = terrain.slope;
        row[13] = terrain.aspect;
        row[14] = terrain.curvature;

        sequence.push(row);
      }

      return sequence;
    }

    throw new Error(`Unsupported prediction hazard: ${hazardType}`);
  }

  async ingestAndSaveEnvironmentalData(district = 'Kodagu') {
    const normalizedDistrict = this.normalizeDistrict(district);
    const telemetry = await this.getEnvironmentalData(normalizedDistrict);

    const doc = await EnvironmentalData.create({
      district: telemetry.district,
      location: telemetry.location,
      rainfall: telemetry.rainfall_mm,
      riverLevel: telemetry.river_level_m,
      soilMoisture: telemetry.soil_moisture_pct,
      volumetricSoilMoisture: telemetry.volumetric_sm,
      temperature: telemetry.temperature_c,
      humidity: telemetry.humidity_pct,
      source: telemetry.source,
      recordedAt: telemetry.timestamp
    });

    return {
      id: doc._id.toString(),
      district: doc.district,
      location: doc.location,
      rainfall_mm: doc.rainfall,
      river_level_m: doc.riverLevel,
      soil_moisture_pct: doc.soilMoisture,
      volumetric_sm: doc.volumetricSoilMoisture !== undefined && doc.volumetricSoilMoisture !== null
        ? doc.volumetricSoilMoisture
        : telemetry.volumetric_sm,
      temperature_c: doc.temperature,
      humidity_pct: doc.humidity,
      source: doc.source,
      recordedAt: doc.recordedAt
    };
  }
}

module.exports = new DataIngestionService();