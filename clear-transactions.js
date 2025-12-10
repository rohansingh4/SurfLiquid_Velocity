import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

async function clearTransactions() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get count before deletion
    const transactionCount = await mongoose.connection.db.collection('transactions').countDocuments();
    console.log(`Found ${transactionCount} transactions\n`);

    if (transactionCount === 0) {
      console.log('✅ No transactions to clear');
      await mongoose.disconnect();
      return;
    }

    // Ask for confirmation
    console.log('⚠️  WARNING: This will delete ALL transactions from the database!\n');
    console.log('Press Ctrl+C to cancel, or waiting 3 seconds to proceed...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete all transactions
    const result = await mongoose.connection.db.collection('transactions').deleteMany({});

    console.log(`✅ Deleted ${result.deletedCount} transactions\n`);

    // Verify
    const remainingCount = await mongoose.connection.db.collection('transactions').countDocuments();
    console.log(`Remaining transactions: ${remainingCount}\n`);

    if (remainingCount === 0) {
      console.log('🎉 All transactions cleared successfully!');
    } else {
      console.log('⚠️  Some transactions remain');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearTransactions();
