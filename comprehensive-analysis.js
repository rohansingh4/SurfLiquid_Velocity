import { connectDB, mongoose } from './db.js';
import Transaction from './models/Transaction.js';

async function comprehensiveAnalysis() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    const db = mongoose.connection.db;

    // Fetch all transactions
    console.log('\n📊 Fetching all transactions...');
    const transactions = await Transaction.find({}).sort({ timestamp: 1 }).lean();
    console.log(`   Found ${transactions.length} transactions`);

    // Fetch all positions
    console.log('📊 Fetching all positions...');
    const positions = await db.collection('positions').find({}).sort({ timestamp: 1 }).toArray();
    console.log(`   Found ${positions.length} positions`);

    // Filter rebalance positions
    const rebalancePositions = positions.filter(p =>
      p.status === 'Open-UP' || p.status === 'Open-DOWN'
    );
    console.log(`   Rebalance positions: ${rebalancePositions.length}`);

    // Analyze transactions by type
    const swaps = transactions.filter(t => t.txType === 'swap');
    const adds = transactions.filter(t => t.txType === 'add_liquidity');
    const removes = transactions.filter(t => t.txType === 'remove_liquidity' || t.txType === 'withdraw_liquidity');

    console.log('\n📊 Transaction Breakdown:');
    console.log(`   Swaps: ${swaps.length}`);
    console.log(`   Add Liquidity: ${adds.length}`);
    console.log(`   Remove Liquidity: ${removes.length}`);
    console.log(`   Total: ${transactions.length}`);

    // Calculate fees earned and lost
    console.log('\n💰 Analyzing Fees...');

    let totalFeesEarned = 0;
    let totalFeesLost = 0;
    const feeDetails = [];

    // Group transactions by rebalance cycle
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      if (tx.txType === 'remove_liquidity' || tx.txType === 'withdraw_liquidity') {
        // Fees earned = difference in portfolio value after remove (principal + fees collected)
        const portfolioBefore = tx.portfolioValueBefore || 0;
        const portfolioAfter = tx.portfolioValueAfter || 0;

        // If portfolio increased after remove, that's fees earned
        if (portfolioAfter > portfolioBefore) {
          const feesEarned = portfolioAfter - portfolioBefore;
          totalFeesEarned += feesEarned;
          feeDetails.push({
            type: 'earn',
            timestamp: tx.timestamp,
            amount: feesEarned,
            txHash: tx.txHash
          });
        }
      }

      if (tx.txType === 'swap') {
        // Fees lost in swap = slippage
        const portfolioBefore = tx.portfolioValueBefore || 0;
        const portfolioAfter = tx.portfolioValueAfter || 0;

        if (portfolioBefore > portfolioAfter) {
          const feesLost = portfolioBefore - portfolioAfter;
          totalFeesLost += feesLost;
          feeDetails.push({
            type: 'lost',
            timestamp: tx.timestamp,
            amount: feesLost,
            txHash: tx.txHash
          });
        }
      }

      if (tx.txType === 'add_liquidity') {
        // Fees lost in add liquidity = slippage/unused amounts
        const portfolioBefore = tx.portfolioValueBefore || 0;
        const portfolioAfter = tx.portfolioValueAfter || 0;

        if (portfolioBefore > portfolioAfter) {
          const feesLost = portfolioBefore - portfolioAfter;
          totalFeesLost += feesLost;
          feeDetails.push({
            type: 'lost',
            timestamp: tx.timestamp,
            amount: feesLost,
            txHash: tx.txHash
          });
        }
      }
    }

    console.log(`   Total Fees Earned: $${totalFeesEarned.toFixed(4)}`);
    console.log(`   Total Fees Lost: $${totalFeesLost.toFixed(4)}`);
    console.log(`   Net Fees: $${(totalFeesEarned - totalFeesLost).toFixed(4)}`);

    // Analyze range choices
    console.log('\n📊 Analyzing Range Choices...');
    const rangeAnalysis = [];

    for (const pos of rebalancePositions) {
      const openPrice = pos.open;
      const chosenTickLower = pos.tickLower;
      const chosenTickUpper = pos.tickUpper;
      const tickSpacing = 100;

      // Calculate center tick
      const openTick = Math.log(openPrice) / Math.log(1.0001);
      const centerTick = Math.round(openTick / tickSpacing) * tickSpacing;

      // Calculate BOTH possible ranges
      const lowerRange = {
        name: 'Lower Range',
        tickLower: centerTick - tickSpacing,
        tickUpper: centerTick,
        priceLower: Math.pow(1.0001, centerTick - tickSpacing),
        priceUpper: Math.pow(1.0001, centerTick)
      };

      const upperRange = {
        name: 'Upper Range',
        tickLower: centerTick,
        tickUpper: centerTick + tickSpacing,
        priceLower: Math.pow(1.0001, centerTick),
        priceUpper: Math.pow(1.0001, centerTick + tickSpacing)
      };

      // Determine which was chosen
      const chosenRange = (chosenTickLower === lowerRange.tickLower) ? lowerRange : upperRange;
      const alternativeRange = (chosenRange === lowerRange) ? upperRange : lowerRange;

      // Calculate metrics for both
      const calculateMetrics = (range) => {
        const upperPct = ((range.priceUpper - openPrice) / openPrice) * 100;
        const lowerPct = ((openPrice - range.priceLower) / openPrice) * 100;
        const upperDeviation = upperPct - 0.5;
        const lowerDeviation = lowerPct - 0.5;
        const avgDeviation = (Math.abs(upperDeviation) + Math.abs(lowerDeviation)) / 2;

        const isDirectionalCorrect = pos.status === 'Open-UP'
          ? (upperPct > lowerPct)
          : (lowerPct > upperPct);

        return { upperPct, lowerPct, upperDeviation, lowerDeviation, avgDeviation, isDirectionalCorrect };
      };

      const chosenMetrics = calculateMetrics(chosenRange);
      const altMetrics = calculateMetrics(alternativeRange);

      rangeAnalysis.push({
        timestamp: new Date(pos.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        signal: pos.status,
        openPrice: openPrice.toFixed(2),
        chosenRange: {
          name: chosenRange.name,
          ticks: `[${chosenRange.tickLower}, ${chosenRange.tickUpper}]`,
          avgDev: chosenMetrics.avgDeviation.toFixed(3),
          directional: chosenMetrics.isDirectionalCorrect
        },
        altRange: {
          name: alternativeRange.name,
          ticks: `[${alternativeRange.tickLower}, ${alternativeRange.tickUpper}]`,
          avgDev: altMetrics.avgDeviation.toFixed(3),
          directional: altMetrics.isDirectionalCorrect
        },
        chosenBetter: chosenMetrics.avgDeviation < altMetrics.avgDeviation,
        chosenCorrectDir: chosenMetrics.isDirectionalCorrect,
        altCorrectDir: altMetrics.isDirectionalCorrect
      });
    }

    const chosenBetterCount = rangeAnalysis.filter(r => r.chosenBetter).length;
    const chosenDirectionalCorrect = rangeAnalysis.filter(r => r.chosenCorrectDir).length;

    console.log(`   Total Rebalances: ${rangeAnalysis.length}`);
    console.log(`   Chosen range better centered: ${chosenBetterCount}/${rangeAnalysis.length} (${(chosenBetterCount/rangeAnalysis.length*100).toFixed(1)}%)`);
    console.log(`   Chosen range directionally correct: ${chosenDirectionalCorrect}/${rangeAnalysis.length} (${(chosenDirectionalCorrect/rangeAnalysis.length*100).toFixed(1)}%)`);

    // Ping-pong analysis
    console.log('\n🔄 Ping-Pong Analysis...');
    let flipCount = 0;
    let totalTime = 0;
    const flipTimes = [];

    for (let i = 1; i < rebalancePositions.length; i++) {
      const prev = rebalancePositions[i-1];
      const curr = rebalancePositions[i];

      const isFlip = (prev.status === 'Open-UP' && curr.status === 'Open-DOWN') ||
                     (prev.status === 'Open-DOWN' && curr.status === 'Open-UP');

      if (isFlip) {
        flipCount++;
        const timeDiff = new Date(curr.timestamp) - new Date(prev.timestamp);
        const minutes = Math.round(timeDiff / 1000 / 60);
        flipTimes.push(minutes);
        totalTime += minutes;
      }
    }

    const avgFlipTime = flipCount > 0 ? totalTime / flipCount : 0;
    const flipRate = ((flipCount / (rebalancePositions.length - 1)) * 100).toFixed(1);

    console.log(`   Total flips: ${flipCount}/${rebalancePositions.length - 1} (${flipRate}%)`);
    console.log(`   Average time between flips: ${avgFlipTime.toFixed(1)} minutes`);
    console.log(`   Fastest flip: ${Math.min(...flipTimes)} minutes`);
    console.log(`   Slowest flip: ${Math.max(...flipTimes)} minutes`);

    // Export everything
    const fs = await import('fs');

    const report = {
      metadata: {
        totalTransactions: transactions.length,
        totalRebalances: rebalancePositions.length,
        dateRange: {
          start: transactions[0]?.timestamp,
          end: transactions[transactions.length - 1]?.timestamp
        }
      },
      fees: {
        earned: totalFeesEarned,
        lost: totalFeesLost,
        net: totalFeesEarned - totalFeesLost,
        details: feeDetails
      },
      ranges: {
        totalAnalyzed: rangeAnalysis.length,
        chosenBetter: chosenBetterCount,
        chosenDirectionalCorrect: chosenDirectionalCorrect,
        details: rangeAnalysis
      },
      pingPong: {
        totalFlips: flipCount,
        totalRebalances: rebalancePositions.length,
        flipRate: parseFloat(flipRate),
        avgFlipTime: avgFlipTime,
        fastestFlip: Math.min(...flipTimes),
        slowestFlip: Math.max(...flipTimes),
        allFlipTimes: flipTimes
      }
    };

    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/comprehensive-report.json',
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ Report exported to comprehensive-report.json');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

comprehensiveAnalysis();
