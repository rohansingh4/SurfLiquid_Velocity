import { connectDB } from './db.js';
import Position from './models/Position.js';

async function fixIndex() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    console.log('📋 Checking existing indexes...');
    const indexes = await Position.collection.getIndexes();
    console.log('Current indexes:', Object.keys(indexes));

    console.log('\n🗑️  Dropping old unique index on timestamp...');
    try {
      await Position.collection.dropIndex('timestamp_-1');
      console.log('✅ Successfully dropped unique timestamp index');
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Index already dropped or does not exist');
      } else {
        console.log('⚠️  Error dropping index:', err.message);
      }
    }

    console.log('\n🔄 Recreating indexes without unique constraint...');
    await Position.syncIndexes();

    console.log('\n📋 New indexes:');
    const newIndexes = await Position.collection.getIndexes();
    console.log(Object.keys(newIndexes));

    console.log('\n✅ Index fix complete!');
    console.log('🚀 You can now restart PM2 without duplicate key errors');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixIndex();
