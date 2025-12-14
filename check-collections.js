import { connectDB, mongoose } from './db.js';

async function checkCollections() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    const db = mongoose.connection.db;

    // List all collections
    console.log('\n📊 Available collections in Velocity database:');
    const collections = await db.listCollections().toArray();
    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`   ${coll.name}: ${count} documents`);
    }

    // Check specifically for position-related collections
    console.log('\n🔍 Checking position-related collections:');
    const positionCollections = ['Position', 'positions', 'positions_swapx'];
    for (const collName of positionCollections) {
      try {
        const count = await db.collection(collName).countDocuments();
        console.log(`   ${collName}: ${count} documents`);

        if (count > 0) {
          const sample = await db.collection(collName).findOne();
          console.log(`   Sample document from ${collName}:`);
          console.log(JSON.stringify(sample, null, 2));
        }
      } catch (error) {
        console.log(`   ${collName}: Collection doesn't exist`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCollections();
