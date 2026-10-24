const path = require('path');
const fs = require('fs');

/**
 * CalibrationService
 *
 * Implements Level 1 district-wise decision threshold calibration
 * for AegisCore disaster-risk predictions.
 *
 * Requirements:
 * 1. Preserves raw LSTM event probability unmodified.
 * 2. Uses empirical, district-calibrated decision thresholds.
 * 3. Classifies predictions into standard operational risk tiers:
 *    LOW, MODERATE, HIGH, CRITICAL.
 * 4. Accompanies every classification with data-provenance metrics,
 *    historical sample sizes, and reliability caveats.
 */
class CalibrationService {
  constructor() {
    this.configPath = path.resolve(__dirname, '../../../shared/district-thresholds.json');
    this.calibratedConfigPath = path.resolve(__dirname, '../../../shared/calibrated-district-thresholds.json');
    this.config = this._loadConfig(this.configPath);
    this.calibratedConfig = this._loadConfig(this.calibratedConfigPath);
  }

  _loadConfig(targetPath) {
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[CalibrationService] Could not load ${targetPath}:`, err.message);
      return { hazards: {} };
    }
  }

  _normalizeHazard(hazard) {
    const clean = String(hazard || '').trim().toLowerCase();
    if (clean.includes('landslide')) return 'landslide';
    return 'flood';
  }

  _normalizeDistrict(district) {
    const clean = String(district || '').trim().toLowerCase();
    const map = {
      'bagalkot': 'Bagalkot',
      'belagavi': 'Belagavi',
      'kodagu': 'Kodagu',
      'uttara kannada': 'Uttara Kannada'
    };
    return map[clean] || district;
  }

  /**
   * Look up the calibrated thresholds and metadata for a district and hazard.
   */
  getDistrictCalibration(hazard, district, isLevel2 = false) {
    const normHazard = this._normalizeHazard(hazard);
    const normDistrict = this._normalizeDistrict(district);

    const activeConfig = isLevel2 && this.calibratedConfig?.hazards?.[normHazard]
      ? this.calibratedConfig
      : this.config;

    const hazardConfig = activeConfig.hazards?.[normHazard];
    const districtConfig = hazardConfig?.districts?.[normDistrict];

    if (!districtConfig) {
      // Conservative fallback if district is uncalibrated
      return {
        calibrated: false,
        district: normDistrict,
        hazard: normHazard,
        thresholds: {
          moderate: 0.35,
          high: 0.50,
          critical: 0.75
        },
        statistical_reliability: 'UNCALIBRATED_FALLBACK',
        operational_notes: 'No empirical calibration found for this district; using default cutoff.'
      };
    }

    return {
      calibrated: true,
      district: normDistrict,
      hazard: normHazard,
      configVersion: activeConfig.version,
      methodology: activeConfig.methodology,
      ...districtConfig
    };
  }

  /**
   * Classify a prediction into an operational risk tier.
   *
   * @param {string} hazard - 'flood' | 'landslide'
   * @param {string} district - District name
   * @param {number} rawProbability - Raw forward-pass model probability in [0, 1]
   * @param {number|null} calibratedProbability - Level 2 calibrated probability in [0, 1]
   * @returns {Object} Calibrated classification and operational decision
   */
  classifyRisk(hazard, district, rawProbability, calibratedProbability = null) {
    const hasCalib = typeof calibratedProbability === 'number' && Number.isFinite(calibratedProbability);
    const effectiveProbability = hasCalib ? calibratedProbability : rawProbability;

    if (typeof effectiveProbability !== 'number' || !Number.isFinite(effectiveProbability)) {
      return {
        riskLevel: 'LOW',
        operationalDecision: 'NORMAL_MONITORING',
        calibratedThreshold: null,
        calibrated: false,
        error: 'Invalid probability input'
      };
    }

    const calib = this.getDistrictCalibration(hazard, district, hasCalib);
    const { thresholds } = calib;

    let riskLevel = 'LOW';
    let operationalDecision = 'NORMAL_MONITORING';

    if (effectiveProbability >= thresholds.critical) {
      riskLevel = 'CRITICAL';
      operationalDecision = 'EVACUATION_WARNING';
    } else if (effectiveProbability >= thresholds.high) {
      riskLevel = 'HIGH';
      operationalDecision = 'ACTIONABLE_ALERT';
    } else if (effectiveProbability >= thresholds.moderate) {
      riskLevel = 'MODERATE';
      operationalDecision = 'HEIGHTENED_ADVISORY';
    } else {
      riskLevel = 'LOW';
      operationalDecision = 'NORMAL_MONITORING';
    }

    let nextThresholdTier = 'MODERATE';
    let nextThreshold = thresholds.moderate;

    if (riskLevel === 'LOW') {
      nextThresholdTier = 'MODERATE';
      nextThreshold = thresholds.moderate;
    } else if (riskLevel === 'MODERATE') {
      nextThresholdTier = 'HIGH';
      nextThreshold = thresholds.high;
    } else if (riskLevel === 'HIGH') {
      nextThresholdTier = 'CRITICAL';
      nextThreshold = thresholds.critical;
    } else {
      nextThresholdTier = 'CRITICAL';
      nextThreshold = thresholds.critical;
    }

    return {
      riskLevel,
      operationalDecision,
      effectiveProbability,
      calibratedThreshold: nextThreshold,
      nextThreshold,
      nextThresholdTier,
      highThreshold: thresholds.high,
      thresholds: {
        moderate: thresholds.moderate,
        high: thresholds.high,
        critical: thresholds.critical
      },
      calibrationDetails: {
        calibrated: calib.calibrated,
        version: calib.configVersion || this.config.version,
        level: hasCalib ? 'Level 2 (Probability Calibrated Scale)' : 'Level 1 (Raw Scale Decision Thresholds)',
        statisticalReliability: calib.statistical_reliability,
        sampleSize: calib.baseline_sample_size || null,
        operationalNotes: calib.operational_notes || null,
        aucRoc: calib.auc_roc || null,
        methodology: calib.methodology || this.config.methodology
      }
    };
  }
}

module.exports = new CalibrationService();
