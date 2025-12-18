import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

// Configuration
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const BASE_HELPER_ADDRESS = process.env.BASE_HELPER_SOL;
const BASE_POOL_ADDRESS = process.env.BASE_POOL_ADDRESS;

// Token addresses
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// ABIs
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() external view returns (int24)',
  'function liquidity() external view returns (uint128)'
];

const BASE_HELPER_ABI = [
  'function addLiquidity(int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint128 liquidityAmount) external returns (uint256 amount0, uint256 amount1)',
  'function removeLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidityAmount) external returns (uint256 amount0, uint256 amount1)',
  'function getUserPositionCount(address user) external view returns (uint256)',
  'function getUserPosition(address user, uint256 index) external view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)',
  'event LiquidityAdded(address indexed user, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'event LiquidityRemoved(address indexed user, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1)'
];

// Setup
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function getPoolState() {
  console.log('\n========== POOL STATE ==========');

  const pool = new ethers.Contract(BASE_POOL_ADDRESS, POOL_ABI, provider);
  const [sqrtPriceX96, tick, , , , , ] = await pool.slot0();
  const tickSpacing = await pool.tickSpacing();
  const liquidity = await pool.liquidity();

  console.log(`Current Tick: ${tick}`);
  console.log(`Tick Spacing: ${tickSpacing}`);
  console.log(`Current Liquidity: ${liquidity}`);
  console.log(`SqrtPrice: ${sqrtPriceX96}`);

  // Calculate price
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const price = sqrtPrice * sqrtPrice;
  const priceAdjusted = price * (10 ** 12); // Adjust for decimals
  const ethPriceInUSDC = 1 / priceAdjusted;

  console.log(`ETH Price: $${ethPriceInUSDC.toFixed(2)} USDC/WETH`);

  return { tick: Number(tick), tickSpacing: Number(tickSpacing), ethPriceInUSDC };
}

function calculateTickRange(currentTick, tickSpacing) {
  console.log('\n========== CALCULATING TICK RANGE ==========');

  // Create a narrow range around current tick (± 2 tick spacings)
  // This is approximately 0.2% range
  const tickLower = Math.floor((currentTick - 2 * tickSpacing) / tickSpacing) * tickSpacing;
  const tickUpper = Math.floor((currentTick + 2 * tickSpacing) / tickSpacing) * tickSpacing;

  console.log(`Current Tick: ${currentTick}`);
  console.log(`Tick Lower: ${tickLower}`);
  console.log(`Tick Upper: ${tickUpper}`);
  console.log(`Range: ${tickUpper - tickLower} ticks`);

  return { tickLower, tickUpper };
}

async function checkAndApprove(tokenAddress, tokenName, amount) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const allowance = await token.allowance(PUBLIC_KEY, BASE_HELPER_ADDRESS);

  if (allowance < amount) {
    console.log(`Approving ${tokenName}...`);
    const tx = await token.approve(BASE_HELPER_ADDRESS, amount);
    await tx.wait();
    console.log(`✓ ${tokenName} approved`);
  } else {
    console.log(`✓ ${tokenName} already approved`);
  }
}

async function testAddLiquidity(tickLower, tickUpper, ethPrice) {
  console.log('\n========== TEST: ADD LIQUIDITY ==========');

  const helper = new ethers.Contract(BASE_HELPER_ADDRESS, BASE_HELPER_ABI, wallet);
  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

  // Use small fixed amounts (~$3 total)
  const wethAmount = ethers.parseEther('0.001'); // 0.001 WETH (~$2.65 at current price)
  const usdcAmount = ethers.parseUnits('1.5', 6); // 1.5 USDC

  // Use a larger liquidity amount to actually deposit meaningful amounts
  const liquidityAmount = 1000000000000n; // Larger liquidity value

  console.log(`WETH Amount: ${ethers.formatEther(wethAmount)} WETH`);
  console.log(`USDC Amount: ${ethers.formatUnits(usdcAmount, 6)} USDC`);
  console.log(`Liquidity: ${liquidityAmount}`);

  // Check balances
  const wethBalance = await weth.balanceOf(PUBLIC_KEY);
  const usdcBalance = await usdc.balanceOf(PUBLIC_KEY);

  console.log(`\nCurrent Balances:`);
  console.log(`WETH: ${ethers.formatEther(wethBalance)} WETH`);
  console.log(`USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

  if (wethBalance < wethAmount) {
    throw new Error(`Insufficient WETH. Need: ${ethers.formatEther(wethAmount)}, Have: ${ethers.formatEther(wethBalance)}`);
  }
  if (usdcBalance < usdcAmount) {
    throw new Error(`Insufficient USDC. Need: ${ethers.formatUnits(usdcAmount, 6)}, Have: ${ethers.formatUnits(usdcBalance, 6)}`);
  }

  // Approve tokens
  await checkAndApprove(WETH_ADDRESS, 'WETH', wethAmount);
  await checkAndApprove(USDC_ADDRESS, 'USDC', usdcAmount);

  // Add liquidity
  console.log('\nAdding liquidity...');
  try {
    const tx = await helper.addLiquidity(
      tickLower,
      tickUpper,
      wethAmount,
      usdcAmount,
      liquidityAmount,
      { gasLimit: 500000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✓ Liquidity added! Block: ${receipt.blockNumber}`);

    // Parse event
    for (const log of receipt.logs) {
      try {
        const parsed = helper.interface.parseLog(log);
        if (parsed && parsed.name === 'LiquidityAdded') {
          console.log(`\nLiquidity Details:`);
          console.log(`Tick Range: [${parsed.args.tickLower}, ${parsed.args.tickUpper}]`);
          console.log(`Liquidity: ${parsed.args.liquidity}`);
          console.log(`WETH Used: ${ethers.formatEther(parsed.args.amount0)} WETH`);
          console.log(`USDC Used: ${ethers.formatUnits(parsed.args.amount1, 6)} USDC`);
          console.log(`Total Value: ~$${(Number(ethers.formatEther(parsed.args.amount0)) * ethPrice + Number(ethers.formatUnits(parsed.args.amount1, 6))).toFixed(2)}`);
        }
      } catch (e) {
        // Skip
      }
    }

    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

    // Check position
    const posCount = await helper.getUserPositionCount(PUBLIC_KEY);
    console.log(`\nTotal Positions: ${posCount}`);

    return { tickLower, tickUpper, liquidityAmount };

  } catch (error) {
    console.error('✗ Add liquidity failed:', error.message);
    throw error;
  }
}

