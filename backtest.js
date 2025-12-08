/**
 * SurfLiquid Velocity - Backtest Script
 * 
 * Simulates trading with $50 on historical signal data
 * Run: node backtest.js
 */

import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

// Configuration
const STARTING_BALANCE_USD = 50;
const TRADE_SIZE_PERCENT = 40;  // Use 40% of balance per trade
const SLIPPAGE_BPS = 50;        // 0.5% slippage
const TRADING_FEE_BPS = 30;     // 0.3% fee per trade

async function runBacktest() {
  console.log('='.repeat(70));
  console.log('🧪 SurfLiquid Velocity - Historical Backtest');
  console.log('='.repeat(70));
  console.log(`\n💰 Starting Balance: $${STARTING_BALANCE_USD}`);
  console.log(`📊 Trade Size: ${TRADE_SIZE_PERCENT}% of balance`);
  console.log(`📉 Slippage: ${SLIPPAGE_BPS / 100}%`);
  console.log(`💸 Trading Fee: ${TRADING_FEE_BPS / 100}%\n`);

  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Connected!\n');

    // Fetch all positions sorted by time
    const positions = await mongoose.connection.db.collection('positions')
      .find({})
      .sort({ timestamp: 1 })
      .toArray();

    console.log(`📂 Found ${positions.length} historical signals\n`);

    if (positions.length === 0) {
      console.log('❌ No position data found!');
      process.exit(1);
    }

    // Show time range
    const firstTime = new Date(positions[0].timestamp);
    const lastTime = new Date(positions[positions.length - 1].timestamp);
    const hoursOfData = (lastTime - firstTime) / (1000 * 60 * 60);
    
    console.log(`📅 Data Range:`);
    console.log(`   Start: ${firstTime.toLocaleString()}`);
    console.log(`   End:   ${lastTime.toLocaleString()}`);
    console.log(`   Duration: ${hoursOfData.toFixed(1)} hours\n`);

    // Count signal types
    const signalCounts = {};
    positions.forEach(p => {
      signalCounts[p.status] = (signalCounts[p.status] || 0) + 1;
    });
    
    console.log('📊 Signal Distribution:');
    Object.entries(signalCounts).forEach(([status, count]) => {
      const pct = ((count / positions.length) * 100).toFixed(1);
      const emoji = {
        'Monitoring': '🔵',
        'Price-UP': '🟠⬆️',
        'Price-DOWN': '🟠⬇️',
        'Open-UP': '🟢⬆️',
        'Open-DOWN': '🟢⬇️',
      }[status] || '⚪';
      console.log(`   ${emoji} ${status}: ${count} (${pct}%)`);
    });

    // Run simulation
    console.log('\n' + '='.repeat(70));
    console.log('🎮 SIMULATION RESULTS');
    console.log('='.repeat(70) + '\n');

    let usdcBalance = STARTING_BALANCE_USD;
    let wethBalance = 0;
    let currentPosition = 'USDC';
    let tradesExecuted = [];
    let lastSignalId = null;

    for (const signal of positions) {
      // Skip non-actionable signals
      if (signal.status !== 'Open-UP' && signal.status !== 'Open-DOWN') {
        continue;
      }

      // Skip duplicate signals (same timestamp)
      const signalId = signal.timestamp.toString();
      if (signalId === lastSignalId) continue;
      lastSignalId = signalId;

      const price = signal.close;
      const time = new Date(signal.timestamp);

      if (signal.status === 'Open-UP' && currentPosition === 'USDC') {
        // BUY WETH with USDC
        const tradeAmount = usdcBalance * (TRADE_SIZE_PERCENT / 100);
        const feeAmount = tradeAmount * (TRADING_FEE_BPS / 10000);
        const slippageAmount = tradeAmount * (SLIPPAGE_BPS / 10000);
        const netUsdcSpent = tradeAmount;
        const wethReceived = (tradeAmount - feeAmount - slippageAmount) / price;

        usdcBalance -= netUsdcSpent;
        wethBalance += wethReceived;
        currentPosition = 'WETH';

        tradesExecuted.push({
          time,
          type: 'BUY',
          signal: signal.status,
          price,
          usdcSpent: netUsdcSpent,
          wethReceived,
          fee: feeAmount,
          slippage: slippageAmount,
        });

        console.log(`🟢 BUY  @ ${time.toLocaleString()}`);
        console.log(`   Price: $${price.toFixed(2)} | Spent: $${netUsdcSpent.toFixed(2)} → ${wethReceived.toFixed(6)} WETH`);
        console.log(`   Balance: $${usdcBalance.toFixed(2)} USDC + ${wethBalance.toFixed(6)} WETH\n`);

      } else if (signal.status === 'Open-DOWN' && currentPosition === 'WETH') {
        // SELL WETH for USDC
        const wethToSell = wethBalance;
        const grossUsdc = wethToSell * price;
        const feeAmount = grossUsdc * (TRADING_FEE_BPS / 10000);
        const slippageAmount = grossUsdc * (SLIPPAGE_BPS / 10000);
        const netUsdcReceived = grossUsdc - feeAmount - slippageAmount;

        wethBalance = 0;
        usdcBalance += netUsdcReceived;
        currentPosition = 'USDC';

        tradesExecuted.push({
          time,
          type: 'SELL',
          signal: signal.status,
          price,
          wethSold: wethToSell,
          usdcReceived: netUsdcReceived,
          fee: feeAmount,
          slippage: slippageAmount,
        });

        console.log(`🔴 SELL @ ${time.toLocaleString()}`);
        console.log(`   Price: $${price.toFixed(2)} | Sold: ${wethToSell.toFixed(6)} WETH → $${netUsdcReceived.toFixed(2)}`);
        console.log(`   Balance: $${usdcBalance.toFixed(2)} USDC + ${wethBalance.toFixed(6)} WETH\n`);
      }
    }

    // Calculate final value
    const lastPrice = positions[positions.length - 1].close;
    const wethValueUsd = wethBalance * lastPrice;
    const totalValueUsd = usdcBalance + wethValueUsd;
    const pnl = totalValueUsd - STARTING_BALANCE_USD;
    const pnlPercent = (pnl / STARTING_BALANCE_USD) * 100;

    // Summary
    console.log('='.repeat(70));
    console.log('📈 FINAL SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n⏱️  Duration: ${hoursOfData.toFixed(1)} hours`);
    console.log(`📊 Total Trades: ${tradesExecuted.length}`);
    console.log(`   - Buys:  ${tradesExecuted.filter(t => t.type === 'BUY').length}`);
    console.log(`   - Sells: ${tradesExecuted.filter(t => t.type === 'SELL').length}`);
    
    const totalFees = tradesExecuted.reduce((sum, t) => sum + (t.fee || 0), 0);
    const totalSlippage = tradesExecuted.reduce((sum, t) => sum + (t.slippage || 0), 0);
    console.log(`\n💸 Total Fees Paid: $${totalFees.toFixed(2)}`);
    console.log(`📉 Total Slippage: $${totalSlippage.toFixed(2)}`);

    console.log(`\n💰 Final Position: ${currentPosition}`);
    console.log(`   USDC: $${usdcBalance.toFixed(2)}`);
    console.log(`   WETH: ${wethBalance.toFixed(6)} (~$${wethValueUsd.toFixed(2)} @ $${lastPrice.toFixed(2)})`);
    console.log(`\n📊 Final Total Value: $${totalValueUsd.toFixed(2)}`);
    console.log(`   Starting: $${STARTING_BALANCE_USD.toFixed(2)}`);
    
    const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
    console.log(`   ${pnlEmoji} P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);

    // Trade log
    if (tradesExecuted.length > 0) {
      console.log('\n' + '='.repeat(70));
      console.log('📋 TRADE LOG');
      console.log('='.repeat(70));
      tradesExecuted.forEach((trade, i) => {
        const emoji = trade.type === 'BUY' ? '🟢' : '🔴';
        console.log(`${i + 1}. ${emoji} ${trade.type} @ ${trade.time.toLocaleString()} | Price: $${trade.price.toFixed(2)}`);
      });
    } else {
      console.log('\n⚠️  No trades were executed - no Open-UP followed by Open-DOWN signals found');
      console.log('   This could mean the price stayed within range during this period.');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Backtest Complete!');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

runBacktest();



