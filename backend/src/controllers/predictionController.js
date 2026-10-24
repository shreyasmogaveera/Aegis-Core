const Prediction = require('../models/Prediction');
const Alert = require('../models/Alert');
const mlBridgeService = require('../services/mlBridgeService');
const socketService = require('../services/socketService');
const calibrationService = require('../services/calibrationService');
const alertController = require('./alertController');
const { resolveDominantPrediction } = require('../utils/dominantHazard');

const DISTRICT_COORDINATES = {
  Kodagu: [75.7382, 12.4244],
  'Uttara Kannada': [74.6868, 14.8153],
  Belagavi: [74.4977, 15.8497],
  Bagalkot: [75.6868, 16.1853]
};

class PredictionController {
  formatPrediction(pred) {
    const hazard = (
      pred.predictionType ||
      pred.prediction_type ||
      'flood'
    ).toLowerCase();

    const score =
      pred.riskScore !== undefined
        ? pred.riskScore
        : pred.risk_score;

    // Apply district-specific decision threshold calibration (Level 2 if calibratedProbability exists)
    const calib = calibrationService.classifyRisk(
      hazard,
      pred.district,
      score,
      pred.calibratedProbability
    );

    return {
      id: pred._id ? pred._id.toString() : undefined,
      district: pred.district,
      predictionType: (
        pred.predictionType ||
        pred.prediction_type ||
        'FLOOD'
      ).toUpperCase(),
      prediction_type: hazard,

      timeWindowHours:
        pred.timeWindowHours ||
        pred.time_window_hours ||
        72,

      // Strictly preserves the authoritative frozen model probability
      riskScore: score,
      eventProbability: score,
      rawProbability: pred.rawProbability !== undefined ? pred.rawProbability : score,
      calibratedProbability: pred.calibratedProbability !== undefined ? pred.calibratedProbability : null,

      // Level 1 / Level 2 Calibrated Operational Decision & Risk Tier
      riskLevel: calib.riskLevel || pred.riskLevel,
      operationalDecision: calib.operationalDecision || pred.operationalDecision,
      calibratedThreshold: calib.calibratedThreshold,
      nextThreshold: calib.nextThreshold,
      nextThresholdTier: calib.nextThresholdTier,
      thresholds: calib.thresholds,
      calibrationDetails: calib.calibrationDetails,

      confidence: pred.confidence,

      recommendations: pred.recommendations || [],
      environmentalInput:
        pred.environmentalInput ||
        pred.environmental_data ||
        {},

      source: pred.source || 'AEGIS-CORE_M11_FROZEN',

      targetDate: pred.targetDate,
      mode: pred.mode,
      predictionStatus: pred.predictionStatus,
      historyStatus: pred.historyStatus,
      dataQualityStatus: pred.dataQualityStatus,
      smapStatus: pred.smapStatus,
      smapAgeDays: pred.smapAgeDays,
      decisionEngine: pred.decisionEngine || (pred.district === 'Belagavi' ? 'secondary_physical_rf' : 'frozen_lstm_level2'),
      modelSource: pred.modelSource,
      modelSha256: pred.modelSha256,
      preprocessingSha256: pred.preprocessingSha256,
      sequenceLength: pred.sequenceLength,

      createdAt: pred.createdAt,
      updatedAt: pred.updatedAt
    };
  }

