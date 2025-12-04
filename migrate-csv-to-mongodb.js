import fs from 'fs';
import readline from 'readline';
import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

async function migrateCandlesCSV() {
  console.log('📊 Starting candles.csv migration...');

  const fileStream = fs.createReadStream('candles.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  const batch = [];
  const BATCH_SIZE = 100;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length !== 8) {
      console.warn(`⚠️  Skipping invalid line: ${line}`);
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

    if (batch.length >= BATCH_SIZE) {
      try {
        await Candle.insertMany(batch, { ordered: false });
        count += batch.length;
        console.log(`  ✓ Migrated ${count} candles...`);
        batch.length = 0;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`  ⚠️  Some duplicate candles skipped`);
        } else {
          console.error(`  ❌ Error inserting batch:`, error.message);
        }
        batch.length = 0;
      }
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    try {
      await Candle.insertMany(batch, { ordered: false });
      count += batch.length;
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ⚠️  Some duplicate candles skipped`);
      } else {
        console.error(`  ❌ Error inserting final batch:`, error.message);
      }
    }
  }

  console.log(`✅ Candles migration complete! Total: ${count} records`);
  return count;
}

async function migratePositionsCSV() {
  console.log('📊 Starting positions.csv migration...');

  const fileStream = fs.createReadStream('positions.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  const batch = [];
  const BATCH_SIZE = 100;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const parts = line.split(',');
    if (parts.length !== 8) {
      console.warn(`⚠️  Skipping invalid line: ${line}`);
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

    if (batch.length >= BATCH_SIZE) {
      try {
        await Position.insertMany(batch, { ordered: false });
        count += batch.length;
        console.log(`  ✓ Migrated ${count} positions...`);
        batch.length = 0;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`  ⚠️  Some duplicate positions skipped`);
        } else {
          console.error(`  ❌ Error inserting batch:`, error.message);
        }
        batch.length = 0;
      }
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    try {
      await Position.insertMany(batch, { ordered: false });
      count += batch.length;
    } catch (error) {
      if (error.code === 11000) {
        console.log(`  ⚠️  Some duplicate positions skipped`);
      } else {
        console.error(`  ❌ Error inserting final batch:`, error.message);
      }
    }
  }

  console.log(`✅ Positions migration complete! Total: ${count} records`);
  return count;
}

async function main() {
  console.log('🚀 Starting CSV to MongoDB migration...\n');

  try {
    // Connect to MongoDB
    await connectDB();

    // Check if CSV files exist
    if (!fs.existsSync('candles.csv')) {
      console.error('❌ candles.csv not found!');
      process.exit(1);
    }

    if (!fs.existsSync('positions.csv')) {
      console.error('❌ positions.csv not found!');
      process.exit(1);
    }

    // Migrate data
    const candlesCount = await migrateCandlesCSV();
    console.log('');
    const positionsCount = await migratePositionsCSV();

    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Candles: ${candlesCount} records`);
    console.log(`   - Positions: ${positionsCount} records`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
