import mongoose from 'mongoose';

const baseTransactionSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  network: { type: String, default: 'base' },
  pool: { type: String, required: true },

  // Transaction details
  txHash: { type: String, required: true },
  txType: { type: String, enum: ['withdraw', 'swap', 'add_liquidity'], required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], required: true },

  // Signal context
  signal: { type: String }, // Open-UP, Open-DOWN
  rebalanceType: { type: String }, // Rebalance UP, Rebalance DOWN

  // Position details
  tickLower: { type: Number },
  tickUpper: { type: Number },
  currentPrice: { type: Number },
  upperRange: { type: Number },
  lowerRange: { type: Number },

  // Amount details
  wethAmount: { type: Number },
  usdcAmount: { type: Number },
  wethBalanceBefore: { type: Number },
  usdcBalanceBefore: { type: Number },
  wethBalanceAfter: { type: Number },
  usdcBalanceAfter: { type: Number },

  // Target allocation
  targetWethPct: { type: Number },
  targetUsdcPct: { type: Number },

  // Gas and fees
  gasUsed: { type: String },
  gasPrice: { type: String },
  txFee: { type: Number }, // in ETH

  // LP specific
  liquidityAmount: { type: String }, // For add/remove liquidity
  feesEarned: { type: Number }, // Fees collected on withdraw

  // Error handling
  error: { type: String },
  retryCount: { type: Number, default: 0 },

  // Additional context
  notes: { type: String }
}, {
  timestamps: true
});

// Indexes for efficient queries
baseTransactionSchema.index({ timestamp: -1 });
baseTransactionSchema.index({ txType: 1, status: 1 });
baseTransactionSchema.index({ signal: 1 });

const BaseTransaction = mongoose.model('BaseTransaction', baseTransactionSchema);

export default BaseTransaction;