  /**
   * Dynamically synchronize Level 1 Calibrated Operational Decisions with Alert lifecycle.
   * - ACTIONABLE_ALERT / EVACUATION_WARNING: Upsert active auto-generated Alert and broadcast.
   * - LOW / MODERATE: Auto-resolve existing active auto-generated alerts for district+hazard.
   */
  /**
   * Produce citizen-facing public safety messaging tailored by district and hazard.
   */
  buildPublicSafetyAlert(district, hazard, riskLevel) {
    const hazardType = (hazard || 'FLOOD').toUpperCase();
    const isFlood = hazardType === 'FLOOD';

    // Authentic geographic and hydrological basin context per district
    const districtContext = {
      Kodagu: {
        floodBasin: 'Cauvery and Harangi river basins',
        floodKeyAreas: 'low-lying riparian reaches across Somwarpet and Madikeri taluks (including Kushalnagar & Napoklu corridors)',
        landslideTerrain: 'steep Western Ghats slopes in Madikeri and Somwarpet taluks',
        landslideKeyAreas: 'Madikeri hill roads and hillside settlements'
      },
      'Uttara Kannada': {
        floodBasin: 'Kali, Sharavathi, and Aghanashini coastal river basins',
        floodKeyAreas: 'low-lying estuarine plains and coastal riverbanks (including Karwar & Honnavar taluk sectors)',
        landslideTerrain: 'coastal Western Ghats ghat sections along NH-66 and Sirsi hills',
        landslideKeyAreas: 'coastal hill cuttings and ghat roads'
      },
      Belagavi: {
        floodBasin: 'Malaprabha and Krishna river systems',
        floodKeyAreas: 'riparian farmland and riverbank plains (including Khanapur, Gokak, and Chikkodi taluk sectors)',
        landslideTerrain: 'Khanapur ghat fringes',
        landslideKeyAreas: 'hilly valley routes'
      },
      Bagalkot: {
        floodBasin: 'Ghataprabha and Krishna river confluences',
        floodKeyAreas: 'riverbank settlements and Almatti reservoir backwater plains (including Jamkhandi & Mudhol taluk sectors)',
        landslideTerrain: 'Badami rock formations',
        landslideKeyAreas: 'outlier ridges'
      }
    };

    const ctx = districtContext[district] || {
      floodBasin: 'local river basin',
      floodKeyAreas: 'low-lying riverbank settlements',
      landslideTerrain: 'vulnerable steep terrain',
      landslideKeyAreas: 'slopes and hillside roads'
    };

    if (isFlood) {
      if (riskLevel === 'CRITICAL') {
        return {
          title: `Flash Flood Evacuation Advisory — ${district}`,
          description: `Severe flood risk projected along the ${ctx.floodBasin}. Water discharge is forecasted to cross warning/danger stages, threatening ${ctx.floodKeyAreas}. Emergency protocols advise immediate precautionary relocation away from active floodplains to designated community shelters or higher ground. Avoid low causeways and bridges.`
        };
      } else if (riskLevel === 'HIGH') {
        return {
          title: `Flood Warning — ${district}`,
          description: `High flood hazard detected across the ${ctx.floodBasin}, with elevated inundation risk across ${ctx.floodKeyAreas}. Residents near riverbanks are advised to secure property, monitor upstream dam releases, and prepare for potential relocation.`
        };
      } else {
        // MODERATE
        return {
          title: `River Flood Advisory — ${district}`,
          description: `Water levels are rising along the ${ctx.floodBasin} due to sustained catchment rainfall runoff. Precautionary advisory in effect for ${ctx.floodKeyAreas}: stay clear of swollen channels, avoid entering watercourses, and track local disaster authority updates.`
        };
      }
    } else {
      // LANDSLIDE
      if (riskLevel === 'CRITICAL') {
        return {
          title: `Landslide Evacuation Advisory — ${district}`,
          description: `Critical slope failure and debris flow hazard across ${ctx.landslideTerrain}. High hazard potential near ${ctx.landslideKeyAreas}. Precautionary relocation advised away from steep cuts to designated safe shelters. Avoid non-essential ghat road transit.`
        };
      } else if (riskLevel === 'HIGH') {
        return {
          title: `Landslide Warning — ${district}`,
          description: `Elevated soil saturation indicates high slope instability across ${ctx.landslideTerrain}. Risk of rockfalls and mudslides affecting ${ctx.landslideKeyAreas}. Exercise heightened vigilance along ghat roads and hillside habitations.`
        };
      } else {
        // MODERATE
        return {
          title: `Slope Hazard Advisory — ${district}`,
          description: `Recent rainfall has increased soil moisture on ${ctx.landslideTerrain}. Motorists and residents near ${ctx.landslideKeyAreas} should exercise caution, watch for minor debris on roads, and avoid staying directly below steep cuttings.`
        };
      }
    }
  }

