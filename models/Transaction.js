import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true },
  signal: { type: String, enum: ['Open-UP', 'Open-DOWN', 'Monitoring'], required: true },
  txType: { type: String, enum: ['swap', 'add_liquidity', 'remove_liquidity'], required: true },
  txHash: { type: String },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },

  // Before transaction
  wethBalanceBefore: { type: Number },
  usdcBalanceBefore: { type: Number },
  wethPctBefore: { type: Number },
  usdcPctBefore: { type: Number },

  // After transaction
  wethBalanceAfter: { type: Number },
  usdcBalanceAfter: { type: Number },
  wethPctAfter: { type: Number },
  usdcPctAfter: { type: Number },

  // Transaction details
  wethAmount: { type: Number },
  usdcAmount: { type: Number },
  price: { type: Number },
  liquidityAmount: { type: String },
  tickLower: { type: Number },
  tickUpper: { type: Number },

  // LP position tracking
  lpAmount0: { type: Number },    // USDC value in LP
  lpAmount1: { type: Number },    // WETH value in LP
  lpPositionValueBefore: { type: Number },  // LP value before transaction
  lpPositionValueAfter: { type: Number },   // LP value after transaction

  // P&L tracking
  portfolioValueBefore: { type: Number },
  portfolioValueAfter: { type: Number },
  profitLoss: { type: Number }, // DEPRECATED - use totalPnL instead
  profitLossPct: { type: Number }, // DEPRECATED - use totalPnLPct instead

  // NEW: Total P&L (cumulative from start)
  initialPortfolioValue: { type: Number }, // Starting value (set once)
  totalPnL: { type: Number }, // Total profit/loss from start
  totalPnLPct: { type: Number }, // Total P&L as percentage

  // NEW: Rebalance fees (fees earned/lost in this rebalance cycle)
  rebalanceFees: { type: Number }, // Fees from this specific rebalance

  // Error handling
  error: { type: String },
  gasUsed: { type: String },

}, { timestamps: true });

// Indexes
transactionSchema.index({ timestamp: -1 });
transactionSchema.index({ signal: 1, timestamp: -1 });
transactionSchema.index({ txType: 1, timestamp: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema, 'transactions');

export default Transaction;
