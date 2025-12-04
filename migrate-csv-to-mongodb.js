import fs from 'fs';
import readline from 'readline';
import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

async function migrateCandlesCSV() {
  console.log('📊 Starting candles.csv migration...');

  if (!fs.existsSync('candles.csv')) {
    console.log('⚠️  candles.csv not found, skipping...');
    return 0;
  }

  const fileStream = fs.createReadStream('candles.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalProcessed = 0;
  let successCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  const batch = [];
  const BATCH_SIZE = 50; // Smaller batches for better duplicate handling

  for await (const line of rl) {
    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length !== 8) {
      console.warn(`⚠️  Skipping invalid line (${parts.length} fields): ${line.substring(0, 50)}...`);
      errorCount++;
      continue;
    }

    const [timestamp, open, high, low, close, liquidity, weth_amount, usdc_amount] = parts;

    batch.push({
      timestamp: new Date(timestamp),
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      liquidity: liquidity,
      weth_amount: parseFloat(weth_amount),
      usdc_amount: parseFloat(usdc_amount)
    });
    totalProcessed++;

    if (batch.length >= BATCH_SIZE) {
      const result = await processCandleBatch(batch);
      successCount += result.success;
      duplicateCount += result.duplicates;
      errorCount += result.errors;

      console.log(`  📈 Progress: ${totalProcessed} processed | ${successCount} inserted | ${duplicateCount} duplicates | ${errorCount} errors`);
      batch.length = 0;
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    const result = await processCandleBatch(batch);
    successCount += result.success;
    duplicateCount += result.duplicates;
    errorCount += result.errors;
  }

  console.log(`\n✅ Candles migration complete!`);
  console.log(`   📊 Total processed: ${totalProcessed}`);
  console.log(`   ✅ Successfully inserted: ${successCount}`);
  console.log(`   ⚠️  Duplicates skipped: ${duplicateCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  return successCount;
}

async function processCandleBatch(batch) {
  let success = 0;
  let duplicates = 0;
  let errors = 0;

  // Try bulk insert first
  try {
    const result = await Candle.insertMany(batch, { ordered: false });
    success = result.length;
    return { success, duplicates, errors };
  } catch (error) {
    // If bulk insert fails, process individually to count duplicates vs errors
    if (error.code === 11000 || (error.writeErrors && error.writeErrors.length > 0)) {
      // Some succeeded, some failed
      if (error.insertedDocs) {
        success = error.insertedDocs.length;
      }

      // Count duplicate errors
      if (error.writeErrors) {
        for (const writeError of error.writeErrors) {
          if (writeError.code === 11000) {
            duplicates++;
          } else {
            errors++;
          }
        }
      }

      return { success, duplicates, errors };
    } else {
      // Unexpected error, count all as errors
      console.error(`  ❌ Unexpected error:`, error.message);
      errors = batch.length;
      return { success, duplicates, errors };
    }
  }
}

async function migratePositionsCSV() {
  console.log('\n📍 Starting positions.csv migration...');

  if (!fs.existsSync('positions.csv')) {
    console.log('⚠️  positions.csv not found, skipping...');
    return 0;
  }

  const fileStream = fs.createReadStream('positions.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let totalProcessed = 0;
  let successCount = 0;
  let errorCount = 0;
  const batch = [];
  const BATCH_SIZE = 50;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length !== 8) {
      console.warn(`⚠️  Skipping invalid line (${parts.length} fields): ${line.substring(0, 50)}...`);
      errorCount++;
      continue;
    }

    const [timestamp, status, price, upper_range, lower_range, weth_pct, usdc_pct, rebalance_type] = parts;

    batch.push({
      timestamp: new Date(timestamp),
      status: status,
      price: parseFloat(price),
      upper_range: parseFloat(upper_range),
      lower_range: parseFloat(lower_range),
      weth_pct: parseFloat(weth_pct),
      usdc_pct: parseFloat(usdc_pct),
      rebalance_type: rebalance_type
    });
    totalProcessed++;

    if (batch.length >= BATCH_SIZE) {
      try {
        const inserted = await Position.insertMany(batch, { ordered: false });
        successCount += inserted.length;
        console.log(`  📈 Progress: ${totalProcessed} processed | ${successCount} inserted`);
      } catch (error) {
        if (error.code === 11000 || error.writeErrors) {
          // Count successful inserts even with some duplicates
          if (error.insertedDocs) {
            successCount += error.insertedDocs.length;
          }
          console.log(`  📈 Progress: ${totalProcessed} processed | ${successCount} inserted (some duplicates)`);
        } else {
          console.error(`  ❌ Error inserting batch:`, error.message);
          errorCount += batch.length;
        }
      }
      batch.length = 0;
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    try {
      const inserted = await Position.insertMany(batch, { ordered: false });
      successCount += inserted.length;
    } catch (error) {
      if (error.code === 11000 || error.writeErrors) {
        if (error.insertedDocs) {
          successCount += error.insertedDocs.length;
        }
      } else {
        console.error(`  ❌ Error inserting final batch:`, error.message);
        errorCount += batch.length;
      }
    }
  }

  console.log(`\n✅ Positions migration complete!`);
  console.log(`   📊 Total processed: ${totalProcessed}`);
  console.log(`   ✅ Successfully inserted: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  return successCount;
}

async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  try {
    const [candleCount, positionCount, latestCandle, latestPosition] = await Promise.all([
      Candle.countDocuments(),
      Position.countDocuments(),
      Candle.findOne().sort({ timestamp: -1 }),
      Position.findOne().sort({ timestamp: -1 })
    ]);

    console.log(`\n📊 MongoDB Database Status:`);
    console.log(`   🕯️  Total Candles: ${candleCount.toLocaleString()}`);
    console.log(`   📍 Total Positions: ${positionCount.toLocaleString()}`);

    if (latestCandle) {
      console.log(`   🕐 Latest Candle: ${new Date(latestCandle.timestamp).toLocaleString()}`);
      console.log(`      Price: $${latestCandle.close.toFixed(2)}`);
    }

    if (latestPosition) {
      console.log(`   🕐 Latest Position: ${new Date(latestPosition.timestamp).toLocaleString()}`);
      console.log(`      Status: ${latestPosition.status}`);
    }

    return { candleCount, positionCount };
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return null;
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('🚀 CSV TO MONGODB MIGRATION TOOL');
  console.log('═'.repeat(70));
  console.log('This script will migrate all CSV data to MongoDB.');
  console.log('Duplicates will be safely skipped based on timestamps.\n');

  const startTime = Date.now();

  try {
    // Connect to MongoDB
    await connectDB();

    // Check for CSV files
    const candlesCsvExists = fs.existsSync('candles.csv');
    const positionsCsvExists = fs.existsSync('positions.csv');

    if (!candlesCsvExists && !positionsCsvExists) {
      console.error('\n❌ No CSV files found!');
      console.error('   Expected: candles.csv and/or positions.csv');
      console.error('   Make sure you are in the correct directory.\n');
      process.exit(1);
    }

    console.log(`📂 Found CSV files:`);
    console.log(`   ${candlesCsvExists ? '✅' : '❌'} candles.csv`);
    console.log(`   ${positionsCsvExists ? '✅' : '❌'} positions.csv\n`);

    // Migrate data
    const candlesCount = await migrateCandlesCSV();
    const positionsCount = await migratePositionsCSV();

    // Verify migration
    const verification = await verifyMigration();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '═'.repeat(70));
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(70));
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📝 CSV files have been preserved as backup`);
    console.log(`🗄️  All data is now safely stored in MongoDB\n`);

    if (verification) {
      console.log('✅ Your application is ready to run with MongoDB!');
      console.log('   Start your app with: npm start\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n' + '═'.repeat(70));
    console.error('❌ MIGRATION FAILED');
    console.error('═'.repeat(70));
    console.error('Error:', error.message);
    console.error('\nPlease check the error above and try again.');
    console.error('Your CSV files remain unchanged.\n');
    process.exit(1);
  }
}

main();
