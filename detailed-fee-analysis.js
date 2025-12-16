import { connectDB, mongoose } from './db.js';
import Transaction from './models/Transaction.js';

async function detailedFeeAnalysis() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    // Fetch all transactions in order
    const transactions = await Transaction.find({}).sort({ timestamp: 1 }).lean();
    console.log(`\n📊 Analyzing ${transactions.length} transactions...\n`);

    // Track LP cycles (add -> remove)
    const lpCycles = [];
    let currentCycle = null;

    for (const tx of transactions) {
      if (tx.txType === 'add_liquidity') {
        // Start new LP cycle
        currentCycle = {
          addTx: tx,
          removeTx: null,
          wethDeposited: tx.wethBalanceBefore - tx.wethBalanceAfter,
          usdcDeposited: tx.usdcBalanceBefore - tx.usdcBalanceAfter,
          priceAtAdd: tx.price,
          tickRange: [tx.tickLower, tx.tickUpper]
        };
      }

      if ((tx.txType === 'remove_liquidity' || tx.txType === 'withdraw_liquidity') && currentCycle) {
        // Complete the cycle
        currentCycle.removeTx = tx;
        currentCycle.wethReceived = tx.wethBalanceAfter - tx.wethBalanceBefore;
        currentCycle.usdcReceived = tx.usdcBalanceAfter - tx.usdcBalanceBefore;
        currentCycle.priceAtRemove = tx.price;

        // Calculate fees earned (received - deposited)
        currentCycle.wethFees = currentCycle.wethReceived - currentCycle.wethDeposited;
        currentCycle.usdcFees = currentCycle.usdcReceived - currentCycle.usdcDeposited;

        // Calculate fees in USD at removal price
        const wethFeesUsd = currentCycle.wethFees * currentCycle.priceAtRemove;
        const usdcFeesUsd = currentCycle.usdcFees;
        currentCycle.totalFeesUsd = wethFeesUsd + usdcFeesUsd;

        // Calculate time in range
        const timeMs = new Date(tx.timestamp) - new Date(currentCycle.addTx.timestamp);
        currentCycle.durationMinutes = Math.round(timeMs / 1000 / 60);

        lpCycles.push(currentCycle);
        currentCycle = null;
      }
    }

    console.log(`✅ Found ${lpCycles.length} complete LP cycles\n`);

    // Calculate total fees
    let totalFeesEarnedUsd = 0;
    let positiveFees = 0;
    let negativeFees = 0;

    for (const cycle of lpCycles) {
      if (cycle.totalFeesUsd > 0) {
        totalFeesEarnedUsd += cycle.totalFeesUsd;
        positiveFees++;
      } else {
        negativeFees++;
      }
    }

    console.log('💰 FEES EARNED FROM LP:');
    console.log(`   Total cycles: ${lpCycles.length}`);
    console.log(`   Profitable cycles: ${positiveFees}`);
    console.log(`   Unprofitable cycles: ${negativeFees}`);
    console.log(`   Total fees earned: $${totalFeesEarnedUsd.toFixed(4)}`);
    console.log(`   Average per cycle: $${(totalFeesEarnedUsd / lpCycles.length).toFixed(4)}`);

    // Calculate losses from swaps and price impact
    const swaps = transactions.filter(t => t.txType === 'swap');
    let totalSwapLoss = 0;

    for (const swap of swaps) {
      const portfolioBefore = swap.portfolioValueBefore || 0;
      const portfolioAfter = swap.portfolioValueAfter || 0;
      const loss = portfolioBefore - portfolioAfter;
      if (loss > 0) {
        totalSwapLoss += loss;
      }
    }

    console.log('\n💸 LOSSES FROM OPERATIONS:');
    console.log(`   Total swaps: ${swaps.length}`);
    console.log(`   Loss from swaps: $${totalSwapLoss.toFixed(4)}`);

    // Net calculation
    const netProfitLoss = totalFeesEarnedUsd - totalSwapLoss;
    console.log('\n📊 NET RESULT:');
    console.log(`   Fees Earned: +$${totalFeesEarnedUsd.toFixed(4)}`);
    console.log(`   Swap/Slippage Losses: -$${totalSwapLoss.toFixed(4)}`);
    console.log(`   Net: $${netProfitLoss.toFixed(4)}`);

    // Export detailed analysis
    const fs = await import('fs');
    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/fee-analysis-detailed.json',
      JSON.stringify({
        summary: {
          totalCycles: lpCycles.length,
          profitableCycles: positiveFees,
          unprofitableCycles: negativeFees,
          totalFeesEarned: totalFeesEarnedUsd,
          totalSwapLoss: totalSwapLoss,
          netProfitLoss: netProfitLoss
        },
        cycles: lpCycles.map(c => ({
          addTime: c.addTx.timestamp,
          removeTime: c.removeTx?.timestamp,
          durationMin: c.durationMinutes,
          tickRange: c.tickRange,
          wethDeposited: c.wethDeposited,
          usdcDeposited: c.usdcDeposited,
          wethReceived: c.wethReceived,
          usdcReceived: c.usdcReceived,
          wethFees: c.wethFees,
          usdcFees: c.usdcFees,
          feesUsd: c.totalFeesUsd
        }))
      }, null, 2)
    );

    console.log('\n✅ Detailed analysis exported to fee-analysis-detailed.json');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

detailedFeeAnalysis();
