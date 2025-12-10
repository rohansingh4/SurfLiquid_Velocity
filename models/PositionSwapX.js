import mongoose from 'mongoose';

const positionSwapXSchema = new mongoose.Schema({
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
  collection: 'positions_swapx'
});

// Create indexes for efficient queries
positionSwapXSchema.index({ timestamp: -1 });
positionSwapXSchema.index({ createdAt: -1 });
positionSwapXSchema.index({ status: 1, timestamp: -1 });

const PositionSwapX = mongoose.model('PositionSwapX', positionSwapXSchema);

export default PositionSwapX;
