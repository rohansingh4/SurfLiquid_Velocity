import { ethers } from 'ethers';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';
import Transaction from './models/Transaction.js';
import { pgPool } from './pg-connection.js';
import TradingBot from './trading-bot.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from .env
const RPC_URL = process.env.SONIC_RPC_URL;
const WRITE_RPC_URL = process.env.SONIC_WRITE_RPC_URL; // Optional: separate RPC for write operations to avoid rate limiting
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const FETCH_INTERVAL = 3000; // 3 seconds (fetch more frequently)
const CANDLE_INTERVAL = 10000; // 10 seconds (candle period)
const RANGE_PERCENTAGE = 0.1; // 0.1% range

// Webhook configuration for AI scientist
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_ENABLED = WEBHOOK_URL && WEBHOOK_URL.startsWith('http');

// Token addresses (from the pool)
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';
const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';

// Trading wallet configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SWAP_HELPER_ADDRESS = process.env.SWAP_HELPER_ADDRESS;
const TRADING_ENABLED = PRIVATE_KEY && PRIVATE_KEY.length > 10 && SWAP_HELPER_ADDRESS;

// Pool ABI (only the functions we need)
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function tickSpacing() external view returns (int24)'
];

// ERC20 ABI for token info
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function balanceOf(address) external view returns (uint256)',
  'function symbol() external view returns (string)'
];

// State management
let currentCandle = null;
let candles = [];
let currentRanges = null; // Tracks current upper/lower ranges
let lastPositionStatus = null; // Tracks last position status
let lastPositionPercentages = { weth_pct: 50, usdc_pct: 50 }; // Tracks last weth/usdc percentages
let positionHistory = [];
let tickData = [];
let outOfRangeDetectedAt = null; // Timestamp when out of range was first detected
let positionSavedThisCycle = false; // Prevent duplicate saves in same candle cycle
let justSavedRebalance = false; // Flag to prevent duplicate saves after rebalance
let isProcessingCandle = false; // Lock to prevent race condition in candle processing

// Web3 setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
const token0Contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token1Contract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

// Trading bot setup
let tradingBot = null;
if (TRADING_ENABLED) {
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Create separate write provider if configured (reduces rate limiting)
  const writeProvider = WRITE_RPC_URL ? new ethers.JsonRpcProvider(WRITE_RPC_URL) : null;

  tradingBot = new TradingBot(provider, wallet, POOL_ADDRESS, WETH_ADDRESS, USDC_ADDRESS, SWAP_HELPER_ADDRESS, writeProvider);
  console.log(`🤖 Trading Bot initialized with wallet: ${wallet.address}`);
  if (WRITE_RPC_URL) {
    console.log(`   📡 Using separate Write RPC to reduce rate limiting`);
  }
} else {
  if (!PRIVATE_KEY || PRIVATE_KEY.length < 10) {
    console.log('⚠️  Trading disabled: No private key configured');
  } else if (!SWAP_HELPER_ADDRESS) {
    console.log('⚠️  Trading disabled: SwapHelper contract not deployed yet');
    console.log('   Deploy SwapHelper and update SWAP_HELPER_ADDRESS in .env');
  }
}

// MongoDB will be used for persistence instead of CSV

// Calculate price from sqrtPriceX96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  // sqrtPriceX96 = sqrt(price) * 2^96
  // price = (sqrtPriceX96 / 2^96)^2
  // This gives the price as token1/token0 in raw units
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = sqrtPrice * sqrtPrice;

  // Adjust for decimals: token0 (USDC) = 6 decimals, token1 (WETH) = 18 decimals
  // priceRaw is in token1/token0 raw units
  // To get human-readable USDC per WETH: divide by 10^(decimals1 - decimals0)
  const priceAdjusted = priceRaw / (10 ** 12); // 10^(18-6)

  // But we want USDC per WETH, which is the inverse (token0 per token1)
  const usdcPerWeth = 1 / priceAdjusted;

  return usdcPerWeth;
}

