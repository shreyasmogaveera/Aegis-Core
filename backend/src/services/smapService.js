/**
 * smapService.js
 *
 * AegisCore Live NASA SMAP (SPL4SMGP Version 8) Ingestion Service
 *
 * Queries the Python ML microservice's SMAP adapter for authoritative
 * 9km EASE-Grid surface soil moisture (sm_surface, 0-5cm, m3/m3).
 *
 * Implements:
 *  - Causal lag calculation (target_date - observation_date)
 *  - Status determination ('same_day' if age=0, 'causal_lag' if 0 < age <= 7, 'unavailable' if > 7)
 *  - 15-minute in-memory caching
 *  - Resilient missingness fallback for pipeline safety
 */

class SmapService {
  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001/api/v1';
    this.cache = new Map();
    this.cacheTtlMs = 15 * 60 * 1000; // 15 minutes
  }

  _getCacheKey(district, targetDate) {
    return `${(district || '').toLowerCase()}_${targetDate || 'today'}`;
  }

  async getLatestTelemetry(targetDate = null) {
    const todayStr = new Date().toISOString().split('T')[0];
    const effectiveDate = targetDate || todayStr;
    const cacheKey = `all_${effectiveDate}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    try {
      const url = `${this.mlServiceUrl}/smap/latest?target_date=${encodeURIComponent(effectiveDate)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        throw new Error(`ML SMAP service returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.status === 'success') {
        this.cache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
      }

      throw new Error(data.error || 'Unknown error querying SMAP adapter');
    } catch (err) {
      console.warn(`[SmapService] Live NASA SMAP query failed (${err.message}). Using resilient fallback.`);
      return null;
    }
  }

  async getDistrictSoilMoisture(district = 'Kodagu', targetDate = null) {
    const todayStr = new Date().toISOString().split('T')[0];
    const effectiveDate = targetDate || todayStr;
    const cacheKey = this._getCacheKey(district, effectiveDate);

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    const allTelemetry = await this.getLatestTelemetry(effectiveDate);

    if (allTelemetry && allTelemetry.districts) {
      // Find matching district
      const matchKey = Object.keys(allTelemetry.districts).find(
        (k) => k.toLowerCase() === String(district).trim().toLowerCase()
      );

      if (matchKey) {
        const dData = allTelemetry.districts[matchKey];
        const result = {
          district: matchKey,
          soilMoisture: dData.soil_moisture,
          center: dData.center,
          windowMin: dData.window_min,
          windowMax: dData.window_max,
          windowMean: dData.window_mean,
          units: dData.units || 'm3 m-3',
          ageDays: dData.causal_smap_age_days,
          smapStatus: dData.smap_status,
          available: Boolean(dData.available),
          granuleId: allTelemetry.granule_id,
          observationUtc: allTelemetry.observation_utc,
          observationDate: allTelemetry.observation_date,
          targetDate: effectiveDate,
          source: 'NASA SMAP L4 (SPL4SMGP v8)'
        };

        this.cache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }

    // Fallback: unavailable
    const fallback = {
      district,
      soilMoisture: null,
      center: null,
      windowMin: null,
      windowMax: null,
      windowMean: null,
      units: 'm3 m-3',
      ageDays: null,
      smapStatus: 'unavailable',
      available: false,
      granuleId: null,
      observationUtc: null,
      observationDate: null,
      targetDate: effectiveDate,
      source: 'UNAVAILABLE'
    };

    return fallback;
  }
}

module.exports = new SmapService();
