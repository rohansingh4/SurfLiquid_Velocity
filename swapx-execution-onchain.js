import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import PositionSwapX from './models/PositionSwapX.js';

dotenv.config();

// Configuration from .env (fallback to SONIC_RPC_URL if SWAPX_RPC_URL not set)
const RPC_URL = process.env.SWAPX_RPC_URL || process.env.SONIC_RPC_URL;
const POOL_ADDRESS = process.env.SWAPX_POOL_ADDRESS || '0xec4ee7d6988ab06f7a8daaf8c5fdffde6321be68';
const TICK_SPACING = parseInt(process.env.SWAPX_TICK_SPACING) || 5;
const RANGE_TICKS = parseInt(process.env.SWAPX_RANGE_TICKS) || 10;
const FETCH_INTERVAL = 3000; // 3 seconds (fetch more frequently)
const CANDLE_INTERVAL = 10000; // 10 seconds (candle period)

// Token addresses (SwapX WETH/USDC pool)
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';
const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';

// Pool ABI (Algebra/SwapX style)
const POOL_ABI = [
  'function globalState() external view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
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
let currentRanges = null;
let lastPositionStatus = null;
let lastPositionPercentages = { weth_pct: 50, usdc_pct: 50 };
let positionHistory = [];
let tickData = [];
let outOfRangeDetectedAt = null;
let positionSavedThisCycle = false;

// Web3 setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
const token0Contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token1Contract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

// Calculate price from sqrtPriceX96 (Algebra V3 format)
// SwapX pool: token0=USDC (6 decimals), token1=WETH (18 decimals)
// sqrtPriceX96 = sqrt(token1/token0) * 2^96 in raw units
// We want WETH price in USDC
function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = BigInt(sqrtPriceX96.toString());
  
  // price_raw = (sqrtPriceX96 / 2^96)^2 = token1/token0 in raw units (WETH_raw / USDC_raw)
  // For token0=USDC(6), token1=WETH(18): price_raw = (weth * 10^18) / (usdc * 10^6)
  // To get USDC per WETH: 10^12 / price_raw
  
  const sqrtPriceFloat = Number(sqrtPrice) / Number(Q96);
  const priceRaw = sqrtPriceFloat * sqrtPriceFloat;
  
  // USDC per WETH = 10^12 / priceRaw (inverse of the raw price, adjusted for decimals)
  const usdcPerWeth = 1e12 / priceRaw;
  
  return usdcPerWeth;
}

// Calculate percentages of pool composition
function calculatePoolComposition(token0Reserve, token1Reserve, price) {
  const token0Value = Number(token0Reserve) / 1e6; // USDC has 6 decimals
  const token1Value = Number(token1Reserve) / 1e18; // WETH has 18 decimals
  const token1ValueInUSDC = token1Value * price;

  const totalValue = token0Value + token1ValueInUSDC;
  const usdc_pct = (token0Value / totalValue) * 100;
  const weth_pct = (token1ValueInUSDC / totalValue) * 100;

  return { usdc_pct, weth_pct };
}

// Fetch pool data from blockchain
async function fetchPoolData() {
  try {
    // Get pool state (globalState for Algebra)
    const globalState = await poolContract.globalState();
    const sqrtPriceX96 = globalState.price;
    const tick = globalState.tick;

    // Calculate price from sqrtPriceX96
    const price = calculatePriceFromSqrtPriceX96(sqrtPriceX96);

    // Get reserves (not available directly in Algebra, use liquidity as proxy)
    const liquidity = await poolContract.liquidity();

    // Calculate approximate reserves based on price and liquidity
    // For display purposes, use default composition
    const { usdc_pct, weth_pct } = { usdc_pct: 50, weth_pct: 50 };

    return {
      timestamp: new Date(),
      price,
      tick: Number(tick),  // Convert BigInt to Number
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      usdc_pct,
      weth_pct
    };
  } catch (error) {
    console.error('Error fetching pool data:', error.message);
    return null;
  }
}

