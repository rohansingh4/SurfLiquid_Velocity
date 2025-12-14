import { connectDB, mongoose } from './db.js';

async function analyzeTightBoundaryRisk() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    const db = mongoose.connection.db;

    // Fetch all positions sorted by time
    const positions = await db.collection('positions').find({
      status: { $in: ['Open-UP', 'Open-DOWN', 'Price-UP', 'Price-DOWN'] }
    }).sort({ timestamp: 1 }).toArray();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 TIGHT BOUNDARY RISK ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const rebalances = positions.filter(p => p.status === 'Open-UP' || p.status === 'Open-DOWN');
    console.log(`Total Rebalances: ${rebalances.length}\n`);

    // Analyze each rebalance for tight boundary risk
    const tightBoundaryStats = [];

    for (let i = 0; i < rebalances.length; i++) {
      const current = rebalances[i];
      const next = rebalances[i + 1];

      const openPrice = current.open;
      const upperRange = current.upper_range;
      const lowerRange = current.lower_range;

      // Calculate distances from open to boundaries
      const upperDistance = ((upperRange - openPrice) / openPrice) * 100;
      const lowerDistance = ((openPrice - lowerRange) / openPrice) * 100;

      // Determine which boundary is "tight" (close to open price)
      const tightBoundary = current.status === 'Open-UP' ? 'lower' : 'upper';
      const looseBoundary = current.status === 'Open-UP' ? 'upper' : 'lower';
      const tightDistance = current.status === 'Open-UP' ? lowerDistance : upperDistance;
      const looseDistance = current.status === 'Open-UP' ? upperDistance : lowerDistance;

      // Check if tight boundary is dangerously close (<0.1%)
      const isDangerouslyClose = tightDistance < 0.1;

      // Check if next rebalance flipped direction
      const flippedDirection = next && (
        (current.status === 'Open-UP' && next.status === 'Open-DOWN') ||
        (current.status === 'Open-DOWN' && next.status === 'Open-UP')
      );

      // Calculate time to next rebalance
      let minutesToNext = null;
      if (next) {
        const timeDiff = new Date(next.timestamp) - new Date(current.timestamp);
        minutesToNext = Math.round(timeDiff / 1000 / 60);
      }

      const stat = {
        index: i + 1,
        timestamp: new Date(current.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        signal: current.status,
        openPrice: openPrice.toFixed(2),
        tightBoundary: tightBoundary,
        tightDistance: tightDistance.toFixed(3),
        looseDistance: looseDistance.toFixed(3),
        isDangerouslyClose: isDangerouslyClose,
        nextSignal: next ? next.status : 'N/A',
        flippedDirection: flippedDirection,
        minutesToNext: minutesToNext
      };

      tightBoundaryStats.push(stat);

      // Print analysis
      const dangerFlag = isDangerouslyClose ? '⚠️ DANGER' : '✅ OK';
      const flipFlag = flippedDirection ? '🔄 FLIPPED' : (next ? '➡️ SAME' : '');

      console.log(`─────────────────────────────────────────────────────────────────`);
      console.log(`#${stat.index} - ${stat.signal} at ${stat.timestamp}`);
      console.log(`   Open Price: $${stat.openPrice}`);
      console.log(`   Tight Boundary (${stat.tightBoundary}): ${stat.tightDistance}% away ${dangerFlag}`);
      console.log(`   Loose Boundary (${stat.looseBoundary}): ${stat.looseDistance}% away`);
      if (next) {
        console.log(`   Next Signal: ${stat.nextSignal} (${stat.minutesToNext} min later) ${flipFlag}`);
      }
      console.log('');
    }

    // Summary statistics
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📈 SUMMARY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const dangerousCount = tightBoundaryStats.filter(s => s.isDangerouslyClose).length;
    const flippedCount = tightBoundaryStats.filter(s => s.flippedDirection).length;
    const consecutiveFlips = tightBoundaryStats.filter((s, i) =>
      s.flippedDirection && i > 0 && tightBoundaryStats[i-1].flippedDirection
    ).length;

    const avgTightDistance = tightBoundaryStats.reduce((sum, s) => sum + parseFloat(s.tightDistance), 0) / tightBoundaryStats.length;
    const minTightDistance = Math.min(...tightBoundaryStats.map(s => parseFloat(s.tightDistance)));
    const maxTightDistance = Math.max(...tightBoundaryStats.map(s => parseFloat(s.tightDistance)));

    // Analyze time between flips
    const flipTimes = tightBoundaryStats.filter(s => s.flippedDirection && s.minutesToNext).map(s => s.minutesToNext);
    const avgFlipTime = flipTimes.length > 0 ? flipTimes.reduce((a, b) => a + b, 0) / flipTimes.length : 0;
    const minFlipTime = flipTimes.length > 0 ? Math.min(...flipTimes) : 0;

    console.log(`TIGHT BOUNDARY ANALYSIS:`);
    console.log(`   Average tight boundary distance: ${avgTightDistance.toFixed(3)}%`);
    console.log(`   Minimum tight boundary distance: ${minTightDistance.toFixed(3)}%`);
    console.log(`   Maximum tight boundary distance: ${maxTightDistance.toFixed(3)}%`);
    console.log(`   Rebalances with <0.1% tight boundary: ${dangerousCount}/${tightBoundaryStats.length} (${(dangerousCount/tightBoundaryStats.length*100).toFixed(1)}%)`);
    console.log('');

    console.log(`DIRECTION FLIP ANALYSIS:`);
    console.log(`   Total direction flips: ${flippedCount}/${tightBoundaryStats.length - 1} (${(flippedCount/(tightBoundaryStats.length-1)*100).toFixed(1)}%)`);
    console.log(`   Consecutive flips (ping-pong): ${consecutiveFlips}`);
    console.log(`   Average time between flips: ${avgFlipTime.toFixed(1)} minutes`);
    console.log(`   Fastest flip: ${minFlipTime} minutes`);
    console.log('');

    // Analyze UP signals specifically
    const upSignals = tightBoundaryStats.filter(s => s.signal === 'Open-UP');
    const upDangerousCount = upSignals.filter(s => s.isDangerouslyClose).length;
    const upFlippedToDown = upSignals.filter(s => s.nextSignal === 'Open-DOWN').length;

    console.log(`OPEN-UP SIGNAL ANALYSIS (Boss's Question):`);
    console.log(`   Total Open-UP signals: ${upSignals.length}`);
    console.log(`   With <0.1% lower boundary: ${upDangerousCount} (${(upDangerousCount/upSignals.length*100).toFixed(1)}%)`);
    console.log(`   Followed by Open-DOWN: ${upFlippedToDown} (${(upFlippedToDown/upSignals.length*100).toFixed(1)}%)`);
    console.log('');

    // Analyze DOWN signals specifically
    const downSignals = tightBoundaryStats.filter(s => s.signal === 'Open-DOWN');
    const downDangerousCount = downSignals.filter(s => s.isDangerouslyClose).length;
    const downFlippedToUp = downSignals.filter(s => s.nextSignal === 'Open-UP').length;

    console.log(`OPEN-DOWN SIGNAL ANALYSIS:`);
    console.log(`   Total Open-DOWN signals: ${downSignals.length}`);
    console.log(`   With <0.1% upper boundary: ${downDangerousCount} (${(downDangerousCount/downSignals.length*100).toFixed(1)}%)`);
    console.log(`   Followed by Open-UP: ${downFlippedToUp} (${(downFlippedToUp/downSignals.length*100).toFixed(1)}%)`);
    console.log('');

    // Find examples of dangerous cases
    console.log(`MOST DANGEROUS CASES (Tight Boundary <0.1%):`);
    const dangerousCases = tightBoundaryStats.filter(s => s.isDangerouslyClose).slice(0, 5);
    for (const c of dangerousCases) {
      console.log(`   ${c.signal} at $${c.openPrice}: ${c.tightBoundary} boundary only ${c.tightDistance}% away`);
      if (c.flippedDirection) {
        console.log(`      → Flipped to ${c.nextSignal} in ${c.minutesToNext} minutes ⚠️`);
      }
    }
    console.log('');

    // Export data
    const fs = await import('fs');
    fs.writeFileSync(
      '/Users/rohansingh/Projects/SurfLiquid_Velocity/tight-boundary-analysis.json',
      JSON.stringify({
        summary: {
          totalRebalances: tightBoundaryStats.length,
          avgTightDistance: avgTightDistance.toFixed(3),
          dangerousCount: dangerousCount,
          flippedCount: flippedCount,
          avgFlipTime: avgFlipTime.toFixed(1),
          minFlipTime: minFlipTime
        },
        upSignals: {
          total: upSignals.length,
          dangerous: upDangerousCount,
          flippedToDown: upFlippedToDown
        },
        downSignals: {
          total: downSignals.length,
          dangerous: downDangerousCount,
          flippedToUp: downFlippedToUp
        },
        allRebalances: tightBoundaryStats
      }, null, 2)
    );

    console.log('✅ Exported analysis to tight-boundary-analysis.json\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeTightBoundaryRisk();