// Get pool tick spacing
async function getPoolTickSpacing() {
  try {
    const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
    const tickSpacing = await poolContract.tickSpacing();
    return Number(tickSpacing);
  } catch (error) {
    console.error('Error getting tick spacing:', error);
    return 1; // Default fallback
  }
}

// Calculate distribution percentage
function calculateDistribution(reserve0, reserve1, price) {
  const token0Value = parseFloat(reserve0) / 1e6; // USDC with 6 decimals
  const token1Value = parseFloat(reserve1) / 1e18; // WETH with 18 decimals
  const token1ValueInUSDC = token1Value * price;

  const totalValue = token0Value + token1ValueInUSDC;
  const usdc_pct = (token0Value / totalValue) * 100;
  const weth_pct = (token1ValueInUSDC / totalValue) * 100;

  return { usdc_pct, weth_pct };
}

// Fetch pool data from blockchain
async function fetchPoolData() {
  try {
    console.log('🔗 Fetching on-chain data from Sonic...');

    // Fetch data in parallel for speed
    const [slot0Data, liquidityData, reserve0, reserve1] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
      token0Contract.balanceOf(POOL_ADDRESS),
      token1Contract.balanceOf(POOL_ADDRESS)
    ]);

    const sqrtPriceX96 = slot0Data[0];
    const tick = slot0Data[1];
    const liquidity = liquidityData;

    // Convert reserves to regular numbers
    const reserve0Num = reserve0;
    const reserve1Num = reserve1;

    // Calculate token amounts in human-readable format
    const weth_amount = Number(reserve1Num) / 1e18;
    const usdc_amount = Number(reserve0Num) / 1e6;

    // Calculate actual price from sqrtPriceX96 (CORRECT for Uniswap V3)
    let price = calculatePriceFromSqrtPriceX96(sqrtPriceX96);

    // Add small realistic variation for demo purposes (±0.01%)
    // Remove this in production when real trading activity provides natural variation
    const variation = (Math.random() - 0.5) * 2 * 0.0001; // ±0.01%
    price = price * (1 + variation);

    // Calculate distribution
    const distribution = calculateDistribution(reserve0Num, reserve1Num, price);

    console.log(`✅ On-chain data fetched: Price=$${price.toFixed(2)}, Liquidity=${liquidity.toString()}`);

    return {
      timestamp: Date.now(),
      price: price,
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      tick: Number(tick),
      reserve0: reserve0Num.toString(),
      reserve1: reserve1Num.toString(),
      weth_amount: weth_amount,
      usdc_amount: usdc_amount,
      tvl: usdc_amount + (weth_amount * price),
      ...distribution
    };
  } catch (error) {
    console.error('❌ Error fetching on-chain data:', error.message);
    return null;
  }
}

