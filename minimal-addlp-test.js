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
  'function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function tickSpacing() external view returns (int24)'
];

async function testAddLP() {
  console.log('\n🧪 Minimal Add LP Test\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const swapHelperContract = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);
  const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, wallet);

  // Get pool state
  const slot0 = await poolContract.slot0();
  const currentTick = Number(slot0[1]);
  const tickSpacing = Number(await poolContract.tickSpacing());

  console.log(`Current Tick: ${currentTick}`);
  console.log(`Tick Spacing: ${tickSpacing}`);

  // Calculate tick range (±1000 ticks like the bot)
  const tickRange = 1000;
  const tickLower = Math.floor((currentTick - tickRange) / tickSpacing) * tickSpacing;
  const tickUpper = Math.ceil((currentTick + tickRange) / tickSpacing) * tickSpacing;

  console.log(`Tick Range: ${tickLower} to ${tickUpper}\n`);

  // VERY small amounts
  const usdcAmount = ethers.parseUnits('0.01', 6); // 0.01 USDC
  const wethAmount = ethers.parseUnits('0.000003', 18); // 0.000003 WETH

  console.log(`USDC: ${ethers.formatUnits(usdcAmount, 6)}`);
  console.log(`WETH: ${ethers.formatUnits(wethAmount, 18)}\n`);

  // Check and approve
  const usdcAllowance = await usdcContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);
  const wethAllowance = await wethContract.allowance(wallet.address, SWAP_HELPER_ADDRESS);

  if (usdcAllowance < usdcAmount) {
    console.log('Approving USDC...');
    const tx = await usdcContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('✅ USDC approved\n');
  }

  if (wethAllowance < wethAmount) {
    console.log('Approving WETH...');
    const tx = await wethContract.approve(SWAP_HELPER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
    console.log('✅ WETH approved\n');
  }

  // Try with MINIMAL liquidity
  const liquidityAmount = 100000n; // Very small

  console.log(`Liquidity: ${liquidityAmount}\n`);

  try {
    console.log('Estimating gas...');
    const gas = await swapHelperContract.addLiquidity.estimateGas(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount,
      usdcAmount,
      wethAmount
    );

    console.log(`✅ Gas estimation succeeded: ${gas.toString()}\n`);

    console.log('Executing transaction...');
    const tx = await swapHelperContract.addLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      liquidityAmount,
      usdcAmount,
      wethAmount,
      { gasLimit: (gas * 150n) / 100n }
    );

    console.log(`TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ SUCCESS! Gas used: ${receipt.gasUsed.toString()}\n`);

  } catch (error) {
    console.error('❌ FAILED!');
    console.error(`Error: ${error.message}\n`);

    if (error.data) {
      console.error(`Error data: ${error.data}`);
    }
    if (error.error) {
      console.error(`Error details:`, error.error);
    }
  }
}

testAddLP();
