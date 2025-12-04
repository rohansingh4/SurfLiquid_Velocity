import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

async function verifyData() {
  console.log('🔍 Verifying MongoDB data...\n');

  try {
    await connectDB();

    // Count candles
    const candleCount = await Candle.countDocuments();
    console.log(`📊 Total candles in database: ${candleCount}`);

    // Get latest candles
    const latestCandles = await Candle.find().sort({ timestamp: -1 }).limit(5);
    console.log('\n📈 Latest 5 candles:');
    latestCandles.forEach(candle => {
      console.log(`  ${candle.timestamp.toISOString()} | O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`);
    });

    // Count positions
    const positionCount = await Position.countDocuments();
    console.log(`\n📍 Total positions in database: ${positionCount}`);

    // Get latest positions
    const latestPositions = await Position.find().sort({ timestamp: -1 }).limit(5);
    console.log('\n📍 Latest 5 positions:');
    latestPositions.forEach(pos => {
      console.log(`  ${pos.timestamp.toISOString()} | ${pos.status} | Price: ${pos.price}`);
    });

    console.log('\n✅ Verification complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyData();
