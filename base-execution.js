import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import PositionBase from './models/PositionBase.js';

dotenv.config();

// Configuration from .env
const RPC_URL = process.env.BASE_RPC_URL;
const POOL_ADDRESS = process.env.BASE_POOL_ADDRESS || '0xd0b53d9277642d899df5c87a3966a349a798f224';
const TICK_SPACING = parseInt(process.env.BASE_TICK_SPACING) || 10;
const RANGE_TICKS = parseInt(process.env.BASE_RANGE_TICKS) || 10;
const FETCH_INTERVAL = 3000; // 3 seconds (fetch more frequently)
const CANDLE_INTERVAL = 10000; // 10 seconds (candle period)

// Uniswap V3 Pool ABI (based on provided contract)
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function tickSpacing() external view returns (int24)',
  'function fee() external view returns (uint24)'
];

// ERC20 ABI for token info
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function balanceOf(address) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)'
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
let token0Info = null;
let token1Info = null;

// Web3 setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

// Get token information
async function getTokenInfo() {
  if (token0Info && token1Info) return { token0Info, token1Info };

  try {
    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();

    const token0Contract = new ethers.Contract(token0Address, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(token1Address, ERC20_ABI, provider);

    token0Info = {
      address: token0Address,
      decimals: await token0Contract.decimals(),
      symbol: await token0Contract.symbol(),
      name: await token0Contract.name()
    };

    token1Info = {
      address: token1Address,
      decimals: await token1Contract.decimals(),
      symbol: await token1Contract.symbol(),
      name: await token1Contract.name()
    };

    console.log(`\n📊 [Base] Pool Token Info:`);
    console.log(`   Token0: ${token0Info.symbol} (${token0Info.decimals} decimals)`);
    console.log(`   Token1: ${token1Info.symbol} (${token1Info.decimals} decimals)`);

    return { token0Info, token1Info };
  } catch (error) {
    console.error('[Base] Error fetching token info:', error.message);
    throw error;
  }
}

// Calculate price from sqrtPriceX96 (Uniswap V3 format)
// sqrtPriceX96 = sqrt(token1/token0) * 2^96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = BigInt(sqrtPriceX96.toString());

  // price = (sqrtPriceX96 / 2^96)^2
  const sqrtPriceFloat = Number(sqrtPrice) / Number(Q96);
  const priceRaw = sqrtPriceFloat * sqrtPriceFloat;

  // Adjust for decimals: price of token1 in terms of token0
  const decimalAdjustment = 10 ** (Number(decimals0) - Number(decimals1));
  const price = priceRaw * decimalAdjustment;

  return price;
}

// Calculate percentages of pool composition
function calculatePoolComposition(token0Reserve, token1Reserve, price, decimals0, decimals1) {
  const token0Value = Number(token0Reserve) / (10 ** Number(decimals0));
  const token1Value = Number(token1Reserve) / (10 ** Number(decimals1));
  const token1ValueInToken0 = token1Value * price;

  const totalValue = token0Value + token1ValueInToken0;
  const token0_pct = (token0Value / totalValue) * 100;
  const token1_pct = (token1ValueInToken0 / totalValue) * 100;

  return { token0_pct, token1_pct };
}

// Fetch pool data from blockchain
async function fetchPoolData() {
  try {
    // Get token info first
    const { token0Info, token1Info } = await getTokenInfo();

    // Get pool state (slot0 for Uniswap V3)
    const slot0 = await poolContract.slot0();
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const tick = slot0.tick;

    // Calculate price from sqrtPriceX96
    const price = calculatePriceFromSqrtPriceX96(
      sqrtPriceX96,
      token0Info.decimals,
      token1Info.decimals
    );

    // Get liquidity
    const liquidity = await poolContract.liquidity();

    // For display purposes, use default composition (can be enhanced later)
    const { token0_pct, token1_pct } = { token0_pct: 50, token1_pct: 50 };

    return {
      timestamp: new Date(),
      price,
      tick: Number(tick),
      sqrtPriceX96: sqrtPriceX96.toString(),
      liquidity: liquidity.toString(),
      token0_pct,
      token1_pct
    };
  } catch (error) {
    console.error('[Base] Error fetching pool data:', error.message);
    return null;
  }
}

// Initialize ranges on first fetch - CENTERED on current tick (±5 ticks = 0.1% range)
async function initializeRanges(data) {
  if (currentRanges !== null) return;

  const { token0Info, token1Info } = await getTokenInfo();
  const currentTick = Number(data.tick);

  // Center the range on current tick: ±5 ticks (half of RANGE_TICKS)
  // Round to nearest valid tick spacing multiple
  const centerTick = Math.round(currentTick / TICK_SPACING) * TICK_SPACING;
  const tickLower = centerTick - (RANGE_TICKS / 2);  // -5 ticks
  const tickUpper = centerTick + (RANGE_TICKS / 2);  // +5 ticks

  // Calculate price boundaries from ticks using proper conversion
  // For Uniswap V3: price = 1.0001^tick, then adjust for decimals
  const priceLowerRaw = Math.pow(1.0001, tickLower);
  const priceUpperRaw = Math.pow(1.0001, tickUpper);

  const decimalAdjustment = 10 ** (Number(token0Info.decimals) - Number(token1Info.decimals));
  const lowerRange = priceLowerRaw * decimalAdjustment;
  const upperRange = priceUpperRaw * decimalAdjustment;

  currentRanges = {
    upper: upperRange,
    lower: lowerRange,
    tickLower: tickLower,
    tickUpper: tickUpper
  };

  lastPositionStatus = 'Monitoring';
  console.log(`\n🎯 [Base] Initial Ranges Set (centered on tick ${centerTick}):`);
  console.log(`   Upper=${currentRanges.upper.toFixed(2)}, Lower=${currentRanges.lower.toFixed(2)}`);
  console.log(`   Tick Range: ${tickLower} to ${tickUpper} (±${RANGE_TICKS/2} ticks = 0.1%)`);
}

