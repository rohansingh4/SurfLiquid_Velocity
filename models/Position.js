import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Position Open', 'Price Out of Range - UP', 'Price Out of Range - DOWN', 'Waiting for Action']
  },
  price: {
    type: Number,
    required: true
  },
  upper_range: {
    type: Number,
    required: true
  },
  lower_range: {
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
  collection: 'positions'
});

// Create indexes for efficient queries
positionSchema.index({ timestamp: -1 });
positionSchema.index({ createdAt: -1 });
positionSchema.index({ status: 1, timestamp: -1 });

const Position = mongoose.model('Position', positionSchema);

export default Position;
