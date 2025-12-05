import { connectDB } from './db.js';
import Position from './models/Position.js';

async function checkPositions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    // Get the last 20 positions to see the flow
    const positions = await Position.find()
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    console.log('\n📊 Last 20 Position Records:\n');
    console.log('Timestamp'.padEnd(25), 'Status'.padEnd(30), 'Rebalance Type'.padEnd(20), 'Upper Range'.padEnd(12), 'Lower Range');
    console.log('='.repeat(120));

    positions.reverse().forEach(pos => {
      const time = new Date(pos.timestamp).toLocaleString();
      const status = pos.status;
      const rebalance = pos.rebalance_type || 'N/A';
      const upper = `$${pos.upper_range.toFixed(2)}`;
      const lower = `$${pos.lower_range.toFixed(2)}`;

      console.log(
        time.padEnd(25),
        status.padEnd(30),
        rebalance.padEnd(20),
        upper.padEnd(12),
        lower
      );
    });

    console.log('\n✅ Analysis complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkPositions();
