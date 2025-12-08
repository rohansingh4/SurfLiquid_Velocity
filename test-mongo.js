// Quick MongoDB connection test
import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

async function test() {
  console.log('🔗 Connecting to MongoDB...');
  
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('✅ Connected!\n');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📂 Collections in database:');
    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`   - ${col.name}: ${count} documents`);
    }
    
    // Try to get latest from positions
    console.log('\n📊 Latest position:');
    const latest = await mongoose.connection.db.collection('positions')
      .find()
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latest.length > 0) {
      console.log(`   Status: ${latest[0].status}`);
      console.log(`   Time: ${new Date(latest[0].timestamp).toLocaleString()}`);
      console.log(`   Close: $${latest[0].close?.toFixed(2)}`);
    } else {
      console.log('   No positions found!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

test();



