const mongoose = require('mongoose');

const sosRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String,
      required: [true, 'Requester name is required'],
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Contact phone is required'],
      trim: true
    },
    emergencyType: {
      type: String,
      enum: ['FLOOD_TRAPPED', 'LANDSLIDE_BLOCKED', 'MEDICAL_EMERGENCY', 'EVACUATION_NEEDED', 'OTHER'],
      default: 'EVACUATION_NEEDED'
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
    address: {
      type: String,
      trim: true,
      default: ''
    },
    district: {
      type: String,
      trim: true,
      required: true
    },
    peopleCount: {
      type: Number,
      default: 1,
      min: 1
    },
    details: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['PENDING', 'RESPONDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
      default: 'PENDING'
    },
    isTest: {
      type: Boolean,
      default: false
    },
    source: {
      type: String,
      default: 'citizen',
      trim: true
    },
    responder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

sosRequestSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('SosRequest', sosRequestSchema);
