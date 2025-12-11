import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

async function verifyRangeCalculation() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Fetch positions with Open-UP or Open-DOWN status (rebalances)
    const positions = await mongoose.connection.db.collection('positionswapxes')
      .find({ status: { $in: ['Open-UP', 'Open-DOWN'] } })
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    console.log(`📊 Found ${positions.length} rebalance positions\n`);
    console.log('='.repeat(140));
    console.log('Timestamp'.padEnd(25), 'Status'.padEnd(12), 'Open Price'.padEnd(14), 'Open Tick'.padEnd(12), 'tickLower'.padEnd(10), 'tickUpper'.padEnd(10), 'Range'.padEnd(8), '±50 Valid?');
    console.log('='.repeat(140));

    let correctCount = 0;
    let incorrectCount = 0;

    positions.reverse().forEach(pos => {
      const time = new Date(pos.timestamp).toLocaleString();
      const status = pos.status;
      const openPrice = pos.open || pos.close;
      
      // Calculate what the open tick should be
      const openTick = Math.floor(Math.log(openPrice) / Math.log(1.0001));
      
      const tickLower = pos.tickLower;
      const tickUpper = pos.tickUpper;
      const rangeWidth = tickUpper - tickLower;
      
      // Check if range covers ±50 from open tick
      // With tick spacing 100, the valid range should contain openTick ± 50
      const expectedLower = Math.floor((openTick - 50) / 100) * 100;
      const expectedUpper = Math.ceil((openTick + 50) / 100) * 100;
      
      const isCorrect = (tickLower === expectedLower && tickUpper === expectedUpper);
      
      if (isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
      
      const status_icon = isCorrect ? '✅' : '❌';
      
      console.log(
        time.padEnd(25),
        status.padEnd(12),
        `$${openPrice?.toFixed(2) || 'N/A'}`.padEnd(14),
        openTick.toString().padEnd(12),
        (tickLower?.toString() || 'N/A').padEnd(10),
        (tickUpper?.toString() || 'N/A').padEnd(10),
        rangeWidth?.toString().padEnd(8) || 'N/A',
        `${status_icon} (exp: ${expectedLower}-${expectedUpper})`
      );
    });

    console.log('\n' + '='.repeat(140));
    console.log(`\n📈 SUMMARY:`);
    console.log(`   ✅ Correct (±50 ticks): ${correctCount}`);
    console.log(`   ❌ Incorrect: ${incorrectCount}`);
    
    // Also fetch recent transactions to see actual rebalances
    console.log('\n\n📊 RECENT TRANSACTIONS (last 30):\n');
    
    const transactions = await mongoose.connection.db.collection('transactions')
      .find({})
      .sort({ timestamp: -1 })
      .limit(30)
      .toArray();
    
    console.log('Timestamp'.padEnd(25), 'Signal'.padEnd(12), 'Type'.padEnd(18), 'Status'.padEnd(10), 'tickLower'.padEnd(10), 'tickUpper'.padEnd(10), 'Price');
    console.log('-'.repeat(120));
    
    transactions.reverse().forEach(tx => {
      const time = new Date(tx.timestamp).toLocaleString();
      console.log(
        time.padEnd(25),
        (tx.signal || 'N/A').padEnd(12),
        (tx.txType || 'N/A').padEnd(18),
        (tx.status || 'N/A').padEnd(10),
        (tx.tickLower?.toString() || '-').padEnd(10),
        (tx.tickUpper?.toString() || '-').padEnd(10),
        tx.price ? `$${tx.price.toFixed(2)}` : '-'
      );
    });

    await mongoose.disconnect();
    console.log('\n✅ Done\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyRangeCalculation();
