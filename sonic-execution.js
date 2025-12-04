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
const FETCH_INTERVAL = 15000; // 15 seconds
const RANGE_PERCENTAGE = 0.1; // 0.1% range

// State management
let currentCandle = null;
let candles = [];
let position = null;
let positionHistory = [];
let tickData = [];

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
function updateCandle(data) {
  const now = Date.now();
  const candleStart = Math.floor(now / FETCH_INTERVAL) * FETCH_INTERVAL;

  if (!currentCandle || currentCandle.timestamp !== candleStart) {
    // Close previous candle
    if (currentCandle) {
      candles.push(currentCandle);
      saveCandleToMongoDB(currentCandle);

      // Check if we need to open a position after rebalance
      if (position && position.status === 'Waiting for Rebalance') {
        openPosition(data);
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

    console.log(`\n=== New 15s Candle Started at ${new Date(candleStart).toISOString()} ===`);
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

  // Keep only last hour of tick data (240 ticks for 15s intervals)
  if (tickData.length > 240) {
    tickData.shift();
  }
}

// Open a new position
function openPosition(data) {
  const openPrice = currentCandle.open;
  const upperRange = openPrice * (1 + RANGE_PERCENTAGE / 100);
  const lowerRange = openPrice * (1 - RANGE_PERCENTAGE / 100);

  position = {
    timestamp: data.timestamp,
    status: 'Position Open',
    openPrice: openPrice,
    currentPrice: data.price,
    upper_range: upperRange,
    lower_range: lowerRange,
    weth_pct: data.weth_pct,
    usdc_pct: data.usdc_pct,
    rebalance_type: null
  };

  console.log(`\n✅ Position Opened:`);
  console.log(`  Open Price: $${openPrice.toFixed(2)}`);
  console.log(`  Upper Range: $${upperRange.toFixed(2)} (+0.1%)`);
  console.log(`  Lower Range: $${lowerRange.toFixed(2)} (-0.1%)`);
  console.log(`  WETH: ${data.weth_pct.toFixed(2)}% | USDC: ${data.usdc_pct.toFixed(2)}%`);

  savePositionToMongoDB();
}

// Monitor position
function monitorPosition(data) {
  if (!position) {
    // Open initial position at the start of a new candle
    if (currentCandle && currentCandle.timestamp === Math.floor(Date.now() / FETCH_INTERVAL) * FETCH_INTERVAL) {
      openPosition(data);
    }
    return;
  }

  position.currentPrice = data.price;

  // Check if price is out of range
  if (data.price > position.upper_range) {
    console.log(`\n⚠️  PRICE OUT OF RANGE - UP`);
    console.log(`  Current: $${data.price.toFixed(2)} > Upper: $${position.upper_range.toFixed(2)}`);
    position.status = 'Price Out of Range - UP';
    position.rebalance_type = 'RebalanceA';
    savePositionToMongoDB();

    // Set to waiting for next candle
    position.status = 'Waiting for Rebalance';
  } else if (data.price < position.lower_range) {
    console.log(`\n⚠️  PRICE OUT OF RANGE - DOWN`);
    console.log(`  Current: $${data.price.toFixed(2)} < Lower: $${position.lower_range.toFixed(2)}`);
    position.status = 'Price Out of Range - DOWN';
    position.rebalance_type = 'RebalanceB';
    savePositionToMongoDB();

    // Set to waiting for next candle
    position.status = 'Waiting for Rebalance';
  } else {
    if (position.status === 'Position Open') {
      console.log(`✓ Position in range: $${data.price.toFixed(2)} (${position.lower_range.toFixed(2)} - ${position.upper_range.toFixed(2)})`);
    }
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
    console.error('Error saving candle:', error.message);
  }
}

// Save position to MongoDB
async function savePositionToMongoDB() {
  if (!position) return;

  try {
    const positionDoc = new Position({
      timestamp: new Date(position.timestamp),
      status: position.status,
      price: parseFloat(position.currentPrice.toFixed(2)),
      upper_range: parseFloat(position.upper_range.toFixed(2)),
      lower_range: parseFloat(position.lower_range.toFixed(2)),
      weth_pct: parseFloat(position.weth_pct.toFixed(2)),
      usdc_pct: parseFloat(position.usdc_pct.toFixed(2)),
      rebalance_type: position.rebalance_type || 'N/A'
    });
    await positionDoc.save();

    positionHistory.push({...position});
  } catch (error) {
    console.error('Error saving position:', error.message);
  }
}

// Main loop
async function mainLoop() {
  console.log('🚀 Fetching pool data...');

  const data = await fetchPoolData();

  if (data) {
    console.log(`\n📊 Price: $${data.price.toFixed(2)} | WETH: ${data.weth_pct.toFixed(2)}% | USDC: ${data.usdc_pct.toFixed(2)}%`);

    // Update candle
    updateCandle(data);

    // Monitor position
    monitorPosition(data);
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
  console.log(`Fetch Interval: ${FETCH_INTERVAL}ms (15 seconds)`);
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
