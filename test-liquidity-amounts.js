import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const POOL_ADDRESS = '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40';
const SWAP_HELPER_ADDRESS = process.env.SWAP_HELPER_ADDRESS;
const WETH_ADDRESS = '0x50c42deacd8fc9773493ed674b675be577f2634b';
const USDC_ADDRESS = '0x29219dd400f2bf60e5a23d13be72b486d4038894';

const SWAP_HELPER_ABI = ['function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)'];
const POOL_ABI = ['function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)', 'function tickSpacing() external view returns (int24)'];

async function test() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const swapHelper = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);
  const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

  const slot0 = await pool.slot0();
  const tick = Number(slot0[1]);
  const tickSpacing = Number(await pool.tickSpacing());
  const tickLower = Math.floor((tick - 1000) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((tick + 1000) / tickSpacing) * tickSpacing;

  const amounts = [
    { liq: 100000n, desc: "Tiny" },
    { liq: 1000000n, desc: "Small" },
    { liq: 10000000n, desc: "Medium" },
    { liq: 100000000n, desc: "Large" },
    { liq: 1000000000n, desc: "Very Large" },
    { liq: 10000000000n, desc: "Huge" }
  ];

  const usdcMax = ethers.parseUnits('13', 6);
  const wethMax = ethers.parseUnits('0.005', 18);

  console.log(`\nTesting different liquidity amounts:\n`);
  
  for (const {liq, desc} of amounts) {
    try {
      await swapHelper.addLiquidity.estimateGas(POOL_ADDRESS, tickLower, tickUpper, liq, usdcMax, wethMax);
      console.log(`✅ ${desc} (${liq}): SUCCESS`);
    } catch (e) {
      console.log(`❌ ${desc} (${liq}): FAILED`);
    }
  }
}

test();
