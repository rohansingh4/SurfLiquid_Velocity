import { connectDB, mongoose } from './db.js';
import Transaction from './models/Transaction.js';

async function analyzeRangeAccuracy() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    const db = mongoose.connection.db;

    // Fetch all transactions
    console.log('\n📊 Fetching transactions...');
    const transactions = await Transaction.find({}).sort({ timestamp: 1 }).lean();
    console.log(`   Found ${transactions.length} transactions`);

    // Fetch all positions
    console.log('\n📊 Fetching positions...');
    const positions = await db.collection('positions').find({}).sort({ timestamp: 1 }).toArray();
    console.log(`   Found ${positions.length} positions`);

    // Export to JSON for analysis
    const fs = await import('fs');

    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/analysis-transactions.json',
      JSON.stringify(transactions, null, 2)
    );
    console.log('✅ Exported transactions to analysis-transactions.json');

    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/analysis-positions.json',
      JSON.stringify(positions, null, 2)
    );
    console.log('✅ Exported positions to analysis-positions.json');

    // Analyze range accuracy for rebalance positions
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('📊 RANGE ACCURACY ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const rebalancePositions = positions.filter(p =>
      p.status === 'Open-UP' || p.status === 'Open-DOWN'
    );

    console.log(`Found ${rebalancePositions.length} rebalance positions (Open-UP/Open-DOWN)\n`);

    const analysisResults = [];

    for (const pos of rebalancePositions) {
      const openPrice = pos.open;
      const upperRange = pos.upper_range;
      const lowerRange = pos.lower_range;
      const tickLower = pos.tickLower;
      const tickUpper = pos.tickUpper;

      // Calculate ideal ±0.5% targets
      const idealUpper = openPrice * 1.005;
      const idealLower = openPrice * 0.995;

      // Calculate actual percentage ranges
      const actualUpperPct = ((upperRange - openPrice) / openPrice) * 100;
      const actualLowerPct = ((openPrice - lowerRange) / openPrice) * 100;

      // Calculate deviations from ideal ±0.5%
      const upperDeviation = actualUpperPct - 0.5;
      const lowerDeviation = actualLowerPct - 0.5;

      // Calculate tick width
      const tickWidth = tickUpper - tickLower;

      // Check if directional range is correct
      const isDirectionalCorrect = pos.status === 'Open-UP'
        ? (actualUpperPct > actualLowerPct) // UP should bias upward
        : (actualLowerPct > actualUpperPct); // DOWN should bias downward

      const result = {
        timestamp: new Date(pos.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        status: pos.status,
        rebalanceType: pos.rebalance_type,
        openPrice: openPrice.toFixed(2),
        tickRange: `${tickLower} to ${tickUpper} (${tickWidth} ticks)`,
        actualRanges: {
          upper: upperRange.toFixed(2),
          lower: lowerRange.toFixed(2)
        },
        idealRanges: {
          upper: idealUpper.toFixed(2),
          lower: idealLower.toFixed(2)
        },
        actualPercentages: {
          upper: `+${actualUpperPct.toFixed(3)}%`,
          lower: `-${actualLowerPct.toFixed(3)}%`
        },
        deviations: {
          upper: `${upperDeviation > 0 ? '+' : ''}${upperDeviation.toFixed(3)}%`,
          lower: `${lowerDeviation > 0 ? '+' : ''}${lowerDeviation.toFixed(3)}%`
        },
        isDirectionalCorrect: isDirectionalCorrect ? '✅' : '❌',
        wethPct: pos.weth_pct?.toFixed(1) + '%',
        usdcPct: pos.usdc_pct?.toFixed(1) + '%'
      };

      analysisResults.push(result);

      console.log(`─────────────────────────────────────────────────────────────────`);
      console.log(`${pos.status} - ${result.timestamp}`);
      console.log(`   Open Price: $${result.openPrice}`);
      console.log(`   Tick Range: ${result.tickRange}`);
      console.log(`   Actual Ranges: $${result.actualRanges.lower} to $${result.actualRanges.upper}`);
      console.log(`   Ideal Ranges:  $${result.idealRanges.lower} to $${result.idealRanges.upper}`);
      console.log(`   Actual %: ${result.actualPercentages.lower} / ${result.actualPercentages.upper}`);
      console.log(`   Deviation from ±0.5%: ${result.deviations.lower} / ${result.deviations.upper}`);
      console.log(`   Directional Bias Correct: ${result.isDirectionalCorrect}`);
      console.log(`   Allocation: ${result.wethPct} WETH, ${result.usdcPct} USDC`);
      console.log('');
    }

    // Summary statistics
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📈 SUMMARY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const upperDeviations = analysisResults.map(r => parseFloat(r.deviations.upper));
    const lowerDeviations = analysisResults.map(r => parseFloat(r.deviations.lower));

    const avgUpperDeviation = upperDeviations.reduce((a, b) => a + b, 0) / upperDeviations.length;
    const avgLowerDeviation = lowerDeviations.reduce((a, b) => a + b, 0) / lowerDeviations.length;

    const maxUpperDeviation = Math.max(...upperDeviations);
    const minUpperDeviation = Math.min(...upperDeviations);
    const maxLowerDeviation = Math.max(...lowerDeviations);
    const minLowerDeviation = Math.min(...lowerDeviations);

    const directionalCorrectCount = analysisResults.filter(r => r.isDirectionalCorrect === '✅').length;
    const directionalAccuracy = (directionalCorrectCount / analysisResults.length * 100).toFixed(1);

    console.log(`Total Rebalances Analyzed: ${analysisResults.length}`);
    console.log(`\nUpper Range Deviation from +0.5% ideal:`);
    console.log(`   Average: ${avgUpperDeviation > 0 ? '+' : ''}${avgUpperDeviation.toFixed(3)}%`);
    console.log(`   Min: ${minUpperDeviation > 0 ? '+' : ''}${minUpperDeviation.toFixed(3)}%`);
    console.log(`   Max: ${maxUpperDeviation > 0 ? '+' : ''}${maxUpperDeviation.toFixed(3)}%`);
    console.log(`\nLower Range Deviation from -0.5% ideal:`);
    console.log(`   Average: ${avgLowerDeviation > 0 ? '+' : ''}${avgLowerDeviation.toFixed(3)}%`);
    console.log(`   Min: ${minLowerDeviation > 0 ? '+' : ''}${minLowerDeviation.toFixed(3)}%`);
    console.log(`   Max: ${maxLowerDeviation > 0 ? '+' : ''}${maxLowerDeviation.toFixed(3)}%`);
    console.log(`\nDirectional Bias Accuracy: ${directionalCorrectCount}/${analysisResults.length} (${directionalAccuracy}%)`);

    // Export analysis results
    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/range-accuracy-report.json',
      JSON.stringify({
        summary: {
          totalRebalances: analysisResults.length,
          upperRangeDeviations: {
            average: avgUpperDeviation,
            min: minUpperDeviation,
            max: maxUpperDeviation
          },
          lowerRangeDeviations: {
            average: avgLowerDeviation,
            min: minLowerDeviation,
            max: maxLowerDeviation
          },
          directionalAccuracy: {
            correct: directionalCorrectCount,
            total: analysisResults.length,
            percentage: directionalAccuracy
          }
        },
        detailedResults: analysisResults
      }, null, 2)
    );
    console.log('\n✅ Exported detailed report to range-accuracy-report.json\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeRangeAccuracy();
