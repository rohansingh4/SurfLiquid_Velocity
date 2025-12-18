import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

// Configuration from .env
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const BASE_HELPER_ADDRESS = process.env.BASE_HELPER_SOL;
const BASE_POOL_ADDRESS = process.env.BASE_POOL_ADDRESS;

// Token addresses (Base network)
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Token0
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Token1

// ABIs
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

const BASE_HELPER_ABI = [
  'function executeSwap(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (int256 amount0, int256 amount1)',
  'function getPoolInfo() external view returns (address, address, uint24, int24, uint160, int24)',
  'event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, int256 amount0, int256 amount1)'
];

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function checkAndApproveToken(tokenAddress, tokenSymbol, amount) {
  console.log(`\n--- Checking ${tokenSymbol} ---`);

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const balance = await token.balanceOf(PUBLIC_KEY);
  const decimals = await token.decimals();

  console.log(`Balance: ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`);

  // Check if we have enough balance
  if (balance < amount) {
    throw new Error(`Insufficient ${tokenSymbol} balance. Need: ${ethers.formatUnits(amount, decimals)}, Have: ${ethers.formatUnits(balance, decimals)}`);
  }

  // Check allowance
  const allowance = await token.allowance(PUBLIC_KEY, BASE_HELPER_ADDRESS);
  console.log(`Current allowance: ${ethers.formatUnits(allowance, decimals)} ${tokenSymbol}`);

  if (allowance < amount) {
    console.log(`Approving ${tokenSymbol}...`);
    const approveTx = await token.approve(BASE_HELPER_ADDRESS, amount);
    console.log(`Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log(`✓ ${tokenSymbol} approved`);
  } else {
    console.log(`✓ ${tokenSymbol} already approved`);
  }
}

async function getPoolInfo() {
  console.log('\n========== POOL INFO ==========');

  const helper = new ethers.Contract(BASE_HELPER_ADDRESS, BASE_HELPER_ABI, provider);
  const [token0, token1, fee, tickSpacing, sqrtPriceX96, tick] = await helper.getPoolInfo();

  console.log(`Pool: ${BASE_POOL_ADDRESS}`);
  console.log(`Token0 (WETH): ${token0}`);
  console.log(`Token1 (USDC): ${token1}`);
  console.log(`Fee: ${fee} (${Number(fee)/10000}%)`);
  console.log(`Tick Spacing: ${tickSpacing}`);
  console.log(`Current Tick: ${tick}`);
  console.log(`Current Price (sqrtPriceX96): ${sqrtPriceX96}`);

  // Calculate approximate price
  // Price = (sqrtPriceX96 / 2^96)^2
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;

  // Adjust for decimals (WETH has 18, USDC has 6)
  const priceAdjusted = price * (10 ** 12); // 18 - 6 = 12
  const ethPriceInUSDC = 1 / priceAdjusted;

  console.log(`Approximate ETH Price: $${ethPriceInUSDC.toFixed(2)} USDC/WETH`);

  return { tick, sqrtPriceX96 };
}

async function swapUSDCtoWETH(amountUSDC) {
  console.log('\n========== SWAP: USDC → WETH ==========');

  const helper = new ethers.Contract(BASE_HELPER_ADDRESS, BASE_HELPER_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);

  // Get balances before
  const usdcBalanceBefore = await usdc.balanceOf(PUBLIC_KEY);
  const wethBalanceBefore = await weth.balanceOf(PUBLIC_KEY);

  console.log(`\nBalances BEFORE:`);
  console.log(`USDC: ${ethers.formatUnits(usdcBalanceBefore, 6)} USDC`);
  console.log(`WETH: ${ethers.formatEther(wethBalanceBefore)} WETH`);

  // Check and approve USDC
  await checkAndApproveToken(USDC_ADDRESS, 'USDC', amountUSDC);

  // Execute swap
  // For USDC → WETH (token1 → token0), we need to set a high price limit
  // Must be less than MAX_SQRT_RATIO (1461446703485210103287273052203988822378723970342)
  const sqrtPriceLimitX96 = '1461446703485210103287273052203988822378723970341'; // MAX - 1

  console.log(`\nSwapping ${ethers.formatUnits(amountUSDC, 6)} USDC for WETH...`);

  try {
    const tx = await helper.executeSwap(
      USDC_ADDRESS, // tokenIn
      WETH_ADDRESS, // tokenOut
      amountUSDC,   // amountIn
      sqrtPriceLimitX96,
      { gasLimit: 300000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    console.log(`Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✓ Swap completed! Block: ${receipt.blockNumber}`);

    // Parse events
    for (const log of receipt.logs) {
      try {
        const parsed = helper.interface.parseLog(log);
        if (parsed && parsed.name === 'SwapExecuted') {
          console.log(`\nSwap Details:`);
          console.log(`Token In: ${parsed.args.tokenIn}`);
          console.log(`Amount In: ${ethers.formatUnits(parsed.args.amountIn, 6)} USDC`);
          console.log(`Amount0 Delta: ${parsed.args.amount0}`);
          console.log(`Amount1 Delta: ${parsed.args.amount1}`);
        }
      } catch (e) {
        // Skip logs we can't parse
      }
    }

    // Get balances after
    const usdcBalanceAfter = await usdc.balanceOf(PUBLIC_KEY);
    const wethBalanceAfter = await weth.balanceOf(PUBLIC_KEY);

    console.log(`\nBalances AFTER:`);
    console.log(`USDC: ${ethers.formatUnits(usdcBalanceAfter, 6)} USDC`);
    console.log(`WETH: ${ethers.formatEther(wethBalanceAfter)} WETH`);

    // Calculate changes
    const usdcSpent = usdcBalanceBefore - usdcBalanceAfter;
    const wethReceived = wethBalanceAfter - wethBalanceBefore;

    console.log(`\n========== SUMMARY ==========`);
    console.log(`USDC Spent: ${ethers.formatUnits(usdcSpent, 6)} USDC`);
    console.log(`WETH Received: ${ethers.formatEther(wethReceived)} WETH`);

    if (wethReceived > 0n) {
      const effectivePrice = Number(ethers.formatUnits(usdcSpent, 6)) / Number(ethers.formatEther(wethReceived));
      console.log(`Effective Price: $${effectivePrice.toFixed(2)} USDC/WETH`);
    }

    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`✓ Swap successful!`);

  } catch (error) {
    console.error('\n✗ Swap failed:', error.message);

    if (error.message.includes('insufficient funds')) {
      console.error('You do not have enough ETH for gas fees');
    } else if (error.message.includes('STF')) {
      console.error('Token transfer failed - check approvals');
    } else if (error.message.includes('LOK')) {
      console.error('Pool is locked - try again in a moment');
    }

    throw error;
  }
}

async function main() {
  console.log('========================================');
  console.log('BASE POOL - SWAP USDC TO WETH');
  console.log('========================================');
  console.log(`Your Address: ${PUBLIC_KEY}`);
  console.log(`Helper Contract: ${BASE_HELPER_ADDRESS}`);
  console.log(`Pool: ${BASE_POOL_ADDRESS}`);

  try {
    // Check ETH balance for gas
    const ethBalance = await provider.getBalance(PUBLIC_KEY);
    console.log(`ETH Balance (for gas): ${ethers.formatEther(ethBalance)} ETH`);

    if (ethBalance < ethers.parseEther('0.001')) {
      console.warn('⚠ Warning: Low ETH balance for gas. You may want to add more.');
    }

    // Get pool info
    await getPoolInfo();

    // Swap 1 USDC to WETH
    const amountToSwap = ethers.parseUnits('1', 6); // 1 USDC
    await swapUSDCtoWETH(amountToSwap);

    console.log('\n========================================');
    console.log('✓ ALL OPERATIONS COMPLETED SUCCESSFULLY');
    console.log('========================================');

  } catch (error) {
    console.error('\n========================================');
    console.error('✗ OPERATION FAILED');
    console.error('========================================');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the script
main();

export { swapUSDCtoWETH, getPoolInfo };
