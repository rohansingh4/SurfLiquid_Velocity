import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import Position from './models/Position.js';
import BaseTransaction from './models/BaseTransaction.js';
import TradingBot from './trading-bot.js';

dotenv.config();

// ============================================================================
// BASE POOL TRADING BOT - STANDALONE
// ============================================================================

// Configuration
const RPC_URL = process.env.BASE_RPC_URL;
const POOL_ADDRESS = process.env.BASE_POOL_ADDRESS || '0xd0b53d9277642d899df5c87a3966a349a798f224';
const FETCH_INTERVAL = 3000; // 3 seconds
const CANDLE_INTERVAL = 10000; // 10 seconds
const TICK_RANGE = 10; // 10 ticks for Base pool

// Base Pool tokens (WETH/USDC)
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Token1
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Token0

// Trading configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SWAP_HELPER_ADDRESS = process.env.BASE_HELPER_SOL;
const TRADING_ENABLED = PRIVATE_KEY && PRIVATE_KEY.length > 10 && SWAP_HELPER_ADDRESS;

// Pool ABI
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function tickSpacing() external view returns (int24)'
];

// ERC20 ABI
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function balanceOf(address) external view returns (uint256)',
  'function symbol() external view returns (string)'
];

// State management
let currentCandle = null;
let currentRanges = null;
let lastPositionStatus = null;
let lastPositionPercentages = { weth_pct: 50, usdc_pct: 50 };
let outOfRangeDetectedAt = null;
let positionSavedThisCycle = false;
let isProcessingCandle = false;

// Web3 setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
const token0Contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token1Contract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

// Trading bot setup
let tradingBot = null;

async function initializeTradingBot() {
  if (!TRADING_ENABLED) {
    console.log('\n⚠️  TRADING DISABLED');
    if (!PRIVATE_KEY || PRIVATE_KEY.length < 10) {
      console.log('   Reason: No PRIVATE_KEY in .env');
    } else if (!SWAP_HELPER_ADDRESS) {
      console.log('   Reason: No BASE_HELPER_SOL in .env');
    }
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('🚀 BASE POOL TRADING BOT - ENABLED');
  console.log('='.repeat(60));

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  tradingBot = new TradingBot(provider, wallet, POOL_ADDRESS, WETH_ADDRESS, USDC_ADDRESS, SWAP_HELPER_ADDRESS);

  console.log(`🤖 Wallet: ${wallet.address}`);
  console.log(`📍 Pool: ${POOL_ADDRESS}`);
  console.log(`🔧 Helper: ${SWAP_HELPER_ADDRESS}`);
  console.log(`📊 Range: ${TICK_RANGE} ticks (directional selection)`);
  console.log('='.repeat(60) + '\n');

  // Restore position state
  await tradingBot.restorePositionState();
}

// Calculate price from sqrtPriceX96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = sqrtPrice * sqrtPrice;
  const priceAdjusted = priceRaw / (10 ** 12); // Adjust for WETH(18) / USDC(6)
  return 1 / priceAdjusted; // USDC per WETH
}

// Get pool tick spacing
async function getPoolTickSpacing() {
  try {
    const tickSpacing = await poolContract.tickSpacing();
    return Number(tickSpacing);
  } catch (error) {
    console.error('❌ Error getting tick spacing:', error);
    return 10; // Default for Base pool
  }
}

// Calculate distribution
function calculateDistribution(reserve0, reserve1, price) {
  const token0Value = parseFloat(reserve0) / 1e6; // USDC
  const token1Value = parseFloat(reserve1) / 1e18; // WETH
  const token1ValueInUSDC = token1Value * price;

  const totalValue = token0Value + token1ValueInUSDC;
  const usdc_pct = (token0Value / totalValue) * 100;
  const weth_pct = (token1ValueInUSDC / totalValue) * 100;

  return { usdc_pct, weth_pct };
}

