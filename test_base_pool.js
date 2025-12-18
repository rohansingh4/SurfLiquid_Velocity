const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const BASE_RPC_URL = process.env.BASE_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

// Addresses
const POOL_ADDRESS = '0xd0b53d9277642d899df5c87a3966a349a798f224';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Contract address (set after deployment)
let BASE_POOL_HELPER_ADDRESS = process.argv[2]; // Pass as command line argument

// ABIs
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)'
];

const BASE_POOL_HELPER_ABI = [
  'function addLiquidity(int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint128 liquidityAmount) external returns (uint256 amount0, uint256 amount1)',
  'function removeLiquidity(int24 tickLower, int24 tickUpper, uint128 liquidityAmount) external returns (uint256 amount0, uint256 amount1)',
  'function executeSwap(address tokenIn, address tokenOut, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (int256 amount0, int256 amount1)',
  'function getPoolInfo() external view returns (address, address, uint24, int24, uint160, int24)',
  'function getUserPositionCount(address user) external view returns (uint256)',
  'function getUserPosition(address user, uint256 index) external view returns (int24, int24, uint128)',
  'function getPositionInfo(int24 tickLower, int24 tickUpper) external view returns (uint128, uint256, uint256, uint128, uint128)',
  'function getTokenBalance(address token) external view returns (uint256)',
  'event LiquidityAdded(address indexed user, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'event LiquidityRemoved(address indexed user, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, int256 amount0, int256 amount1)'
];

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function checkBalances() {
  console.log('\n========== CHECKING BALANCES ==========');

  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

  const wethBalance = await weth.balanceOf(PUBLIC_KEY);
  const usdcBalance = await usdc.balanceOf(PUBLIC_KEY);
  const ethBalance = await provider.getBalance(PUBLIC_KEY);

  console.log(`ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`WETH Balance: ${ethers.formatEther(wethBalance)} WETH`);
  console.log(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);

  return { wethBalance, usdcBalance };
}

async function approveTokens(helperAddress) {
  console.log('\n========== APPROVING TOKENS ==========');

  const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);

  // Approve 1 WETH
  console.log('Approving WETH...');
  const wethApproveTx = await weth.approve(helperAddress, ethers.parseEther('1'));
  await wethApproveTx.wait();
  console.log('✓ WETH approved');

  // Approve 100 USDC
  console.log('Approving USDC...');
  const usdcApproveTx = await usdc.approve(helperAddress, ethers.parseUnits('100', 6));
  await usdcApproveTx.wait();
  console.log('✓ USDC approved');
}

async function getPoolInfo(helperContract) {
  console.log('\n========== POOL INFO ==========');

  const [token0, token1, fee, tickSpacing, sqrtPriceX96, tick] = await helperContract.getPoolInfo();

  console.log(`Token0: ${token0}`);
  console.log(`Token1: ${token1}`);
  console.log(`Fee: ${fee}`);
  console.log(`Tick Spacing: ${tickSpacing}`);
  console.log(`Current Tick: ${tick}`);
  console.log(`Current Price (sqrtPriceX96): ${sqrtPriceX96}`);

  return { tick: Number(tick), tickSpacing: Number(tickSpacing) };
}

async function testAddLiquidity(helperContract, currentTick, tickSpacing) {
  console.log('\n========== TEST 1: ADD LIQUIDITY ==========');

  // Calculate tick range (must be multiples of tickSpacing)
  const tickLower = Math.floor((currentTick - 20) / tickSpacing) * tickSpacing;
  const tickUpper = Math.floor((currentTick + 20) / tickSpacing) * tickSpacing;

  console.log(`Tick Lower: ${tickLower}`);
  console.log(`Tick Upper: ${tickUpper}`);

  // Small amounts for testing
  const amount0Desired = ethers.parseEther('0.005'); // 0.005 WETH
  const amount1Desired = ethers.parseUnits('20', 6); // 20 USDC
  const liquidityAmount = 1000000; // Small liquidity amount

  console.log(`Amount0 Desired: ${ethers.formatEther(amount0Desired)} WETH`);
  console.log(`Amount1 Desired: ${ethers.formatUnits(amount1Desired, 6)} USDC`);
  console.log(`Liquidity Amount: ${liquidityAmount}`);

  try {
    console.log('Adding liquidity...');
    const tx = await helperContract.addLiquidity(
      tickLower,
      tickUpper,
      amount0Desired,
      amount1Desired,
      liquidityAmount,
      { gasLimit: 500000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log('✓ Liquidity added successfully!');

    // Parse events
    const event = receipt.logs.find(log => {
      try {
        return helperContract.interface.parseLog(log).name === 'LiquidityAdded';
      } catch (e) {
        return false;
      }
    });

    if (event) {
      const parsed = helperContract.interface.parseLog(event);
      console.log(`Amount0 Used: ${ethers.formatEther(parsed.args.amount0)} WETH`);
      console.log(`Amount1 Used: ${ethers.formatUnits(parsed.args.amount1, 6)} USDC`);
    }

    return { tickLower, tickUpper, liquidityAmount };
  } catch (error) {
    console.error('✗ Add liquidity failed:', error.message);
    throw error;
  }
}

async function testSwap(helperContract) {
  console.log('\n========== TEST 2: EXECUTE SWAP ==========');

  // Test swap: USDC -> WETH
  const tokenIn = USDC_ADDRESS;
  const tokenOut = WETH_ADDRESS;
  const amountIn = ethers.parseUnits('10', 6); // 10 USDC
  const sqrtPriceLimitX96 = '4295128739'; // Min price

  console.log(`Swapping ${ethers.formatUnits(amountIn, 6)} USDC for WETH`);

  try {
    console.log('Executing swap...');
    const tx = await helperContract.executeSwap(
      tokenIn,
      tokenOut,
      amountIn,
      sqrtPriceLimitX96,
      { gasLimit: 300000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log('✓ Swap executed successfully!');

    // Parse events
    const event = receipt.logs.find(log => {
      try {
        return helperContract.interface.parseLog(log).name === 'SwapExecuted';
      } catch (e) {
        return false;
      }
    });

    if (event) {
      const parsed = helperContract.interface.parseLog(event);
      console.log(`Amount0: ${parsed.args.amount0}`);
      console.log(`Amount1: ${parsed.args.amount1}`);
    }
  } catch (error) {
    console.error('✗ Swap failed:', error.message);
    throw error;
  }
}

async function testRemoveLiquidity(helperContract, tickLower, tickUpper, liquidityAmount) {
  console.log('\n========== TEST 3: REMOVE LIQUIDITY ==========');

  console.log(`Tick Lower: ${tickLower}`);
  console.log(`Tick Upper: ${tickUpper}`);
  console.log(`Liquidity Amount: ${liquidityAmount}`);

  try {
    console.log('Removing liquidity...');
    const tx = await helperContract.removeLiquidity(
      tickLower,
      tickUpper,
      liquidityAmount,
      { gasLimit: 500000 }
    );

    console.log(`Transaction hash: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log('✓ Liquidity removed successfully!');

    // Parse events
    const event = receipt.logs.find(log => {
      try {
        return helperContract.interface.parseLog(log).name === 'LiquidityRemoved';
      } catch (e) {
        return false;
      }
    });

    if (event) {
      const parsed = helperContract.interface.parseLog(event);
      console.log(`Amount0 Received: ${ethers.formatEther(parsed.args.amount0)} WETH`);
      console.log(`Amount1 Received: ${ethers.formatUnits(parsed.args.amount1, 6)} USDC`);
    }
  } catch (error) {
    console.error('✗ Remove liquidity failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('========== BASE POOL HELPER TEST ==========');
  console.log(`Your Address: ${PUBLIC_KEY}`);
  console.log(`Base Pool Helper: ${BASE_POOL_HELPER_ADDRESS || 'NOT SET'}`);

  if (!BASE_POOL_HELPER_ADDRESS) {
    console.error('\n✗ Please provide the BasePoolHelper contract address as argument');
    console.log('Usage: node test_base_pool.js <CONTRACT_ADDRESS>');
    process.exit(1);
  }

  try {
    // Check balances
    await checkBalances();

    // Create contract instance
    const helperContract = new ethers.Contract(BASE_POOL_HELPER_ADDRESS, BASE_POOL_HELPER_ABI, wallet);

    // Get pool info
    const { tick, tickSpacing } = await getPoolInfo(helperContract);

    // Approve tokens
    await approveTokens(BASE_POOL_HELPER_ADDRESS);

    // Test 1: Add Liquidity
    const { tickLower, tickUpper, liquidityAmount } = await testAddLiquidity(helperContract, tick, tickSpacing);

    // Check balances after add
    await checkBalances();

    // Test 2: Swap
    await testSwap(helperContract);

    // Check balances after swap
    await checkBalances();

    // Test 3: Remove Liquidity
    await testRemoveLiquidity(helperContract, tickLower, tickUpper, liquidityAmount);

    // Final balance check
    await checkBalances();

    console.log('\n========== ALL TESTS COMPLETED SUCCESSFULLY! ==========');
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
main();
