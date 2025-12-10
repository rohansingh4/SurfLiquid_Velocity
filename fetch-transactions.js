import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

async function fetchTransactions() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch all transactions, sorted by timestamp
    const transactions = await mongoose.connection.db.collection('transactions')
      .find({})
      .sort({ timestamp: 1 })
      .toArray();

    console.log(`📊 Found ${transactions.length} transactions\n`);
    console.log('='.repeat(120));

    // Group by timestamp to show transaction sequences
    let currentTimestamp = null;
    let sequence = 1;

    transactions.forEach((tx, index) => {
      const txTime = new Date(tx.timestamp);
      const timeStr = txTime.toLocaleString();

      // New timestamp group
      if (currentTimestamp !== timeStr) {
        if (currentTimestamp !== null) console.log(''); // Blank line between groups
        currentTimestamp = timeStr;
        console.log(`\n🕐 ${timeStr} | Signal: ${tx.signal || 'N/A'}`);
        console.log('-'.repeat(120));
        sequence = 1;
      }

      // Transaction details
      console.log(`  ${sequence}. ${tx.txType?.toUpperCase() || 'UNKNOWN'} | Status: ${tx.status}`);

      if (tx.txType === 'swap') {
        console.log(`     WETH: ${tx.wethAmount?.toFixed(6) || 'N/A'} | Before: ${tx.wethBalanceBefore?.toFixed(6) || 'N/A'} → After: ${tx.wethBalanceAfter?.toFixed(6) || 'N/A'}`);
        console.log(`     USDC: ${tx.usdcAmount?.toFixed(2) || 'N/A'} | Before: ${tx.usdcBalanceBefore?.toFixed(2) || 'N/A'} → After: ${tx.usdcBalanceAfter?.toFixed(2) || 'N/A'}`);
      } else if (tx.txType === 'add_liquidity') {
        console.log(`     WETH: ${tx.wethAmount?.toFixed(6) || 'N/A'} | USDC: ${tx.usdcAmount?.toFixed(2) || 'N/A'}`);
        console.log(`     Liquidity: ${tx.liquidityAmount || 'N/A'}`);
      } else if (tx.txType === 'remove_liquidity') {
        console.log(`     Liquidity Removed: ${tx.liquidityAmount || 'N/A'}`);
        console.log(`     WETH Before: ${tx.wethBalanceBefore?.toFixed(6) || 'N/A'} | USDC Before: ${tx.usdcBalanceBefore?.toFixed(2) || 'N/A'}`);
      }

      if (tx.error) {
        console.log(`     ❌ Error: ${tx.error}`);
      }

      console.log(`     TX: ${tx.txHash?.substring(0, 10) || 'N/A'}...`);

      sequence++;
    });

    console.log('\n' + '='.repeat(120));
    console.log('\n📈 ANALYSIS:\n');

    // Analyze transaction patterns
    const signals = [...new Set(transactions.map(t => t.signal).filter(Boolean))];
    console.log(`Signals seen: ${signals.join(', ')}`);

    const txTypes = transactions.reduce((acc, tx) => {
      acc[tx.txType] = (acc[tx.txType] || 0) + 1;
      return acc;
    }, {});

    console.log('\nTransaction type counts:');
    Object.entries(txTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Find sequences where remove_liquidity is missing
    console.log('\n🔍 CHECKING FOR MISSING REMOVE LIQUIDITY:\n');

    let lastSignal = null;
    let hasLiquidity = false;
    let missingRemoveCount = 0;

    transactions.forEach((tx, index) => {
      if (tx.txType === 'add_liquidity' && tx.status === 'success') {
        hasLiquidity = true;
      }

      if (tx.txType === 'remove_liquidity' && tx.status === 'success') {
        hasLiquidity = false;
      }

      // Check if signal changed while we have liquidity
      if (tx.signal && tx.signal !== lastSignal && lastSignal !== null) {
        if (hasLiquidity && tx.txType !== 'remove_liquidity') {
          console.log(`  ⚠️  Signal changed from ${lastSignal} → ${tx.signal} but no remove_liquidity!`);
          console.log(`     At: ${new Date(tx.timestamp).toLocaleString()}`);
          console.log(`     First action: ${tx.txType}`);
          missingRemoveCount++;
        }
      }

      lastSignal = tx.signal;
    });

    console.log(`\nTotal missing remove_liquidity: ${missingRemoveCount}`);

    // Check WETH/USDC ratio patterns
    console.log('\n💱 SWAP RATIO ANALYSIS:\n');

    const swaps = transactions.filter(tx => tx.txType === 'swap' && tx.status === 'success');
    swaps.forEach(swap => {
      if (swap.wethBalanceAfter && swap.usdcBalanceAfter) {
        const totalValue = swap.wethBalanceAfter * 3326 + swap.usdcBalanceAfter; // approximate WETH price
        const wethPct = (swap.wethBalanceAfter * 3326 / totalValue * 100).toFixed(1);
        const usdcPct = (swap.usdcBalanceAfter / totalValue * 100).toFixed(1);

        console.log(`  ${new Date(swap.timestamp).toLocaleString()} | Signal: ${swap.signal}`);
        console.log(`    After swap: ${wethPct}% WETH, ${usdcPct}% USDC`);
        console.log(`    WETH: ${swap.wethBalanceAfter.toFixed(6)} | USDC: ${swap.usdcBalanceAfter.toFixed(2)}`);
      }
    });

    await mongoose.disconnect();
    console.log('\n✅ Done\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fetchTransactions();
