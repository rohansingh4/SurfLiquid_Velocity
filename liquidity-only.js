#!/usr/bin/env node
/**
 * Liquidity Operations Only
 * 
 * Add and remove liquidity without needing SwapHelper
 * This bypasses the swap callback issue entirely
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  rpcUrl: process.env.SONIC_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  poolAddress: '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40',
  usdcAddress: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
  wethAddress: '0x50c42deacd8fc9773493ed674b675be577f2634b',
  nftPositionManagerAddress: '0xAA277CB7914b7e5514946Da92cb9De332Ce610EF',
  
  // Test amounts for liquidity
  testAmountUSDC: '0.25', // $0.25
  testAmountWETH: '0.00008', // ~$0.25 at $3100/WETH
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function fee() external view returns (uint24)',
  'function tickSpacing() external view returns (int24)'
];

const NFT_POSITION_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
  'function burn(uint256 tokenId) external payable',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)'
];

let provider, wallet, usdcContract, wethContract, poolContract, nftManagerContract;

async function init() {
  console.log('='.repeat(70));
  console.log('💧 Liquidity Manager - WETH/USDC Pool');
  console.log('='.repeat(70));
  console.log('');

  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  wallet = new ethers.Wallet(config.privateKey, provider);

  console.log(`📍 Wallet: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 S Balance: ${ethers.formatEther(balance)} S`);
  
  usdcContract = new ethers.Contract(config.usdcAddress, ERC20_ABI, wallet);
  wethContract = new ethers.Contract(config.wethAddress, ERC20_ABI, wallet);
  poolContract = new ethers.Contract(config.poolAddress, POOL_ABI, wallet);
  nftManagerContract = new ethers.Contract(config.nftPositionManagerAddress, NFT_POSITION_MANAGER_ABI, wallet);

  await displayBalances();
  
  console.log('');
  console.log('📊 Pool Info:');
  const [fee, tickSpacing, slot0] = await Promise.all([
    poolContract.fee(),
    poolContract.tickSpacing(),
    poolContract.slot0()
  ]);
  
  const price = calculatePriceFromSqrtPriceX96(slot0[0]);
  console.log(`   Fee: ${Number(fee) / 10000}%`);
  console.log(`   Tick Spacing: ${tickSpacing}`);
  console.log(`   Current Price: $${price.toFixed(2)} USDC per WETH`);
  console.log(`   Current Tick: ${slot0[1]}`);
  console.log('');
}

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

function calculatePriceFromSqrtPriceX96(sqrtPriceX96) {
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = sqrtPrice * sqrtPrice;
  const priceAdjusted = priceRaw / (10 ** 12);
  return 1 / priceAdjusted;
}

function priceToTick(price) {
  const adjustedPrice = (1 / price) * (10 ** 12);
  return Math.floor(Math.log(adjustedPrice) / Math.log(1.0001));
}

function tickToPrice(tick) {
  const rawPrice = Math.pow(1.0001, tick);
  const usdcPerWeth = 1 / (rawPrice / (10 ** 12));
  return usdcPerWeth;
}

async function ensureApproval(tokenContract, spenderAddress, amount, tokenName) {
  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
  
  if (allowance < amount) {
    console.log(`   📝 Approving ${tokenName}...`);
    const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
    await tx.wait();
    console.log(`   ✅ ${tokenName} approved`);
  } else {
    console.log(`   ✅ ${tokenName} already approved`);
  }
}

async function addLiquidity() {
  console.log('='.repeat(70));
  console.log('➕ ADD LIQUIDITY');
  console.log('='.repeat(70));
  
  try {
    const slot0 = await poolContract.slot0();
    const currentTick = Number(slot0[1]);
    const currentPrice = calculatePriceFromSqrtPriceX96(slot0[0]);
    const tickSpacing = Number(await poolContract.tickSpacing());
    const fee = await poolContract.fee();
    
    console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
    console.log(`   Current Tick: ${currentTick}`);
    
    const lowerPrice = currentPrice * 0.995;
    const upperPrice = currentPrice * 1.005;
    
    let tickLower = Math.floor(priceToTick(lowerPrice) / tickSpacing) * tickSpacing;
    let tickUpper = Math.ceil(priceToTick(upperPrice) / tickSpacing) * tickSpacing;
    
    console.log(`   Range: $${lowerPrice.toFixed(2)} - $${upperPrice.toFixed(2)}`);
    console.log(`   Ticks: ${tickLower} - ${tickUpper}`);
    
    const amount0Desired = ethers.parseUnits(config.testAmountUSDC, 6);
    const amount1Desired = ethers.parseUnits(config.testAmountWETH, 18);
    
    console.log(`   USDC: ${config.testAmountUSDC}`);
    console.log(`   WETH: ${config.testAmountWETH}`);
    console.log('');
    
    await ensureApproval(usdcContract, config.nftPositionManagerAddress, amount0Desired, 'USDC');
    await ensureApproval(wethContract, config.nftPositionManagerAddress, amount1Desired, 'WETH');
    
    console.log('   ➕ Minting position...');
    
    const mintParams = {
      token0: config.usdcAddress,
      token1: config.wethAddress,
      fee: fee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Desired,
      amount1Desired: amount1Desired,
      amount0Min: 0,
      amount1Min: 0,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20
    };
    
    const tx = await nftManagerContract.mint(mintParams, { gasLimit: 500000 });
    console.log(`   ⏳ Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`   ✅ Position minted! Gas: ${receipt.gasUsed.toString()}`);
    
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
    console.log('❌ No tokenId provided');
    console.log('Usage: node liquidity-only.js remove <tokenId>');
    await displayPositions();
    return;
  }
  
  try {
    const position = await nftManagerContract.positions(tokenId);
    console.log(`   Position #${tokenId}:`);
    console.log(`   Liquidity: ${position[7].toString()}`);
    
    if (position[7] === 0n) {
      console.log('❌ Position has no liquidity');
      return;
    }
    
    console.log('   ➖ Decreasing liquidity...');
    
    const decreaseParams = {
      tokenId: tokenId,
      liquidity: position[7],
      amount0Min: 0,
      amount1Min: 0,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20
    };
    
    const tx1 = await nftManagerContract.decreaseLiquidity(decreaseParams, { gasLimit: 300000 });
    await tx1.wait();
    console.log(`   ✅ Liquidity decreased`);
    
    console.log('   💰 Collecting tokens...');
    const collectParams = {
      tokenId: tokenId,
      recipient: wallet.address,
      amount0Max: ethers.MaxUint128,
      amount1Max: ethers.MaxUint128
    };
    
    const tx2 = await nftManagerContract.collect(collectParams, { gasLimit: 300000 });
    await tx2.wait();
    console.log(`   ✅ Tokens collected`);
    
    console.log('   🔥 Burning NFT...');
    const tx3 = await nftManagerContract.burn(tokenId, { gasLimit: 200000 });
    await tx3.wait();
    console.log(`   ✅ NFT burned`);
    
    console.log('');
    console.log('   ✅ Position fully closed!');
    
    await displayBalances();
    
  } catch (error) {
    console.error('❌ Remove liquidity failed:', error.message);
  }
}

async function displayPositions() {
  try {
    const balance = await nftManagerContract.balanceOf(wallet.address);
    console.log('');
    console.log(`📋 Your Positions: ${balance.toString()}`);
    
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

async function main() {
  await init();
  
  const operation = process.argv[2] || 'help';
  const param = process.argv[3];
  
  console.log('='.repeat(70));
  console.log(`🎯 Operation: ${operation.toUpperCase()}`);
  console.log('='.repeat(70));
  console.log('');
  
  switch(operation) {
    case 'add':
    case 'add-liquidity':
      await addLiquidity();
      break;
      
    case 'remove':
    case 'remove-liquidity':
      await removeLiquidity(param);
      break;
      
    case 'positions':
    case 'list':
      await displayPositions();
      break;
      
    case 'help':
    default:
      console.log('📖 Available Operations:\n');
      console.log('  add                 - Add ~$0.50 liquidity');
      console.log('  remove <tokenId>    - Remove liquidity');
      console.log('  positions           - List all positions');
      console.log('');
      console.log('📝 Examples:');
      console.log('  node liquidity-only.js add');
      console.log('  node liquidity-only.js positions');
      console.log('  node liquidity-only.js remove 12345');
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




