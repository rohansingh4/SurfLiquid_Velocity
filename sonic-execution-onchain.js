import { ethers } from 'ethers';
import fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration from .env
const RPC_URL = process.env.SONIC_RPC_URL;
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const FETCH_INTERVAL = 15000; // 15 seconds
const RANGE_PERCENTAGE = 0.1; // 0.1% range

// Token addresses (from the pool)
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';
const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';

// Pool ABI (only the functions we need)
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
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
let position = null;
let positionHistory = [];
let tickData = [];

// Web3 setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
const token0Contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
const token1Contract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);

// Initialize CSV writers
const candleWriter = createObjectCsvWriter({
  path: 'candles.csv',
  header: [
    { id: 'timestamp', title: 'Timestamp' },
    { id: 'open', title: 'Open' },
    { id: 'high', title: 'High' },
    { id: 'low', title: 'Low' },
    { id: 'close', title: 'Close' },
    { id: 'liquidity', title: 'Liquidity' },
    { id: 'weth_amount', title: 'WETH Amount' },
    { id: 'usdc_amount', title: 'USDC Amount' }
  ],
  append: true
});

const positionWriter = createObjectCsvWriter({
  path: 'positions.csv',
  header: [
    { id: 'timestamp', title: 'Timestamp' },
    { id: 'status', title: 'Status' },
    { id: 'price', title: 'Price' },
    { id: 'upper_range', title: 'Upper Range' },
    { id: 'lower_range', title: 'Lower Range' },
    { id: 'weth_pct', title: 'WETH %' },
    { id: 'usdc_pct', title: 'USDC %' },
    { id: 'rebalance_type', title: 'Rebalance Type' }
  ],
  append: true
});

// Calculate price from sqrtPriceX96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  // sqrtPriceX96 = sqrt(price) * 2^96
  // price = (sqrtPriceX96 / 2^96)^2
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;

  // Adjust for decimals: token0 (USDC) = 6 decimals, token1 (WETH) = 18 decimals
  // Price represents token1/token0, so we need to adjust
  const priceAdjusted = price * (10 ** 12); // 10^(18-6)

  // This gives us USDC per WETH
  return priceAdjusted;
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

    // Calculate actual price: USDC per WETH (using reserves, more reliable)
    const price = usdc_amount / weth_amount;

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
function updateCandle(data) {
  const now = Date.now();
  const candleStart = Math.floor(now / FETCH_INTERVAL) * FETCH_INTERVAL;

  if (!currentCandle || currentCandle.timestamp !== candleStart) {
    // Close previous candle
    if (currentCandle) {
      candles.push(currentCandle);
      saveCandleToCSV(currentCandle);

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

  savePositionToCSV();
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
    savePositionToCSV();

    // Set to waiting for next candle
    position.status = 'Waiting for Rebalance';
  } else if (data.price < position.lower_range) {
    console.log(`\n⚠️  PRICE OUT OF RANGE - DOWN`);
    console.log(`  Current: $${data.price.toFixed(2)} < Lower: $${position.lower_range.toFixed(2)}`);
    position.status = 'Price Out of Range - DOWN';
    position.rebalance_type = 'RebalanceB';
    savePositionToCSV();

    // Set to waiting for next candle
    position.status = 'Waiting for Rebalance';
  } else {
    if (position.status === 'Position Open') {
      console.log(`✓ Position in range: $${data.price.toFixed(2)} (${position.lower_range.toFixed(2)} - ${position.upper_range.toFixed(2)})`);
    }
  }
}

// Save candle to CSV
async function saveCandleToCSV(candle) {
  try {
    await candleWriter.writeRecords([{
      timestamp: new Date(candle.timestamp).toISOString(),
      open: candle.open.toFixed(2),
      high: candle.high.toFixed(2),
      low: candle.low.toFixed(2),
      close: candle.close.toFixed(2),
      liquidity: candle.liquidity,
      weth_amount: candle.weth_amount.toFixed(6),
      usdc_amount: candle.usdc_amount.toFixed(2)
    }]);
    console.log(`💾 Candle saved: O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)}`);
  } catch (error) {
    console.error('Error saving candle:', error.message);
  }
}

// Save position to CSV
async function savePositionToCSV() {
  if (!position) return;

  try {
    await positionWriter.writeRecords([{
      timestamp: new Date(position.timestamp).toISOString(),
      status: position.status,
      price: position.currentPrice.toFixed(2),
      upper_range: position.upper_range.toFixed(2),
      lower_range: position.lower_range.toFixed(2),
      weth_pct: position.weth_pct.toFixed(2),
      usdc_pct: position.usdc_pct.toFixed(2),
      rebalance_type: position.rebalance_type || 'N/A'
    }]);

    positionHistory.push({...position});
  } catch (error) {
    console.error('Error saving position:', error.message);
  }
}

// Main loop
async function mainLoop() {
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
console.log('='.repeat(60));
console.log('🎯 Sonic Execution Layer - WETH/USDC Pool Monitor (ON-CHAIN)');
console.log('='.repeat(60));
console.log(`Pool: ${POOL_ADDRESS}`);
console.log(`RPC: ${RPC_URL.substring(0, 50)}...`);
console.log(`Fetch Interval: ${FETCH_INTERVAL}ms (15 seconds)`);
console.log(`Range: ±${RANGE_PERCENTAGE}%`);
console.log('='.repeat(60));

// Initial fetch
mainLoop();

// Set interval for subsequent fetches
setInterval(mainLoop, FETCH_INTERVAL);