// Save position data to MongoDB
async function savePositionData(positionData) {
  try {
    const newPosition = new PositionBase(positionData);
    await newPosition.save();

    // Update last position percentages
    if (positionData.weth_pct && positionData.usdc_pct) {
      lastPositionPercentages = {
        weth_pct: positionData.weth_pct,
        usdc_pct: positionData.usdc_pct
      };
    }

    console.log(`   ✅ [Base] Position saved: ${positionData.status}`);
  } catch (error) {
    console.error('[Base] Error saving position:', error.message);
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

        // Convert price back to tick (inverse of price calculation)
        const decimalAdjustment = 10 ** (Number(token0Info.decimals) - Number(token1Info.decimals));
        const priceRaw = openPrice / decimalAdjustment;
        const openTick = Math.floor(Math.log(priceRaw) / Math.log(1.0001));

        // Center the range on open tick
        const centerTick = Math.round(openTick / TICK_SPACING) * TICK_SPACING;
        const tickLower = centerTick - (RANGE_TICKS / 2);  // -5 ticks
        const tickUpper = centerTick + (RANGE_TICKS / 2);  // +5 ticks

        const priceLowerRaw = Math.pow(1.0001, tickLower);
        const priceUpperRaw = Math.pow(1.0001, tickUpper);
        const lowerRange = priceLowerRaw * decimalAdjustment;
        const upperRange = priceUpperRaw * decimalAdjustment;

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

        console.log(`\n🔄 [Base] REBALANCE: ${status}`);
        console.log(`  Open Price: $${openPrice.toFixed(2)} (center tick ${centerTick})`);
        console.log(`  New Ranges: Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);
        console.log(`  Tick Range: ${tickLower} to ${tickUpper} (±${RANGE_TICKS/2} ticks = 0.1%)`);
        console.log(`  Target Allocation: ${targetPercentages.weth_pct}% Token1, ${targetPercentages.usdc_pct}% Token0`);

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
      console.log(`\n✅ [Base] PRICE BACK IN RANGE`);
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
    console.error('[Base] Error processing candle:', error.message);
  }
}

// Express server for API
const app = express();
app.use(cors());

// API endpoint for Base positions
app.get('/api/base/positions', async (req, res) => {
  try {
    const positions = await PositionBase.find()
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(positions);
  } catch (error) {
    console.error('[Base] API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// API endpoint for latest Base data
app.get('/api/base/current', (req, res) => {
  // Convert BigInt values to regular numbers for JSON serialization
  const safeTokenInfo = token0Info && token1Info ? {
    token0Info: {
      address: token0Info.address,
      decimals: Number(token0Info.decimals),
      symbol: token0Info.symbol,
      name: token0Info.name
    },
    token1Info: {
      address: token1Info.address,
      decimals: Number(token1Info.decimals),
      symbol: token1Info.symbol,
      name: token1Info.name
    }
  } : null;

  res.json({
    currentRanges,
    lastPositionStatus,
    lastPositionPercentages,
    tokenInfo: safeTokenInfo
  });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`[Base] API server running on port ${PORT}`);
});

// Main execution loop
async function main() {
  console.log('\n🚀 Starting Base Pool Position Monitoring Service...');
  console.log(`   Network: Base`);
  console.log(`   Pool: ${POOL_ADDRESS}`);
  console.log(`   Range: 0.1% (${RANGE_TICKS} ticks with spacing ${TICK_SPACING})`);
  console.log(`   Fetch interval: ${FETCH_INTERVAL}ms`);
  console.log(`   Candle interval: ${CANDLE_INTERVAL}ms\n`);

  // Connect to MongoDB
  await connectDB();

  // Get token info
  await getTokenInfo();

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
        console.log(`[Base] 📊 Monitoring: $${data.price.toFixed(2)} (Range: $${currentRanges.lower.toFixed(2)} - $${currentRanges.upper.toFixed(2)})`);
      } else {
        console.log(`[Base] ⚠️  Out of Range: $${data.price.toFixed(2)} (Range: $${currentRanges.lower.toFixed(2)} - $${currentRanges.upper.toFixed(2)})`);
      }
    } catch (error) {
      console.error('[Base] Error in main loop:', error.message);
    }
  }, FETCH_INTERVAL);
}

// Start the service
main().catch(console.error);
