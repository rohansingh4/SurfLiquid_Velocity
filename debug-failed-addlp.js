import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

// Transaction schema
const transactionSchema = new mongoose.Schema({
  timestamp: Date,
  signal: String,
  txType: String,
  txHash: String,
  status: String,
  error: String,
  wethBalanceBefore: Number,
  usdcBalanceBefore: Number,
  wethBalanceAfter: Number,
  usdcBalanceAfter: Number,
  wethAmount: Number,
  usdcAmount: Number,
  price: Number,
  liquidityAmount: String,
  tickLower: Number,
  tickUpper: Number,
  portfolioValueBefore: Number,
  portfolioValueAfter: Number,
  profitLoss: Number,
  profitLossPct: Number,
  gasUsed: String
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema, 'transactions');

async function debugFailedAddLP() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('\n✅ Connected to MongoDB\n');

    // Find all failed add_liquidity transactions
    const failedAddLP = await Transaction.find({
      txType: 'add_liquidity',
      status: 'failed'
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

    console.log(`📊 Found ${failedAddLP.length} failed Add LP transactions\n`);
    console.log('='.repeat(80));

    failedAddLP.forEach((tx, i) => {
      console.log(`\n${i + 1}. Failed Add LP - ${new Date(tx.timestamp).toLocaleString()}`);
      console.log(`   Signal: ${tx.signal}`);
      console.log(`   Error: ${tx.error || 'No error message'}`);
      console.log(`   WETH Balance: ${tx.wethBalanceBefore}`);
      console.log(`   USDC Balance: ${tx.usdcBalanceBefore}`);
      console.log(`   Tick Range: ${tx.tickLower} to ${tx.tickUpper}`);
      console.log(`   Price: $${tx.price}`);
      console.log('-'.repeat(80));
    });

    // Get some stats
    const totalAddLP = await Transaction.countDocuments({ txType: 'add_liquidity' });
    const successAddLP = await Transaction.countDocuments({ txType: 'add_liquidity', status: 'success' });
    const failedCount = await Transaction.countDocuments({ txType: 'add_liquidity', status: 'failed' });

    console.log(`\n📈 Add LP Statistics:`);
    console.log(`   Total: ${totalAddLP}`);
    console.log(`   Success: ${successAddLP}`);
    console.log(`   Failed: ${failedCount}`);
    console.log(`   Success Rate: ${totalAddLP > 0 ? ((successAddLP / totalAddLP) * 100).toFixed(1) : 0}%`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB\n');
  }
}

debugFailedAddLP();
