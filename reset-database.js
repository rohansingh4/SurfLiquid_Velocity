import { connectDB, mongoose } from './db.js';

async function resetDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to Velocity database\n');

    const db = mongoose.connection.db;

    console.log('📊 DATABASE RESET - Clearing ALL position and candle data\n');
    console.log('='.repeat(60));

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`\n📦 Found collections: ${collections.map(c => c.name).join(', ')}\n`);

    let totalDeleted = 0;

    // Clear Position collection (capital P - used by old code)
    try {
      const posCount = await db.collection('Position').countDocuments();
      if (posCount > 0) {
        console.log(`🗑️  Position (capital P): ${posCount} documents`);
        await db.collection('Position').deleteMany({});
        console.log(`   ✅ Deleted ${posCount} documents`);
        totalDeleted += posCount;
      } else {
        console.log(`✓  Position collection: empty`);
      }
    } catch (e) {
      console.log(`ℹ️  Position collection: not found`);
    }

    // Clear positions collection (lowercase - used by sonic-execution)
    try {
      const posCount = await db.collection('positions').countDocuments();
      if (posCount > 0) {
        console.log(`\n🗑️  positions (lowercase): ${posCount} documents`);
        await db.collection('positions').deleteMany({});
        console.log(`   ✅ Deleted ${posCount} documents`);
        totalDeleted += posCount;
      } else {
        console.log(`✓  positions collection: empty`);
      }
    } catch (e) {
      console.log(`ℹ️  positions collection: not found`);
    }

    // Clear positions_swapx collection
    try {
      const swapxCount = await db.collection('positions_swapx').countDocuments();
      if (swapxCount > 0) {
        console.log(`\n🗑️  positions_swapx: ${swapxCount} documents`);
        await db.collection('positions_swapx').deleteMany({});
        console.log(`   ✅ Deleted ${swapxCount} documents`);
        totalDeleted += swapxCount;
      } else {
        console.log(`✓  positions_swapx collection: empty`);
      }
    } catch (e) {
      console.log(`ℹ️  positions_swapx collection: not found`);
    }

    // Clear candles collection (optional - usually want to keep historical data)
    try {
      const candleCount = await db.collection('candles').countDocuments();
      console.log(`\nℹ️  candles collection: ${candleCount} documents (NOT deleted - historical data)`);
    } catch (e) {
      console.log(`ℹ️  candles collection: not found`);
    }

    // Show transactions (NOT deleted - for debugging)
    try {
      const txCount = await db.collection('transactions').countDocuments();
      console.log(`ℹ️  transactions collection: ${txCount} documents (NOT deleted - for debugging)`);
    } catch (e) {
      console.log(`ℹ️  transactions collection: not found`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ DATABASE RESET COMPLETE!`);
    console.log(`   Total position documents deleted: ${totalDeleted}`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. On AWS: pm2 restart velocity`);
    console.log(`   2. Bot will start fresh with clean slate`);
    console.log(`   3. Ranges will be calculated from first candle open price\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

resetDatabase();
