#!/usr/bin/env node
/**
 * Approve Tokens Script
 * 
 * Approves USDC and WETH for the SwapHelper contract
 * Run this after deploying a new SwapHelper
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  rpcUrl: process.env.SONIC_RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  swapHelperAddress: process.env.SWAP_HELPER_ADDRESS,
  usdcAddress: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
  wethAddress: '0x50c42deacd8fc9773493ed674b675be577f2634b',
  nftPositionManagerAddress: '0xAA277CB7914b7e5514946Da92cb9De332Ce610EF',
};

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)'
];

async function main() {
  console.log('='.repeat(70));
  console.log('📝 Token Approval Script');
  console.log('='.repeat(70));
  console.log('');

  if (!config.swapHelperAddress) {
    console.error('❌ SWAP_HELPER_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  console.log(`📍 Wallet: ${wallet.address}`);
  console.log(`🔧 SwapHelper: ${config.swapHelperAddress}`);
  console.log('');

  const usdcContract = new ethers.Contract(config.usdcAddress, ERC20_ABI, wallet);
  const wethContract = new ethers.Contract(config.wethAddress, ERC20_ABI, wallet);

  // Approve USDC for SwapHelper
  console.log('1️⃣ Approving USDC for SwapHelper...');
  try {
    const allowance = await usdcContract.allowance(wallet.address, config.swapHelperAddress);
    if (allowance > 0) {
      console.log(`   ✅ Already approved (allowance: ${ethers.formatUnits(allowance, 6)} USDC)`);
    } else {
      const tx = await usdcContract.approve(config.swapHelperAddress, ethers.MaxUint256);
      console.log(`   ⏳ Transaction: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ USDC approved!`);
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
  }

  console.log('');

  // Approve WETH for SwapHelper
  console.log('2️⃣ Approving WETH for SwapHelper...');
  try {
    const allowance = await wethContract.allowance(wallet.address, config.swapHelperAddress);
    if (allowance > 0) {
      console.log(`   ✅ Already approved (allowance: ${ethers.formatUnits(allowance, 18)} WETH)`);
    } else {
      const tx = await wethContract.approve(config.swapHelperAddress, ethers.MaxUint256);
      console.log(`   ⏳ Transaction: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ WETH approved!`);
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
  }

  console.log('');

  // Approve USDC for NFT Position Manager (for liquidity)
  console.log('3️⃣ Approving USDC for NFT Position Manager...');
  try {
    const allowance = await usdcContract.allowance(wallet.address, config.nftPositionManagerAddress);
    if (allowance > 0) {
      console.log(`   ✅ Already approved (allowance: ${ethers.formatUnits(allowance, 6)} USDC)`);
    } else {
      const tx = await usdcContract.approve(config.nftPositionManagerAddress, ethers.MaxUint256);
      console.log(`   ⏳ Transaction: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ USDC approved!`);
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
  }

  console.log('');

  // Approve WETH for NFT Position Manager (for liquidity)
  console.log('4️⃣ Approving WETH for NFT Position Manager...');
  try {
    const allowance = await wethContract.allowance(wallet.address, config.nftPositionManagerAddress);
    if (allowance > 0) {
      console.log(`   ✅ Already approved (allowance: ${ethers.formatUnits(allowance, 18)} WETH)`);
    } else {
      const tx = await wethContract.approve(config.nftPositionManagerAddress, ethers.MaxUint256);
      console.log(`   ⏳ Transaction: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ WETH approved!`);
    }
  } catch (error) {
    console.error(`   ❌ Failed:`, error.message);
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('✅ All approvals complete!');
  console.log('='.repeat(70));
  console.log('');
  console.log('💡 You can now:');
  console.log('   - Run swaps: npm run test:swap-buy');
  console.log('   - Add liquidity: npm run test:add-liq');
  console.log('');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});