// Initialize ranges on first fetch - CENTERED on current tick (±5 ticks = 0.1% range)
async function initializeRanges(data) {
  if (currentRanges !== null) return;

  const currentTick = data.tick;

  // Center the range on current tick: ±5 ticks (half of RANGE_TICKS)
  // Round to nearest valid tick spacing multiple
  const centerTick = Math.round(currentTick / TICK_SPACING) * TICK_SPACING;
  const tickLower = centerTick - (RANGE_TICKS / 2);  // -5 ticks
  const tickUpper = centerTick + (RANGE_TICKS / 2);  // +5 ticks

  // Calculate price boundaries from ticks
  const lowerRange = Math.pow(1.0001, tickLower);
  const upperRange = Math.pow(1.0001, tickUpper);

  currentRanges = {
    upper: upperRange,
    lower: lowerRange,
    tickLower: tickLower,
    tickUpper: tickUpper
  };

  lastPositionStatus = 'Monitoring';
  console.log(`\n🎯 [SwapX] Initial Ranges Set (centered on tick ${centerTick}):`);
  console.log(`   Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);
  console.log(`   Tick Range: ${tickLower} to ${tickUpper} (±${RANGE_TICKS/2} ticks = 0.1%)`);
}

// Save position data to MongoDB
async function savePositionData(positionData) {
  try {
    const newPosition = new PositionSwapX(positionData);
    await newPosition.save();

    // Update last position percentages
    if (positionData.weth_pct && positionData.usdc_pct) {
      lastPositionPercentages = {
        weth_pct: positionData.weth_pct,
        usdc_pct: positionData.usdc_pct
      };
    }

    console.log(`   ✅ [SwapX] Position saved: ${positionData.status}`);
  } catch (error) {
    console.error('[SwapX] Error saving position:', error.message);
  }
}

// Process candle close and determine if rebalance needed
async function processCandle(candle) {
  try {
    const currentPrice = candle.close;
    const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;

    // Reset flag at start of new candle
    if (!positionSavedThisCycle) {
      positionSavedThisCycle = false;
    }

    // Check if rebalance needed (price out of range)
    if (!isInRange && lastPositionStatus !== 'Price-UP' && lastPositionStatus !== 'Price-DOWN') {
      // Price just went out of range
      const priceStatus = currentPrice > currentRanges.upper ? 'Price-UP' : 'Price-DOWN';

      await savePositionData({
        timestamp: candle.timestamp,
        status: priceStatus,
        upper_range: currentRanges.upper,
        lower_range: currentRanges.lower,
        tickLower: currentRanges.tickLower,
        tickUpper: currentRanges.tickUpper,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        weth_pct: lastPositionPercentages.weth_pct,
        usdc_pct: lastPositionPercentages.usdc_pct,
        rebalance_type: 'N/A'
      });

      lastPositionStatus = priceStatus;
      outOfRangeDetectedAt = candle.timestamp;
      positionSavedThisCycle = true;
    } else if (!isInRange && ['Price-UP', 'Price-DOWN'].includes(lastPositionStatus)) {
      // Still out of range - check if should rebalance
      const timeSinceOutOfRange = candle.timestamp - outOfRangeDetectedAt;

      // Rebalance if out of range for 2+ candles (20+ seconds)
      if (timeSinceOutOfRange >= CANDLE_INTERVAL * 2) {
        // Calculate new range CENTERED on open price (±5 ticks = 0.1%)
        const openPrice = candle.open;
        const openTick = Math.floor(Math.log(openPrice) / Math.log(1.0001));
        
        // Center the range on open tick
        const centerTick = Math.round(openTick / TICK_SPACING) * TICK_SPACING;
        const tickLower = centerTick - (RANGE_TICKS / 2);  // -5 ticks
        const tickUpper = centerTick + (RANGE_TICKS / 2);  // +5 ticks

        const lowerRange = Math.pow(1.0001, tickLower);
        const upperRange = Math.pow(1.0001, tickUpper);

        // Determine signal based on previous out-of-range direction
        const status = lastPositionStatus === 'Price-UP' ? 'Open-UP' : 'Open-DOWN';
        const rebalanceType = status === 'Open-UP' ? 'Rebalance UP' : 'Rebalance DOWN';

        currentRanges = {
          upper: upperRange,
          lower: lowerRange,
          tickLower: tickLower,
          tickUpper: tickUpper
        };

        // Define strategic target percentages based on signal type
        const targetPercentages = status === 'Open-UP'
          ? { weth_pct: 70, usdc_pct: 30 }
          : { weth_pct: 30, usdc_pct: 70 };

        console.log(`\n🔄 [SwapX] REBALANCE: ${status}`);
        console.log(`  Open Price: $${openPrice.toFixed(2)} (center tick ${centerTick})`);
        console.log(`  New Ranges: Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);
        console.log(`  Tick Range: ${tickLower} to ${tickUpper} (±${RANGE_TICKS/2} ticks = 0.1%)`);
        console.log(`  Target Allocation: ${targetPercentages.weth_pct}% WETH, ${targetPercentages.usdc_pct}% USDC`);

        // Prevent duplicate saves
        if (positionSavedThisCycle) {
          console.log(`  ⏭️  Already saved this rebalance - skipping duplicate`);
          return;
        }

        await savePositionData({
          timestamp: candle.timestamp,
          status: status,
          upper_range: currentRanges.upper,
          lower_range: currentRanges.lower,
          tickLower: currentRanges.tickLower,
          tickUpper: currentRanges.tickUpper,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          weth_pct: targetPercentages.weth_pct,
          usdc_pct: targetPercentages.usdc_pct,
          rebalance_type: rebalanceType
        });

        lastPositionStatus = 'Monitoring';
        outOfRangeDetectedAt = null;
        positionSavedThisCycle = true;
      }
    } else if (isInRange && lastPositionStatus !== 'Monitoring') {
      // Price back in range
      console.log(`\n✅ [SwapX] PRICE BACK IN RANGE`);
      lastPositionStatus = 'Monitoring';
      outOfRangeDetectedAt = null;
      positionSavedThisCycle = false;
    } else if (isInRange && lastPositionStatus === 'Monitoring' && !positionSavedThisCycle) {
      // Regular monitoring save
      await savePositionData({
        timestamp: candle.timestamp,
        status: 'Monitoring',
        upper_range: currentRanges.upper,
        lower_range: currentRanges.lower,
        tickLower: currentRanges.tickLower,
        tickUpper: currentRanges.tickUpper,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        weth_pct: lastPositionPercentages.weth_pct,
        usdc_pct: lastPositionPercentages.usdc_pct,
        rebalance_type: 'N/A'
      });
      positionSavedThisCycle = false;
    }
  } catch (error) {
    console.error('[SwapX] Error processing candle:', error.message);
  }
}