async function testRemoveLiquidity(tickLower, tickUpper, liquidityAmount, initialWethUsed, initialUsdcUsed, ethPrice) {
  console.log('\n========== TEST: REMOVE LIQUIDITY ==========');

  const helper = new ethers.Contract(BASE_HELPER_ADDRESS, BASE_HELPER_ABI, wallet);
  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

  // Get balances before
  const wethBefore = await weth.balanceOf(PUBLIC_KEY);
  const usdcBefore = await usdc.balanceOf(PUBLIC_KEY);

  console.log(`Removing liquidity...`);
  console.log(`Tick Range: [${tickLower}, ${tickUpper}]`);
  console.log(`Liquidity: ${liquidityAmount}`);

  try {
    const tx = await helper.removeLiquidity(
      tickLower,
      tickUpper,
      liquidityAmount,
      { gasLimit: 500000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✓ Liquidity removed! Block: ${receipt.blockNumber}`);

    // Get balances after
    const wethAfter = await weth.balanceOf(PUBLIC_KEY);
    const usdcAfter = await usdc.balanceOf(PUBLIC_KEY);

    const wethReceived = wethAfter - wethBefore;
    const usdcReceived = usdcAfter - usdcBefore;

    console.log(`\nTokens Received:`);
    console.log(`WETH: ${ethers.formatEther(wethReceived)} WETH`);
    console.log(`USDC: ${ethers.formatUnits(usdcReceived, 6)} USDC`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);

    // Calculate fees earned
    console.log(`\n========== REWARDS ANALYSIS ==========`);
    console.log(`Initial WETH Deposited: ${ethers.formatEther(initialWethUsed)} WETH`);
    console.log(`Initial USDC Deposited: ${ethers.formatUnits(initialUsdcUsed, 6)} USDC`);
    console.log(`WETH Received Back: ${ethers.formatEther(wethReceived)} WETH`);
    console.log(`USDC Received Back: ${ethers.formatUnits(usdcReceived, 6)} USDC`);

    const wethFees = wethReceived - initialWethUsed;
    const usdcFees = usdcReceived - initialUsdcUsed;

    console.log(`\nFees Earned:`);
    console.log(`WETH Fees: ${ethers.formatEther(wethFees)} WETH ($${(Number(ethers.formatEther(wethFees)) * ethPrice).toFixed(4)})`);
    console.log(`USDC Fees: ${ethers.formatUnits(usdcFees, 6)} USDC`);

    const totalFeesUSD = Number(ethers.formatEther(wethFees)) * ethPrice + Number(ethers.formatUnits(usdcFees, 6));
    console.log(`Total Fees: $${totalFeesUSD.toFixed(4)} USD`);

    if (totalFeesUSD > 0.0001) {
      console.log(`\n✓ SUCCESS: Earned fees of $${totalFeesUSD.toFixed(4)}!`);
    } else {
      console.log(`\n⚠ No significant fees earned (position held for very short time)`);
    }

  } catch (error) {
    console.error('✗ Remove liquidity failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('========================================');
  console.log('BASE POOL - LIQUIDITY TEST');
  console.log('========================================');
  console.log(`Your Address: ${PUBLIC_KEY}`);
  console.log(`Helper Contract: ${BASE_HELPER_ADDRESS}`);
  console.log(`Pool: ${BASE_POOL_ADDRESS}`);

  try {
    // Get pool state
    const { tick, tickSpacing, ethPriceInUSDC } = await getPoolState();

    // Calculate tick range
    const { tickLower, tickUpper } = calculateTickRange(tick, tickSpacing);

    // Add liquidity
    const { liquidityAmount } = await testAddLiquidity(tickLower, tickUpper, ethPriceInUSDC);

    console.log('\n⏸️  Waiting 5 seconds before removing liquidity...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the actual amounts used from the position
    const helper = new ethers.Contract(BASE_HELPER_ADDRESS, BASE_HELPER_ABI, provider);
    const [posTickLower, posTickUpper, posLiquidity] = await helper.getUserPosition(PUBLIC_KEY, 0);

    console.log(`\nPosition Info:`);
    console.log(`Tick Lower: ${posTickLower}`);
    console.log(`Tick Upper: ${posTickUpper}`);
    console.log(`Liquidity: ${posLiquidity}`);

    // For this test, we'll use the amounts from the event (stored in memory)
    // In real usage, you'd query the position to get exact amounts

    // Remove liquidity (use amounts from add liquidity)
    await testRemoveLiquidity(
      tickLower,
      tickUpper,
      liquidityAmount,
      ethers.parseEther('0.001'), // WETH amount used
      ethers.parseUnits('1.5', 6), // USDC amount used
      ethPriceInUSDC
    );

    console.log('\n========================================');
    console.log('✓ ALL TESTS COMPLETED');
    console.log('========================================');

  } catch (error) {
    console.error('\n========================================');
    console.error('✗ TEST FAILED');
    console.error('========================================');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

main();
