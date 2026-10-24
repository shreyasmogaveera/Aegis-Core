const mongoose = require('mongoose');

const shelterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Shelter name is required'],
      trim: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
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
        required: true
      }
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: 0
    },
    occupied: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['OPEN', 'NEAR_CAPACITY', 'FULL', 'CLOSED'],
      default: 'OPEN'
    },
    contactPhone: {
      type: String,
      trim: true,
      default: ''
    },
    facilities: [{
      type: String,
      trim: true
    }],
    isTest: {
      type: Boolean,
      default: false
    },
    source: {
      type: String,
      default: 'admin'
    }
  },
  {
    timestamps: true
  }
);

shelterSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Shelter', shelterSchema);
