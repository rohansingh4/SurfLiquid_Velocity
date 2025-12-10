import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

async function analyzeTransactions() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const txSchema = new mongoose.Schema({}, { collection: 'transactions', strict: false });
    const Transaction = mongoose.model('Transaction', txSchema);

    // Get all recent transactions
    const transactions = await Transaction.find()
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    console.log('=== RECENT TRANSACTIONS ===\n');

    transactions.reverse().forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.timestamp.toISOString()}`);
      console.log(`   Signal: ${tx.signal}`);
      console.log(`   Type: ${tx.txType}`);
      console.log(`   Status: ${tx.status}`);

      if (tx.wethBalanceBefore !== undefined) {
        console.log(`   Balance Before: ${tx.wethBalanceBefore?.toFixed(6)} WETH, ${tx.usdcBalanceBefore?.toFixed(2)} USDC`);
      }
      if (tx.wethBalanceAfter !== undefined) {
        console.log(`   Balance After: ${tx.wethBalanceAfter?.toFixed(6)} WETH, ${tx.usdcBalanceAfter?.toFixed(2)} USDC`);
      }
      if (tx.wethAmount !== undefined) {
        console.log(`   Swap: ${tx.wethAmount?.toFixed(6)} WETH, ${tx.usdcAmount?.toFixed(2)} USDC`);
      }
      if (tx.upperRange) {
        console.log(`   Range: $${tx.lowerRange?.toFixed(2)} - $${tx.upperRange?.toFixed(2)}`);
      }
      if (tx.portfolioValueBefore !== undefined) {
        console.log(`   Portfolio: Before=$${tx.portfolioValueBefore?.toFixed(2)}, After=$${tx.portfolioValueAfter?.toFixed(2)}`);
      }
      if (tx.profitLoss !== undefined) {
        console.log(`   P&L: $${tx.profitLoss?.toFixed(2)}`);
      }
      console.log('');
    });

    // Analyze the pattern
    console.log('\n=== PATTERN ANALYSIS ===\n');

    const grouped = {};
    transactions.forEach(tx => {
      const time = tx.timestamp.toISOString().substring(0, 16); // Group by minute
      if (!grouped[time]) grouped[time] = [];
      grouped[time].push({ signal: tx.signal, type: tx.txType });
    });

    Object.keys(grouped).sort().reverse().slice(0, 10).forEach(time => {
      const txs = grouped[time];
      console.log(`${time}: ${txs.map(t => `${t.signal}→${t.type}`).join(', ')}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

analyzeTransactions();
