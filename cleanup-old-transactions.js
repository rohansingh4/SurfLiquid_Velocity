import { connectDB } from './db.js';
import Transaction from './models/Transaction.js';

async function cleanupOldTransactions() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    // 12/9/2025, 12:51:57 AM IST = December 9, 2025 at 00:51:57 IST
    // Converting to UTC: IST is UTC+5:30, so subtract 5:30
    // UTC time: December 8, 2025 at 19:21:57
    const cutoffDate = new Date('2025-12-08T19:21:57.000Z');

    console.log('\n🗑️  Deleting old transactions...');
    console.log(`   Cutoff date (IST): 12/9/2025, 12:51:57 AM`);
    console.log(`   Cutoff date (UTC): ${cutoffDate.toISOString()}`);

    // Count transactions before deletion
    const countBefore = await Transaction.countDocuments({ timestamp: { $lt: cutoffDate } });
    console.log(`\n📊 Found ${countBefore} transactions before cutoff date`);

    if (countBefore === 0) {
      console.log('✅ No old transactions to delete!');
      process.exit(0);
    }

    // Delete transactions before the cutoff date
    const result = await Transaction.deleteMany({ timestamp: { $lt: cutoffDate } });
    console.log(`✅ Deleted ${result.deletedCount} old transactions`);

    // Count remaining transactions
    const countAfter = await Transaction.countDocuments({});
    console.log(`\n📈 Remaining transactions: ${countAfter}`);

    // Show earliest transaction still in database
    const earliestTransaction = await Transaction.findOne().sort({ timestamp: 1 });
    if (earliestTransaction) {
      console.log(`   Earliest transaction: ${earliestTransaction.timestamp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST`);
      console.log(`   Type: ${earliestTransaction.txType}, Status: ${earliestTransaction.status}`);
    }

    console.log('\n🎉 Cleanup completed successfully!');
    console.log('   P&L calculations should now reflect accurate overnight data.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanupOldTransactions();
