import mongoose from 'mongoose';

const positionBaseSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Open-UP', 'Open-DOWN', 'Monitoring', 'Price-UP', 'Price-DOWN']
  },
  upper_range: {
    type: Number,
    required: true
  },
  lower_range: {
    type: Number,
    required: true
  },
  tickLower: {
    type: Number
  },
  tickUpper: {
    type: Number
  },
  open: {
    type: Number,
    required: true
  },
  high: {
    type: Number,
    required: true
  },
  low: {
    type: Number,
    required: true
  },
  close: {
    type: Number,
    required: true
  },
  weth_pct: {
    type: Number,
    required: true
  },
  usdc_pct: {
    type: Number,
    required: true
  },
  rebalance_type: {
    type: String,
    default: 'N/A'
  }
}, {
  timestamps: true,
  collection: 'positions_base'
});

// Create indexes for efficient queries
positionBaseSchema.index({ timestamp: -1 });
positionBaseSchema.index({ createdAt: -1 });
positionBaseSchema.index({ status: 1, timestamp: -1 });

const PositionBase = mongoose.model('PositionBase', positionBaseSchema);

export default PositionBase;
