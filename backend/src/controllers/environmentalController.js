const EnvironmentalData = require('../models/EnvironmentalData');
const dataIngestionService = require('../services/dataIngestionService');

class EnvironmentalController {
  /**
   * GET /api/v1/environmental/latest?district=Kodagu
   */
  async getLatestEnvironmentalData(req, res) {
    try {
      const { district = 'Kodagu' } = req.query;

      let latest = await EnvironmentalData.findOne({
        district: new RegExp(`^${district}$`, 'i')
      }).sort({ recordedAt: -1 });

      if (!latest) {
        // Ingest and save initial baseline for district
        latest = await dataIngestionService.ingestAndSaveEnvironmentalData(district);
        return res.status(200).json({
          district: latest.district,
          location: latest.location,
          rainfall_mm: latest.rainfall_mm,
          river_level_m: latest.river_level_m,
          soil_moisture_pct: latest.soil_moisture_pct,
          volumetric_sm: latest.volumetric_sm,
          temperature_c: latest.temperature_c,
          humidity_pct: latest.humidity_pct,
          source: latest.source,
          recordedAt: latest.recordedAt
        });
      }

      return res.status(200).json({
        id: latest._id.toString(),
        district: latest.district,
        location: latest.location,
        rainfall_mm: latest.rainfall,
        river_level_m: latest.riverLevel,
        soil_moisture_pct: latest.soilMoisture,
        volumetric_sm: latest.volumetricSoilMoisture !== undefined && latest.volumetricSoilMoisture !== null
          ? latest.volumetricSoilMoisture
          : (latest.soilMoisture !== undefined && latest.soilMoisture !== null ? Number((latest.soilMoisture / 100).toFixed(4)) : 0.352),
        temperature_c: latest.temperature || 24.5,
        humidity_pct: latest.humidity || 88,
        source: latest.source || 'mock',
        recordedAt: latest.recordedAt
      });
    } catch (err) {
      console.error('[EnvironmentalController.getLatestEnvironmentalData] Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve environmental data' });
    }
  }

  /**
   * GET /api/v1/environmental/history?district=Kodagu
   */
  async getEnvironmentalHistory(req, res) {
    try {
      const { district = 'Kodagu', limit = 20 } = req.query;

      const history = await EnvironmentalData.find({
        district: new RegExp(`^${district}$`, 'i')
      })
        .sort({ recordedAt: -1 })
        .limit(Number(limit) || 20);

      const formatted = history.map((doc) => ({
        id: doc._id.toString(),
        district: doc.district,
        location: doc.location,
        rainfall_mm: doc.rainfall,
        river_level_m: doc.riverLevel,
        soil_moisture_pct: doc.soilMoisture,
        volumetric_sm: doc.volumetricSoilMoisture !== undefined && doc.volumetricSoilMoisture !== null
          ? doc.volumetricSoilMoisture
          : (doc.soilMoisture !== undefined && doc.soilMoisture !== null ? Number((doc.soilMoisture / 100).toFixed(4)) : 0.352),
        temperature_c: doc.temperature || 24.5,
        humidity_pct: doc.humidity || 88,
        source: doc.source || 'mock',
        recordedAt: doc.recordedAt
      }));

      return res.status(200).json({
        count: formatted.length,
        history: formatted
      });
    } catch (err) {
      console.error('[EnvironmentalController.getEnvironmentalHistory] Error:', err);
      return res.status(500).json({ error: 'Failed to retrieve environmental history' });
    }
  }
}

module.exports = new EnvironmentalController();
