import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';

const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';

const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() external view returns (int24)'
];

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
  console.log(`\nDEBUG Liquidity Calculation:`);
  console.log(`  sqrtPriceX96: ${sqrtPriceX96.toString()}`);
  console.log(`  sqrtPriceAX96: ${sqrtPriceAX96.toString()}`);
  console.log(`  sqrtPriceBX96: ${sqrtPriceBX96.toString()}`);
  console.log(`  amount0 (USDC wei): ${amount0.toString()}`);
  console.log(`  amount1 (WETH wei): ${amount1.toString()}`);

  if (sqrtPriceX96 <= sqrtPriceAX96) {
    const liq = getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
    console.log(`  Branch: sqrtPriceX96 <= sqrtPriceAX96`);
    console.log(`  Liquidity (from amount0): ${liq.toString()}`);
    return liq;
  } else if (sqrtPriceX96 < sqrtPriceBX96) {
    const liquidity0 = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
    const liquidity1 = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
    console.log(`  Branch: sqrtPriceAX96 < sqrtPriceX96 < sqrtPriceBX96`);
    console.log(`  Liquidity0 (from USDC): ${liquidity0.toString()}`);
    console.log(`  Liquidity1 (from WETH): ${liquidity1.toString()}`);
    const min = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
    console.log(`  Using minimum: ${min.toString()}`);
    return min;
  } else {
    const liq = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
    console.log(`  Branch: sqrtPriceX96 >= sqrtPriceBX96`);
    console.log(`  Liquidity (from amount1): ${liq.toString()}`);
    return liq;
  }
}

async function debugLiquidityCalc() {
  console.log('\n🔍 Debugging Liquidity Calculation\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, provider);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

  // Get balances
  const wethBalance = await wethContract.balanceOf(wallet.address);
  const usdcBalance = await usdcContract.balanceOf(wallet.address);

  console.log(`Balances:`);
  console.log(`  WETH: ${ethers.formatUnits(wethBalance, 18)}`);
  console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)}`);

  // Get pool state
  const slot0 = await poolContract.slot0();
  const currentTick = Number(slot0[1]);
  const sqrtPriceX96 = slot0[0];
  const tickSpacing = Number(await poolContract.tickSpacing());

  console.log(`\nPool State:`);
  console.log(`  Current Tick: ${currentTick}`);
  console.log(`  Tick Spacing: ${tickSpacing}`);

  // Calculate tick range (what the bot does)
  const tickRange = 1000;
  const tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

  console.log(`\nTick Range:`);
  console.log(`  Lower: ${tickLower}`);
  console.log(`  Upper: ${tickUpper}`);

  // Use 99% of balance (what the bot does)
  const wethWei = (wethBalance * 99n) / 100n;
  const usdcWei = (usdcBalance * 99n) / 100n;

  console.log(`\n99% of balance:`);
  console.log(`  WETH: ${ethers.formatUnits(wethWei, 18)}`);
  console.log(`  USDC: ${ethers.formatUnits(usdcWei, 6)}`);

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

  console.log(`\n========================================`);
  console.log(`📊 FINAL LIQUIDITY: ${liquidity.toString()}`);
  console.log(`========================================\n`);

  // Compare to what worked
  console.log(`✅ What worked: 100,000`);
  console.log(`❌ What bot calculated: ${liquidity.toString()}`);
  console.log(`\n🔴 The bot's liquidity is ${(liquidity / 100000n).toString()}x too large!\n`);
}

debugLiquidityCalc();
