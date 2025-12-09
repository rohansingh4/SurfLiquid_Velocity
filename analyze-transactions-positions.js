import mongoose from 'mongoose';

// MongoDB connection (correct database name is Velocity, not finora!)
const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  timestamp: Date,
  signal: String,
  txType: String,
  txHash: String,
  status: String,
  wethAmount: Number,
  usdcAmount: Number,
  wethPrice: Number,
  portfolioValueBefore: Number,
  portfolioValueAfter: Number,
  pnl: Number,
  upperRange: Number,
  lowerRange: Number,
  tickLower: Number,
  tickUpper: Number,
  tickRange: Number,
  liquidityAmount: String,
  error: String,
  gasUsed: String,
  gasCost: Number
}, { collection: 'transactions' });

// Position Schema
const positionSchema = new mongoose.Schema({
  timestamp: Date,
  status: String,
  upper_range: Number,
  lower_range: Number,
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  weth_pct: Number,
  usdc_pct: Number,
  rebalance_type: String
}, { collection: 'positions' });

const Transaction = mongoose.model('Transaction', transactionSchema);
const Position = mongoose.model('Position', positionSchema);

async function analyzeData() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all transactions, sorted by timestamp
    console.log('📊 Fetching transactions...');
    const transactions = await Transaction.find()
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    console.log(`Found ${transactions.length} transactions\n`);

    // Group transactions by status and type
    const successfulAddLP = transactions.filter(t => t.txType === 'add_liquidity' && t.status === 'success');
    const failedAddLP = transactions.filter(t => t.txType === 'add_liquidity' && t.status === 'failed');
    const successfulRemoveLP = transactions.filter(t => t.txType === 'remove_liquidity' && t.status === 'success');
    const successfulSwaps = transactions.filter(t => t.txType === 'swap' && t.status === 'success');

    console.log('=== TRANSACTION SUMMARY ===');
    console.log(`Total transactions: ${transactions.length}`);
    console.log(`Successful Add LP: ${successfulAddLP.length}`);
    console.log(`Failed Add LP: ${failedAddLP.length}`);
    console.log(`Successful Remove LP: ${successfulRemoveLP.length}`);
    console.log(`Successful Swaps: ${successfulSwaps.length}\n`);

    // Analyze successful add liquidity transactions
    if (successfulAddLP.length > 0) {
      console.log('=== SUCCESSFUL ADD LIQUIDITY ANALYSIS ===');
      console.log(`Most recent successful add LP: ${successfulAddLP[0].timestamp}`);
      console.log(`Oldest successful add LP: ${successfulAddLP[successfulAddLP.length - 1].timestamp}\n`);

      // Show details of last 5 successful add LP
      console.log('Last 5 successful add LP transactions:');
      successfulAddLP.slice(0, 5).forEach((tx, i) => {
        console.log(`\n${i + 1}. ${tx.timestamp.toISOString()}`);
        console.log(`   Signal: ${tx.signal}`);
        console.log(`   Tick Range: ${tx.tickLower} to ${tx.tickUpper} (width: ${tx.tickUpper - tx.tickLower} ticks)`);
        console.log(`   Price Range: $${tx.lowerRange?.toFixed(2)} to $${tx.upperRange?.toFixed(2)}`);
        console.log(`   Range %: ${tx.upperRange && tx.lowerRange ? (((tx.upperRange - tx.lowerRange) / tx.lowerRange) * 100).toFixed(2) : 'N/A'}%`);
        console.log(`   WETH: ${tx.wethAmount?.toFixed(6)} ($${(tx.wethAmount * tx.wethPrice)?.toFixed(2)})`);
        console.log(`   USDC: ${tx.usdcAmount?.toFixed(2)}`);
        console.log(`   Portfolio Before: $${tx.portfolioValueBefore?.toFixed(2)}`);
        console.log(`   Portfolio After: $${tx.portfolioValueAfter?.toFixed(2)}`);
        console.log(`   P&L: $${tx.pnl?.toFixed(2)}`);
        console.log(`   Liquidity: ${tx.liquidityAmount}`);
        console.log(`   Gas: ${tx.gasCost?.toFixed(4)} S`);
      });
    }

    // Analyze failed add liquidity transactions
    if (failedAddLP.length > 0) {
      console.log('\n\n=== FAILED ADD LIQUIDITY ANALYSIS ===');
      console.log(`Most recent failed add LP: ${failedAddLP[0].timestamp}`);
      console.log(`Total failed: ${failedAddLP.length}\n`);

      // Show details of all recent failed add LP
      console.log('Recent failed add LP transactions:');
      failedAddLP.slice(0, 10).forEach((tx, i) => {
        console.log(`\n${i + 1}. ${tx.timestamp.toISOString()}`);
        console.log(`   Signal: ${tx.signal}`);
        console.log(`   Tick Range: ${tx.tickLower} to ${tx.tickUpper} (width: ${tx.tickUpper - tx.tickLower} ticks)`);
        console.log(`   Price Range: $${tx.lowerRange?.toFixed(2)} to $${tx.upperRange?.toFixed(2)}`);
        console.log(`   Range %: ${tx.upperRange && tx.lowerRange ? (((tx.upperRange - tx.lowerRange) / tx.lowerRange) * 100).toFixed(2) : 'N/A'}%`);
        console.log(`   WETH: ${tx.wethAmount?.toFixed(6)}`);
        console.log(`   USDC: ${tx.usdcAmount?.toFixed(2)}`);
        console.log(`   Error: ${tx.error?.substring(0, 150)}...`);
      });
    }

    // Find the transition point - when did it stop working?
    console.log('\n\n=== TRANSITION ANALYSIS ===');

    // Group transactions by hour
    const txByHour = {};
    transactions.forEach(tx => {
      if (tx.txType === 'add_liquidity') {
        const hour = new Date(tx.timestamp).toISOString().substring(0, 13); // YYYY-MM-DDTHH
        if (!txByHour[hour]) {
          txByHour[hour] = { success: 0, failed: 0 };
        }
        if (tx.status === 'success') {
          txByHour[hour].success++;
        } else {
          txByHour[hour].failed++;
        }
      }
    });

    console.log('Add LP success/failure by hour:');
    Object.keys(txByHour).sort().reverse().forEach(hour => {
      const data = txByHour[hour];
      console.log(`${hour}: ✅ ${data.success} success, ❌ ${data.failed} failed`);
    });

    // Compare successful vs failed parameters
    if (successfulAddLP.length > 0 && failedAddLP.length > 0) {
      console.log('\n\n=== PARAMETER COMPARISON (Success vs Failed) ===');

      const avgSuccessTickRange = successfulAddLP
        .filter(tx => tx.tickUpper && tx.tickLower)
        .reduce((sum, tx) => sum + (tx.tickUpper - tx.tickLower), 0) / successfulAddLP.filter(tx => tx.tickUpper && tx.tickLower).length;

      const avgFailedTickRange = failedAddLP
        .filter(tx => tx.tickUpper && tx.tickLower)
        .reduce((sum, tx) => sum + (tx.tickUpper - tx.tickLower), 0) / failedAddLP.filter(tx => tx.tickUpper && tx.tickLower).length;

      console.log(`Successful Add LP:`);
      console.log(`  Average tick range: ${avgSuccessTickRange.toFixed(0)} ticks`);
      console.log(`  Average WETH amount: ${(successfulAddLP.reduce((sum, tx) => sum + (tx.wethAmount || 0), 0) / successfulAddLP.length).toFixed(6)}`);
      console.log(`  Average USDC amount: ${(successfulAddLP.reduce((sum, tx) => sum + (tx.usdcAmount || 0), 0) / successfulAddLP.length).toFixed(2)}`);

      console.log(`\nFailed Add LP:`);
      console.log(`  Average tick range: ${avgFailedTickRange.toFixed(0)} ticks`);
      console.log(`  Average WETH amount: ${(failedAddLP.reduce((sum, tx) => sum + (tx.wethAmount || 0), 0) / failedAddLP.length).toFixed(6)}`);
      console.log(`  Average USDC amount: ${(failedAddLP.reduce((sum, tx) => sum + (tx.usdcAmount || 0), 0) / failedAddLP.length).toFixed(2)}`);
    }

    // Fetch recent positions to see current state
    console.log('\n\n=== RECENT POSITION DATA ===');
    const recentPositions = await Position.find()
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    recentPositions.forEach((pos, i) => {
      console.log(`\n${i + 1}. ${pos.timestamp.toISOString()}`);
      console.log(`   Status: ${pos.status}`);
      console.log(`   Price: $${pos.close?.toFixed(2)} (High: $${pos.high?.toFixed(2)}, Low: $${pos.low?.toFixed(2)})`);
      console.log(`   Range: $${pos.lower_range?.toFixed(2)} to $${pos.upper_range?.toFixed(2)}`);
      console.log(`   Range width: $${(pos.upper_range - pos.lower_range)?.toFixed(2)} (${((pos.upper_range - pos.lower_range) / pos.lower_range * 100)?.toFixed(2)}%)`);
      console.log(`   Allocation: ${pos.weth_pct?.toFixed(2)}% WETH, ${pos.usdc_pct?.toFixed(2)}% USDC`);
      console.log(`   Rebalance: ${pos.rebalance_type}`);
    });

    await mongoose.disconnect();
    console.log('\n\n✅ Analysis complete');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeData();
