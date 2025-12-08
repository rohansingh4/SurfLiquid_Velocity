import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const SWAP_HELPER_ADDRESS = process.env.SWAP_HELPER_ADDRESS;

const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const SWAP_HELPER_ABI = [
  'function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)',
  'function getPositionLiquidity(address pool, int24 tickLower, int24 tickUpper) view returns (uint128)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() external view returns (int24)'
];

// Helper functions
function getSqrtPriceAtTick(tick) {
  const Q96 = 2n ** 96n;
  const ratio = 1.0001 ** tick;
  return BigInt(Math.floor(Math.sqrt(ratio) * Number(Q96)));
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

function priceToTick(price) {
  const logPrice = Math.log(price) / Math.log(1.0001);
  return Math.floor(logPrice);
}

async function testAddLPFix() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Testing Add Liquidity Fix (with wider tick range)');
  console.log('='.repeat(70));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n📍 Wallet: ${wallet.address}`);
  console.log(`💰 SwapHelper: ${SWAP_HELPER_ADDRESS}`);

  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const swapHelperContract = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);
  const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);

  // Get balances
  const wethBalance = await wethContract.balanceOf(wallet.address);
  const usdcBalance = await usdcContract.balanceOf(wallet.address);

  console.log(`\n📊 Current Balances:`);
  console.log(`   WETH: ${ethers.formatUnits(wethBalance, 18)}`);
  console.log(`   USDC: ${ethers.formatUnits(usdcBalance, 6)}`);

  // Get pool state
  const slot0 = await poolContract.slot0();
  const currentTick = Number(slot0[1]);
  const sqrtPriceX96 = slot0[0];
  const tickSpacing = Number(await poolContract.tickSpacing());

  // Calculate price
  const Q96 = 2n ** 96n;
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const priceRaw = sqrtPrice * sqrtPrice;
  const priceAdjusted = priceRaw / (10 ** 12);
  const currentPrice = 1 / priceAdjusted;

  console.log(`\n📈 Pool State:`);
  console.log(`   Current Tick: ${currentTick}`);
  console.log(`   Current Price: $${currentPrice.toFixed(2)}`);
  console.log(`   Tick Spacing: ${tickSpacing}`);

  // Calculate WIDE tick range (±1000 ticks like the bot now does)
  const tickRange = 1000;
  let tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
  let tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

  console.log(`\n   Tick Range: ${tickLower} to ${tickUpper} (±${tickRange} ticks = ~10%)`);

  // Use 99% of current balance (like the fixed bot does)
  const wethAmount = parseFloat(ethers.formatUnits(wethBalance, 18)) * 0.99;
  const usdcAmount = parseFloat(ethers.formatUnits(usdcBalance, 6)) * 0.99;

  const wethWei = ethers.parseUnits(wethAmount.toFixed(18), 18);
  const usdcWei = ethers.parseUnits(usdcAmount.toFixed(6), 6);

  console.log(`\n💰 Token Amounts:`);
  console.log(`   WETH: ${wethAmount}`);
  console.log(`   USDC: ${usdcAmount}`);

  // Calculate liquidity
  const sqrtPriceAX96 = getSqrtPriceAtTick(tickLower);
  const sqrtPriceBX96 = getSqrtPriceAtTick(tickUpper);

  const liquidity = getLiquidityForAmounts(
    sqrtPriceX96,
    sqrtPriceAX96,
    sqrtPriceBX96,
    usdcWei,
    wethWei
  );

  console.log(`\n🧮 Calculated Liquidity: ${liquidity.toString()}`);

  // Check approvals
  const wethAllowance = await wethContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
  const usdcAllowance = await usdcContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);

  if (usdcAllowance < usdcWei) {
    console.log('\n   Approving USDC...');
    const tx = await usdcContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('   ✅ USDC approved');
  }

  if (wethAllowance < wethWei) {
    console.log('   Approving WETH...');
    const tx = await wethContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('   ✅ WETH approved');
  }

  // Test gas estimation
  console.log('\n' + '='.repeat(70));
  console.log('Testing Gas Estimation (should succeed now!)');
  console.log('='.repeat(70));

  try {
    const estimatedGas = await swapHelperContract.addLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidity,
      usdcWei,
      wethWei
    );

    console.log(`\n✅ Gas estimation SUCCEEDED!`);
    console.log(`   Estimated Gas: ${estimatedGas.toString()}`);
    console.log(`\n🎉 The fix works! Add liquidity should work now.`);

  } catch (error) {
    console.error(`\n❌ Gas estimation FAILED!`);
    console.error(`   Error: ${error.message}`);
    console.log(`\n⚠️  There may still be an issue. Check the error above.`);
  }

  console.log('\n' + '='.repeat(70));
}

testAddLPFix().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
