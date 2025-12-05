import { connectDB } from './db.js';
import Position from './models/Position.js';

async function fixHistoricalPositions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    console.log('📊 Fetching all positions...');
    const positions = await Position.find().sort({ timestamp: 1 }).lean();

    if (positions.length === 0) {
      console.log('ℹ️  No positions found to fix');
      process.exit(0);
    }

    console.log(`📝 Found ${positions.length} position records to analyze`);
    console.log('🔄 Analyzing and fixing position data...\n');

    let currentRanges = null;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let needsUpdate = false;
      let updates = {};

      // Check if this is a rebalance point (Price Out of Range with rebalance type)
      const isRebalancePoint = (
        (pos.status.includes('Out of Range')) &&
        (pos.rebalance_type === 'RebalanceA' || pos.rebalance_type === 'RebalanceB')
      );

      if (isRebalancePoint) {
        // This is a rebalance - the NEXT Position Open will have new ranges
        currentRanges = null; // Reset ranges, next position will set new ones
        console.log(`  [${new Date(pos.timestamp).toLocaleString()}] ⚠️  Rebalance point: ${pos.rebalance_type} (${pos.status})`);
        unchangedCount++;
      }
      else if (pos.status === 'Position Open') {
        if (currentRanges === null) {
          // This is the first Position Open or first after a rebalance
          // Lock in these ranges
          currentRanges = {
            upper_range: parseFloat(pos.upper_range),
            lower_range: parseFloat(pos.lower_range)
          };
          console.log(`  [${new Date(pos.timestamp).toLocaleString()}] 🔒 Locked ranges: Upper=$${currentRanges.upper_range.toFixed(2)}, Lower=$${currentRanges.lower_range.toFixed(2)}`);
          unchangedCount++;
        } else {
          // This Position Open should use the locked ranges
          const upperDiff = Math.abs(parseFloat(pos.upper_range) - currentRanges.upper_range);
          const lowerDiff = Math.abs(parseFloat(pos.lower_range) - currentRanges.lower_range);

          if (upperDiff > 0.01 || lowerDiff > 0.01) {
            // Ranges are different, need to fix
            updates.upper_range = parseFloat(currentRanges.upper_range.toFixed(2));
            updates.lower_range = parseFloat(currentRanges.lower_range.toFixed(2));
            needsUpdate = true;
            console.log(`  [${new Date(pos.timestamp).toLocaleString()}] 🔧 Fixing: Upper $${parseFloat(pos.upper_range).toFixed(2)}→$${currentRanges.upper_range.toFixed(2)}, Lower $${parseFloat(pos.lower_range).toFixed(2)}→$${currentRanges.lower_range.toFixed(2)}`);
          } else {
            unchangedCount++;
          }
        }
      } else {
        // Other statuses (Price Out of Range without rebalance, etc.)
        unchangedCount++;
      }

      // Apply updates if needed
      if (needsUpdate) {
        await Position.updateOne(
          { _id: pos._id },
          { $set: updates }
        );
        updatedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration complete!');
    console.log('='.repeat(60));
    console.log(`📊 Total records processed: ${positions.length}`);
    console.log(`🔧 Records updated: ${updatedCount}`);
    console.log(`✓ Records unchanged: ${unchangedCount}`);
    console.log('\n💡 Historical data has been corrected!');
    console.log('📝 Position Open ranges now stay consistent until rebalance occurs');
    console.log('\n🚀 You can now deploy the new code to AWS with confidence!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing positions:', error);
    process.exit(1);
  }
}

fixHistoricalPositions();
