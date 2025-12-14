import { connectDB, mongoose } from './db.js';
import Transaction from './models/Transaction.js';

async function analyzeRangeAccuracyDetailed() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    const db = mongoose.connection.db;

    // Fetch all positions
    console.log('\n📊 Fetching positions...');
    const positions = await db.collection('positions').find({}).sort({ timestamp: 1 }).toArray();
    console.log(`   Found ${positions.length} positions`);

    // Analyze range accuracy for rebalance positions
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('📊 DETAILED RANGE ANALYSIS WITH ALTERNATIVE RANGES');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const rebalancePositions = positions.filter(p =>
      p.status === 'Open-UP' || p.status === 'Open-DOWN'
    );

    console.log(`Found ${rebalancePositions.length} rebalance positions\n`);

    const detailedAnalysis = [];

    for (let i = 0; i < rebalancePositions.length; i++) {
      const pos = rebalancePositions[i];
      const openPrice = pos.open;
      const chosenTickLower = pos.tickLower;
      const chosenTickUpper = pos.tickUpper;
      const tickSpacing = 100;

      // Calculate the open tick
      const openTick = Math.log(openPrice) / Math.log(1.0001);
      const centerTick = Math.round(openTick / tickSpacing) * tickSpacing;

      // Calculate BOTH possible ranges
      const range1 = {
        name: 'Lower Range',
        tickLower: centerTick - tickSpacing,
        tickUpper: centerTick,
        priceLower: Math.pow(1.0001, centerTick - tickSpacing),
        priceUpper: Math.pow(1.0001, centerTick)
      };

      const range2 = {
        name: 'Upper Range',
        tickLower: centerTick,
        tickUpper: centerTick + tickSpacing,
        priceLower: Math.pow(1.0001, centerTick),
        priceUpper: Math.pow(1.0001, centerTick + tickSpacing)
      };

      // Determine which range was chosen
      const chosenRange = (chosenTickLower === range1.tickLower) ? range1 : range2;
      const alternativeRange = (chosenRange === range1) ? range2 : range1;

      // Calculate metrics for both ranges
      const calculateMetrics = (range) => {
        const upperPct = ((range.priceUpper - openPrice) / openPrice) * 100;
        const lowerPct = ((openPrice - range.priceLower) / openPrice) * 100;
        const upperDeviation = upperPct - 0.5;
        const lowerDeviation = lowerPct - 0.5;
        const totalDeviation = Math.abs(upperDeviation) + Math.abs(lowerDeviation);
        const avgDeviation = totalDeviation / 2;

        // Check if directional bias is correct
        const isDirectionalCorrect = pos.status === 'Open-UP'
          ? (upperPct > lowerPct)
          : (lowerPct > upperPct);

        return {
          upperPct,
          lowerPct,
          upperDeviation,
          lowerDeviation,
          totalDeviation,
          avgDeviation,
          isDirectionalCorrect
        };
      };

      const chosenMetrics = calculateMetrics(chosenRange);
      const altMetrics = calculateMetrics(alternativeRange);

      // Ideal ±0.5% targets
      const idealUpper = openPrice * 1.005;
      const idealLower = openPrice * 0.995;

      const analysis = {
        index: i + 1,
        timestamp: new Date(pos.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        signal: pos.status,
        openPrice: openPrice.toFixed(2),
        openTick: openTick.toFixed(2),
        centerTick: centerTick,
        idealRanges: {
          upper: idealUpper.toFixed(2),
          lower: idealLower.toFixed(2)
        },
        chosenRange: {
          name: chosenRange.name,
          tickRange: `${chosenRange.tickLower} to ${chosenRange.tickUpper}`,
          priceRange: `$${chosenRange.priceLower.toFixed(2)} to $${chosenRange.priceUpper.toFixed(2)}`,
          upperPct: chosenMetrics.upperPct.toFixed(3),
          lowerPct: chosenMetrics.lowerPct.toFixed(3),
          upperDev: chosenMetrics.upperDeviation.toFixed(3),
          lowerDev: chosenMetrics.lowerDeviation.toFixed(3),
          avgDev: chosenMetrics.avgDeviation.toFixed(3),
          directionalCorrect: chosenMetrics.isDirectionalCorrect
        },
        alternativeRange: {
          name: alternativeRange.name,
          tickRange: `${alternativeRange.tickLower} to ${alternativeRange.tickUpper}`,
          priceRange: `$${alternativeRange.priceLower.toFixed(2)} to $${alternativeRange.priceUpper.toFixed(2)}`,
          upperPct: altMetrics.upperPct.toFixed(3),
          lowerPct: altMetrics.lowerPct.toFixed(3),
          upperDev: altMetrics.upperDeviation.toFixed(3),
          lowerDev: altMetrics.lowerDeviation.toFixed(3),
          avgDev: altMetrics.avgDeviation.toFixed(3),
          directionalCorrect: altMetrics.isDirectionalCorrect
        },
        choiceAnalysis: {
          chosenBetter: chosenMetrics.avgDeviation < altMetrics.avgDeviation,
          chosenDirectionalCorrect: chosenMetrics.isDirectionalCorrect,
          altDirectionalCorrect: altMetrics.isDirectionalCorrect,
          deviationDiff: (chosenMetrics.avgDeviation - altMetrics.avgDeviation).toFixed(3)
        }
      };

      detailedAnalysis.push(analysis);

      // Print detailed comparison
      console.log(`${'═'.repeat(100)}`);
      console.log(`REBALANCE #${analysis.index} - ${analysis.signal} - ${analysis.timestamp}`);
      console.log(`${'═'.repeat(100)}`);
      console.log(`Open Price: $${analysis.openPrice} (tick ${analysis.openTick})`);
      console.log(`Center Tick: ${analysis.centerTick}`);
      console.log(`Ideal ±0.5% Range: $${analysis.idealRanges.lower} to $${analysis.idealRanges.upper}`);
      console.log('');

      // Chosen Range
      console.log(`✅ CHOSEN: ${analysis.chosenRange.name}`);
      console.log(`   Tick Range:      ${analysis.chosenRange.tickRange}`);
      console.log(`   Price Range:     ${analysis.chosenRange.priceRange}`);
      console.log(`   Actual %:        ${analysis.chosenRange.lowerPct > 0 ? '-' : ''}${analysis.chosenRange.lowerPct}% / +${analysis.chosenRange.upperPct}%`);
      console.log(`   Deviation:       ${analysis.chosenRange.lowerDev > 0 ? '+' : ''}${analysis.chosenRange.lowerDev}% / ${analysis.chosenRange.upperDev > 0 ? '+' : ''}${analysis.chosenRange.upperDev}%`);
      console.log(`   Avg Deviation:   ${analysis.chosenRange.avgDev}%`);
      console.log(`   Directional:     ${analysis.chosenRange.directionalCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log('');

      // Alternative Range
      console.log(`⚪ ALTERNATIVE: ${analysis.alternativeRange.name}`);
      console.log(`   Tick Range:      ${analysis.alternativeRange.tickRange}`);
      console.log(`   Price Range:     ${analysis.alternativeRange.priceRange}`);
      console.log(`   Actual %:        ${analysis.alternativeRange.lowerPct > 0 ? '-' : ''}${analysis.alternativeRange.lowerPct}% / +${analysis.alternativeRange.upperPct}%`);
      console.log(`   Deviation:       ${analysis.alternativeRange.lowerDev > 0 ? '+' : ''}${analysis.alternativeRange.lowerDev}% / ${analysis.alternativeRange.upperDev > 0 ? '+' : ''}${analysis.alternativeRange.upperDev}%`);
      console.log(`   Avg Deviation:   ${analysis.alternativeRange.avgDev}%`);
      console.log(`   Directional:     ${analysis.alternativeRange.directionalCorrect ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log('');

      // Comparison
      console.log(`📊 COMPARISON:`);
      if (analysis.choiceAnalysis.chosenBetter) {
        console.log(`   ✅ Chosen range has BETTER centering (${analysis.choiceAnalysis.deviationDiff}% closer to ±0.5%)`);
      } else {
        console.log(`   ⚠️  Alternative range has better centering (+${Math.abs(parseFloat(analysis.choiceAnalysis.deviationDiff))}% closer to ±0.5%)`);
      }

      if (analysis.choiceAnalysis.chosenDirectionalCorrect && !analysis.choiceAnalysis.altDirectionalCorrect) {
        console.log(`   ✅ Chosen range has CORRECT directional bias, alternative would be WRONG`);
      } else if (!analysis.choiceAnalysis.chosenDirectionalCorrect && analysis.choiceAnalysis.altDirectionalCorrect) {
        console.log(`   ❌ Alternative range has correct directional bias, chosen is WRONG`);
      } else if (analysis.choiceAnalysis.chosenDirectionalCorrect && analysis.choiceAnalysis.altDirectionalCorrect) {
        console.log(`   ⚪ Both ranges have correct directional bias`);
      }
      console.log('');
    }

    // Summary Statistics
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('📈 SUMMARY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const chosenBetterCount = detailedAnalysis.filter(a => a.choiceAnalysis.chosenBetter).length;
    const altBetterCount = detailedAnalysis.length - chosenBetterCount;

    const chosenDirectionalCorrect = detailedAnalysis.filter(a => a.choiceAnalysis.chosenDirectionalCorrect).length;
    const altDirectionalCorrect = detailedAnalysis.filter(a => a.choiceAnalysis.altDirectionalCorrect).length;

    const bothDirectionalCorrect = detailedAnalysis.filter(a =>
      a.choiceAnalysis.chosenDirectionalCorrect && a.choiceAnalysis.altDirectionalCorrect
    ).length;

    const onlyChosenCorrect = detailedAnalysis.filter(a =>
      a.choiceAnalysis.chosenDirectionalCorrect && !a.choiceAnalysis.altDirectionalCorrect
    ).length;

    const onlyAltCorrect = detailedAnalysis.filter(a =>
      !a.choiceAnalysis.chosenDirectionalCorrect && a.choiceAnalysis.altDirectionalCorrect
    ).length;

    console.log(`Total Rebalances: ${detailedAnalysis.length}`);
    console.log('');
    console.log(`CENTERING ACCURACY:`);
    console.log(`   Chosen range closer to ±0.5%:      ${chosenBetterCount} (${(chosenBetterCount/detailedAnalysis.length*100).toFixed(1)}%)`);
    console.log(`   Alternative range closer to ±0.5%: ${altBetterCount} (${(altBetterCount/detailedAnalysis.length*100).toFixed(1)}%)`);
    console.log('');
    console.log(`DIRECTIONAL BIAS:`);
    console.log(`   Chosen range directional correct:     ${chosenDirectionalCorrect}/${detailedAnalysis.length} (${(chosenDirectionalCorrect/detailedAnalysis.length*100).toFixed(1)}%)`);
    console.log(`   Alternative range directional correct: ${altDirectionalCorrect}/${detailedAnalysis.length} (${(altDirectionalCorrect/detailedAnalysis.length*100).toFixed(1)}%)`);
    console.log('');
    console.log(`DIRECTIONAL BREAKDOWN:`);
    console.log(`   Both ranges correct:          ${bothDirectionalCorrect}`);
    console.log(`   Only chosen correct:          ${onlyChosenCorrect}`);
    console.log(`   Only alternative correct:     ${onlyAltCorrect}`);
    console.log(`   Neither correct (impossible): ${detailedAnalysis.length - bothDirectionalCorrect - onlyChosenCorrect - onlyAltCorrect}`);
    console.log('');

    // Average deviations
    const avgChosenDev = detailedAnalysis.reduce((sum, a) => sum + parseFloat(a.chosenRange.avgDev), 0) / detailedAnalysis.length;
    const avgAltDev = detailedAnalysis.reduce((sum, a) => sum + parseFloat(a.alternativeRange.avgDev), 0) / detailedAnalysis.length;

    console.log(`AVERAGE DEVIATION FROM ±0.5%:`);
    console.log(`   Chosen ranges:      ${avgChosenDev.toFixed(3)}%`);
    console.log(`   Alternative ranges: ${avgAltDev.toFixed(3)}%`);
    console.log('');

    // Export detailed analysis
    const fs = await import('fs');
    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/detailed-range-comparison.json',
      JSON.stringify(detailedAnalysis, null, 2)
    );
    console.log('✅ Exported detailed comparison to detailed-range-comparison.json\n');

    // Export summary
    const summary = {
      totalRebalances: detailedAnalysis.length,
      centering: {
        chosenBetter: chosenBetterCount,
        alternativeBetter: altBetterCount,
        chosenBetterPct: (chosenBetterCount/detailedAnalysis.length*100).toFixed(1)
      },
      directional: {
        chosenCorrect: chosenDirectionalCorrect,
        alternativeCorrect: altDirectionalCorrect,
        bothCorrect: bothDirectionalCorrect,
        onlyChosenCorrect: onlyChosenCorrect,
        onlyAlternativeCorrect: onlyAltCorrect
      },
      averageDeviations: {
        chosen: avgChosenDev.toFixed(3),
        alternative: avgAltDev.toFixed(3),
        difference: (avgChosenDev - avgAltDev).toFixed(3)
      }
    };

    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/range-comparison-summary.json',
      JSON.stringify(summary, null, 2)
    );
    console.log('✅ Exported summary to range-comparison-summary.json\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeRangeAccuracyDetailed();
