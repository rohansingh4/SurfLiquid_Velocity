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
  'function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)',
  'function removeLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount) returns (uint256 amount0, uint256 amount1)',
  'function getPositionLiquidity(address pool, int24 tickLower, int24 tickUpper) view returns (uint128)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() external view returns (int24)'
];

// Helper function to calculate liquidity from amounts
function getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0, amount1) {
  if (sqrtPriceX96 <= sqrtPriceAX96) {
    return getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
  } else if (sqrtPriceX96 < sqrtPriceBX96) {
    const liquidity0 = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
    const liquidity1 = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
    return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  } else {
    return getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
  }
}

function getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0) {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }
  const intermediate = (sqrtPriceAX96 * sqrtPriceBX96) / (2n ** 96n);
  return (amount0 * intermediate) / (sqrtPriceBX96 - sqrtPriceAX96);
}

function getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1) {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }
  return (amount1 * (2n ** 96n)) / (sqrtPriceBX96 - sqrtPriceAX96);
}

function getSqrtPriceAtTick(tick) {
  const Q96 = 2n ** 96n;
  const ratio = 1.0001 ** tick;
  return BigInt(Math.floor(Math.sqrt(ratio) * Number(Q96)));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing Liquidity Operations (FIXED)');
  console.log('='.repeat(70));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n📍 Wallet: ${wallet.address}`);
  console.log(`💰 SwapHelper: ${SWAP_HELPER_ADDRESS}`);
  console.log(`🏊 Pool: ${POOL_ADDRESS}`);

  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const swapHelperContract = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);
  const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);

  // Check balances
  console.log('\n📊 Current Balances:');
  const wethBalance = await wethContract.balanceOf(wallet.address);
  const usdcBalance = await usdcContract.balanceOf(wallet.address);
  console.log(`   WETH: ${ethers.formatUnits(wethBalance, 18)}`);
  console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`);

  // Get pool state
  const slot0 = await poolContract.slot0();
  const currentTick = Number(slot0[1]);
  const sqrtPriceX96 = slot0[0];
  const tickSpacing = Number(await poolContract.tickSpacing());

  console.log(`\n📈 Pool State:`);
  console.log(`   Current Tick: ${currentTick}`);
  console.log(`   Tick Spacing: ${tickSpacing}`);

  // Calculate tick range (±10% from current price, about ±950 ticks)
  const tickRange = 1000;
  let tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
  let tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

  console.log(`   Tick Range: ${tickLower} to ${tickUpper} (±${tickRange} ticks)`);

  // Use MUCH smaller amounts - 0.1 USDC and 0.00003 WETH
  const amount0Desired = ethers.parseUnits('0.1', 6); // 0.1 USDC
  const amount1Desired = ethers.parseUnits('0.00003', 18); // 0.00003 WETH (~$0.09)

  console.log(`\n💰 Token Amounts:`);
  console.log(`   USDC (amount0): ${ethers.formatUnits(amount0Desired, 6)}`);
  console.log(`   WETH (amount1): ${ethers.formatUnits(amount1Desired, 18)}`);
  console.log(`   Available WETH: ${ethers.formatUnits(wethBalance, 18)}`);

  // Calculate liquidity using proper formula
  const sqrtPriceAX96 = getSqrtPriceAtTick(tickLower);
  const sqrtPriceBX96 = getSqrtPriceAtTick(tickUpper);

  const liquidity = getLiquidityForAmounts(
    sqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    amount0Desired,
    amount1Desired
  );

  console.log(`\n🧮 Calculated Liquidity: ${liquidity.toString()}`);

  // Safety check
  if (wethBalance < amount1Desired) {
    console.error(`\n❌ Insufficient WETH balance!`);
    console.error(`   Need: ${ethers.formatUnits(amount1Desired, 18)} WETH`);
    console.error(`   Have: ${ethers.formatUnits(wethBalance, 18)} WETH`);
    process.exit(1);
  }
  if (usdcBalance < amount0Desired) {
    console.error(`\n❌ Insufficient USDC balance!`);
    console.error(`   Need: ${ethers.formatUnits(amount0Desired, 6)} USDC`);
    console.error(`   Have: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    process.exit(1);
  }

  // Check approvals
  const wethAllowance = await wethContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
  const usdcAllowance = await usdcContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);

  if (usdcAllowance < amount0Desired) {
    console.log('\n   Approving USDC...');
    const tx = await usdcContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('   ✅ USDC approved');
  }

  if (wethAllowance < amount1Desired) {
    console.log('   Approving WETH...');
    const tx = await wethContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('   ✅ WETH approved');
  }

  // TEST: ADD LIQUIDITY
  console.log('\n' + '='.repeat(70));
  console.log('TEST: Add Liquidity');
  console.log('='.repeat(70));

  try {
    console.log('   Estimating gas...');
    const estimatedGas = await swapHelperContract.addLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidity,
      amount0Desired,
      amount1Desired
    );

    const gasLimit = (estimatedGas * 150n) / 100n;
    console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

    console.log('   Adding liquidity...');
    const tx = await swapHelperContract.addLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidity,
      amount0Desired,
      amount1Desired,
      { gasLimit }
    );

    console.log(`   ⏳ TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Liquidity added! Gas used: ${receipt.gasUsed.toString()}`);

    // TEST: REMOVE LIQUIDITY (100% removal)
    console.log('\n' + '='.repeat(70));
    console.log('TEST: Remove Liquidity (100% of position)');
    console.log('='.repeat(70));

    // Check current position liquidity
    const positionLiquidity = await swapHelperContract.getPositionLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper
    );
    console.log(`   Position has ${positionLiquidity.toString()} liquidity`);

    // Pass 0 to remove 100% of liquidity
    console.log('   Removing 100% of liquidity (passing 0)...');
    const removeEstimatedGas = await swapHelperContract.removeLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      0 // 0 means remove 100%
    );

    const removeGasLimit = (removeEstimatedGas * 150n) / 100n;
    console.log(`   Gas: Estimated ${removeEstimatedGas.toString()}, Using ${removeGasLimit.toString()} (150%)`);

    const removeTx = await swapHelperContract.removeLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      0, // 0 means remove 100%
      { gasLimit: removeGasLimit }
    );

    console.log(`   ⏳ TX: ${removeTx.hash}`);
    const removeReceipt = await removeTx.wait();
    console.log(`   ✅ Liquidity removed! Gas used: ${removeReceipt.gasUsed.toString()}`);

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    if (error.data) {
      console.error('Error data:', error.data);
    }
    if (error.error) {
      console.error('Error details:', error.error);
    }
  }

  // Final balances
  const finalWeth = await wethContract.balanceOf(wallet.address);
  const finalUsdc = await usdcContract.balanceOf(wallet.address);

  console.log('\n📊 Final Balances:');
  console.log(`   WETH: ${ethers.formatUnits(finalWeth, 18)}`);
  console.log(`   USDC: ${ethers.formatUnits(finalUsdc, 6)}`);
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
