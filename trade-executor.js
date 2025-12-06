/**
 * SurfLiquid Velocity - Phase 2 Trading Executor
 * 
 * Executes trades based on Open-UP/Open-DOWN signals from the monitoring system.
 * 
 * Usage:
 *   DRY_RUN=true node trade-executor.js   # Test mode (no real trades)
 *   DRY_RUN=false node trade-executor.js  # Live trading
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import Position from './models/Position.js';

dotenv.config();

// ===========================================
// Configuration
// ===========================================

const config = {
  // RPC & Network
  rpcUrl: process.env.SONIC_RPC_URL || 'https://rpc.soniclabs.com',
  chainId: 146, // Sonic mainnet
  
  // Pool & Tokens
  poolAddress: process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40',
  usdcAddress: process.env.USDC_ADDRESS || '0x29219dd400f2bf60e5a23d13be72b486d4038894',
  wethAddress: process.env.WETH_ADDRESS || '0x50c42deacd8fc9773493ed674b675be577f2634b',
  
  // Router (Shadow/Ramses on Sonic - needs to be verified)
  routerAddress: process.env.ROUTER_ADDRESS || '',
  
  // Trading Parameters
  tradeSizeUsd: parseFloat(process.env.TRADE_SIZE_USD) || 15,
  slippageBps: parseInt(process.env.SLIPPAGE_BPS) || 50, // 0.5%
  maxTradesPerHour: parseInt(process.env.MAX_TRADES_PER_HOUR) || 5,
  
  // Safety
  dryRun: process.env.DRY_RUN !== 'false', // Default to true for safety
  minBalanceUsd: parseFloat(process.env.MIN_BALANCE_USD) || 10,
  maxGasGwei: parseFloat(process.env.MAX_GAS_GWEI) || 50,
  
  // Polling
  pollIntervalMs: 10000, // 10 seconds - match signal generation
};

// ===========================================
// ABIs
// ===========================================

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Minimal Ramses V3 Router ABI for swaps
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

// Pool ABI for price
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function fee() external view returns (uint24)',
];

// ===========================================
// State
// ===========================================

let tradingState = {
  position: 'USDC',           // Current position: 'USDC' or 'WETH'
  lastSignalId: null,         // Last processed signal ID (to avoid duplicates)
  lastSignalTime: null,       // Timestamp of last signal
  tradesExecuted: 0,          // Count of trades this session
  sessionStartTime: Date.now(),
  wethBalance: 0,
  usdcBalance: 0,
};

// ===========================================
// Web3 Setup
// ===========================================

let provider, wallet, usdcContract, wethContract, poolContract, routerContract;

async function initializeWeb3() {
  console.log('\n🔗 Initializing Web3...');
  
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  
  // Check if private key is provided
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === 'your_private_key_here') {
    console.log('⚠️  No private key configured - running in READ-ONLY mode');
    console.log('   Set PRIVATE_KEY in .env to enable trading\n');
    return false;
  }
  
  wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log(`📍 Wallet: ${wallet.address}`);
  
  // Initialize contracts
  usdcContract = new ethers.Contract(config.usdcAddress, ERC20_ABI, wallet);
  wethContract = new ethers.Contract(config.wethAddress, ERC20_ABI, wallet);
  poolContract = new ethers.Contract(config.poolAddress, POOL_ABI, provider);
  
  if (config.routerAddress) {
    routerContract = new ethers.Contract(config.routerAddress, ROUTER_ABI, wallet);
  }
  
  return true;
}

// ===========================================
// Balance & Price Functions
// ===========================================

async function getBalances() {
  if (!wallet) return { usdc: 0, weth: 0, sonic: 0 };
  
  try {
    const [usdcBal, wethBal, sonicBal] = await Promise.all([
      usdcContract.balanceOf(wallet.address),
      wethContract.balanceOf(wallet.address),
      provider.getBalance(wallet.address),
    ]);
    
    return {
      usdc: parseFloat(ethers.formatUnits(usdcBal, 6)),
      weth: parseFloat(ethers.formatUnits(wethBal, 18)),
      sonic: parseFloat(ethers.formatEther(sonicBal)),
    };
  } catch (error) {
    console.error('Error getting balances:', error.message);
    return { usdc: 0, weth: 0, sonic: 0 };
  }
}

async function getCurrentPrice() {
  try {
    const slot0 = await poolContract.slot0();
    const sqrtPriceX96 = slot0[0];
    
    // Calculate price from sqrtPriceX96
    const Q96 = 2n ** 96n;
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const priceRaw = sqrtPrice * sqrtPrice;
    const priceAdjusted = priceRaw / (10 ** 12); // Adjust for decimals
    const usdcPerWeth = 1 / priceAdjusted;
    
    return usdcPerWeth;
  } catch (error) {
    console.error('Error getting price:', error.message);
    return null;
  }
}

// ===========================================
// Signal Polling
// ===========================================

async function getLatestSignal() {
  try {
    // Get the most recent position from MongoDB
    const latestPosition = await Position.findOne()
      .sort({ timestamp: -1 })
      .lean();
    
    return latestPosition;
  } catch (error) {
    console.error('Error fetching signal:', error.message);
    return null;
  }
}

// ===========================================
// Trading Functions
// ===========================================

async function executeSwap(tokenIn, tokenOut, amountIn, minAmountOut) {
  if (config.dryRun) {
    console.log('\n📝 [DRY RUN] Would execute swap:');
    console.log(`   TokenIn: ${tokenIn === config.usdcAddress ? 'USDC' : 'WETH'}`);
    console.log(`   AmountIn: ${amountIn}`);
    console.log(`   MinAmountOut: ${minAmountOut}`);
    return { success: true, txHash: 'DRY_RUN_TX_HASH' };
  }
  
  if (!routerContract) {
    console.log('❌ Router not configured - cannot execute swap');
    return { success: false, error: 'Router not configured' };
  }
  
  try {
    // Check and set approval if needed
    const tokenContract = tokenIn === config.usdcAddress ? usdcContract : wethContract;
    const currentAllowance = await tokenContract.allowance(wallet.address, config.routerAddress);
    
    if (currentAllowance < amountIn) {
      console.log('📝 Approving tokens...');
      const approveTx = await tokenContract.approve(config.routerAddress, ethers.MaxUint256);
      await approveTx.wait();
      console.log('✅ Approval confirmed');
    }
    
    // Get pool fee
    const fee = await poolContract.fee();
    
    // Execute swap
    const deadline = Math.floor(Date.now() / 1000) + 60; // 1 minute deadline
    
    const swapParams = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: fee,
      recipient: wallet.address,
      deadline: deadline,
      amountIn: amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0, // No price limit
    };
    
    console.log('📤 Executing swap...');
    const tx = await routerContract.exactInputSingle(swapParams);
    console.log(`📝 Tx submitted: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`✅ Tx confirmed in block ${receipt.blockNumber}`);
    
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error('❌ Swap failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function buyWeth(usdcAmount) {
  console.log(`\n🟢 BUY WETH: Swapping $${usdcAmount.toFixed(2)} USDC → WETH`);
  
  const price = await getCurrentPrice();
  if (!price) return { success: false, error: 'Could not get price' };
  
  const expectedWeth = usdcAmount / price;
  const slippageMultiplier = 1 - (config.slippageBps / 10000);
  const minWeth = expectedWeth * slippageMultiplier;
  
  console.log(`   Expected: ~${expectedWeth.toFixed(6)} WETH`);
  console.log(`   Min (${config.slippageBps/100}% slippage): ${minWeth.toFixed(6)} WETH`);
  
  const amountIn = ethers.parseUnits(usdcAmount.toFixed(6), 6);
  const minAmountOut = ethers.parseUnits(minWeth.toFixed(18), 18);
  
  return executeSwap(config.usdcAddress, config.wethAddress, amountIn, minAmountOut);
}

async function sellWeth(wethAmount) {
  console.log(`\n🔴 SELL WETH: Swapping ${wethAmount.toFixed(6)} WETH → USDC`);
  
  const price = await getCurrentPrice();
  if (!price) return { success: false, error: 'Could not get price' };
  
  const expectedUsdc = wethAmount * price;
  const slippageMultiplier = 1 - (config.slippageBps / 10000);
  const minUsdc = expectedUsdc * slippageMultiplier;
  
  console.log(`   Expected: ~$${expectedUsdc.toFixed(2)} USDC`);
  console.log(`   Min (${config.slippageBps/100}% slippage): $${minUsdc.toFixed(2)} USDC`);
  
  const amountIn = ethers.parseUnits(wethAmount.toFixed(18), 18);
  const minAmountOut = ethers.parseUnits(minUsdc.toFixed(6), 6);
  
  return executeSwap(config.wethAddress, config.usdcAddress, amountIn, minAmountOut);
}

// ===========================================
// Main Trading Logic
// ===========================================

async function processSignal(signal) {
  // Skip if we've already processed this signal
  if (tradingState.lastSignalId === signal._id?.toString()) {
    return;
  }
  
  // Skip if not an actionable signal
  if (signal.status !== 'Open-UP' && signal.status !== 'Open-DOWN') {
    return;
  }
  
  // Check trade limit
  if (tradingState.tradesExecuted >= config.maxTradesPerHour) {
    console.log(`⚠️  Max trades reached (${config.maxTradesPerHour}/hour). Skipping.`);
    return;
  }
  
  // Get current balances
  const balances = await getBalances();
  tradingState.usdcBalance = balances.usdc;
  tradingState.wethBalance = balances.weth;
  
  const price = await getCurrentPrice();
  const totalValueUsd = balances.usdc + (balances.weth * price);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚨 NEW SIGNAL: ${signal.status}`);
  console.log(`   Time: ${new Date(signal.timestamp).toLocaleString()}`);
  console.log(`   Price: $${signal.close?.toFixed(2)}`);
  console.log(`   Balances: $${balances.usdc.toFixed(2)} USDC, ${balances.weth.toFixed(6)} WETH`);
  console.log(`   Total Value: $${totalValueUsd.toFixed(2)}`);
  console.log(`${'='.repeat(60)}`);
  
  // Check minimum balance
  if (totalValueUsd < config.minBalanceUsd) {
    console.log(`❌ Balance too low ($${totalValueUsd.toFixed(2)} < $${config.minBalanceUsd}). Stopping.`);
    return;
  }
  
  let result;
  
  if (signal.status === 'Open-UP') {
    // Bullish signal - buy WETH
    if (tradingState.position === 'WETH') {
      console.log('ℹ️  Already holding WETH. Skipping buy.');
      tradingState.lastSignalId = signal._id?.toString();
      return;
    }
    
    // Calculate trade size (max of configured size or 40% of balance)
    const tradeSize = Math.min(config.tradeSizeUsd, balances.usdc * 0.4);
    
    if (tradeSize < 5) {
      console.log(`❌ Trade size too small ($${tradeSize.toFixed(2)}). Skipping.`);
      return;
    }
    
    result = await buyWeth(tradeSize);
    
    if (result.success) {
      tradingState.position = 'WETH';
      tradingState.tradesExecuted++;
      console.log(`✅ Position changed to WETH (Trade #${tradingState.tradesExecuted})`);
    }
    
  } else if (signal.status === 'Open-DOWN') {
    // Bearish signal - sell WETH
    if (tradingState.position === 'USDC' || balances.weth < 0.0001) {
      console.log('ℹ️  No WETH to sell. Already defensive.');
      tradingState.lastSignalId = signal._id?.toString();
      return;
    }
    
    result = await sellWeth(balances.weth);
    
    if (result.success) {
      tradingState.position = 'USDC';
      tradingState.tradesExecuted++;
      console.log(`✅ Position changed to USDC (Trade #${tradingState.tradesExecuted})`);
    }
  }
  
  // Update state
  tradingState.lastSignalId = signal._id?.toString();
  tradingState.lastSignalTime = signal.timestamp;
  
  // Log updated balances
  const newBalances = await getBalances();
  console.log(`\n📊 Updated Balances:`);
  console.log(`   USDC: $${newBalances.usdc.toFixed(2)}`);
  console.log(`   WETH: ${newBalances.weth.toFixed(6)}`);
  console.log(`   Sonic (gas): ${newBalances.sonic.toFixed(4)}`);
}

// ===========================================
// Main Loop
// ===========================================

async function mainLoop() {
  const signal = await getLatestSignal();
  
  if (signal) {
    await processSignal(signal);
  }
}

async function startTrading() {
  console.log('='.repeat(60));
  console.log('🚀 SurfLiquid Velocity - Phase 2 Trading Executor');
  console.log('='.repeat(60));
  console.log(`\n📋 Configuration:`);
  console.log(`   DRY_RUN: ${config.dryRun ? 'YES (no real trades)' : 'NO (LIVE TRADING!)'}`);
  console.log(`   Trade Size: $${config.tradeSizeUsd}`);
  console.log(`   Slippage: ${config.slippageBps / 100}%`);
  console.log(`   Max Trades/Hour: ${config.maxTradesPerHour}`);
  console.log(`   Min Balance: $${config.minBalanceUsd}`);
  console.log(`   Poll Interval: ${config.pollIntervalMs / 1000}s`);
  
  // Connect to MongoDB
  await connectDB();
  
  // Initialize Web3
  const web3Ready = await initializeWeb3();
  
  if (web3Ready) {
    // Get initial balances
    const balances = await getBalances();
    const price = await getCurrentPrice();
    
    console.log(`\n💰 Initial Balances:`);
    console.log(`   USDC: $${balances.usdc.toFixed(2)}`);
    console.log(`   WETH: ${balances.weth.toFixed(6)} (~$${(balances.weth * price).toFixed(2)})`);
    console.log(`   Sonic (gas): ${balances.sonic.toFixed(4)}`);
    console.log(`   Current WETH Price: $${price?.toFixed(2)}`);
    
    // Determine initial position
    if (balances.weth * price > balances.usdc) {
      tradingState.position = 'WETH';
    } else {
      tradingState.position = 'USDC';
    }
    console.log(`\n📍 Starting Position: ${tradingState.position}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('👀 Monitoring for signals... (Press Ctrl+C to stop)');
  console.log('='.repeat(60) + '\n');
  
  // Initial check
  await mainLoop();
  
  // Start polling
  setInterval(mainLoop, config.pollIntervalMs);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  
  const balances = await getBalances();
  const price = await getCurrentPrice();
  const totalValue = balances.usdc + (balances.weth * price);
  
  console.log(`\n📊 Session Summary:`);
  console.log(`   Duration: ${Math.floor((Date.now() - tradingState.sessionStartTime) / 60000)} minutes`);
  console.log(`   Trades Executed: ${tradingState.tradesExecuted}`);
  console.log(`   Final Position: ${tradingState.position}`);
  console.log(`   Final Balances: $${balances.usdc.toFixed(2)} USDC, ${balances.weth.toFixed(6)} WETH`);
  console.log(`   Final Total Value: $${totalValue.toFixed(2)}`);
  
  process.exit(0);
});

// Start
startTrading().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

