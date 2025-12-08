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
  'function balanceOf(address owner) view returns (uint256)'
];

const SWAP_HELPER_ABI = [
  'function removeLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount) returns (uint256 amount0, uint256 amount1)',
  'function getPositionLiquidity(address pool, int24 tickLower, int24 tickUpper) view returns (uint128)'
];

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Remove Liquidity Test');
  console.log('='.repeat(70));

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`\n📍 Wallet: ${wallet.address}`);
  console.log(`💰 SwapHelper: ${SWAP_HELPER_ADDRESS}`);

  const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const swapHelperContract = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, wallet);

  // These are from the last test
  const tickLower = 194700;
  const tickUpper = 196800;

  // Check position
  const positionLiquidity = await swapHelperContract.getPositionLiquidity(
    POOL_ADDRESS,
    tickLower,
    tickUpper
  );

  console.log(`\n📊 Position Info:`);
  console.log(`   Tick Range: ${tickLower} to ${tickUpper}`);
  console.log(`   Liquidity: ${positionLiquidity.toString()}`);

  if (positionLiquidity === 0n) {
    console.log('\n✅ No liquidity to remove!');
    return;
  }

  // Check balances before
  const wethBefore = await wethContract.balanceOf(wallet.address);
  const usdcBefore = await usdcContract.balanceOf(wallet.address);
  console.log(`\n💼 Balances Before:`);
  console.log(`   WETH: ${ethers.formatUnits(wethBefore, 18)}`);
  console.log(`   USDC: ${ethers.formatUnits(usdcBefore, 6)}`);

  // Remove liquidity
  console.log('\n' + '='.repeat(70));
  console.log('Removing 100% of liquidity...');
  console.log('='.repeat(70));

  try {
    const tx = await swapHelperContract.removeLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper,
      0, // 0 = remove 100%
      {
        gasLimit: 500000 // Fixed gas limit to avoid estimation issues
      }
    );

    console.log(`   ⏳ TX: ${tx.hash}`);
    console.log(`   Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`   ✅ Liquidity removed! Gas used: ${receipt.gasUsed.toString()}`);

    // Check balances after
    const wethAfter = await wethContract.balanceOf(wallet.address);
    const usdcAfter = await usdcContract.balanceOf(wallet.address);

    console.log(`\n💼 Balances After:`);
    console.log(`   WETH: ${ethers.formatUnits(wethAfter, 18)} (${wethAfter > wethBefore ? '+' : ''}${ethers.formatUnits(wethAfter - wethBefore, 18)})`);
    console.log(`   USDC: ${ethers.formatUnits(usdcAfter, 6)} (${usdcAfter > usdcBefore ? '+' : ''}${ethers.formatUnits(usdcAfter - usdcBefore, 6)})`);

    // Verify position is empty
    const finalLiquidity = await swapHelperContract.getPositionLiquidity(
      POOL_ADDRESS,
      tickLower,
      tickUpper
    );
    console.log(`\n✅ Final position liquidity: ${finalLiquidity.toString()}`);

  } catch (error) {
    console.error('\n❌ Failed:', error.message);
    if (error.error) {
      console.error('Error details:', error.error);
    }
  }

  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
