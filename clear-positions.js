import { connectDB } from './db.js';
import Position from './models/Position.js';

async function clearPositions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    console.log('🗑️  Deleting all position data...');
    const result = await Position.deleteMany({});

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Successfully deleted ${result.deletedCount} position records`);
    console.log('='.repeat(60));
    console.log('💡 Your system will now start collecting position data with the new correct logic');
    console.log('🚀 Deploy to AWS and restart PM2 to begin fresh!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing positions:', error);
    process.exit(1);
  }
}

clearPositions();