// Express server for API
const app = express();
app.use(cors());

// API endpoint for SwapX positions
app.get('/api/swapx/positions', async (req, res) => {
  try {
    const positions = await PositionSwapX.find()
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(positions);
  } catch (error) {
    console.error('[SwapX] API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// API endpoint for latest SwapX data
app.get('/api/swapx/current', (req, res) => {
  res.json({
    currentRanges,
    lastPositionStatus,
    lastPositionPercentages
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[SwapX] API server running on port ${PORT}`);
});

// Main execution loop
async function main() {
  console.log('\n🚀 Starting SwapX Position Monitoring Service...');
  console.log(`   Pool: ${POOL_ADDRESS}`);
  console.log(`   Range: 0.1% (${RANGE_TICKS} ticks with spacing ${TICK_SPACING})`);
  console.log(`   Fetch interval: ${FETCH_INTERVAL}ms`);
  console.log(`   Candle interval: ${CANDLE_INTERVAL}ms\n`);

  // Connect to MongoDB
  await connectDB();

  let lastCandleTime = Date.now();

  // Main loop
  setInterval(async () => {
    try {
      const data = await fetchPoolData();
      if (!data) return;

      // Initialize ranges on first fetch
      await initializeRanges(data);

      // Update current candle
      if (!currentCandle) {
        currentCandle = {
          timestamp: data.timestamp,
          open: data.price,
          high: data.price,
          low: data.price,
          close: data.price
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, data.price);
        currentCandle.low = Math.min(currentCandle.low, data.price);
        currentCandle.close = data.price;
      }

      // Store tick data for candle
      tickData.push({
        timestamp: data.timestamp,
        price: data.price,
        tick: data.tick
      });

      // Check if candle should close
      const now = Date.now();
      if (now - lastCandleTime >= CANDLE_INTERVAL) {
        candles.push(currentCandle);

        // Process closed candle
        await processCandle(currentCandle);

        // Start new candle
        currentCandle = {
          timestamp: new Date(),
          open: data.price,
          high: data.price,
          low: data.price,
          close: data.price
        };

        tickData = [];
        lastCandleTime = now;
        positionSavedThisCycle = false;
      }

      // Log current status
      const isInRange = data.price >= currentRanges.lower && data.price <= currentRanges.upper;
      if (isInRange) {
        console.log(`[SwapX] 📊 Monitoring: $${data.price.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
      } else {
        console.log(`[SwapX] ⚠️  Out of Range: $${data.price.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
      }
    } catch (error) {
      console.error('[SwapX] Error in main loop:', error.message);
    }
  }, FETCH_INTERVAL);
}

// Start the service
main().catch(console.error);
