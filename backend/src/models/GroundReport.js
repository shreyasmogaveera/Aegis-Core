const mongoose = require('mongoose');

const groundReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    reporterName: {
      type: String,
      default: 'Anonymous Citizen'
    },
    reporterPhone: {
      type: String,
      default: ''
    },
    reportType: {
      type: String,
      enum: ['FLOOD', 'LANDSLIDE', 'HEAVY_RAINFALL', 'ROAD_BLOCKAGE', 'DAM_RIVER_ISSUE', 'OTHER'],
      required: true
    },
    district: {
      type: String,
      enum: ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'],
      required: true
    },
    description: {
      type: String,
      required: [true, 'Report description is required'],
      trim: true
    },
    severity: {
      type: String,
      enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
      default: 'MODERATE'
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    },
    image: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['SUBMITTED', 'VERIFIED', 'DISPATCHED', 'RESOLVED', 'REJECTED'],
      default: 'SUBMITTED'
    }
  },
  {
    timestamps: true
  }
);

groundReportSchema.index({ location: '2dsphere' });
groundReportSchema.index({ district: 1, createdAt: -1 });

module.exports = mongoose.model('GroundReport', groundReportSchema);
