import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const SWAP_HELPER_ADDRESS = process.env.SWAP_HELPER_ADDRESS;

const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';

// ABIs
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)'
];

const SWAP_HELPER_ABI = [
  'function executeSwap(address pool, address tokenIn, address tokenOut, bool zeroForOne, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (int256 amount0, int256 amount1)',
  'function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)',
  'function removeLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount) returns (uint256 amount0, uint256 amount1)',
  'function withdrawToken(address token, uint256 amount)',
  'function getTokenBalance(address token) view returns (uint256)',
  'function owner() view returns (address)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function mint(address recipient, uint256 index, int24 tickLower, int24 tickUpper, uint128 amount, bytes data) returns (uint256 amount0, uint256 amount1)',
  'function burn(uint256 index, int24 tickLower, int24 tickUpper, uint128 amount) returns (uint256 amount0, uint256 amount1)',
  'function collect(address recipient, uint256 index, int24 tickLower, int24 tickUpper, uint128 amount0Requested, uint128 amount1Requested) returns (uint128 amount0, uint128 amount1)',
  'function positions(bytes32 key) external view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing ALL Trading Operations');
  console.log('='.repeat(70));

  if (!PRIVATE_KEY) {
    console.error('\n❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  if (!SWAP_HELPER_ADDRESS) {
    console.error('\n❌ SWAP_HELPER_ADDRESS not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n📍 Wallet: ${wallet.address}`);
  console.log(`💰 SwapHelper: ${SWAP_HELPER_ADDRESS}`);
  console.log(`🏊 Pool: ${POOL_ADDRESS}`);

  // Initialize contracts
  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const swapHelperContract = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);
  const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);

  // Check balances
  console.log('\n📊 Current Balances:');
  const wethBalance = await wethContract.balanceOf(wallet.address);
  const usdcBalance = await usdcContract.balanceOf(wallet.address);
  const sonicBalance = await provider.getBalance(wallet.address);

  console.log(`   WETH: ${ethers.formatUnits(wethBalance, 18)}`);
  console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
  console.log(`   Sonic: ${ethers.formatEther(sonicBalance)}`);

  if (sonicBalance < ethers.parseEther('0.01')) {
    console.error('\n❌ Insufficient Sonic for gas (need at least 0.01 S)');
    process.exit(1);
  }

  // TEST 1: SWAP
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: Swap (USDC → WETH via SwapHelper)');
  console.log('='.repeat(70));

  try {
    // Approve USDC to SwapHelper if needed
    const usdcAllowance = await usdcContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
    if (usdcAllowance < ethers.parseUnits('1', 6)) {
      console.log('   Approving USDC to SwapHelper...');
      const approveTx = await usdcContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`   ✅ USDC approved`);
    }

    const swapAmount = ethers.parseUnits('0.2', 6); // 0.2 USDC
    console.log(`   Swapping ${ethers.formatUnits(swapAmount, 6)} USDC for WETH...`);

    // Get current price
    const slot0 = await poolContract.slot0();
    const sqrtPriceX96 = slot0[0];
    const Q96 = 2n ** 96n;
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const priceRaw = sqrtPrice * sqrtPrice;
    const priceAdjusted = priceRaw / (10 ** 12);
    const currentPrice = 1 / priceAdjusted;

    // 5% slippage
    const targetPrice = currentPrice * 1.05;
    const priceAdj = 1 / targetPrice;
    const priceR = priceAdj * (10 ** 12);
    const sqrtP = Math.sqrt(priceR);
    const sqrtPriceLimit = BigInt(Math.floor(sqrtP * (2 ** 96)));

    // Estimate gas with 150% buffer
    const estimatedGas = await swapHelperContract.executeSwap.estimateGas(
      POOL_ADDRESS,
      USDC_ADDRESS,
      WETH_ADDRESS,
      true, // USDC → WETH
      swapAmount,
      sqrtPriceLimit
    );
    const gasLimit = (estimatedGas * 150n) / 100n;
    console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

    const swapTx = await swapHelperContract.executeSwap(
      POOL_ADDRESS,
      USDC_ADDRESS,
      WETH_ADDRESS,
      true, // USDC → WETH
      swapAmount,
      sqrtPriceLimit,
      { gasLimit }
    );

    console.log(`   ⏳ TX: ${swapTx.hash}`);
    await swapTx.wait();
    console.log(`   ✅ Swap successful!`);

  } catch (error) {
    console.error(`   ❌ Swap failed:`, error.message);
  }

  // TEST 2: ADD LIQUIDITY (via SwapHelper)
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Add Liquidity (via SwapHelper)');
  console.log('='.repeat(70));

  let tickLower, tickUpper, liquidityAmount;

  try {
    // Approve tokens to SwapHelper if needed
    const wethAllowance = await wethContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
    if (wethAllowance < ethers.parseUnits('0.001', 18)) {
      console.log('   Approving WETH to SwapHelper...');
      const tx = await wethContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      console.log(`   ✅ WETH approved`);
    }

    const usdcAllowanceSwapHelper = await usdcContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
    if (usdcAllowanceSwapHelper < ethers.parseUnits('1', 6)) {
      console.log('   Approving USDC to SwapHelper...');
      const tx = await usdcContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      console.log(`   ✅ USDC approved`);
    }

    // Get current tick
    const slot0 = await poolContract.slot0();
    const currentTick = Number(slot0[1]);
    console.log(`   Current tick: ${currentTick}`);

    // Set tight range around current tick (±100 ticks)
    const tickSpacing = 1; // Adjust based on pool
    tickLower = Math.floor((currentTick - 100) / tickSpacing) * tickSpacing;
    tickUpper = Math.ceil((currentTick + 100) / tickSpacing) * tickSpacing;

    console.log(`   Range: ${tickLower} to ${tickUpper}`);

    liquidityAmount = ethers.parseUnits('0.00001', 18); // Very small amount for testing
    const amount0Max = ethers.parseUnits('1', 6); // 1 USDC max
    const amount1Max = ethers.parseUnits('0.001', 18); // 0.001 WETH max

    console.log(`   Adding liquidity via SwapHelper...`);

    // Estimate gas with 150% buffer
    const estimatedGas = await swapHelperContract.addLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount,
      amount0Max,
      amount1Max
    );
    const gasLimit = (estimatedGas * 150n) / 100n;
    console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

    const mintTx = await swapHelperContract.addLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount,
      amount0Max,
      amount1Max,
      { gasLimit }
    );

    console.log(`   ⏳ TX: ${mintTx.hash}`);
    const receipt = await mintTx.wait();
    console.log(`   ✅ Liquidity added! Gas: ${receipt.gasUsed.toString()}`);

    // TEST 3: REMOVE LIQUIDITY
    console.log('\n' + '='.repeat(70));
    console.log('TEST 3: Remove Liquidity (via SwapHelper)');
    console.log('='.repeat(70));

    console.log(`   Removing liquidity from range ${tickLower} to ${tickUpper}...`);

    // Estimate gas with 150% buffer
    const removeEstimatedGas = await swapHelperContract.removeLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount
    );
    const removeGasLimit = (removeEstimatedGas * 150n) / 100n;
    console.log(`   Gas: Estimated ${removeEstimatedGas.toString()}, Using ${removeGasLimit.toString()} (150%)`);

    const removeTx = await swapHelperContract.removeLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount,
      { gasLimit: removeGasLimit }
    );

    console.log(`   ⏳ TX: ${removeTx.hash}`);
    const removeReceipt = await removeTx.wait();
    console.log(`   ✅ Liquidity removed! Gas: ${removeReceipt.gasUsed.toString()}`);

  } catch (error) {
    console.error(`   ❌ Liquidity operations failed:`, error.message);
    if (error.info) {
      console.error('   Error info:', error.info);
    }
  }

  // Final balances
  console.log('\n' + '='.repeat(70));
  console.log('✅ Tests Complete!');
  console.log('='.repeat(70));

  const finalWeth = await wethContract.balanceOf(wallet.address);
  const finalUsdc = await usdcContract.balanceOf(wallet.address);

  console.log('\n📊 Final Balances:');
  console.log(`   WETH: ${ethers.formatUnits(finalWeth, 18)} (${finalWeth > wethBalance ? '+' : ''}${ethers.formatUnits(finalWeth - wethBalance, 18)})`);
  console.log(`   USDC: ${ethers.formatUnits(finalUsdc, 6)} (${finalUsdc > usdcBalance ? '+' : ''}${ethers.formatUnits(finalUsdc - usdcBalance, 6)})`);
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
