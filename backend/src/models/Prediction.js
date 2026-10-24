const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    district: {
      type: String,
      required: [true, 'District is required'],
      trim: true
    },

    predictionType: {
      type: String,
      enum: ['FLOOD', 'LANDSLIDE', 'COMBINED', 'flood', 'landslide', 'combined'],
      required: true
    },

    timeWindowHours: {
      type: Number,
      default: 72
    },

    // Compatibility field:
    // stores the frozen model event probability.
    // It is NOT a separately derived risk score.
    riskScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },

    rawProbability: {
      type: Number,
      min: 0,
      max: 1
    },

    calibratedProbability: {
      type: Number,
      min: 0,
      max: 1
    },

    // M12 does not define model confidence.
    // Therefore this is optional and is not populated by the frozen LSTM.
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },

    // Legacy UI compatibility field.
    // Must not be invented from the probability.
    riskLevel: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL']
    },

    recommendations: [{
      type: String,
      trim: true
    }],

    environmentalInput: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    source: {
      type: String,
      default: 'AEGIS-CORE_M11_FROZEN'
    },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [75.7382, 12.4244]
      }
    },

    // M12 prediction provenance / operational fields.
    targetDate: {
      type: String
    },

    mode: {
      type: String,
      enum: ['live', 'historical_replay']
    },

    predictionStatus: {
      type: String
    },

    historyStatus: {
      type: String
    },

    dataQualityStatus: {
      type: String
    },

    smapStatus: {
      type: String
    },

    smapAgeDays: {
      type: Number
    },

    modelSource: {
      type: String
    },

    modelSha256: {
      type: String
    },

    preprocessingSha256: {
      type: String
    },

    sequenceLength: {
      type: Number
    },

    operationalDecision: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

predictionSchema.index({ location: '2dsphere' });
predictionSchema.index({ district: 1, createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);