// Fetch pool data
async function fetchPoolData() {
  try {
    const [slot0Data, liquidityData, reserve0, reserve1] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
      token0Contract.balanceOf(POOL_ADDRESS),
      token1Contract.balanceOf(POOL_ADDRESS)
    ]);

    const sqrtPriceX96 = slot0Data[0];
    const tick = slot0Data[1];
    const liquidity = liquidityData;

    const price = calculatePriceFromSqrtPriceX96(sqrtPriceX96);
    const distribution = calculateDistribution(reserve0, reserve1, price);

    return {
      timestamp: Date.now(),
      price,
      tick: Number(tick),
      liquidity: liquidity.toString(),
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      ...distribution
    };
  } catch (error) {
    console.error('❌ Error fetching pool data:', error.message);
    return null;
  }
}

// Update candle
async function updateCandle(data) {
  const now = Date.now();
  const candleStart = Math.floor(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;

  if (!currentCandle || currentCandle.timestamp !== candleStart) {
    if (isProcessingCandle) {
      return;
    }
    isProcessingCandle = true;

    try {
      // Close previous candle
      if (currentCandle) {
        const currentPrice = data.price;
        const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;

        // Check for rebalance conditions
        if (lastPositionStatus === 'Price-UP' || lastPositionStatus === 'Price-DOWN') {
          if (isInRange) {
            // Price back in range
            console.log(`✅ Price back in range - No rebalance needed`);
            lastPositionStatus = 'Monitoring';
            outOfRangeDetectedAt = null;
            positionSavedThisCycle = false;
          } else {
            // REBALANCE NOW
            await executeRebalance(data);
          }
        } else if (!isInRange && lastPositionStatus !== 'Price-UP' && lastPositionStatus !== 'Price-DOWN') {
          // Price just went out of range
          const isAbove = currentPrice > currentRanges.upper;
          const status = isAbove ? 'Price-UP' : 'Price-DOWN';

          console.log(`\n⚠️  ${status}: $${currentPrice.toFixed(2)}`);

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
          positionSavedThisCycle = true;
        } else if (isInRange && lastPositionStatus === 'Monitoring') {
          // Normal monitoring
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
        close: data.price
      };

      positionSavedThisCycle = false;
    } finally {
      isProcessingCandle = false;
    }
  } else {
    // Update current candle
    currentCandle.high = Math.max(currentCandle.high, data.price);
    currentCandle.low = Math.min(currentCandle.low, data.price);
    currentCandle.close = data.price;
  }
}

// Execute rebalance with retry logic
async function executeRebalance(data) {
  const isUpRebalance = data.price > currentRanges.upper;
  const openPrice = data.price;

  // Calculate new directional range
  const poolTickSpacing = await getPoolTickSpacing();
  const openTick = Math.log(openPrice) / Math.log(1.0001);
  const centerTick = Math.round(openTick / poolTickSpacing) * poolTickSpacing;

  // DIRECTIONAL RANGE SELECTION
  let tickLower, tickUpper;
  if (isUpRebalance) {
    // Rebalance UP: Pick UPPER range [center, center+10]
    tickLower = centerTick;
    tickUpper = centerTick + TICK_RANGE;
  } else {
    // Rebalance DOWN: Pick LOWER range [center-10, center]
    tickLower = centerTick - TICK_RANGE;
    tickUpper = centerTick;
  }

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

  // Use CURRENT pool composition for target
  const targetPercentages = {
    weth_pct: data.weth_pct,
    usdc_pct: data.usdc_pct
  };

  console.log(`\n🔄 BASE REBALANCE: ${status}`);
  console.log(`  Price: $${openPrice.toFixed(2)}`);
  console.log(`  Direction: ${isUpRebalance ? 'UP (upper range)' : 'DOWN (lower range)'}`);
  console.log(`  New Range: $${lowerRange.toFixed(2)} - $${upperRange.toFixed(2)}`);
  console.log(`  Ticks: ${tickLower} to ${tickUpper}`);
  console.log(`  Target: ${targetPercentages.weth_pct.toFixed(1)}% WETH, ${targetPercentages.usdc_pct.toFixed(1)}% USDC`);

  if (positionSavedThisCycle) {
    console.log(`  ⏭️  Already saved - skipping duplicate`);
    return;
  }

  // Save position
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
    weth_pct: targetPercentages.weth_pct,
    usdc_pct: targetPercentages.usdc_pct,
    rebalance_type: rebalanceType
  });

  // Execute trading if enabled
  if (tradingBot) {
    await tradingBot.processSignal(
      status,
      targetPercentages.weth_pct,
      targetPercentages.usdc_pct,
      currentRanges.upper,
      currentRanges.lower,
      data.price,
      currentRanges.tickLower,
      currentRanges.tickUpper
    );
  }

  lastPositionStatus = 'Monitoring';
  outOfRangeDetectedAt = null;
  positionSavedThisCycle = true;
}

