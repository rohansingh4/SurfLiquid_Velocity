import { connectDB } from './db.js';
import Transaction from './models/Transaction.js';
import fs from 'fs';

async function analyzeAddLiquidity() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await connectDB();

    console.log('\n📊 Fetching all transactions...');
    const allTransactions = await Transaction.find({}).sort({ timestamp: 1 });
    console.log(`   Total transactions: ${allTransactions.length}`);

    // Filter add liquidity transactions
    const addLiquidityTxns = allTransactions.filter(tx => tx.txType === 'add_liquidity');
    console.log(`   Add Liquidity transactions: ${addLiquidityTxns.length}`);

    // Analyze add liquidity transactions
    const analysis = {
      totalTransactions: allTransactions.length,
      addLiquidityCount: addLiquidityTxns.length,
      successfulAddLiquidity: addLiquidityTxns.filter(tx => tx.status === 'success').length,
      failedAddLiquidity: addLiquidityTxns.filter(tx => tx.status === 'failed').length,
      addLiquidityDetails: [],
      summary: {
        totalPnL: 0,
        negativePnLCount: 0,
        positivePnLCount: 0,
        zeroPnLCount: 0,
        avgPnL: 0,
        avgPnLPct: 0
      }
    };

    // Detailed analysis of each add liquidity transaction
    addLiquidityTxns.forEach((tx, index) => {
      const wethUsed = Math.abs(tx.wethBalanceBefore - tx.wethBalanceAfter);
      const usdcUsed = Math.abs(tx.usdcBalanceBefore - tx.usdcBalanceAfter);

      // Calculate percentage of balance used
      const wethPctUsed = tx.wethBalanceBefore > 0 ? (wethUsed / tx.wethBalanceBefore) * 100 : 0;
      const usdcPctUsed = tx.usdcBalanceBefore > 0 ? (usdcUsed / tx.usdcBalanceBefore) * 100 : 0;

      // Calculate tick range width
      const tickRange = tx.tickUpper && tx.tickLower ? tx.tickUpper - tx.tickLower : null;

      // Price range calculation (tick to price conversion)
      const priceLower = tx.tickLower ? Math.pow(1.0001, tx.tickLower) : null;
      const priceUpper = tx.tickUpper ? Math.pow(1.0001, tx.tickUpper) : null;
      const priceRangePct = priceLower && priceUpper && tx.price ?
        ((priceUpper - priceLower) / tx.price) * 100 : null;

      const detail = {
        index: index + 1,
        timestamp: tx.timestamp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
        status: tx.status,
        price: tx.price,
        balancesBefore: {
          weth: tx.wethBalanceBefore,
          usdc: tx.usdcBalanceBefore,
          portfolioValue: tx.portfolioValueBefore
        },
        balancesAfter: {
          weth: tx.wethBalanceAfter,
          usdc: tx.usdcBalanceAfter,
          portfolioValue: tx.portfolioValueAfter
        },
        amountsUsed: {
          weth: wethUsed,
          usdc: usdcUsed,
          wethPctUsed: wethPctUsed.toFixed(2) + '%',
          usdcPctUsed: usdcPctUsed.toFixed(2) + '%'
        },
        tickInfo: {
          tickLower: tx.tickLower,
          tickUpper: tx.tickUpper,
          tickRange: tickRange,
          priceLower: priceLower,
          priceUpper: priceUpper,
          priceRangePct: priceRangePct ? priceRangePct.toFixed(2) + '%' : 'N/A',
          currentPrice: tx.price
        },
        pnl: {
          profitLoss: tx.profitLoss || 0,
          profitLossPct: tx.profitLossPct || 0
        },
        txHash: tx.txHash,
        error: tx.error
      };

      analysis.addLiquidityDetails.push(detail);

      // Update summary
      if (tx.status === 'success' && tx.profitLoss !== undefined) {
        analysis.summary.totalPnL += tx.profitLoss;
        if (tx.profitLoss < 0) analysis.summary.negativePnLCount++;
        else if (tx.profitLoss > 0) analysis.summary.positivePnLCount++;
        else analysis.summary.zeroPnLCount++;
      }
    });

    // Calculate averages
    const successfulCount = analysis.successfulAddLiquidity;
    if (successfulCount > 0) {
      analysis.summary.avgPnL = analysis.summary.totalPnL / successfulCount;
      const totalPct = addLiquidityTxns
        .filter(tx => tx.status === 'success' && tx.profitLossPct !== undefined)
        .reduce((sum, tx) => sum + tx.profitLossPct, 0);
      analysis.summary.avgPnLPct = totalPct / successfulCount;
    }

    // Save to JSON file
    fs.writeFileSync(
      'add-liquidity-analysis.json',
      JSON.stringify(analysis, null, 2)
    );

    // Print summary
    console.log('\n📈 ADD LIQUIDITY ANALYSIS SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Add Liquidity Transactions: ${analysis.addLiquidityCount}`);
    console.log(`  ✅ Successful: ${analysis.successfulAddLiquidity}`);
    console.log(`  ❌ Failed: ${analysis.failedAddLiquidity}`);
    console.log('\nP&L BREAKDOWN:');
    console.log(`  📉 Negative P&L: ${analysis.summary.negativePnLCount} transactions`);
    console.log(`  📈 Positive P&L: ${analysis.summary.positivePnLCount} transactions`);
    console.log(`  ➖ Zero P&L: ${analysis.summary.zeroPnLCount} transactions`);
    console.log(`\n  💰 Total P&L: $${analysis.summary.totalPnL.toFixed(4)}`);
    console.log(`  📊 Average P&L: $${analysis.summary.avgPnL.toFixed(4)}`);
    console.log(`  📊 Average P&L %: ${analysis.summary.avgPnLPct.toFixed(4)}%`);

    // Sample of recent add liquidity transactions
    console.log('\n📋 RECENT ADD LIQUIDITY TRANSACTIONS (Last 5):');
    console.log('═'.repeat(60));
    const recentTxns = analysis.addLiquidityDetails.slice(-5);
    recentTxns.forEach(tx => {
      console.log(`\n[${tx.index}] ${tx.timestamp} - ${tx.status.toUpperCase()}`);
      console.log(`  Price: $${tx.price?.toFixed(2) || 'N/A'}`);
      console.log(`  Range: ${tx.tickInfo.priceRangePct} (Ticks: ${tx.tickInfo.tickLower} to ${tx.tickInfo.tickUpper})`);
      console.log(`  WETH Used: ${tx.amountsUsed.wethPctUsed} | USDC Used: ${tx.amountsUsed.usdcPctUsed}`);
      console.log(`  P&L: $${tx.pnl.profitLoss?.toFixed(4)} (${tx.pnl.profitLossPct?.toFixed(4)}%)`);
    });

    console.log('\n✅ Analysis saved to add-liquidity-analysis.json');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

analyzeAddLiquidity();
