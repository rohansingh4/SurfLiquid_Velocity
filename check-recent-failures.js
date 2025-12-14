import { connectDB } from './db.js';
import Transaction from './models/Transaction.js';

async function checkRecentFailures() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    // Fetch last 10 transactions
    console.log('\n📊 Fetching recent transactions...\n');
    const recentTransactions = await Transaction.find({})
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('LAST 10 TRANSACTIONS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (let i = 0; i < recentTransactions.length; i++) {
      const tx = recentTransactions[i];
      const statusIcon = tx.status === 'success' ? '✅' : '❌';

      console.log(`${i + 1}. ${statusIcon} ${tx.txType.toUpperCase()} - ${tx.status.toUpperCase()}`);
      console.log(`   Time: ${new Date(tx.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
      console.log(`   Signal: ${tx.signal || 'N/A'}`);

      if (tx.txHash) {
        console.log(`   TX Hash: ${tx.txHash}`);
      }

      if (tx.error) {
        console.log(`   ❌ Error: ${tx.error}`);
      }

      if (tx.txType === 'remove_liquidity' || tx.txType === 'withdraw_liquidity') {
        console.log(`   Liquidity Amount: ${tx.liquidityAmount || 'N/A'}`);
        console.log(`   Tick Range: [${tx.tickLower}, ${tx.tickUpper}]`);
      }

      if (tx.txType === 'add_liquidity') {
        console.log(`   Liquidity Amount: ${tx.liquidityAmount || 'N/A'}`);
        console.log(`   Tick Range: [${tx.tickLower}, ${tx.tickUpper}]`);
        console.log(`   WETH Before: ${tx.wethBalanceBefore}`);
        console.log(`   USDC Before: ${tx.usdcBalanceBefore}`);
      }

      console.log('');
    }

    // Find failed transactions
    const failedTxs = recentTransactions.filter(tx => tx.status === 'failed');

    if (failedTxs.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(`DETAILED FAILURE ANALYSIS (${failedTxs.length} failures)`);
      console.log('═══════════════════════════════════════════════════════════════\n');

      for (const tx of failedTxs) {
        console.log(`❌ FAILED: ${tx.txType.toUpperCase()}`);
        console.log(`   Time: ${new Date(tx.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`);
        console.log(`   Signal: ${tx.signal}`);
        console.log(`   Error: ${tx.error || 'No error message recorded'}`);
        console.log(`   TX Hash: ${tx.txHash || 'No hash recorded'}`);

        if (tx.txType === 'remove_liquidity' || tx.txType === 'withdraw_liquidity') {
          console.log(`   Attempted to remove liquidity: ${tx.liquidityAmount || 'unknown'}`);
          console.log(`   Tick range: [${tx.tickLower}, ${tx.tickUpper}]`);
        }

        if (tx.txType === 'add_liquidity') {
          console.log(`   Attempted tick range: [${tx.tickLower}, ${tx.tickUpper}]`);
          console.log(`   Wallet balances:`);
          console.log(`      WETH: ${tx.wethBalanceBefore}`);
          console.log(`      USDC: ${tx.usdcBalanceBefore}`);
        }

        console.log('');
      }
    } else {
      console.log('✅ No failed transactions in last 10\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkRecentFailures();