// Update 15-second candle
async function updateCandle(data) {
  const now = Date.now();
  const candleStart = Math.floor(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;

  if (!currentCandle || currentCandle.timestamp !== candleStart) {
    // Prevent race condition - only one fetch processes candle close at a time
    if (isProcessingCandle) {
      console.log('⏳ Candle processing already in progress, skipping...');
      return;
    }
    isProcessingCandle = true;

    try {
    // Close previous candle
    if (currentCandle) {
      candles.push(currentCandle);
      saveCandleToMongoDB(currentCandle);

      // Check status every 10 seconds on candle close
      const currentPrice = data.price;
      const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;

      if (lastPositionStatus === 'Price-UP' || lastPositionStatus === 'Price-DOWN') {
        // We detected out of range in previous check
        if (isInRange) {
          // Price came back in range - no rebalance needed
          console.log(`\n✅ PRICE BACK IN RANGE - No rebalance needed`);
          lastPositionStatus = 'Monitoring';
          outOfRangeDetectedAt = null;
          positionSavedThisCycle = false; // Allow Monitoring to be saved normally
        } else {
          // Still out of range - REBALANCE NOW
          const isUpRebalance = currentPrice > currentRanges.upper;
          const openPrice = data.price;

          // Update ranges based on OPEN price - ±0.5% range (rounded to 100-tick spacing)
          // Calculate ideal ±0.5% price targets
          const idealUpper = openPrice * 1.005;
          const idealLower = openPrice * 0.995;

          // Get tick spacing from pool (100 ticks = 1% range)
          const tickSpacing = await getPoolTickSpacing();

          // Convert ideal prices to ticks and round to nearest valid multiples
          const upperTickIdeal = Math.log(idealUpper) / Math.log(1.0001);
          const lowerTickIdeal = Math.log(idealLower) / Math.log(1.0001);
          const tickUpper = Math.round(upperTickIdeal / tickSpacing) * tickSpacing;
          const tickLower = Math.round(lowerTickIdeal / tickSpacing) * tickSpacing;

          // Calculate actual price boundaries from rounded ticks
          const lowerRange = Math.pow(1.0001, tickLower);
          const upperRange = Math.pow(1.0001, tickUpper);

          currentRanges = {
            upper: upperRange,
            lower: lowerRange,
            tickLower: tickLower,
            tickUpper: tickUpper
          };

          const status = isUpRebalance ? 'Open-UP' : 'Open-DOWN';
          const rebalanceType = isUpRebalance ? 'Rebalance UP' : 'Rebalance DOWN';

          // Use CURRENT pool composition (fetched every 3s) - NOT hardcoded percentages!
          // This ensures we match the pool's actual ratio when adding liquidity
          const targetPercentages = {
            weth_pct: data.weth_pct,  // Current pool composition from latest fetch
            usdc_pct: data.usdc_pct   // Current pool composition from latest fetch
          };

          console.log(`\n🔄 REBALANCE: ${status}`);
          console.log(`  Open Price: $${openPrice.toFixed(2)} (±0.5% target)`);
          console.log(`  New Ranges: Upper=$${currentRanges.upper.toFixed(2)} (ideal: $${idealUpper.toFixed(2)}), Lower=$${currentRanges.lower.toFixed(2)} (ideal: $${idealLower.toFixed(2)})`);
          console.log(`  Tick Range: ${tickLower} to ${tickUpper} (${tickUpper - tickLower} ticks, spacing=${tickSpacing})`);
          console.log(`  Target Allocation: ${targetPercentages.weth_pct.toFixed(1)}% WETH, ${targetPercentages.usdc_pct.toFixed(1)}% USDC (latest pool composition)`);

          // Prevent duplicate saves - only save once per rebalance
          if (positionSavedThisCycle) {
            console.log(`  ⏭️  Already saved this rebalance - skipping duplicate`);
            return;
          }

          // Save rebalance position
          await savePositionData({
            timestamp: data.timestamp,
            status: status,
            upper_range: currentRanges.upper,
            lower_range: currentRanges.lower,
            tickLower: currentRanges.tickLower,
            tickUpper: currentRanges.tickUpper,
            open: data.price,
            high: data.price,
            low: data.price,
            close: data.price,
            weth_pct: targetPercentages.weth_pct,  // Current pool composition (updated every 3s)
            usdc_pct: targetPercentages.usdc_pct,  // Current pool composition (updated every 3s)
            rebalance_type: rebalanceType
          });

          // After rebalance, go back to Monitoring with new ranges
          lastPositionStatus = 'Monitoring';
          outOfRangeDetectedAt = null;
          positionSavedThisCycle = true; // Prevent duplicate Monitoring save
        }
      } else if (!isInRange && lastPositionStatus !== 'Price-UP' && lastPositionStatus !== 'Price-DOWN') {
        // Price just went out of range - save Price-UP/DOWN
        const isAbove = currentPrice > currentRanges.upper;
        const status = isAbove ? 'Price-UP' : 'Price-DOWN';
        
        console.log(`\n⚠️  ${status}: $${currentPrice.toFixed(2)} ${isAbove ? '>' : '<'} ${isAbove ? currentRanges.upper.toFixed(2) : currentRanges.lower.toFixed(2)}`);

        await savePositionData({
          timestamp: data.timestamp,
          status: status,
          upper_range: currentRanges.upper,
          lower_range: currentRanges.lower,
          tickLower: currentRanges.tickLower,
          tickUpper: currentRanges.tickUpper,
          open: currentCandle.open,
          high: currentCandle.high,
          low: currentCandle.low,
          close: currentCandle.close,
          weth_pct: data.weth_pct,
          usdc_pct: data.usdc_pct,
          rebalance_type: 'N/A'
        });
        
        lastPositionStatus = status;
        outOfRangeDetectedAt = Date.now();
        positionSavedThisCycle = true; // Prevent duplicate save
      } else if (isInRange && lastPositionStatus === 'Monitoring') {
        // Normal Monitoring - save position for chart continuity
        await savePositionData({
          timestamp: data.timestamp,
          status: 'Monitoring',
          upper_range: currentRanges.upper,
          lower_range: currentRanges.lower,
          tickLower: currentRanges.tickLower,
          tickUpper: currentRanges.tickUpper,
          open: currentCandle.open,
          high: currentCandle.high,
          low: currentCandle.low,
          close: currentCandle.close,
          weth_pct: data.weth_pct,
          usdc_pct: data.usdc_pct,
          rebalance_type: 'N/A'
        });
        positionSavedThisCycle = false;
      }
    }

    // Start new candle
    currentCandle = {
      timestamp: candleStart,
      open: data.price,
      high: data.price,
      low: data.price,
      close: data.price,
      liquidity: data.liquidity,
      weth_amount: data.weth_amount,
      usdc_amount: data.usdc_amount
    };
    
    // Reset flag for new candle cycle
    positionSavedThisCycle = false;

    console.log(`\n=== New 10s Candle Started at ${new Date(candleStart).toISOString()} ===`);
    } finally {
      // Always release the lock
      isProcessingCandle = false;
    }
  } else {
    // Update current candle
    currentCandle.high = Math.max(currentCandle.high, data.price);
    currentCandle.low = Math.min(currentCandle.low, data.price);
    currentCandle.close = data.price;
    currentCandle.liquidity = data.liquidity;
    currentCandle.weth_amount = data.weth_amount;
    currentCandle.usdc_amount = data.usdc_amount;
  }

  // Store tick data for frontend
  tickData.push({
    timestamp: data.timestamp,
    price: data.price,
    weth_pct: data.weth_pct,
    usdc_pct: data.usdc_pct
  });

  // Keep only last hour of tick data (360 ticks for 10s intervals)
  if (tickData.length > 360) {
    tickData.shift();
  }
}

// Initialize ranges on first run
async function streamPositionData(data) {
  if (!currentCandle) return;

  // Initialize ranges on first run OR restore from DB on restart
  if (!currentRanges) {
    // Try to restore existing ranges from the most recent position in DB
    try {
      const lastPosition = await Position.findOne().sort({ timestamp: -1 }).limit(1);

      if (lastPosition && lastPosition.upper_range && lastPosition.lower_range && lastPosition.tickLower && lastPosition.tickUpper) {
        // Restore ranges from DB (bot was restarted)
        currentRanges = {
          upper: lastPosition.upper_range,
          lower: lastPosition.lower_range,
          tickLower: lastPosition.tickLower,
          tickUpper: lastPosition.tickUpper
        };
        lastPositionStatus = lastPosition.status || 'Monitoring';
        console.log(`\n🔄 Ranges RESTORED from DB (bot restarted):`);
        console.log(`   Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);
        console.log(`   Tick Range: ${currentRanges.tickLower} to ${currentRanges.tickUpper}`);
        console.log(`   Last Status: ${lastPositionStatus}`);
      } else {
        // No existing ranges - first time setup
        const openPrice = currentCandle.open;

        // Calculate tick-based range: ±0.5% range (rounded to 100-tick spacing)
        // Calculate ideal ±0.5% price targets
        const idealUpper = openPrice * 1.005;
        const idealLower = openPrice * 0.995;

        const tickSpacing = await getPoolTickSpacing();

        // Convert ideal prices to ticks and round to nearest valid multiples
        const upperTickIdeal = Math.log(idealUpper) / Math.log(1.0001);
        const lowerTickIdeal = Math.log(idealLower) / Math.log(1.0001);
        const tickUpper = Math.round(upperTickIdeal / tickSpacing) * tickSpacing;
        const tickLower = Math.round(lowerTickIdeal / tickSpacing) * tickSpacing;

        // Calculate actual price boundaries from rounded ticks
        const lowerRange = Math.pow(1.0001, tickLower);
        const upperRange = Math.pow(1.0001, tickUpper);

        currentRanges = {
          upper: upperRange,
          lower: lowerRange,
          tickLower: tickLower,
          tickUpper: tickUpper
        };
        lastPositionStatus = 'Monitoring';
        console.log(`\n🎯 Initial Ranges Set (first run): Open=$${openPrice.toFixed(2)} (±0.5% target)`);
        console.log(`   Upper=$${currentRanges.upper.toFixed(2)} (ideal: $${idealUpper.toFixed(2)}), Lower=$${currentRanges.lower.toFixed(2)} (ideal: $${idealLower.toFixed(2)})`);
        console.log(`   Tick Range: ${tickLower} to ${tickUpper} (${tickUpper - tickLower} ticks, spacing=${tickSpacing})`);
      }
    } catch (error) {
      console.error('Error restoring ranges from DB:', error);
      // Fall back to creating new ranges if DB read fails
      const openPrice = currentCandle.open;
      const idealUpper = openPrice * 1.005;
      const idealLower = openPrice * 0.995;
      const tickSpacing = await getPoolTickSpacing();
      const upperTickIdeal = Math.log(idealUpper) / Math.log(1.0001);
      const lowerTickIdeal = Math.log(idealLower) / Math.log(1.0001);
      const tickUpper = Math.round(upperTickIdeal / tickSpacing) * tickSpacing;
      const tickLower = Math.round(lowerTickIdeal / tickSpacing) * tickSpacing;
      const lowerRange = Math.pow(1.0001, tickLower);
      const upperRange = Math.pow(1.0001, tickUpper);
      currentRanges = {
        upper: upperRange,
        lower: lowerRange,
        tickLower: tickLower,
        tickUpper: tickUpper
      };
      lastPositionStatus = 'Monitoring';
      console.log(`\n⚠️  Ranges initialized from current price (DB restore failed)`);
    }
  }

  // Just log current status, don't save (saving happens on candle close only)
  const currentPrice = data.price;
  const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;
  
  if (isInRange) {
    console.log(`📊 Monitoring: $${currentPrice.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
  }
}

// Send position data to webhook (AI scientist)
async function sendWebhook(positionData) {
  if (!WEBHOOK_ENABLED) return;

  try {
    const payload = {
      timestamp: positionData.timestamp,
      status: positionData.status,
      upper_range: positionData.upper_range,
      lower_range: positionData.lower_range,
      open: positionData.open,
      high: positionData.high,
      low: positionData.low,
      close: positionData.close,
      weth_pct: positionData.weth_pct,
      usdc_pct: positionData.usdc_pct,
      rebalance_type: positionData.rebalance_type,
      pool_address: POOL_ADDRESS,
      network: 'sonic'
    };

    // Log the payload being sent
    console.log(`📡 Webhook payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (response.ok) {
      console.log(`✅ Webhook sent: ${positionData.status} @ $${positionData.close.toFixed(2)}`);
    } else {
      console.log(`⚠️  Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
  }
}

// Save position data to MongoDB
async function savePositionData(positionData) {
  try {
    const newPosition = new Position(positionData);
    await newPosition.save();

    // Update last position percentages for the Token Distribution card
    if (positionData.weth_pct && positionData.usdc_pct) {
      lastPositionPercentages = {
        weth_pct: positionData.weth_pct,
        usdc_pct: positionData.usdc_pct
      };
    }

    // Send to webhook (non-blocking)
    sendWebhook(positionData).catch(err => {
      console.error('Webhook failed silently:', err.message);
    });

    // Trigger trading bot if enabled and signal changed
    if (tradingBot && positionData.status !== 'Monitoring') {
      // Execute trading logic based on signal
      await tradingBot.processSignal(
        positionData.status,
        positionData.weth_pct,
        positionData.usdc_pct,
        positionData.upper_range,
        positionData.lower_range,
        positionData.close,
        positionData.tickLower,
        positionData.tickUpper
      );
    }
  } catch (error) {
    console.error('Error saving position:', error.message);
  }
}

// Save candle to MongoDB
async function saveCandleToMongoDB(candle) {
  try {
    const candleDoc = new Candle({
      timestamp: new Date(candle.timestamp),
      open: parseFloat(candle.open.toFixed(2)),
      high: parseFloat(candle.high.toFixed(2)),
      low: parseFloat(candle.low.toFixed(2)),
      close: parseFloat(candle.close.toFixed(2)),
      liquidity: candle.liquidity.toString(),
      weth_amount: parseFloat(candle.weth_amount.toFixed(6)),
      usdc_amount: parseFloat(candle.usdc_amount.toFixed(2))
    });
    await candleDoc.save();
    console.log(`💾 Candle saved: O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)}`);
    
    // Reset the flag for next candle
    justSavedRebalance = false;
  } catch (error) {
    if (error.code === 11000) {
      console.log(`⚠️  Duplicate candle skipped for timestamp: ${new Date(candle.timestamp).toISOString()}`);
    } else {
      console.error('Error saving candle:', error.message);
    }
  }
}

// Save position to MongoDB

// Main loop
async function mainLoop() {
  const data = await fetchPoolData();

  if (data) {
    console.log(`\n📊 Price: $${data.price.toFixed(2)} | WETH: ${data.weth_pct.toFixed(2)}% | USDC: ${data.usdc_pct.toFixed(2)}%`);

    // Update candle
    updateCandle(data);

    // Stream position data every fetch
    await streamPositionData(data);
  }
}

// Express server for frontend
const app = express();
app.use(cors());
app.use(express.static(__dirname));

// API endpoints
app.get('/api/current', (req, res) => {
  // Build position object from current state
  const position = currentRanges ? {
    status: lastPositionStatus || 'No Position',
    upper_range: currentRanges.upper,
    lower_range: currentRanges.lower,
    rebalance_type: 'N/A',
    weth_pct: lastPositionPercentages.weth_pct,
    usdc_pct: lastPositionPercentages.usdc_pct
  } : null;

  res.json({
    currentCandle,
    position,
    tickData: tickData.slice(-60) // Last 15 minutes
  });
});

app.get('/api/candles', (req, res) => {
  res.json(candles.slice(-60)); // Last 15 minutes of candles
});

app.get('/api/positions', (req, res) => {
  res.json(positionHistory);
});

app.get('/api/all-data', (req, res) => {
  res.json({
    candles: candles.slice(-240), // Last hour
    tickData: tickData.slice(-240), // Last hour
    currentCandle,
    position,
    positionHistory
  });
});

// MongoDB API endpoints with pagination
app.get('/api/db/candles', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [candles, totalCount] = await Promise.all([
      Candle.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Candle.countDocuments()
    ]);

    res.json({
      data: candles.reverse(),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + candles.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/db/positions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [positions, totalCount] = await Promise.all([
      Position.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Position.countDocuments()
    ]);

    res.json({
      data: positions.reverse(),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + positions.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/db/stats', async (req, res) => {
  try {
    const candleCount = await Candle.countDocuments();
    const positionCount = await Position.countDocuments();
    const latestCandle = await Candle.findOne().sort({ timestamp: -1 });
    const latestPosition = await Position.findOne().sort({ timestamp: -1 });

    res.json({
      candleCount,
      positionCount,
      latestCandle,
      latestPosition
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get position range info for a specific candle timestamp
app.get('/api/position-range/:timestamp', async (req, res) => {
  try {
    const clickedTime = new Date(parseInt(req.params.timestamp));

    // Find the position active at this timestamp
    const activePosition = await Position.findOne({
      timestamp: { $lte: clickedTime },
      status: 'Position Open'
    }).sort({ timestamp: -1 });

    if (!activePosition) {
      return res.json({ error: 'No active position found for this timestamp' });
    }

    const { upper_range, lower_range } = activePosition;

    // Find when this range started (first Position Open with these exact ranges)
    const rangeStart = await Position.findOne({
      upper_range: upper_range,
      lower_range: lower_range,
      status: 'Position Open'
    }).sort({ timestamp: 1 });

    // Find when this range ended (next Position Open with different ranges)
    const rangeEnd = await Position.findOne({
      timestamp: { $gt: rangeStart.timestamp },
      status: 'Position Open',
      $or: [
        { upper_range: { $ne: upper_range } },
        { lower_range: { $ne: lower_range } }
      ]
    }).sort({ timestamp: 1 });

    // Get all positions during this range period for additional context
    const endTime = rangeEnd ? rangeEnd.timestamp : new Date();
    const rangePositions = await Position.find({
      timestamp: { $gte: rangeStart.timestamp, $lt: endTime }
    }).sort({ timestamp: 1 });

    // Check if rebalance occurred
    const rebalanceOccurred = rangePositions.some(
      p => p.status.includes('Out of Range') && p.rebalance_type
    );

    res.json({
      rangeStart: rangeStart.timestamp,
      rangeEnd: rangeEnd ? rangeEnd.timestamp : null,
      upperRange: upper_range,
      lowerRange: lower_range,
      duration: rangeEnd ? (rangeEnd.timestamp - rangeStart.timestamp) / 1000 : null,
      rebalanceOccurred,
      rebalanceType: rebalanceOccurred
        ? rangePositions.find(p => p.rebalance_type)?.rebalance_type
        : null,
      positions: rangePositions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get candles by time range for chart
app.get('/api/db/candles/range', async (req, res) => {
  try {
    const range = req.query.range || '15m';
    const now = new Date();
    let startTime;

    switch(range) {
      case '15m':
        startTime = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '4h':
        startTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startTime = new Date(0); // Get all data
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    const candles = await Candle.find({
      timestamp: { $gte: startTime }
    })
    .sort({ timestamp: 1 })
    .limit(range === 'all' ? 5000 : 1000)
    .lean();

    res.json(candles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get positions by time range for chart
app.get('/api/db/positions/range', async (req, res) => {
  try {
    const range = req.query.range || '15m';
    const now = new Date();
    let startTime;

    switch(range) {
      case '15m':
        startTime = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '4h':
        startTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startTime = new Date(0); // Get all data
        break;
      default:
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
    }

    const positions = await Position.find({
      timestamp: { $gte: startTime }
    })
    .sort({ timestamp: 1 })
    .limit(range === 'all' ? 5000 : 1000)
    .lean();

    res.json(positions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PostgreSQL API endpoints
app.get('/api/pg/tables', async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT table_name,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    // Get row counts for each table
    const tablesWithCounts = await Promise.all(
      result.rows.map(async (table) => {
        try {
          const countResult = await pgPool.query(`SELECT COUNT(*) as count FROM "${table.table_name}"`);
          return {
            name: table.table_name,
            row_count: parseInt(countResult.rows[0].count),
            column_count: parseInt(table.column_count)
          };
        } catch (err) {
          return {
            name: table.table_name,
            row_count: 0,
            column_count: parseInt(table.column_count)
          };
        }
      })
    );

    res.json({ tables: tablesWithCounts });
  } catch (error) {
    console.error('Error fetching PostgreSQL tables:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pg/table/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pgPool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataResult = await pgPool.query(`
      SELECT * FROM "${tableName}"
      ORDER BY evt_block_time DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + dataResult.rows.length < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching table data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pg/table/:tableName/schema', async (req, res) => {
  try {
    const { tableName } = req.params;

    const result = await pgPool.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [tableName]);

    res.json({ schema: result.rows });
  } catch (error) {
    console.error('Error fetching table schema:', error);
    res.status(500).json({ error: error.message });
  }
});

// Transaction API endpoints
app.get('/api/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      Transaction.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments()
    ]);

    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + transactions.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions/stats', async (req, res) => {
  try {
    const [totalCount, successCount, failedCount, lastTransaction, firstTransaction] = await Promise.all([
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: 'success' }),
      Transaction.countDocuments({ status: 'failed' }),
      Transaction.findOne().sort({ timestamp: -1 }).lean(),
      Transaction.findOne().sort({ timestamp: 1 }).lean() // Get first transaction for starting fund
    ]);

    // Get wallet balances and current price if trading is enabled
    let walletBalances = null;
    let startingFund = 0;
    let currentBalance = 0;
    let totalPnL = 0;
    let currentPrice = 0;

    if (tradingBot) {
      // First, always try to get balances
      try {
        const balances = await tradingBot.getBalances();
        walletBalances = {
          weth: balances.wethFormatted,
          usdc: balances.usdcFormatted,
          walletAddress: tradingBot.wallet.address
        };
        
        // Get current price from last transaction or position data
        // (tradingBot doesn't have getCurrentPrice method)
        currentPrice = lastTransaction?.price || 0;

        // Calculate Current Balance = Current WETH × current price + Current USDC
        if (currentPrice > 0) {
          currentBalance = (balances.wethFormatted * currentPrice) + balances.usdcFormatted;

          // Calculate Starting Fund from first transaction
          if (firstTransaction) {
            const startWeth = firstTransaction.wethBalanceBefore || 0;
            const startUsdc = firstTransaction.usdcBalanceBefore || 0;
            const startPrice = firstTransaction.price || currentPrice;
            startingFund = (startWeth * startPrice) + startUsdc;
            
            // P&L = Current Balance - Starting Fund
            totalPnL = currentBalance - startingFund;
          } else {
            // No transactions yet - show current balance as starting fund, P&L is 0
            startingFund = currentBalance;
            totalPnL = 0;
          }
        }
      } catch (error) {
        console.error('Error fetching wallet balances:', error.message);
      }
    }

    res.json({
      totalTransactions: totalCount,
      successfulTransactions: successCount,
      failedTransactions: failedCount,
      // New simple P&L calculation
      startingFund,
      currentBalance,
      totalPnL,
      currentPrice,
      // Legacy
      lastTransaction,
      walletBalances,
      tradingEnabled: TRADING_ENABLED
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🌐 Server running on http://localhost:${PORT}`);
  console.log(`📈 Open http://localhost:${PORT}/index.html to view the dashboard\n`);
});

// Start the main loop
async function startApplication() {
  console.log('='.repeat(60));
  console.log('🎯 Sonic Execution Layer - WETH/USDC Pool Monitor (ON-CHAIN)');
  console.log('='.repeat(60));

  // Connect to MongoDB
  await connectDB();

  console.log(`Pool: ${POOL_ADDRESS}`);
  console.log(`RPC: ${RPC_URL.substring(0, 50)}...`);
  console.log(`Fetch Interval: ${FETCH_INTERVAL}ms (${FETCH_INTERVAL/1000} seconds)`);
  console.log(`Candle Period: ${CANDLE_INTERVAL}ms (10 seconds)`);
  console.log(`Range: ±${RANGE_PERCENTAGE}%`);
  
  // Webhook status
  if (WEBHOOK_ENABLED) {
    console.log(`📡 Webhook: ENABLED → ${WEBHOOK_URL.substring(0, 50)}...`);
  } else {
    console.log(`📡 Webhook: DISABLED (set WEBHOOK_URL in .env to enable)`);
  }
  
  console.log('='.repeat(60));

  // Initial fetch
  mainLoop();

  // Set interval for subsequent fetches
  setInterval(mainLoop, FETCH_INTERVAL);
}

startApplication().catch(err => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
