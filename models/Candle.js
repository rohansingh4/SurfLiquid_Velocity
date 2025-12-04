import mongoose from 'mongoose';

const candleSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    index: true
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
  liquidity: {
    type: String,
    required: true
  },
  weth_amount: {
    type: Number,
    required: true
  },
  usdc_amount: {
    type: Number,
    required: true
  }
}, {
  timestamps: true,
  collection: 'candles'
});

// Create compound index for efficient queries
candleSchema.index({ timestamp: -1 });

const Candle = mongoose.model('Candle', candleSchema);

export default Candle;
