#!/usr/bin/env node
/**
 * Test All Transactions Script
 * 
 * Performs all types of transactions with small amounts (~$0.50 max):
 * 1. Swap USDC → WETH
 * 2. Swap WETH → USDC  
 * 3. Add Liquidity (mint position)
 * 4. Remove Liquidity (burn position)
 * 
 * Usage:
 *   node test-all-transactions.js [operation]
 * 
 * Operations:
 *   swap-usdc-to-weth  - Swap $0.50 USDC to WETH
 *   swap-weth-to-usdc  - Swap equivalent WETH to USDC
 *   add-liquidity      - Add ~$0.50 liquidity to pool
 *   remove-liquidity   - Remove liquidity (requires tokenId)
 *   all                - Run all operations in sequence
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const config = {
  rpcUrl: process.env.SONIC_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  poolAddress: process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40',
  swapHelperAddress: process.env.SWAP_HELPER_ADDRESS,
  usdcAddress: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
  wethAddress: '0x50c42deacd8fc9773493ed674b675be577f2634b',
  // NonfungiblePositionManager address for Ramses on Sonic
  nftPositionManagerAddress: '0xAA277CB7914b7e5514946Da92cb9De332Ce610EF',
  
  // Test amounts (~$0.50)
  testAmountUSDC: '0.50', // $0.50 USDC
  testAmountWETH: '0.00016', // ~$0.50 worth at $3100/WETH
};

// ABIs
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)'
];

const SWAP_HELPER_ABI = [
  'function executeSwap(address pool, address tokenIn, address tokenOut, bool zeroForOne, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (int256 amount0, int256 amount1)',
  'function owner() view returns (address)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function tickSpacing() external view returns (int24)'
];

const NFT_POSITION_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
  'function burn(uint256 tokenId) external payable',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'
];

// Global state
let provider, wallet, usdcContract, wethContract, poolContract, swapHelperContract, nftManagerContract;

// Initialize contracts
async function init() {
  console.log('='.repeat(70));
  console.log('🧪 Transaction Test Suite - Ramses/Shadow DEX on Sonic');
  console.log('='.repeat(70));
  console.log('');

  // Validate configuration
  if (!config.rpcUrl) throw new Error('❌ SONIC_RPC_URL not set in .env');
  if (!config.privateKey) throw new Error('❌ PRIVATE_KEY not set in .env');
  if (!config.swapHelperAddress) throw new Error('❌ SWAP_HELPER_ADDRESS not set in .env (deploy first)');

  // Initialize provider and wallet
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  wallet = new ethers.Wallet(config.privateKey, provider);

  console.log(`📍 Wallet: ${wallet.address}`);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 S Balance: ${ethers.formatEther(balance)} S`);
  
  if (balance < ethers.parseEther('0.01')) {
    console.log('⚠️  Low balance - may not have enough gas for transactions');
  }

  // Initialize contracts
  usdcContract = new ethers.Contract(config.usdcAddress, ERC20_ABI, wallet);
  wethContract = new ethers.Contract(config.wethAddress, ERC20_ABI, wallet);
  poolContract = new ethers.Contract(config.poolAddress, POOL_ABI, wallet);
  swapHelperContract = new ethers.Contract(config.swapHelperAddress, SWAP_HELPER_ABI, wallet);
  nftManagerContract = new ethers.Contract(config.nftPositionManagerAddress, NFT_POSITION_MANAGER_ABI, wallet);

  // Display token balances
  await displayBalances();
  
  console.log('');
  console.log('📊 Pool Info:');
  const [token0, token1, fee, tickSpacing, slot0] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
    poolContract.tickSpacing(),
    poolContract.slot0()
  ]);
  
  const price = calculatePriceFromSqrtPriceX96(slot0[0]);
  console.log(`   Token0 (USDC): ${token0}`);
  console.log(`   Token1 (WETH): ${token1}`);
  console.log(`   Fee: ${Number(fee) / 10000}%`);
  console.log(`   Tick Spacing: ${tickSpacing}`);
  console.log(`   Current Price: $${price.toFixed(2)} USDC per WETH`);
  console.log(`   Current Tick: ${slot0[1]}`);
  console.log('');
}

// Display token balances
async function displayBalances() {
  const [usdcBalance, wethBalance] = await Promise.all([
    usdcContract.balanceOf(wallet.address),
    wethContract.balanceOf(wallet.address)
  ]);

  const usdcFormatted = parseFloat(ethers.formatUnits(usdcBalance, 6));
  const wethFormatted = parseFloat(ethers.formatUnits(wethBalance, 18));

  console.log('');
  console.log('💼 Token Balances:');
  console.log(`   USDC: ${usdcFormatted.toFixed(6)} ($${usdcFormatted.toFixed(2)})`);
  console.log(`   WETH: ${wethFormatted.toFixed(6)}`);
}

// Calculate price from sqrtPriceX96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = sqrtPrice * sqrtPrice;
  const priceAdjusted = priceRaw / (10 ** 12); // 10^(18-6)
  return 1 / priceAdjusted; // USDC per WETH
}

// Calculate sqrtPriceX96 from price
function priceToSqrtPriceX96(price) {
  // price is USDC per WETH
  // Convert to token1/token0 in raw units
  const priceToken1PerToken0 = (1 / price) * (10 ** 12); // Adjust for decimals
  const sqrtPrice = Math.sqrt(priceToken1PerToken0);
  const Q96 = 2n ** 96n;
  return BigInt(Math.floor(sqrtPrice * Number(Q96)));
}

// Price to tick conversion
function priceToTick(price) {
  const adjustedPrice = (1 / price) * (10 ** 12); // token1/token0 with decimal adjustment
  return Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
}

// Tick to price conversion
function tickToPrice(tick) {
  const rawPrice = Math.pow(1.0001, tick);
  const usdcPerWeth = 1 / (rawPrice / (10 ** 12));
  return usdcPerWeth;
}

// Check and approve tokens
async function ensureApproval(tokenContract, spenderAddress, amount, tokenName) {
  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
  
  if (allowance < amount) {
    console.log(`   📝 Approving ${tokenName} for ${spenderAddress.substring(0, 10)}...`);
    const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
    console.log(`   ⏳ Waiting for approval... Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ ${tokenName} approved`);
  } else {
    console.log(`   ✅ ${tokenName} already approved`);
  }
}

// ================== SWAP OPERATIONS ==================

async function swapUsdcToWeth() {
  console.log('='.repeat(70));
  console.log('🔄 SWAP: USDC → WETH');
  console.log('='.repeat(70));
  
  const amountIn = ethers.parseUnits(config.testAmountUSDC, 6); // 0.5 USDC
  console.log(`📤 Swapping ${config.testAmountUSDC} USDC for WETH`);
  
  try {
    // Ensure approval for SwapHelper
    await ensureApproval(usdcContract, config.swapHelperAddress, amountIn, 'USDC');
    
    // Get current price for limit
    const slot0 = await poolContract.slot0();
    const currentPrice = calculatePriceFromSqrtPriceX96(slot0[0]);
    const minPrice = currentPrice * 0.95; // 5% slippage tolerance
    const sqrtPriceLimitX96 = priceToSqrtPriceX96(minPrice);
    
    console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
    console.log(`   Min Acceptable: $${minPrice.toFixed(2)} (5% slippage)`);
    console.log('');
    console.log('   🔄 Executing swap...');
    
    // Execute swap: USDC (token0) → WETH (token1), zeroForOne = true
    const tx = await swapHelperContract.executeSwap(
      config.poolAddress,
      config.usdcAddress,  // tokenIn
      config.wethAddress,  // tokenOut
      true,  // zeroForOne (USDC → WETH)
      amountIn,
      sqrtPriceLimitX96
    );
    
    console.log(`   ⏳ Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`   ✅ Swap successful! Gas used: ${receipt.gasUsed.toString()}`);
    
    await displayBalances();
    
  } catch (error) {
    console.error('❌ Swap failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

async function swapWethToUsdc() {
  console.log('='.repeat(70));
  console.log('🔄 SWAP: WETH → USDC');
  console.log('='.repeat(70));
  
  const amountIn = ethers.parseUnits(config.testAmountWETH, 18); // ~0.00016 WETH
  console.log(`📤 Swapping ${config.testAmountWETH} WETH for USDC`);
  
  try {
    // Check balance
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance < amountIn) {
      console.log(`❌ Insufficient WETH. Have: ${ethers.formatUnits(wethBalance, 18)}, Need: ${config.testAmountWETH}`);
      return;
    }
    
    // Ensure approval for SwapHelper
    await ensureApproval(wethContract, config.swapHelperAddress, amountIn, 'WETH');
    
    // Get current price for limit
    const slot0 = await poolContract.slot0();
    const currentPrice = calculatePriceFromSqrtPriceX96(slot0[0]);
    const maxPrice = currentPrice * 1.05; // 5% slippage tolerance
    const sqrtPriceLimitX96 = priceToSqrtPriceX96(maxPrice);
    
    console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
    console.log(`   Max Acceptable: $${maxPrice.toFixed(2)} (5% slippage)`);
    console.log('');
    console.log('   🔄 Executing swap...');
    
    // Execute swap: WETH (token1) → USDC (token0), zeroForOne = false
    const tx = await swapHelperContract.executeSwap(
      config.poolAddress,
      config.wethAddress,  // tokenIn
      config.usdcAddress,  // tokenOut
      false,  // zeroForOne (WETH → USDC)
      amountIn,
      sqrtPriceLimitX96
    );
    
    console.log(`   ⏳ Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`   ✅ Swap successful! Gas used: ${receipt.gasUsed.toString()}`);
    
    await displayBalances();
    
  } catch (error) {
    console.error('❌ Swap failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

// ================== LIQUIDITY OPERATIONS ==================

async function addLiquidity() {
  console.log('='.repeat(70));
  console.log('➕ ADD LIQUIDITY');
  console.log('='.repeat(70));
  
  try {
    // Get current pool state
    const slot0 = await poolContract.slot0();
    const currentTick = Number(slot0[1]);
    const currentPrice = calculatePriceFromSqrtPriceX96(slot0[0]);
    const tickSpacing = Number(await poolContract.tickSpacing());
    const fee = await poolContract.fee();
    
    console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
    console.log(`   Current Tick: ${currentTick}`);
    console.log(`   Tick Spacing: ${tickSpacing}`);
    
    // Calculate tick range: ±0.5% from current price
    const lowerPrice = currentPrice * 0.995;
    const upperPrice = currentPrice * 1.005;
    
    let tickLower = Math.floor(priceToTick(lowerPrice) / tickSpacing) * tickSpacing;
    let tickUpper = Math.ceil(priceToTick(upperPrice) / tickSpacing) * tickSpacing;
    
    console.log(`   Range: $${lowerPrice.toFixed(2)} - $${upperPrice.toFixed(2)}`);
    console.log(`   Ticks: ${tickLower} - ${tickUpper}`);
    
    // Small amounts for testing (~$0.25 worth of each)
    const amount0Desired = ethers.parseUnits('0.25', 6);  // 0.25 USDC
    const amount1Desired = ethers.parseUnits('0.00008', 18); // ~$0.25 WETH
    
    console.log(`   USDC: ${ethers.formatUnits(amount0Desired, 6)}`);
    console.log(`   WETH: ${ethers.formatUnits(amount1Desired, 18)}`);
    console.log('');
    
    // Check balances
    const [usdcBalance, wethBalance] = await Promise.all([
      usdcContract.balanceOf(wallet.address),
      wethContract.balanceOf(wallet.address)
    ]);
    
    if (usdcBalance < amount0Desired || wethBalance < amount1Desired) {
      console.log('❌ Insufficient balance');
      console.log(`   USDC: Have ${ethers.formatUnits(usdcBalance, 6)}, Need ${ethers.formatUnits(amount0Desired, 6)}`);
      console.log(`   WETH: Have ${ethers.formatUnits(wethBalance, 18)}, Need ${ethers.formatUnits(amount1Desired, 18)}`);
      return;
    }
    
    // Approve tokens for NonfungiblePositionManager
    await ensureApproval(usdcContract, config.nftPositionManagerAddress, amount0Desired, 'USDC');
    await ensureApproval(wethContract, config.nftPositionManagerAddress, amount1Desired, 'WETH');
    
    console.log('   ➕ Minting position...');
    
    // Prepare mint parameters
    const mintParams = {
      token0: config.usdcAddress,
      token1: config.wethAddress,
      fee: fee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: 0, // Accept any amount for testing
      amount1Min: 0,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes
    };
    
    const tx = await nftManagerContract.mint(mintParams, { gasLimit: 500000 });
    console.log(`   ⏳ Tx submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    
    // Parse tokenId from logs
    const mintEvent = receipt.logs.find(log => {
      try {
        const parsed = nftManagerContract.interface.parseLog(log);
        return parsed && parsed.name === 'IncreaseLiquidity' || parsed.name === 'Transfer';
      } catch { return false; }
    });
    
    console.log(`   ✅ Position minted! Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`   📝 Transaction: ${tx.hash}`);
    console.log(`   💡 Check your NFT positions for the new tokenId`);
    
    await displayBalances();
    await displayPositions();
    
  } catch (error) {
    console.error('❌ Add liquidity failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

async function removeLiquidity(tokenId) {
  console.log('='.repeat(70));
  console.log('➖ REMOVE LIQUIDITY');
  console.log('='.repeat(70));
  
  if (!tokenId) {
    console.log('❌ No tokenId provided. Usage: node test-all-transactions.js remove-liquidity <tokenId>');
    await displayPositions();
    return;
  }
  
  try {
    // Get position info
    const position = await nftManagerContract.positions(tokenId);
    console.log(`   Position #${tokenId}:`);
    console.log(`   Liquidity: ${position[7].toString()}`);
    console.log(`   Tick Range: ${position[5]} - ${position[6]}`);
    
    if (position[7] === 0n) {
      console.log('❌ Position has no liquidity');
      return;
    }
    
    // Check ownership
    const owner = await nftManagerContract.ownerOf(tokenId);
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log(`❌ Not the owner of position #${tokenId}`);
      return;
    }
    
    console.log('');
    console.log('   ➖ Decreasing liquidity...');
    
    // Decrease liquidity to 0 (remove all)
    const decreaseParams = {
      tokenId: tokenId,
      liquidity: position[7], // Remove all liquidity
      amount0Min: 0,
      amount1Min: 0,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20
    };
    
    const tx1 = await nftManagerContract.decreaseLiquidity(decreaseParams, { gasLimit: 300000 });
    console.log(`   ⏳ Tx submitted: ${tx1.hash}`);
    await tx1.wait();
    console.log(`   ✅ Liquidity decreased`);
    
    // Collect tokens
    console.log('   💰 Collecting tokens...');
    const collectParams = {
      tokenId: tokenId,
      recipient: wallet.address,
      amount0Max: ethers.MaxUint128,
      amount1Max: ethers.MaxUint128
    };
    
    const tx2 = await nftManagerContract.collect(collectParams, { gasLimit: 300000 });
    console.log(`   ⏳ Tx submitted: ${tx2.hash}`);
    await tx2.wait();
    console.log(`   ✅ Tokens collected`);
    
    // Burn NFT
    console.log('   🔥 Burning NFT...');
    const tx3 = await nftManagerContract.burn(tokenId, { gasLimit: 200000 });
    console.log(`   ⏳ Tx submitted: ${tx3.hash}`);
    await tx3.wait();
    console.log(`   ✅ NFT burned`);
    
    console.log('');
    console.log('   ✅ Position fully closed!');
    
    await displayBalances();
    
  } catch (error) {
    console.error('❌ Remove liquidity failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

// Display all positions owned by wallet
async function displayPositions() {
  try {
    const balance = await nftManagerContract.balanceOf(wallet.address);
    console.log('');
    console.log(`📋 Your Liquidity Positions: ${balance.toString()}`);
    
    if (balance > 0) {
      for (let i = 0; i < balance; i++) {
        const tokenId = await nftManagerContract.tokenOfOwnerByIndex(wallet.address, i);
        const position = await nftManagerContract.positions(tokenId);
        
        const priceLower = tickToPrice(Number(position[5]));
        const priceUpper = tickToPrice(Number(position[6]));
        
        console.log(`   #${tokenId}: Liquidity=${position[7].toString()}, Range=$${priceLower.toFixed(2)}-$${priceUpper.toFixed(2)}`);
      }
    }
  } catch (error) {
    console.error('Error fetching positions:', error.message);
  }
}

// ================== MAIN ==================

async function main() {
  await init();
  
  const operation = process.argv[2] || 'help';
  const param = process.argv[3];
  
  console.log('='.repeat(70));
  console.log(`🎯 Operation: ${operation.toUpperCase()}`);
  console.log('='.repeat(70));
  console.log('');
  
  switch(operation) {
    case 'swap-usdc-to-weth':
      await swapUsdcToWeth();
      break;
      
    case 'swap-weth-to-usdc':
      await swapWethToUsdc();
      break;
      
    case 'add-liquidity':
    case 'add':
      await addLiquidity();
      break;
      
    case 'remove-liquidity':
    case 'remove':
      await removeLiquidity(param);
      break;
      
    case 'positions':
      await displayPositions();
      break;
      
    case 'all':
      console.log('🔄 Running all operations in sequence...\n');
      await swapUsdcToWeth();
      console.log('\n⏳ Waiting 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await addLiquidity();
      console.log('\n⏳ Waiting 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Get first position to remove
      const balance = await nftManagerContract.balanceOf(wallet.address);
      if (balance > 0) {
        const tokenId = await nftManagerContract.tokenOfOwnerByIndex(wallet.address, 0);
        await removeLiquidity(tokenId.toString());
      }
      
      console.log('\n⏳ Waiting 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await swapWethToUsdc();
      break;
      
    case 'help':
    default:
      console.log('📖 Available Operations:\n');
      console.log('  swap-usdc-to-weth   - Swap $0.50 USDC to WETH');
      console.log('  swap-weth-to-usdc   - Swap ~$0.50 WETH to USDC');
      console.log('  add-liquidity       - Add ~$0.50 liquidity position');
      console.log('  remove-liquidity    - Remove liquidity (provide tokenId)');
      console.log('  positions           - List all your positions');
      console.log('  all                 - Run all operations in sequence');
      console.log('');
      console.log('📝 Examples:');
      console.log('  node test-all-transactions.js swap-usdc-to-weth');
      console.log('  node test-all-transactions.js add-liquidity');
      console.log('  node test-all-transactions.js remove-liquidity 12345');
      console.log('  node test-all-transactions.js all');
      break;
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ Done!');
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

