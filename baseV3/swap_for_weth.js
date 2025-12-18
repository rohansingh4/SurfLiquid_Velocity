import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const helperAbi = ['function executeSwap(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (int256, int256)'];
const erc20Abi = ['function approve(address, uint256) external', 'function allowance(address, address) view returns (uint256)'];

async function swapForMoreWETH() {
  const helper = new ethers.Contract(process.env.BASE_HELPER_SOL, helperAbi, wallet);
  const usdc = new ethers.Contract('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', erc20Abi, wallet);

  const amount = ethers.parseUnits('2', 6);
  const allowance = await usdc.allowance(process.env.PUBLIC_KEY, process.env.BASE_HELPER_SOL);

  if (allowance < amount) {
    console.log('Approving USDC...');
    const tx = await usdc.approve(process.env.BASE_HELPER_SOL, amount);
    await tx.wait();
    console.log('✓ Approved');
  }

  console.log('Swapping 2 USDC to WETH...');
  const tx = await helper.executeSwap(
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    '0x4200000000000000000000000000000000000006',
    amount,
    '1461446703485210103287273052203988822378723970341',
    { gasLimit: 300000 }
  );

  console.log('Tx:', tx.hash);
  await tx.wait();
  console.log('✓ Swap complete!');
}

swapForMoreWETH().catch(console.error);
