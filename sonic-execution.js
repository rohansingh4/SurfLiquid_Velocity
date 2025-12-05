import axios from 'axios';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './db.js';
import Candle from './models/Candle.js';
import Position from './models/Position.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const POOL_ADDRESS = '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const API_URL = 'https://api.shadow.so/mixed-pairs';
const FETCH_INTERVAL = 10000; // 10 seconds
const RANGE_PERCENTAGE = 0.1; // 0.1% range

// State management
let currentCandle = null;
let candles = [];
let currentRanges = null; // Tracks current upper/lower ranges
let lastPositionStatus = null; // Tracks last position status
let positionHistory = [];
let tickData = [];
let outOfRangeDetectedAt = null; // Timestamp when out of range was first detected

// MongoDB will be used for persistence instead of CSV

// Calculate price from sqrtPrice (Uniswap V3 formula)
function calculatePrice(sqrtPriceX96, token0Decimals = 6, token1Decimals = 18) {
  // sqrtPriceX96 is sqrt(price) * 2^96
  // price = (sqrtPriceX96 / 2^96)^2
  const Q96 = Math.pow(2, 96);
  const sqrtPrice = parseFloat(sqrtPriceX96) / Q96;
  const price = Math.pow(sqrtPrice, 2);

  // Adjust for decimals: token0 is USDC (6 decimals), token1 is WETH (18 decimals)
  // Price is in terms of token0/token1, so USDC per WETH
  const adjustedPrice = price * Math.pow(10, token1Decimals - token0Decimals);

  return adjustedPrice;
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

// Fetch pool data from Shadow API
async function fetchPoolData() {
  try {
    const response = await axios.get(API_URL);
    const pools = response.data.pairs; // API returns {pairs: [...]}

    // Find our specific pool
    const pool = pools.find(p => p.id.toLowerCase() === POOL_ADDRESS.toLowerCase());

    if (!pool) {
      console.error('Pool not found!');
      return null;
    }

    // Get reserves
    const reserve0 = pool.reserve0 || parseFloat(pool.totalValueLockedToken0) * 1e6;
    const reserve1 = pool.reserve1 || parseFloat(pool.totalValueLockedToken1) * 1e18;

    // Calculate actual price: USDC per WETH
    // reserve0 is USDC (6 decimals), reserve1 is WETH (18 decimals)
    const usdc_amount = reserve0 / 1e6; // Convert to actual USDC
    const weth_amount = reserve1 / 1e18; // Convert to actual WETH
    const price = usdc_amount / weth_amount; // USDC per WETH (price of 1 WETH in USDC)

    // Calculate distribution
    const distribution = calculateDistribution(reserve0, reserve1, price);

    return {
      timestamp: Date.now(),
      price: price,
      sqrtPrice: pool.sqrtPrice,
      liquidity: pool.liquidity,
      tick: pool.tick,
      reserve0: reserve0,
      reserve1: reserve1,
      weth_amount: parseFloat(pool.totalValueLockedToken1),
      usdc_amount: parseFloat(pool.totalValueLockedToken0),
      tvl: pool.tvl,
      ...distribution
    };
  } catch (error) {
    console.error('Error fetching pool data:', error.message);
    return null;
  }
}

// Update 15-second candle
async function updateCandle(data) {
  const now = Date.now();
  const candleStart = Math.floor(now / FETCH_INTERVAL) * FETCH_INTERVAL;

  if (!currentCandle || currentCandle.timestamp !== candleStart) {
    // Close previous candle
    if (currentCandle) {
      candles.push(currentCandle);
      saveCandleToMongoDB(currentCandle);

      // Check if we need to rebalance (Step 1: Open-UP/DOWN)
      if (lastPositionStatus === 'Price-UP' || lastPositionStatus === 'Price-DOWN') {
        const currentPrice = data.price;
        const stillOutOfRange = currentPrice > currentRanges.upper || currentPrice < currentRanges.lower;

        if (stillOutOfRange) {
          // Step 1: Rebalance - Update ranges
          const isUpRebalance = currentPrice > currentRanges.upper;
          const openPrice = data.price;

          // Update ranges based on new price
          currentRanges = {
            upper: openPrice * (1 + RANGE_PERCENTAGE / 100),
            lower: openPrice * (1 - RANGE_PERCENTAGE / 100)
          };

          const status = isUpRebalance ? 'Open-UP' : 'Open-DOWN';
          const rebalanceType = isUpRebalance ? 'Rebalance UP' : 'Rebalance DOWN';

          console.log(`\n🔄 REBALANCE: ${status}`);
          console.log(`  New Ranges: Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);

          // Save rebalance position
          await savePositionData({
            timestamp: data.timestamp,
            status: status,
            upper_range: currentRanges.upper,
            lower_range: currentRanges.lower,
            open: data.price,
            high: data.price,
            low: data.price,
            close: data.price,
            weth_pct: data.weth_pct,
            usdc_pct: data.usdc_pct,
            rebalance_type: rebalanceType
          });

          lastPositionStatus = status;
          outOfRangeDetectedAt = null;
        } else {
          // Price came back in range - continue monitoring with old ranges
          console.log(`\n✅ PRICE BACK IN RANGE - No rebalance needed`);
          outOfRangeDetectedAt = null;
        }
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

    console.log(`\n=== New 10s Candle Started at ${new Date(candleStart).toISOString()} ===`);
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

// Stream position data every 10 seconds
async function streamPositionData(data) {
  if (!currentCandle) return;

  // Initialize ranges on first run
  if (!currentRanges) {
    const openPrice = currentCandle.open;
    currentRanges = {
      upper: openPrice * (1 + RANGE_PERCENTAGE / 100),
      lower: openPrice * (1 - RANGE_PERCENTAGE / 100)
    };
    console.log(`\n🎯 Initial Ranges Set: Upper=$${currentRanges.upper.toFixed(2)}, Lower=$${currentRanges.lower.toFixed(2)}`);
  }

  const currentPrice = data.price;
  const isInRange = currentPrice >= currentRanges.lower && currentPrice <= currentRanges.upper;

  let status, rebalanceType = 'N/A';

  if (isInRange) {
    // Step 2: Monitoring - Price is in range
    status = 'Monitoring';
    outOfRangeDetectedAt = null;
    console.log(`📊 Monitoring: $${currentPrice.toFixed(2)} (Range: ${currentRanges.lower.toFixed(2)} - ${currentRanges.upper.toFixed(2)})`);
  } else {
    // Step 3: Price out of range
    const isAboveRange = currentPrice > currentRanges.upper;
    status = isAboveRange ? 'Price-UP' : 'Price-DOWN';

    if (!outOfRangeDetectedAt) {
      outOfRangeDetectedAt = Date.now();
      console.log(`\n⚠️  ${status}: $${currentPrice.toFixed(2)} ${isAboveRange ? '>' : '<'} ${isAboveRange ? currentRanges.upper.toFixed(2) : currentRanges.lower.toFixed(2)}`);
    }
  }

  // Save position data with current candle OHLC
  await savePositionData({
    timestamp: data.timestamp,
    status: status,
    upper_range: currentRanges.upper,
    lower_range: currentRanges.lower,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    close: currentCandle.close,
    weth_pct: data.weth_pct,
    usdc_pct: data.usdc_pct,
    rebalance_type: rebalanceType
  });

  lastPositionStatus = status;
}

// Save position data to MongoDB
async function savePositionData(positionData) {
  try {
    const newPosition = new Position(positionData);
    await newPosition.save();
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
  console.log('🚀 Fetching pool data...');

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

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🌐 Server running on http://localhost:${PORT}`);
  console.log(`📈 Open http://localhost:${PORT}/index.html to view the dashboard\n`);
});

// Start the main loop
async function startApplication() {
  console.log('='.repeat(60));
  console.log('🎯 Sonic Execution Layer - WETH/USDC Pool Monitor');
  console.log('='.repeat(60));

  // Connect to MongoDB
  await connectDB();

  console.log(`Pool: ${POOL_ADDRESS}`);
  console.log(`Fetch Interval: ${FETCH_INTERVAL}ms (10 seconds)`);
  console.log(`Range: ±${RANGE_PERCENTAGE}%`);
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
