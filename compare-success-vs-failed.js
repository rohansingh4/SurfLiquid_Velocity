import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

const transactionSchema = new mongoose.Schema({}, { collection: 'transactions', strict: false });
const Transaction = mongoose.model('Transaction', transactionSchema);

async function compareTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Get last successful add LP (around 8:17 AM)
    const lastSuccess = await Transaction.findOne({
      txType: 'add_liquidity',
      status: 'success'
    }).sort({ timestamp: -1 }).lean();

    // Get first failed add LP (around 10:50 AM)
    const firstFailed = await Transaction.findOne({
      txType: 'add_liquidity',
      status: 'failed'
    }).sort({ timestamp: 1 }).lean();

    console.log('=== LAST SUCCESSFUL ADD LP (Dec 9, 8:17 AM) ===');
    console.log(JSON.stringify(lastSuccess, null, 2));

    console.log('\n\n=== FIRST FAILED ADD LP (Dec 9, 10:50 AM) ===');
    console.log(JSON.stringify(firstFailed, null, 2));

    // Get a sample of successful transactions to see field structure
    console.log('\n\n=== SAMPLE OF SUCCESSFUL TRANSACTIONS (showing all fields) ===');
    const samples = await Transaction.find({
      txType: 'add_liquidity',
      status: 'success'
    }).sort({ timestamp: -1 }).limit(3).lean();

    samples.forEach((tx, i) => {
      console.log(`\n--- Sample ${i + 1} ---`);
      console.log(`Timestamp: ${tx.timestamp}`);
      console.log(`All fields: ${Object.keys(tx).join(', ')}`);
      console.log(`Full data:`, tx);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

compareTransactions();
