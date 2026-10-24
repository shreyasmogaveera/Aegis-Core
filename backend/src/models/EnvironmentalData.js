const mongoose = require('mongoose');

const environmentalDataSchema = new mongoose.Schema(
  {
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [75.7382, 12.4244]
      }
    },
    rainfall: {
      type: Number, // in mm (rainfall_mm)
      required: true,
      min: 0
    },
    riverLevel: {
      type: Number, // in meters (river_level_m)
      required: true,
      min: 0
    },
    soilMoisture: {
      type: Number, // percentage (0 - 100) (soil_moisture_pct)
      required: true,
      min: 0,
      max: 100
    },
    volumetricSoilMoisture: {
      type: Number, // volumetric water content in m3/m3 (0.00 - 1.00)
      min: 0,
      max: 1
    },
    temperature: {
      type: Number, // temperature_c
      default: 24.5
    },
    humidity: {
      type: Number, // humidity_pct
      default: 88
    },
    source: {
      type: String,
      default: 'mock'
    },
    recordedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

environmentalDataSchema.index({ location: '2dsphere' });
environmentalDataSchema.index({ district: 1, recordedAt: -1 });

module.exports = mongoose.model('EnvironmentalData', environmentalDataSchema);
