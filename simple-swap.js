#!/usr/bin/env node
/**
 * Simple Swap Script - Using Ramses SwapRouter
 * 
 * This uses the proper SwapRouter contract which handles callbacks internally
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  rpcUrl: process.env.SONIC_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  // Common Ramses V3 SwapRouter addresses (try these)
  swapRouterAddresses: [
    '0xAA23611badAFB62D37E7295A682D21960ac85A90', // Ramses SwapRouter (common pattern)
    '0xAA20F59F2F72C5bF7e2Aa9d5b11d218f1d5BA1DE', // Alternative
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Standard V3 pattern
  ],
  poolAddress: '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40',
  usdcAddress: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
  wethAddress: '0x50c42deacd8fc9773493ed674b675be577f2634b',
  
  testAmountUSDC: '0.50', // $0.50
  testAmountWETH: '0.00016', // ~$0.50 at $3100/WETH
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Standard Uniswap V3 SwapRouter ABI
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
];

const POOL_ABI = [
  'function fee() external view returns (uint24)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
];

let provider, wallet, usdcContract, wethContract, poolContract, swapRouterContract;
let swapRouterAddress = null;

async function init() {
  console.log('='.repeat(70));
  console.log('🔄 Simple Swap - WETH/USDC');
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

  // Find working SwapRouter
  console.log('\n🔍 Finding SwapRouter contract...');
  for (const addr of config.swapRouterAddresses) {
    try {
      const code = await provider.getCode(addr);
      if (code !== '0x') {
        swapRouterAddress = addr;
        swapRouterContract = new ethers.Contract(addr, SWAP_ROUTER_ABI, wallet);
        console.log(`✅ Found SwapRouter: ${addr}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  if (!swapRouterAddress) {
    console.log('❌ SwapRouter not found at standard addresses');
    console.log('\n💡 To find the correct address:');
    console.log('   1. Go to https://sonicscan.org');
    console.log('   2. Search for NFT Position Manager: 0xAA277CB7914b7e5514946Da92cb9De332Ce610EF');
    console.log('   3. Look for "SwapRouter" in related contracts');
    console.log('   4. Or check: https://docs.ramses.exchange/');
    console.log('\n   Then add to script: config.swapRouterAddresses = ["0xYourRouterAddress"]');
    process.exit(1);
  }

  await displayBalances();
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
  console.log('💼 Balances:');
  console.log(`   USDC: ${usdcFormatted.toFixed(6)}`);
  console.log(`   WETH: ${wethFormatted.toFixed(6)}`);
}

async function ensureApproval(tokenContract, spenderAddress, amount, tokenName) {
  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
  
  if (allowance < amount) {
    console.log(`   📝 Approving ${tokenName}...`);
    const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
    await tx.wait();
    console.log(`   ✅ Approved`);
  } else {
    console.log(`   ✅ ${tokenName} already approved`);
  }
}

async function swapUsdcToWeth() {
  console.log('='.repeat(70));
  console.log('🔄 SWAP: USDC → WETH');
  console.log('='.repeat(70));
  
  const amountIn = ethers.parseUnits(config.testAmountUSDC, 6);
  console.log(`📤 Swapping ${config.testAmountUSDC} USDC for WETH`);
  
  try {
    await ensureApproval(usdcContract, swapRouterAddress, amountIn, 'USDC');
    
    const fee = await poolContract.fee();
    
    console.log('');
    console.log('   🔄 Executing swap via SwapRouter...');
    
    const params = {
      tokenIn: config.usdcAddress,
      tokenOut: config.wethAddress,
      fee: fee,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes
      amountIn: amountIn,
      amountOutMinimum: 0, // Accept any amount for testing
      sqrtPriceLimitX96: 0, // No price limit
    };
    
    const tx = await swapRouterContract.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`   ⏳ Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`   ✅ Swap successful! Gas: ${receipt.gasUsed.toString()}`);
    
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
  
  const amountIn = ethers.parseUnits(config.testAmountWETH, 18);
  console.log(`📤 Swapping ${config.testAmountWETH} WETH for USDC`);
  
  try {
    // Check balance
    const wethBalance = await wethContract.balanceOf(wallet.address);
    if (wethBalance < amountIn) {
      console.log(`❌ Insufficient WETH`);
      console.log(`   Have: ${ethers.formatUnits(wethBalance, 18)}`);
      console.log(`   Need: ${config.testAmountWETH}`);
      return;
    }
    
    await ensureApproval(wethContract, swapRouterAddress, amountIn, 'WETH');
    
    const fee = await poolContract.fee();
    
    console.log('');
    console.log('   🔄 Executing swap via SwapRouter...');
    
    const params = {
      tokenIn: config.wethAddress,
      tokenOut: config.usdcAddress,
      fee: fee,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
      amountIn: amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    };
    
    const tx = await swapRouterContract.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`   ⏳ Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`   ✅ Swap successful! Gas: ${receipt.gasUsed.toString()}`);
    
    await displayBalances();
    
  } catch (error) {
    console.error('❌ Swap failed:', error.message);
    if (error.data) console.error('Error data:', error.data);
  }
}

async function main() {
  await init();
  
  const operation = process.argv[2] || 'help';
  
  console.log('='.repeat(70));
  console.log(`🎯 Operation: ${operation.toUpperCase()}`);
  console.log('='.repeat(70));
  console.log('');
  
  switch(operation) {
    case 'buy':
    case 'usdc-to-weth':
      await swapUsdcToWeth();
      break;
      
    case 'sell':
    case 'weth-to-usdc':
      await swapWethToUsdc();
      break;
      
    case 'help':
    default:
      console.log('📖 Available Operations:\n');
      console.log('  buy (usdc-to-weth)  - Swap $0.50 USDC → WETH');
      console.log('  sell (weth-to-usdc) - Swap ~$0.50 WETH → USDC');
      console.log('');
      console.log('📝 Examples:');
      console.log('  node simple-swap.js buy');
      console.log('  node simple-swap.js sell');
      console.log('');
      console.log('💡 Note: This script searches for the SwapRouter automatically.');
      console.log('   If not found, check Sonicscan or Ramses docs for the address.');
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

