import { connectDB, mongoose } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

console.log('══════════════════════════════════════════════════════════════════════');
console.log('🧹 MONGODB DUPLICATE CLEANUP TOOL');
console.log('══════════════════════════════════════════════════════════════════════');
console.log('This script will remove duplicate entries based on timestamps.');
console.log('Only the oldest entry for each timestamp will be kept.\n');

async function removeDuplicates(Model, collectionName) {
  console.log(`\n📊 Cleaning ${collectionName}...`);

  try {
    // Find all documents
    const allDocs = await Model.find({}).sort({ timestamp: 1 }).lean();
    console.log(`   Found ${allDocs.length} total documents`);

    // Group by timestamp
    const timestampMap = new Map();
    for (const doc of allDocs) {
      const timestampKey = new Date(doc.timestamp).getTime();
      if (!timestampMap.has(timestampKey)) {
        timestampMap.set(timestampKey, []);
      }
      timestampMap.get(timestampKey).push(doc._id);
    }

    // Find duplicates
    let duplicateCount = 0;
    const idsToDelete = [];

    for (const [timestamp, ids] of timestampMap.entries()) {
      if (ids.length > 1) {
        // Keep the first one, delete the rest
        idsToDelete.push(...ids.slice(1));
        duplicateCount += ids.length - 1;
      }
    }

    console.log(`   Found ${duplicateCount} duplicate entries`);

    if (idsToDelete.length > 0) {
      console.log(`   Deleting ${idsToDelete.length} duplicate documents...`);
      const result = await Model.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`   ✅ Deleted ${result.deletedCount} duplicates`);
    } else {
      console.log(`   ✅ No duplicates found`);
    }

    // Verify final count
    const finalCount = await Model.countDocuments();
    console.log(`   📊 Final count: ${finalCount} unique documents`);

    return { before: allDocs.length, duplicates: duplicateCount, after: finalCount };

  } catch (error) {
    console.error(`   ❌ Error cleaning ${collectionName}:`, error.message);
    throw error;
  }
}

async function recreateUniqueIndexes() {
  console.log(`\n🔧 Recreating unique indexes...`);

  try {
    // Drop existing indexes (except _id)
    console.log(`   Dropping old indexes on candles...`);
    await Candle.collection.dropIndexes();

    console.log(`   Dropping old indexes on positions...`);
    await Position.collection.dropIndexes();

    // Recreate unique indexes
    console.log(`   Creating unique index on candles.timestamp...`);
    await Candle.collection.createIndex({ timestamp: -1 }, { unique: true });

    console.log(`   Creating unique index on positions.timestamp...`);
    await Position.collection.createIndex({ timestamp: -1 }, { unique: true });

    // Create other indexes
    console.log(`   Creating additional indexes...`);
    await Candle.collection.createIndex({ createdAt: -1 });
    await Position.collection.createIndex({ createdAt: -1 });
    await Position.collection.createIndex({ status: 1, timestamp: -1 });

    console.log(`   ✅ All indexes recreated successfully`);

  } catch (error) {
    console.error(`   ❌ Error recreating indexes:`, error.message);
    throw error;
  }
}

async function main() {
  try {
    // Connect to MongoDB
    await connectDB();

    const startTime = Date.now();

    // Clean candles
    const candleResults = await removeDuplicates(Candle, 'candles');

    // Clean positions
    const positionResults = await removeDuplicates(Position, 'positions');

    // Recreate unique indexes
    await recreateUniqueIndexes();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Final summary
    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('🎉 CLEANUP COMPLETED SUCCESSFULLY!');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`\n📊 Candles:`);
    console.log(`   Before: ${candleResults.before} documents`);
    console.log(`   Duplicates removed: ${candleResults.duplicates}`);
    console.log(`   After: ${candleResults.after} unique documents`);
    console.log(`\n📍 Positions:`);
    console.log(`   Before: ${positionResults.before} documents`);
    console.log(`   Duplicates removed: ${positionResults.duplicates}`);
    console.log(`   After: ${positionResults.after} unique documents`);
    console.log(`\n⏱️  Duration: ${duration} seconds`);
    console.log(`\n✅ Your MongoDB database is now clean and duplicate-free!`);
    console.log(`🔒 Unique indexes are in place to prevent future duplicates.`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

main();
