import mongoose from 'mongoose';
import Transaction from './models/Transaction.js';

// Connect to MongoDB (same as your production database)
const MONGODB_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';
await mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Get the most recent failed add_liquidity transaction
const failedTx = await Transaction.findOne({
  txType: 'add_liquidity',
  status: 'failed'
}).sort({ timestamp: -1 });

if (failedTx) {
  console.log('\n=== FAILED ADD LIQUIDITY TRANSACTION ===\n');
  console.log('Timestamp:', failedTx.timestamp);
  console.log('Signal:', failedTx.signal);
  console.log('Tick Lower:', failedTx.tickLower);
  console.log('Tick Upper:', failedTx.tickUpper);
  console.log('Price:', failedTx.price);
  console.log('WETH Balance Before:', failedTx.wethBalanceBefore);
  console.log('USDC Balance Before:', failedTx.usdcBalanceBefore);
  console.log('\n❌ ERROR:', failedTx.error);
  console.log('\n');
} else {
  console.log('No failed add_liquidity transactions found');
}

await mongoose.disconnect();