  /**
   * Dynamically synchronize Level 1 / Level 2 Calibrated Operational Decisions with Alert lifecycle.
   * - CRITICAL / HIGH / MODERATE: Upsert active auto-generated Alert and broadcast.
   * - LOW: Auto-resolve existing active alerts for district+hazard.
   */
  async syncOperationalAlert(district, hazard, classification, eventProbability) {
    try {
      const hazardType = (hazard || 'FLOOD').toUpperCase();
      const normDistrict = district;
      const riskLevel = classification.riskLevel || 'LOW';
      const isFlood = hazardType === 'FLOOD';

      if (
        riskLevel === 'CRITICAL' ||
        riskLevel === 'HIGH' ||
        riskLevel === 'MODERATE'
      ) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // Citizen-facing public safety title & description
        const { title, description } = this.buildPublicSafetyAlert(normDistrict, hazardType, riskLevel);

        const coords = DISTRICT_COORDINATES[normDistrict] || [75.7382, 12.4244];

        // Model provenance source string
        let sourceStr = 'AegisCore Calibrated Engine';
        if (normDistrict === 'Belagavi' && hazardType === 'FLOOD') {
          sourceStr = 'Belagavi Secondary Physical Classifier (RF Dynamic Engine)';
        } else if (classification.calibrationDetails?.version) {
          sourceStr = `AegisCore Calibrated Engine (${classification.calibrationDetails.level || 'Level 2'})`;
        }

        // Separate technical details field for audit & admin view
        const technicalDetails = {
          operationalDecision: classification.operationalDecision,
          calibratedProbability: Number(eventProbability.toFixed(4)),
          calibratedThreshold: classification.calibratedThreshold || classification.thresholds?.[riskLevel.toLowerCase()],
          thresholds: classification.thresholds,
          riskLevel,
          decisionEngine: normDistrict === 'Belagavi' && hazardType === 'FLOOD' ? 'secondary_physical_rf' : 'frozen_lstm_level2',
          calibrationLevel: classification.calibrationDetails?.level || 'Level 2',
          methodology: classification.calibrationDetails?.methodology,
          statisticalReliability: classification.calibrationDetails?.statisticalReliability
        };

        // District Disaster Management Plan (DDMP) & Census baseline demographic estimates for mapped hazard zones
        const districtBaselines = {
          Kodagu: {
            floodZone: 'Cauvery & Harangi riparian corridor',
            floodPop: 14200,
            landslideZone: 'Madikeri & Somwarpet Western Ghats slopes',
            landslidePop: 8500
          },
          'Uttara Kannada': {
            floodZone: 'Kali & Sharavathi coastal estuarine corridor',
            floodPop: 38500,
            landslideZone: 'Sirsi & Karwar ghat road corridors',
            landslidePop: 11000
          },
          Belagavi: {
            floodZone: 'Krishna & Malaprabha floodplain corridor',
            floodPop: 92000,
            landslideZone: 'Khanapur ghat fringe',
            landslidePop: 6500
          },
          Bagalkot: {
            floodZone: 'Ghataprabha & Krishna backwater basin',
            floodPop: 44000,
            landslideZone: 'Badami outlier ridges',
            landslidePop: 3000
          }
        };

        const base = districtBaselines[normDistrict] || {
          floodZone: 'Monitored riparian corridor',
          floodPop: 10000,
          landslideZone: 'Monitored slope sector',
          landslidePop: 5000
        };

        const affectedZone = isFlood ? base.floodZone : base.landslideZone;
        const baselinePop = isFlood ? base.floodPop : base.landslidePop;
        const populationBasis = 'Estimated figure, not verified against official DDMP records';

        // Find existing active alert for this district + hazard
        let alert = await Alert.findOne({
          district: normDistrict,
          hazardType,
          status: 'ACTIVE'
        });

        let isNew = false;
        if (!alert) {
          alert = new Alert({
            title,
            description,
            hazardType,
            riskLevel,
            district: normDistrict,
            location: { type: 'Point', coordinates: coords },
            affectedPopulation: baselinePop,
            affectedZone,
            populationBasis,
            source: sourceStr,
            status: 'ACTIVE',
            isAutoGenerated: true,
            technicalDetails,
            expiresAt
          });
          isNew = true;
        } else {
          alert.title = title;
          alert.description = description;
          alert.riskLevel = riskLevel;
          alert.source = sourceStr;
          alert.affectedPopulation = baselinePop;
          alert.affectedZone = affectedZone;
          alert.populationBasis = populationBasis;
          alert.isAutoGenerated = true;
          alert.technicalDetails = technicalDetails;
          alert.expiresAt = expiresAt;
          alert.updatedAt = now;
        }

        await alert.save();

        const formattedAlert = alertController.formatAlert(alert);
        if (isNew) {
          socketService.notifyAlertCreated(formattedAlert);
        } else {
          socketService.notifyAlertUpdated(formattedAlert);
        }

        return alert;
      } else if (riskLevel === 'LOW') {
        // Automatically resolve any previously active alerts for this district+hazard
        const activeAlerts = await Alert.find({
          district: normDistrict,
          hazardType,
          status: 'ACTIVE'
        });

        for (const existingAlert of activeAlerts) {
          existingAlert.status = 'RESOLVED';
          existingAlert.updatedAt = new Date();
          await existingAlert.save();

          const formattedAlert = alertController.formatAlert(existingAlert);
          socketService.notifyAlertUpdated(formattedAlert);
        }
      }
    } catch (err) {
      console.error('[PredictionController.syncOperationalAlert] Error:', err);
    }
  }

  /**
   * POST /api/v1/predictions/trigger
   *
   * Node -> ML Bridge -> Flask -> frozen M11 LSTM -> MongoDB -> Socket.io
   *
   * Request:
   * {
   *   district,
   *   predictionType,
   *   target_date,
   *   mode,
   *   sequence
   * }
   *
   * Flood sequence:      15 x 15
   * Landslide sequence:  30 x 15
   */
  /**
   * Internal reusable execution engine for live prediction pipeline & alert sync.
   * Can be called by HTTP handler, scheduler, or internal automated worker.
   */
  async executePrediction({
    district = 'Kodagu',
    predictionType = 'flood',
    target_date,
    mode = 'live',
    sequence
  }) {
    const hazard = (predictionType || 'flood').toLowerCase();
    const effectiveTargetDate = target_date || new Date().toISOString().split('T')[0];

    if (!district) {
      const err = new Error('district is required');
      err.status = 400;
      throw err;
    }

    let activeSequence = sequence;
    if (!Array.isArray(activeSequence)) {
      const dataIngestionService = require('../services/dataIngestionService');
      activeSequence = await dataIngestionService.buildLiveSequence(
        district,
        hazard,
        effectiveTargetDate
      );
    }

    // Pass the sequence to the frozen-model bridge.
    const mlResult = await mlBridgeService.predictRisk(
      district,
      {
        target_date: effectiveTargetDate,
        mode,
        sequence: activeSequence
      },
      hazard
    );

    const eventProbability = mlResult.event_probability;

    if (
      typeof eventProbability !== 'number' ||
      !Number.isFinite(eventProbability) ||
      eventProbability < 0 ||
      eventProbability > 1
    ) {
      const err = new Error('ML service returned an invalid event probability');
      err.status = 502;
      throw err;
    }

    const rawProbability = mlResult.raw_probability !== undefined ? mlResult.raw_probability : eventProbability;
    const calibratedProbability = mlResult.calibrated_probability !== undefined ? mlResult.calibrated_probability : null;

    // Apply district-specific decision threshold calibration (Level 2 if calibrated, else Level 1)
    const classification = calibrationService.classifyRisk(
      hazard,
      mlResult.district || district,
      rawProbability,
      calibratedProbability
    );

    // Persist the authoritative frozen-model probability alongside
    // calibrated operational risk classification.
    const newPrediction = await Prediction.create({
      district: mlResult.district || district,
      predictionType: hazard.toUpperCase(),
      riskScore: eventProbability,
      rawProbability,
      calibratedProbability,
      riskLevel: classification.riskLevel,
      operationalDecision: classification.operationalDecision,

      recommendations: [],

      environmentalInput: {
        sequence: activeSequence,
        calibration: classification
      },

      source: mlResult.model_source || 'AEGIS-CORE_M11_FROZEN',

      targetDate: mlResult.target_date || effectiveTargetDate,
      mode: mlResult.mode || mode,
      predictionStatus: mlResult.prediction_status,
      historyStatus: mlResult.history_status,
      dataQualityStatus: mlResult.data_quality_status,
      smapStatus: mlResult.smap_status,
      smapAgeDays: mlResult.smap_age_days,
      decisionEngine: mlResult.decision_engine || (district === 'Belagavi' ? 'secondary_physical_rf' : 'frozen_lstm_level2'),
      modelSource: mlResult.model_source,
      modelSha256: mlResult.model_sha256,
      preprocessingSha256: mlResult.preprocessing_sha256,
      sequenceLength: mlResult.sequence_length
    });

    const formatted = this.formatPrediction(newPrediction);

    // Dynamically synchronize Level 1 Calibrated Operational Decision with the Alert lifecycle
    await this.syncOperationalAlert(
      mlResult.district || district,
      hazard,
      classification,
      eventProbability
    );

    socketService.notifyPredictionUpdated(formatted);
    return formatted;
  }

  async triggerPrediction(req, res) {
    try {
      const {
        district = 'Kodagu',
        predictionType = 'flood',
        target_date,
        mode = 'live',
        sequence
      } = req.body;

      const formatted = await this.executePrediction({
        district,
        predictionType,
        target_date,
        mode,
        sequence
      });

      return res.status(201).json({
        message: 'Frozen LSTM prediction generated successfully',
        prediction: formatted
      });
    } catch (err) {
      console.error(
        '[PredictionController.triggerPrediction] Error:',
        err
      );

      const statusCode = err.status || 500;

      return res.status(statusCode).json({
        error: err.message || 'Failed to process risk prediction pipeline'
      });
    }
  }

  /**
   * POST /api/v1/predictions/historical-replay
   *
   * Flexible historical replay:
   * district + hazard + target_date
   * -> frozen M7 sequence
   * -> existing ML bridge
   * -> frozen M11 LSTM
   *
   * Historical label is looked up ONLY after inference.
   */
  async historicalReplay(req, res) {
    try {
      const {
        district,
        predictionType = 'flood',
        target_date
      } = req.body;

      if (!district) {
        return res.status(400).json({
          error: 'district is required'
        });
      }

      if (!target_date) {
        return res.status(400).json({
          error: 'target_date is required'
        });
      }

      const historicalReplayService = require(
        '../services/historicalReplay/historicalReplayService'
      );

      const replay =
        await historicalReplayService.getReplayInput(
          predictionType,
          district,
          target_date
        );

      // IMPORTANT:
      // The historical target/label is NOT sent to the model.
      const mlResult =
        await mlBridgeService.predictRisk(
          replay.district,
          {
            target_date: replay.targetDate,
            mode: 'historical_replay',
            sequence: replay.sequence
          },
          replay.hazard
        );

      const eventProbability =
        mlResult.event_probability;

      if (
        typeof eventProbability !== 'number' ||
        !Number.isFinite(eventProbability) ||
        eventProbability < 0 ||
        eventProbability > 1
      ) {
        return res.status(502).json({
          error:
            'ML service returned an invalid event probability'
        });
      }

      const rawProbability = mlResult.raw_probability !== undefined ? mlResult.raw_probability : eventProbability;
      const calibratedProbability = mlResult.calibrated_probability !== undefined ? mlResult.calibrated_probability : null;

      const historicalComparison =
        replay.historicalLabel.available
          ? {
              available: true,
              label: replay.historicalLabel.value
            }
          : {
              available: false,
              label: null
            };

      const calib = calibrationService.classifyRisk(
        replay.hazard,
        replay.district,
        rawProbability,
        calibratedProbability
      );

      return res.status(200).json({
        message:
          'Historical replay prediction generated successfully',

        prediction: {
          district: replay.district,
          predictionType:
            replay.hazard.toUpperCase(),

          targetDate: replay.targetDate,
          mode: 'historical_replay',

          eventProbability,
          rawProbability,
          calibratedProbability,
          riskScore: eventProbability,

          // Level 1 / Level 2 Calibrated Operational Decision & Risk Tier
          riskLevel: calib.riskLevel,
          operationalDecision: calib.operationalDecision,
          calibratedThreshold: calib.calibratedThreshold,
          calibrationDetails: calib.calibrationDetails,

          predictionStatus:
            mlResult.prediction_status,

          historyStatus:
            mlResult.history_status,

          dataQualityStatus:
            mlResult.data_quality_status,

          smapStatus:
            mlResult.smap_status,

          smapAgeDays:
            mlResult.smap_age_days,

          sequenceLength:
            replay.sequenceLength,

          sequenceStart:
            replay.sequenceStart,

          sequenceEnd:
            replay.sequenceEnd,

          modelSource:
            mlResult.model_source,

          modelSha256:
            mlResult.model_sha256,

          preprocessingSha256:
            mlResult.preprocessing_sha256,

          historicalComparison
        }
      });

    } catch (err) {
      console.error(
        '[PredictionController.historicalReplay] Error:',
        err
      );

      const statusCode =
        err.status || 500;

      return res.status(statusCode).json({
        error:
          err.message ||
          'Failed to process historical replay'
      });
    }
  }

  /**
   * GET /api/v1/predictions/latest?district=Kodagu
   *
   * Retrieval only.
   *
   * No prediction is generated here because M12 requires
   * an explicit sequence and target date.
   */
  async getLatestPrediction(req, res) {
    try {
      const { district = 'Kodagu', predictionType, hazard } = req.query;
      const type = predictionType || hazard;

      // Multi-hazard priority: when no specific hazard is requested,
      // evaluate all supported hazards for this district and return the dominant (highest risk tier) prediction.
      if (!type) {
        const candidateHazards = ['FLOOD', 'LANDSLIDE'];
        const latestHazards = await Promise.all(
          candidateHazards.map((h) =>
            Prediction.findOne({
              district: new RegExp(`^${district}$`, 'i'),
              predictionType: new RegExp(`^${h}$`, 'i')
            }).sort({ createdAt: -1 })
          )
        );
        // Canonical dominant hazard resolution (see backend/src/utils/dominantHazard.js)
        const dominant = resolveDominantPrediction(latestHazards);
        if (dominant) {
          return res.status(200).json(this.formatPrediction(dominant));
        }
      }

      const query = {
        district: new RegExp(`^${district}$`, 'i')
      };
      if (type) {
        query.predictionType = new RegExp(`^${type}$`, 'i');
      }

      const latest = await Prediction.findOne(query).sort({ createdAt: -1 });

      if (!latest) {
        return res.status(404).json({
          error: `No prediction found for this district${type ? ` (${type})` : ''}`
        });
      }

      return res.status(200).json(this.formatPrediction(latest));
    } catch (err) {
      console.error(
        '[PredictionController.getLatestPrediction] Error:',
        err
      );

      return res.status(500).json({
        error: 'Failed to retrieve latest prediction'
      });
    }
  }

  /**
   * GET /api/v1/predictions/history?district=Kodagu
   */
  async getPredictionHistory(req, res) {
    try {
      const {
        district = 'Kodagu',
        limit = 20
      } = req.query;

      const history = await Prediction.find({
        district: new RegExp(`^${district}$`, 'i')
      })
        .sort({ createdAt: -1 })
        .limit(Number(limit) || 20);

      const formatted = history.map((doc) =>
        this.formatPrediction(doc)
      );

      return res.status(200).json({
        count: formatted.length,
        predictions: formatted
      });
    } catch (err) {
      console.error(
        '[PredictionController.getPredictionHistory] Error:',
        err
      );

      return res.status(500).json({
        error: 'Failed to retrieve prediction history'
      });
    }
  }
}

module.exports = new PredictionController();
