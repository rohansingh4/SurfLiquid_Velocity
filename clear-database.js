import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

async function clearDatabase() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    console.log('\n🗑️  Clearing database...');
    
    // Delete all candles
    const candleResult = await Candle.deleteMany({});
    console.log(`✅ Deleted ${candleResult.deletedCount} candles`);

    // Delete all positions
    const positionResult = await Position.deleteMany({});
    console.log(`✅ Deleted ${positionResult.deletedCount} positions`);

    console.log('\n🎉 Database cleared successfully!');
    console.log('   You can now restart the application to start collecting fresh data.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearDatabase();