// Initialize ranges
async function streamPositionData(data) {
  if (!currentCandle) return;

  if (!currentRanges) {
    // Try restore from DB
    try {
      const lastPosition = await Position.findOne().sort({ timestamp: -1 }).limit(1);

      if (lastPosition && lastPosition.upper_range && lastPosition.lower_range) {
        currentRanges = {
          upper: lastPosition.upper_range,
          lower: lastPosition.lower_range,
          tickLower: lastPosition.tickLower,
          tickUpper: lastPosition.tickUpper
        };
        lastPositionStatus = lastPosition.status || 'Monitoring';
        console.log(`\n🔄 Ranges RESTORED from DB`);
        console.log(`   Range: $${currentRanges.lower.toFixed(2)} - $${currentRanges.upper.toFixed(2)}`);
      } else {
        // Create new symmetric range
        const openPrice = currentCandle.open;
        const tickSpacing = await getPoolTickSpacing();
        const openTick = Math.log(openPrice) / Math.log(1.0001);
        const centerTick = Math.round(openTick / tickSpacing) * tickSpacing;

        // Initial: symmetric [center-5, center+5]
        const tickLower = centerTick - (TICK_RANGE / 2);
        const tickUpper = centerTick + (TICK_RANGE / 2);
        const lowerRange = Math.pow(1.0001, tickLower);
        const upperRange = Math.pow(1.0001, tickUpper);

        currentRanges = {
          upper: upperRange,
          lower: lowerRange,
          tickLower: tickLower,
          tickUpper: tickUpper
        };
        lastPositionStatus = 'Monitoring';
        console.log(`\n🎯 Initial Range: $${lowerRange.toFixed(2)} - $${upperRange.toFixed(2)} (10 ticks)`);
      }
    } catch (error) {
      console.error('Error restoring ranges:', error);
    }
  }

  // Log status
  const currentPrice = data.price;
  const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;

  if (isInRange) {
    console.log(`📊 Monitoring: $${currentPrice.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
  } else {
    console.log(`⚠️  Out of Range: $${currentPrice.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
  }
}

// Save position data
async function savePositionData(positionData) {
  try {
    const newPosition = new Position(positionData);
    await newPosition.save();

    if (positionData.weth_pct && positionData.usdc_pct) {
      lastPositionPercentages = {
        weth_pct: positionData.weth_pct,
        usdc_pct: positionData.usdc_pct
      };
    }
  } catch (error) {
    console.error('Error saving position:', error.message);
  }
}

// Main loop
async function mainLoop() {
  const data = await fetchPoolData();

  if (data) {
    await updateCandle(data);
    await streamPositionData(data);
  }
}

// Start application
async function startApplication() {
  console.log('='.repeat(60));
  console.log('🎯 BASE POOL TRADING BOT - STANDALONE');
  console.log('='.repeat(60));
  console.log(`Pool: ${POOL_ADDRESS}`);
  console.log(`RPC: ${RPC_URL.substring(0, 50)}...`);
  console.log(`Fetch: ${FETCH_INTERVAL}ms | Candle: ${CANDLE_INTERVAL}ms`);
  console.log(`Range: ${TICK_RANGE} ticks (directional)`);
  console.log('='.repeat(60));

  await connectDB();
  await initializeTradingBot();

  console.log('\n🚀 Starting main loop...\n');

  mainLoop();
  setInterval(mainLoop, FETCH_INTERVAL);
}

startApplication().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
