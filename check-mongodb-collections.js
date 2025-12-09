import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/finora?tls=true';

async function checkCollections() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log('=== AVAILABLE COLLECTIONS ===');
    console.log(`Found ${collections.length} collections:\n`);

    for (const collection of collections) {
      console.log(`📦 ${collection.name}`);

      // Get count of documents in each collection
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`   Documents: ${count}`);

      // Get sample document to see structure
      const sample = await mongoose.connection.db.collection(collection.name).findOne();
      if (sample) {
        console.log(`   Sample keys: ${Object.keys(sample).join(', ')}`);
        if (sample.timestamp) {
          const latest = await mongoose.connection.db.collection(collection.name)
            .find()
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();
          console.log(`   Latest: ${latest[0].timestamp}`);
        }
      }
      console.log('');
    }

    await mongoose.disconnect();
    console.log('✅ Check complete');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkCollections();
