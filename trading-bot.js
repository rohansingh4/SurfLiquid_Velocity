import { ethers } from 'ethers';
import Transaction from './models/Transaction.js';

// ERC20 ABI for token approvals and balances
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

// SwapHelper ABI (updated with liquidity functions)
const SWAP_HELPER_ABI = [
  'function executeSwap(address pool, address tokenIn, address tokenOut, bool zeroForOne, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (int256 amount0, int256 amount1)',
  'function addLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount, uint256 amount0Max, uint256 amount1Max) returns (uint256 amount0, uint256 amount1)',
  'function removeLiquidity(address pool, int24 tickLower, int24 tickUpper, uint128 liquidityAmount) returns (uint256 amount0, uint256 amount1)',
  'function getPositionLiquidity(address pool, int24 tickLower, int24 tickUpper) view returns (uint128)',
  'function withdrawToken(address token, uint256 amount)',
  'function getTokenBalance(address token) view returns (uint256)',
  'function owner() view returns (address)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

// Pool ABI (provided by user)
const POOL_ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"AI","type":"error"},{"inputs":[],"name":"AS","type":"error"},{"inputs":[],"name":"F0","type":"error"},{"inputs":[],"name":"F1","type":"error"},{"inputs":[],"name":"I","type":"error"},{"inputs":[],"name":"IIA","type":"error"},{"inputs":[],"name":"L","type":"error"},{"inputs":[],"name":"LOK","type":"error"},{"inputs":[],"name":"M0","type":"error"},{"inputs":[],"name":"M1","type":"error"},{"inputs":[],"name":"NOT_AUTHORIZED","type":"error"},{"inputs":[],"name":"OLD","type":"error"},{"inputs":[],"name":"R","type":"error"},{"inputs":[],"name":"SPL","type":"error"},{"inputs":[],"name":"T","type":"error"},{"inputs":[],"name":"TF","type":"error"},{"inputs":[],"name":"TLM","type":"error"},{"inputs":[],"name":"TLU","type":"error"},{"inputs":[],"name":"TUM","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"address","name":"recipient","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"Collect","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"CollectProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid1","type":"uint256"}],"name":"Flash","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextOld","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextNew","type":"uint16"}],"name":"IncreaseObservationCardinalityNext","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Initialize","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint8","name":"feeProtocol0Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol0New","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1New","type":"uint8"}],"name":"SetFeeProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"int256","name":"amount0","type":"int256"},{"indexed":false,"internalType":"int256","name":"amount1","type":"int256"},{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"uint128","name":"liquidity","type":"uint128"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Swap","type":"event"},{"inputs":[],"name":"_advancePeriod","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collect","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collectProtocol","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal0X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal1X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"flash","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"}],"name":"increaseObservationCardinalityNext","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"lastPeriod","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"liquidity","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxLiquidityPerTick","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"mint","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"observations","outputs":[{"internalType":"uint32","name":"blockTimestamp","type":"uint32"},{"internalType":"int56","name":"tickCumulative","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityCumulativeX128","type":"uint160"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint32[]","name":"secondsAgos","type":"uint32[]"}],"name":"observe","outputs":[{"internalType":"int56[]","name":"tickCumulatives","type":"int56[]"},{"internalType":"uint160[]","name":"secondsPerLiquidityCumulativeX128s","type":"uint160[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"period","type":"uint256"}],"name":"periods","outputs":[{"internalType":"uint32","name":"previousPeriod","type":"uint32"},{"internalType":"int24","name":"startTick","type":"int24"},{"internalType":"int24","name":"lastTick","type":"int24"},{"internalType":"uint160","name":"endSecondsPerLiquidityPeriodX128","type":"uint160"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"period","type":"uint256"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"positionPeriodSecondsInRange","outputs":[{"internalType":"uint256","name":"periodSecondsInsideX96","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"key","type":"bytes32"}],"name":"positions","outputs":[{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"feeGrowthInside0LastX128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthInside1LastX128","type":"uint256"},{"internalType":"uint128","name":"tokensOwed0","type":"uint128"},{"internalType":"uint128","name":"tokensOwed1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFees","outputs":[{"internalType":"uint128","name":"","type":"uint128"},{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"slots","type":"bytes32[]"}],"name":"readStorage","outputs":[{"internalType":"bytes32[]","name":"returnData","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint24","name":"_fee","type":"uint24"}],"name":"setFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"setFeeProtocol","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"slot0","outputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"internalType":"int24","name":"tick","type":"int24"},{"internalType":"uint16","name":"observationIndex","type":"uint16"},{"internalType":"uint16","name":"observationCardinality","type":"uint16"},{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"},{"internalType":"uint8","name":"feeProtocol","type":"uint8"},{"internalType":"bool","name":"unlocked","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"snapshotCumulativesInside","outputs":[{"internalType":"int56","name":"tickCumulativeInside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityInsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsInside","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"bool","name":"zeroForOne","type":"bool"},{"internalType":"int256","name":"amountSpecified","type":"int256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[{"internalType":"int256","name":"amount0","type":"int256"},{"internalType":"int256","name":"amount1","type":"int256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int16","name":"tick","type":"int16"}],"name":"tickBitmap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tickSpacing","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tick","type":"int24"}],"name":"ticks","outputs":[{"internalType":"uint128","name":"liquidityGross","type":"uint128"},{"internalType":"int128","name":"liquidityNet","type":"int128"},{"internalType":"uint256","name":"feeGrowthOutside0X128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthOutside1X128","type":"uint256"},{"internalType":"int56","name":"tickCumulativeOutside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityOutsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsOutside","type":"uint32"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];

class TradingBot {
  constructor(provider, wallet, poolAddress, wethAddress, usdcAddress, swapHelperAddress = null, writeProvider = null) {
    this.provider = provider; // For read operations
    this.writeProvider = writeProvider || provider; // For write operations (txns) - use separate RPC if provided
    this.wallet = wallet;
    this.poolAddress = poolAddress;
    this.wethAddress = wethAddress;
    this.usdcAddress = usdcAddress;
    this.swapHelperAddress = swapHelperAddress;

    // Create a separate wallet for write operations if writeProvider is different
    const writeWallet = writeProvider ? new ethers.Wallet(wallet.privateKey, writeProvider) : wallet;

    // Initialize contracts
    // Read operations use provider (fetched every 10s)
    this.poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
    this.wethContract = new ethers.Contract(wethAddress, ERC20_ABI, provider);
    this.usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

    // Write operations use writeWallet (with separate RPC if provided)
    // Initialize SwapHelper if address provided
    if (swapHelperAddress) {
      this.swapHelperContract = new ethers.Contract(swapHelperAddress, SWAP_HELPER_ABI, writeWallet);
      console.log(`   ✅ SwapHelper: ${swapHelperAddress}`);
      if (writeProvider) {
        console.log(`   ✅ Separate Write RPC configured (reduces rate limiting)`);
      }
    } else {
      console.log(`   ⚠️  SwapHelper: Not configured (swaps disabled)`);
    }

    // State tracking
    this.lastSignal = null;
    this.hasLiquidity = false; // Track if we currently have liquidity in pool
    this.currentLiquidity = null;
    this.currentTickLower = null;
    this.currentTickUpper = null;
    this.isExecuting = false;
    this.initialPortfolioValue = null; // Portfolio value at very start (never changes)
    this.rebalanceStartValue = null; // Portfolio value at start of current rebalance cycle
    this.tokensApproved = false;

    console.log(`\n🤖 Trading Bot Configuration:`);
    console.log(`   Wallet: ${wallet.address}`);
    console.log(`   Pool: ${poolAddress}`);
    console.log(`   WETH: ${wethAddress}`);
    console.log(`   USDC: ${usdcAddress}`);
  }

  // Get wallet balances
  async getBalances() {
    try {
      const [wethBalance, usdcBalance] = await Promise.all([
        this.wethContract.balanceOf(this.wallet.address),
        this.usdcContract.balanceOf(this.wallet.address)
      ]);

      const wethFormatted = parseFloat(ethers.formatUnits(wethBalance, 18));
      const usdcFormatted = parseFloat(ethers.formatUnits(usdcBalance, 6));

      return { wethFormatted, usdcFormatted, wethBalance, usdcBalance };
    } catch (error) {
      console.error('Error getting balances:', error);
      throw error;
    }
  }

  // Calculate portfolio value in USDC
  async calculatePortfolioValue(wethAmount, usdcAmount, wethPrice, includeLPPosition = true) {
    let walletValue = (wethAmount * wethPrice) + usdcAmount;

    if (includeLPPosition) {
      const lpValue = await this.getLPPositionValue(wethPrice);
      const totalValue = walletValue + lpValue;

      console.log(`   Portfolio: Wallet=$${walletValue.toFixed(2)}, LP=$${lpValue.toFixed(2)}, Total=$${totalValue.toFixed(2)}`);
      return totalValue;
    }

    return walletValue;
  }

  // Price to tick conversion
  priceToTick(price) {
    // price = (1.0001^tick)
    // tick = log(price) / log(1.0001)
    return Math.floor(Math.log(price) / Math.log(1.0001));
  }

  // Helper functions for liquidity calculation (from test-liquidity-fix.js)
  getSqrtPriceAtTick(tick) {
    const Q96 = 2n ** 96n;
    const ratio = 1.0001 ** tick;
    return BigInt(Math.floor(Math.sqrt(ratio) * Number(Q96)));
  }

  getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0) {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
      [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
    }
    const intermediate = (sqrtPriceAX96 * sqrtPriceBX96) / (2n ** 96n);
    return (amount0 * intermediate) / (sqrtPriceBX96 - sqrtPriceAX96);
  }

  getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1) {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
      [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
    }
    return (amount1 * (2n ** 96n)) / (sqrtPriceBX96 - sqrtPriceAX96);
  }

  getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, amount0, amount1) {
    if (sqrtPriceX96 <= sqrtPriceAX96) {
      return this.getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
    } else if (sqrtPriceX96 < sqrtPriceBX96) {
      const liquidity0 = this.getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
      const liquidity1 = this.getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
      return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
    } else {
      return this.getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
    }
  }

  // Convert liquidity back to token amounts (reverse of getLiquidityForAmounts)
  getAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, liquidity) {
    if (sqrtPriceAX96 > sqrtPriceBX96) {
      [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
    }

    let amount0 = 0n;
    let amount1 = 0n;

    // If current price is below range, all liquidity is in token0 (USDC)
    if (sqrtPriceX96 <= sqrtPriceAX96) {
      amount0 = (liquidity * (sqrtPriceBX96 - sqrtPriceAX96)) / ((sqrtPriceAX96 * sqrtPriceBX96) / (2n ** 96n));
      amount1 = 0n;
    }
    // If current price is above range, all liquidity is in token1 (WETH)
    else if (sqrtPriceX96 >= sqrtPriceBX96) {
      amount0 = 0n;
      amount1 = (liquidity * (sqrtPriceBX96 - sqrtPriceAX96)) / (2n ** 96n);
    }
    // If current price is in range, liquidity is split
    else {
      amount0 = (liquidity * (sqrtPriceBX96 - sqrtPriceX96)) / ((sqrtPriceX96 * sqrtPriceBX96) / (2n ** 96n));
      amount1 = (liquidity * (sqrtPriceX96 - sqrtPriceAX96)) / (2n ** 96n);
    }

    return { amount0, amount1 };
  }

  // Get current LP position value in USDC
  async getLPPositionValue(wethPrice) {
    if (!this.currentTickLower || !this.currentTickUpper) {
      return 0; // No active position
    }

    try {
      // Get current liquidity from contract
      const liquidity = await this.swapHelperContract.getPositionLiquidity(
        this.poolAddress,
        this.currentTickLower,
        this.currentTickUpper
      );

      if (liquidity === 0n) {
        return 0; // Position closed or empty
      }

      // Get current pool state
      const slot0 = await this.poolContract.slot0();
      const sqrtPriceX96 = slot0[0];

      // Calculate sqrt prices at tick boundaries
      const sqrtPriceAX96 = this.getSqrtPriceAtTick(this.currentTickLower);
      const sqrtPriceBX96 = this.getSqrtPriceAtTick(this.currentTickUpper);

      // Convert liquidity to token amounts
      const { amount0, amount1 } = this.getAmountsForLiquidity(
        sqrtPriceX96,
        sqrtPriceAX96,
        sqrtPriceBX96,
        liquidity
      );

      // Convert to formatted amounts
      const usdcAmount = Number(amount0) / 1e6;  // USDC has 6 decimals
      const wethAmount = Number(amount1) / 1e18; // WETH has 18 decimals

      // Calculate total value in USDC
      const lpValue = usdcAmount + (wethAmount * wethPrice);

      console.log(`   LP Position Value: $${lpValue.toFixed(2)} (${usdcAmount.toFixed(2)} USDC + ${wethAmount.toFixed(6)} WETH)`);

      return lpValue;
    } catch (error) {
      console.error('   Error getting LP position value:', error.message);
      return 0;
    }
  }

  async getCurrentSqrtPriceX96() {
    const slot0 = await this.poolContract.slot0();
    return slot0[0];
  }

  async getTickSpacing() {
    try {
      const tickSpacing = await this.poolContract.tickSpacing();
      return Number(tickSpacing);
    } catch (error) {
      console.log('   Warning: Could not get tick spacing, using default 1');
      return 1;
    }
  }

  // Tick to price conversion
  tickToPrice(tick) {
    return Math.pow(1.0001, tick);
  }

  // Convert price to sqrtPriceX96
  // Price is USDC per WETH (e.g., 3162)
  // Need to convert to sqrtPriceX96 format for Uniswap V3
  priceToSqrtPriceX96(price) {
    // Reverse the calculation from calculatePriceFromSqrtPriceX96
    // usdcPerWeth = 1 / priceAdjusted
    const priceAdjusted = 1 / price;
    // priceAdjusted = priceRaw / (10 ** 12)
    const priceRaw = priceAdjusted * (10 ** 12);
    // priceRaw = sqrtPrice^2
    const sqrtPrice = Math.sqrt(priceRaw);
    // sqrtPriceX96 = sqrtPrice * 2^96
    const sqrtPriceX96 = sqrtPrice * (2 ** 96);

    return BigInt(Math.floor(sqrtPriceX96));
  }

  // Approve tokens once with high amount (MaxUint256)
  async approveTokensOnce() {
    if (this.tokensApproved) {
      return;
    }

    if (!this.swapHelperAddress) {
      console.log(`⚠️  SwapHelper not configured, skipping token approvals`);
      return;
    }

    try {
      console.log(`\n🔓 Approving tokens to SwapHelper (one-time, high amounts)...`);

      // Check and approve WETH to SwapHelper
      const wethAllowance = await this.wethContract.allowance(this.wallet.address, this.swapHelperAddress);
      if (wethAllowance < ethers.parseUnits('100', 18)) {
        console.log(`   Approving WETH to SwapHelper...`);
        const wethTx = await this.wethContract.approve(this.swapHelperAddress, ethers.MaxUint256, {
          gasLimit: 100000 // Fixed gas for approval
        });
        await wethTx.wait();
        console.log(`   ✅ WETH approved to SwapHelper`);
      }

      // Check and approve USDC to SwapHelper
      const usdcAllowance = await this.usdcContract.allowance(this.wallet.address, this.swapHelperAddress);
      if (usdcAllowance < ethers.parseUnits('100', 6)) {
        console.log(`   Approving USDC to SwapHelper...`);
        const usdcTx = await this.usdcContract.approve(this.swapHelperAddress, ethers.MaxUint256, {
          gasLimit: 100000 // Fixed gas for approval
        });
        await usdcTx.wait();
        console.log(`   ✅ USDC approved to SwapHelper`);
      }

      this.tokensApproved = true;
      console.log(`✅ All tokens approved to SwapHelper!`);
    } catch (error) {
      console.error('Error approving tokens:', error);
      throw error;
    }
  }

  // Execute swap with 150% gas limit using SwapHelper
  async executeSwap(zeroForOne, amountIn, currentPrice) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.swapHelperContract) {
          throw new Error('SwapHelper not configured - cannot execute swap');
        }

        console.log(`\n💱 Executing Swap via SwapHelper (Attempt ${attempt}/${maxRetries})...`);
        console.log(`   Direction: ${zeroForOne ? 'USDC → WETH' : 'WETH → USDC'}`);
        console.log(`   Amount In: ${ethers.formatUnits(amountIn, zeroForOne ? 6 : 18)}`);

        // Determine tokenIn and tokenOut
        const tokenIn = zeroForOne ? this.usdcAddress : this.wethAddress;
        const tokenOut = zeroForOne ? this.wethAddress : this.usdcAddress;

        // Calculate sqrt price limit (5% slippage)
        const slippage = 0.05;
        let sqrtPriceLimitX96;
        if (zeroForOne) {
          // Buying WETH with USDC (token0 → token1), price goes up
          sqrtPriceLimitX96 = this.priceToSqrtPriceX96(currentPrice * (1 + slippage));
        } else {
          // Selling WETH for USDC (token1 → token0), price goes down
          sqrtPriceLimitX96 = this.priceToSqrtPriceX96(currentPrice * (1 - slippage));
        }

        console.log(`   Token In: ${tokenIn}`);
        console.log(`   Token Out: ${tokenOut}`);
        console.log(`   SqrtPriceLimit: ${sqrtPriceLimitX96.toString()}`);

        // Estimate gas and add 50% buffer
        const estimatedGas = await this.swapHelperContract.executeSwap.estimateGas(
          this.poolAddress,
          tokenIn,
          tokenOut,
          zeroForOne,
          amountIn,
          sqrtPriceLimitX96
        );

        const gasLimit = (estimatedGas * 150n) / 100n; // 150% of estimated
        console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

        // Execute swap via SwapHelper
        const tx = await this.swapHelperContract.executeSwap(
          this.poolAddress,
          tokenIn,
          tokenOut,
          zeroForOne,
          amountIn,
          sqrtPriceLimitX96,
          { gasLimit }
        );

        console.log(`   TX Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Swap completed! Gas used: ${receipt.gasUsed.toString()}`);

        return { txHash: tx.hash, gasUsed: receipt.gasUsed.toString() };
      } catch (error) {
        lastError = error;
        console.error(`❌ Swap attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(`   Retrying in ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ Swap failed after all retries');
    throw lastError;
  }

  // Add liquidity with proper calculation and retry logic
  async addLiquidity(tickLower, tickUpper, wethAmount, usdcAmount) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.swapHelperContract) {
          throw new Error('SwapHelper not configured - cannot add liquidity');
        }

        console.log(`\n➕ Adding Liquidity via SwapHelper (Attempt ${attempt}/${maxRetries})...`);
        console.log(`   Tick Range: ${tickLower} to ${tickUpper}`);
        console.log(`   WETH: ${wethAmount.toFixed(6)}`);
        console.log(`   USDC: ${usdcAmount.toFixed(2)}`);

        // Convert to wei
        const wethWei = ethers.parseUnits(wethAmount.toFixed(18), 18);
        const usdcWei = ethers.parseUnits(usdcAmount.toFixed(6), 6);

        // Get current sqrt price
        const sqrtPriceX96 = await this.getCurrentSqrtPriceX96();

        // Calculate sqrt prices at tick boundaries
        const sqrtPriceAX96 = this.getSqrtPriceAtTick(tickLower);
        const sqrtPriceBX96 = this.getSqrtPriceAtTick(tickUpper);

        // DEBUG: Liquidity calculation inputs
        console.log(`   DEBUG: Liquidity calculation inputs:`);
        console.log(`     Current sqrt price: ${sqrtPriceX96.toString()}`);
        console.log(`     Lower sqrt price: ${sqrtPriceAX96.toString()}`);
        console.log(`     Upper sqrt price: ${sqrtPriceBX96.toString()}`);
        console.log(`     WETH to add: ${wethAmount.toFixed(6)} (${wethWei.toString()} wei)`);
        console.log(`     USDC to add: ${usdcAmount.toFixed(2)} (${usdcWei.toString()} wei)`);

        // Calculate liquidity amount
        let liquidityAmount = this.getLiquidityForAmounts(
          sqrtPriceX96,
          sqrtPriceAX96,
          sqrtPriceBX96,
          usdcWei,
          wethWei
        );

        // Cap at 1 trillion to avoid precision errors and "transfer amount exceeds balance" errors
        const MAX_LIQUIDITY = 1000000000000n; // 1 trillion (this worked for 48 successful transactions overnight)
        if (liquidityAmount > MAX_LIQUIDITY) {
          console.log(`   Calculated liquidity ${liquidityAmount.toString()} exceeds max, capping at ${MAX_LIQUIDITY.toString()}`);
          liquidityAmount = MAX_LIQUIDITY;
        }

        // On retry attempts, reduce liquidity slightly to avoid precision errors
        if (attempt > 1) {
          const reductionPct = BigInt(attempt - 1) * 2n; // Reduce by 2%, 4% on retries
          liquidityAmount = (liquidityAmount * (100n - reductionPct)) / 100n;
          console.log(`   Retry ${attempt}: Reducing liquidity by ${reductionPct}% to ${liquidityAmount.toString()}`);
        }

        console.log(`   Using liquidity amount: ${liquidityAmount.toString()}`);

        // Estimate gas
        const estimatedGas = await this.swapHelperContract.addLiquidity.estimateGas(
          this.poolAddress,
          tickLower,
          tickUpper,
          liquidityAmount,
          usdcWei, // amount0Max (USDC)
          wethWei  // amount1Max (WETH)
        );

        const gasLimit = (estimatedGas * 150n) / 100n; // 150% of estimated
        console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

        // Add liquidity via SwapHelper
        const tx = await this.swapHelperContract.addLiquidity(
          this.poolAddress,
          tickLower,
          tickUpper,
          liquidityAmount,
          usdcWei, // amount0Max
          wethWei, // amount1Max
          { gasLimit }
        );

        console.log(`   TX Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Liquidity added! Gas used: ${receipt.gasUsed.toString()}`);

        // Store position info
        this.currentLiquidity = liquidityAmount;
        this.currentTickLower = tickLower;
        this.currentTickUpper = tickUpper;
        this.hasLiquidity = true;

        return {
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          liquidity: liquidityAmount.toString()
        };
      } catch (error) {
        lastError = error;
        console.error(`❌ Add liquidity attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(`   Retrying in ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ Add liquidity failed after all retries');
    throw lastError;
  }

  // Remove liquidity with 150% gas limit and retry logic
  async removeLiquidity() {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.swapHelperContract) {
          throw new Error('SwapHelper not configured - cannot remove liquidity');
        }

        if (!this.hasLiquidity) {
          console.log('⚠️  No active liquidity position to remove');
          return null;
        }

        console.log(`\n➖ Removing Liquidity via SwapHelper (Attempt ${attempt}/${maxRetries})...`);
        console.log(`   Tick Range: ${this.currentTickLower} to ${this.currentTickUpper}`);

        // Check actual position liquidity
        const positionLiquidity = await this.swapHelperContract.getPositionLiquidity(
          this.poolAddress,
          this.currentTickLower,
          this.currentTickUpper
        );

        if (positionLiquidity === 0n) {
          console.log('⚠️  Position already empty');
          this.hasLiquidity = false;
          return null;
        }

        console.log(`   Liquidity to remove: ${positionLiquidity.toString()}`);

        // Pass 0 to remove 100% of liquidity
        const tx = await this.swapHelperContract.removeLiquidity(
          this.poolAddress,
          this.currentTickLower,
          this.currentTickUpper,
          0, // 0 = remove 100%
          { gasLimit: 500000 } // Fixed gas to avoid estimation issues
        );

        console.log(`   TX Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`✅ Liquidity removed! Gas used: ${receipt.gasUsed.toString()}`);

        const result = {
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          liquidity: positionLiquidity.toString()
        };

        // Clear position
        this.currentLiquidity = null;
        this.currentTickLower = null;
        this.currentTickUpper = null;
        this.hasLiquidity = false;

        return result;
      } catch (error) {
        lastError = error;
        console.error(`❌ Remove liquidity attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(`   Retrying in ${waitTime/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    console.error('❌ Remove liquidity failed after all retries');
    throw lastError;
  }

  // Main trading logic - CORRECTED FOR CONSECUTIVE SIGNALS
  async processSignal(signal, targetWethPct, targetUsdcPct, upperRange, lowerRange, currentPrice, tickLowerProvided, tickUpperProvided) {
    if (this.isExecuting) {
      console.log('⏳ Already executing a trade, skipping...');
      return;
    }

    // Only process Open-UP or Open-DOWN signals
    if (signal !== 'Open-UP' && signal !== 'Open-DOWN') {
      return;
    }

    this.isExecuting = true;

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🤖 TRADING BOT - Signal: ${signal}`);
      console.log(`   Last Signal: ${this.lastSignal || 'None'}`);
      console.log(`   Has Liquidity: ${this.hasLiquidity}`);
      console.log(`${'='.repeat(60)}`);

      // Approve tokens once
      await this.approveTokensOnce();

      // Get current balances
      const balancesBefore = await this.getBalances();
      const portfolioValueBefore = await this.calculatePortfolioValue(
        balancesBefore.wethFormatted,
        balancesBefore.usdcFormatted,
        currentPrice
      );

      if (!this.initialPortfolioValue) {
        this.initialPortfolioValue = portfolioValueBefore;
        console.log(`   📍 Initial Portfolio Value Set: $${this.initialPortfolioValue.toFixed(2)}`);
      }

      console.log(`\n📊 Current Portfolio:`);
      console.log(`   WETH: ${balancesBefore.wethFormatted.toFixed(6)}`);
      console.log(`   USDC: ${balancesBefore.usdcFormatted.toFixed(2)}`);
      console.log(`   Total Value: $${portfolioValueBefore.toFixed(2)}`);
      console.log(`   Total P&L: $${(portfolioValueBefore - this.initialPortfolioValue).toFixed(2)} (${((portfolioValueBefore - this.initialPortfolioValue) / this.initialPortfolioValue * 100).toFixed(2)}%)`);

      // ============================================
      // DECISION LOGIC: Should we rebalance?
      // ============================================
      const signalChanged = (this.lastSignal !== signal && this.lastSignal !== null);
      const priceInRange = (currentPrice >= lowerRange && currentPrice <= upperRange);
      const priceOutOfRangeDown = (currentPrice < lowerRange);
      const priceOutOfRangeUp = (currentPrice > upperRange);

      console.log(`\n🔍 Decision Factors:`);
      console.log(`   Current Signal: ${signal}`);
      console.log(`   Last Signal: ${this.lastSignal || 'None'}`);
      console.log(`   Signal Changed: ${signalChanged}`);
      console.log(`   Price: $${currentPrice.toFixed(2)}`);
      console.log(`   Range: $${lowerRange.toFixed(2)} - $${upperRange.toFixed(2)}`);
      console.log(`   Price In Range: ${priceInRange}`);
      console.log(`   Price Out Down: ${priceOutOfRangeDown}`);
      console.log(`   Price Out Up: ${priceOutOfRangeUp}`);

      // CASE 1: Signal unchanged, price in range, have liquidity → HOLD
      if (!signalChanged && priceInRange && this.hasLiquidity) {
        console.log(`\n✅ HOLD: Signal unchanged & price in range → Keep earning fees`);
        this.lastSignal = signal;
        this.isExecuting = false;
        return;
      }

      // CASE 2: Price out of range downward → Remove LP (if exists), Swap, HOLD (no add LP)
      if (currentPrice < lowerRange) {
        console.log(`\n⚠️  OUT OF RANGE DOWN: ${this.hasLiquidity ? 'Remove LP → ' : ''}Swap → HOLD`);

        // Remove LP first (if we have any)
        if (this.hasLiquidity) {
          try {
            const removeResult = await this.removeLiquidity();
          if (removeResult) {
            await Transaction.create({
              timestamp: new Date(),
              signal: 'Out-of-Range-Down',
              txType: 'remove_liquidity',
              txHash: removeResult.txHash,
              status: 'success',
              wethBalanceBefore: balancesBefore.wethFormatted,
              usdcBalanceBefore: balancesBefore.usdcFormatted,
              liquidityAmount: removeResult.liquidity,
              price: currentPrice,
              portfolioValueBefore,
              gasUsed: removeResult.gasUsed
            });
            console.log(`   ✅ Remove liquidity recorded`);
          }
        } catch (error) {
          console.error(`   ❌ Remove liquidity failed:`, error.message);
        }
      } // End of if (this.hasLiquidity)

      // Swap to latest ratio (happens regardless of whether we had LP)
      await new Promise(resolve => setTimeout(resolve, 3000));
      const currentBalances = await this.getBalances();
      const totalValue = await this.calculatePortfolioValue(
        currentBalances.wethFormatted,
        currentBalances.usdcFormatted,
        currentPrice
      );

      console.log(`\n   Swapping to latest ratio: ${targetWethPct}% WETH, ${targetUsdcPct}% USDC`);
      const currentWethPct = (currentBalances.wethFormatted * currentPrice / totalValue) * 100;

      const targetWethValue = totalValue * (targetWethPct / 100);
      const currentWethValue = currentBalances.wethFormatted * currentPrice;
      const wethDiff = targetWethValue - currentWethValue;

      if (Math.abs(wethDiff) > 0.5) {
        try {
          if (wethDiff > 0) {
            // Buy WETH
            const usdcToSell = Math.abs(wethDiff);
            const usdcWei = ethers.parseUnits(usdcToSell.toFixed(6), 6);
            const swapResult = await this.executeSwap(true, usdcWei, currentPrice);

            const balancesAfter = await this.getBalances();
            await Transaction.create({
              timestamp: new Date(),
              signal: 'Out-of-Range-Down',
              txType: 'swap',
              txHash: swapResult.txHash,
              status: 'success',
              wethBalanceBefore: currentBalances.wethFormatted,
              usdcBalanceBefore: currentBalances.usdcFormatted,
              wethBalanceAfter: balancesAfter.wethFormatted,
              usdcBalanceAfter: balancesAfter.usdcFormatted,
              price: currentPrice,
              portfolioValueBefore: totalValue,
              portfolioValueAfter: await this.calculatePortfolioValue(balancesAfter.wethFormatted, balancesAfter.usdcFormatted, currentPrice),
              gasUsed: swapResult.gasUsed
            });
            console.log(`   ✅ Swapped to latest ratio`);
          } else {
            // Sell WETH
            const wethToSell = Math.abs(wethDiff) / currentPrice;
            const wethWei = ethers.parseUnits(wethToSell.toFixed(18), 18);
            const swapResult = await this.executeSwap(false, wethWei, currentPrice);

            const balancesAfter = await this.getBalances();
            await Transaction.create({
              timestamp: new Date(),
              signal: 'Out-of-Range-Down',
              txType: 'swap',
              txHash: swapResult.txHash,
              status: 'success',
              wethBalanceBefore: currentBalances.wethFormatted,
              usdcBalanceBefore: currentBalances.usdcFormatted,
              wethBalanceAfter: balancesAfter.wethFormatted,
              usdcBalanceAfter: balancesAfter.usdcFormatted,
              price: currentPrice,
              portfolioValueBefore: totalValue,
              portfolioValueAfter: await this.calculatePortfolioValue(balancesAfter.wethFormatted, balancesAfter.usdcFormatted, currentPrice),
              gasUsed: swapResult.gasUsed
            });
            console.log(`   ✅ Swapped to latest ratio`);
          }
        } catch (error) {
          console.error(`   ❌ Swap failed:`, error.message);
        }
      }

      console.log(`\n   💰 HOLDING - Not adding LP back (price out of range down)`);
      this.lastSignal = 'Out-of-Range-Down';
      this.isExecuting = false;
      return;
    }

      // CASE 3: Signal changed OR price out of range up → Rebalance
      console.log(`\n🔄 REBALANCE: ${signalChanged ? 'Signal changed' : 'Price out of range up'}`);

      // Track portfolio value at start of rebalance cycle (for calculating fees earned)
      this.rebalanceStartValue = portfolioValueBefore;
      console.log(`   💰 Rebalance Start Value: $${this.rebalanceStartValue.toFixed(2)}`);

      // ============================================
      // REBALANCING LOGIC
      // ============================================
      if (signal === 'Open-UP' || signal === 'Open-DOWN') {
        console.log(`\n${signal === 'Open-UP' ? '🟢' : '🔴'} ${signal} Signal!`);

        // If we already have liquidity, we need to withdraw first
        if (this.hasLiquidity) {
          console.log(`   Removing existing liquidity first`);

          try {
            const removeResult = await this.removeLiquidity();

            if (removeResult) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'remove_liquidity',
                txHash: removeResult.txHash,
                status: 'success',
                wethBalanceBefore: balancesBefore.wethFormatted,
                usdcBalanceBefore: balancesBefore.usdcFormatted,
                liquidityAmount: removeResult.liquidity,
                price: currentPrice,
                portfolioValueBefore,
                gasUsed: removeResult.gasUsed
              });
              console.log(`   ✅ Remove liquidity recorded - TX: ${removeResult.txHash}`);
            } else {
              // Remove liquidity returned null (failed but didn't throw)
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'remove_liquidity',
                status: 'failed',
                error: 'Remove liquidity returned null',
                wethBalanceBefore: balancesBefore.wethFormatted,
                usdcBalanceBefore: balancesBefore.usdcFormatted,
                price: currentPrice,
                portfolioValueBefore
              });
              console.log(`   ❌ Remove liquidity failed - returned null`);
            }
          } catch (error) {
            // Remove liquidity threw an error
            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'remove_liquidity',
              status: 'failed',
              error: error.message,
              wethBalanceBefore: balancesBefore.wethFormatted,
              usdcBalanceBefore: balancesBefore.usdcFormatted,
              price: currentPrice,
              portfolioValueBefore
            });
            console.error(`   ❌ Remove liquidity failed:`, error.message);
          }

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Get fresh balances after potential withdraw
        const currentBalances = await this.getBalances();
        const totalValue = await this.calculatePortfolioValue(
          currentBalances.wethFormatted,
          currentBalances.usdcFormatted,
          currentPrice
        );

        // Step 1: Swap to target ratio
        console.log(`\n   Target: ${targetWethPct}% WETH, ${targetUsdcPct}% USDC`);
        const currentWethPct = (currentBalances.wethFormatted * currentPrice / totalValue) * 100;
        const currentUsdcPct = (currentBalances.usdcFormatted / totalValue) * 100;
        console.log(`   Current: ${currentWethPct.toFixed(2)}% WETH, ${currentUsdcPct.toFixed(2)}% USDC`);

        const targetWethValue = totalValue * (targetWethPct / 100);
        const currentWethValue = currentBalances.wethFormatted * currentPrice;
        const wethDiff = targetWethValue - currentWethValue;

        if (Math.abs(wethDiff) > 0.5) {
          if (wethDiff > 0) {
            // Need more WETH, buy WETH with USDC (zeroForOne=true)
            const usdcToSell = Math.abs(wethDiff);
            const usdcWei = ethers.parseUnits(usdcToSell.toFixed(6), 6);

            try {
              const swapResult = await this.executeSwap(true, usdcWei, currentPrice);

              // Get balances after swap
              const balancesAfter = await this.getBalances();
              const totalValueAfter = balancesAfter.wethFormatted + (balancesAfter.usdcFormatted / currentPrice);
              const totalUsdValueAfter = (balancesAfter.wethFormatted * currentPrice) + balancesAfter.usdcFormatted;
              const wethPctAfter = (balancesAfter.wethFormatted / totalValueAfter) * 100;
              const usdcPctAfter = (balancesAfter.usdcFormatted / totalUsdValueAfter) * 100;

              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                txHash: swapResult.txHash,
                status: 'success',
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethBalanceAfter: balancesAfter.wethFormatted,
                usdcBalanceAfter: balancesAfter.usdcFormatted,
                wethPctAfter: wethPctAfter,
                usdcPctAfter: usdcPctAfter,
                usdcAmount: -usdcToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue,
                portfolioValueAfter: await this.calculatePortfolioValue(balancesAfter.wethFormatted, balancesAfter.usdcFormatted, currentPrice),
                gasUsed: swapResult.gasUsed
              });
              console.log(`   ✅ Swap recorded (Buy WETH) - TX: ${swapResult.txHash}`);
            } catch (error) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                status: 'failed',
                error: error.message,
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                usdcAmount: -usdcToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue
              });
              console.error(`   ❌ Swap failed (Buy WETH):`, error.message);
              throw error; // Re-throw to prevent add liquidity from executing
            }
          } else {
            // Need more USDC, sell WETH for USDC (zeroForOne=false)
            const wethToSell = Math.abs(wethDiff) / currentPrice;
            const wethWei = ethers.parseUnits(wethToSell.toFixed(18), 18);

            try {
              const swapResult = await this.executeSwap(false, wethWei, currentPrice);

              // Get balances after swap
              const balancesAfter = await this.getBalances();
              const totalValueAfter = balancesAfter.wethFormatted + (balancesAfter.usdcFormatted / currentPrice);
              const totalUsdValueAfter = (balancesAfter.wethFormatted * currentPrice) + balancesAfter.usdcFormatted;
              const wethPctAfter = (balancesAfter.wethFormatted / totalValueAfter) * 100;
              const usdcPctAfter = (balancesAfter.usdcFormatted / totalUsdValueAfter) * 100;

              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                txHash: swapResult.txHash,
                status: 'success',
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethBalanceAfter: balancesAfter.wethFormatted,
                usdcBalanceAfter: balancesAfter.usdcFormatted,
                wethPctAfter: wethPctAfter,
                usdcPctAfter: usdcPctAfter,
                wethAmount: -wethToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue,
                portfolioValueAfter: await this.calculatePortfolioValue(balancesAfter.wethFormatted, balancesAfter.usdcFormatted, currentPrice),
                gasUsed: swapResult.gasUsed
              });
              console.log(`   ✅ Swap recorded (Sell WETH) - TX: ${swapResult.txHash}`);
            } catch (error) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                status: 'failed',
                error: error.message,
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethAmount: -wethToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue
              });
              console.error(`   ❌ Swap failed (Sell WETH):`, error.message);
              throw error; // Re-throw to prevent add liquidity from executing
            }
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Step 2: Add liquidity (use 99% of balance to avoid rounding errors)
        const finalBalances = await this.getBalances();

        // Use the tick ranges from the position signal (these are the strategic ranges)
        let tickLower, tickUpper;
        if (tickLowerProvided !== undefined && tickUpperProvided !== undefined) {
          // Use ticks provided by sonic-execution-onchain (exact 10-tick range)
          tickLower = tickLowerProvided;
          tickUpper = tickUpperProvided;
          console.log(`   Using provided tick range: ${tickLower} to ${tickUpper}`);
        } else {
          // Fallback to price-based conversion (for backwards compatibility)
          const tickSpacing = await this.getTickSpacing();
          tickLower = Math.floor(this.priceToTick(lowerRange) / tickSpacing) * tickSpacing;
          tickUpper = Math.ceil(this.priceToTick(upperRange) / tickSpacing) * tickSpacing;
          console.log(`   Calculated tick range from prices: ${tickLower} to ${tickUpper}`);
        }

        const tickRangeWidth = tickUpper - tickLower;
        console.log(`   Tick Range: ${tickLower} to ${tickUpper} (${tickRangeWidth} ticks)`);
        console.log(`   Price Range: $${lowerRange.toFixed(2)} to $${upperRange.toFixed(2)}`);

        // Use 95% of balance with 5% safety buffer for gas, rounding, and successful submission
        // This percentage worked reliably for 48 successful transactions overnight
        const capitalPct = 0.95;

        const wethToAdd = finalBalances.wethFormatted * capitalPct;
        const usdcToAdd = finalBalances.usdcFormatted * capitalPct;

        console.log(`   Using ${(capitalPct * 100).toFixed(0)}% of balance: ${wethToAdd.toFixed(6)} WETH, ${usdcToAdd.toFixed(2)} USDC`);

        try {
          const addResult = await this.addLiquidity(
            tickLower,
            tickUpper,
            wethToAdd,
            usdcToAdd
          );

          if (addResult) {
            const balancesAfter = await this.getBalances();
            const portfolioValueAfter = await this.calculatePortfolioValue(
              balancesAfter.wethFormatted,
              balancesAfter.usdcFormatted,
              currentPrice
            );

            // Get LP position value after adding liquidity
            const lpValueAfter = await this.getLPPositionValue(currentPrice);

            // Calculate P&L metrics
            const totalPnL = portfolioValueAfter - this.initialPortfolioValue;
            const totalPnLPct = (totalPnL / this.initialPortfolioValue) * 100;
            const rebalanceFees = this.rebalanceStartValue ? (portfolioValueAfter - this.rebalanceStartValue) : 0;

            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'add_liquidity',
              txHash: addResult.txHash,
              status: 'success',
              wethBalanceBefore: finalBalances.wethFormatted,
              usdcBalanceBefore: finalBalances.usdcFormatted,
              wethBalanceAfter: balancesAfter.wethFormatted,
              usdcBalanceAfter: balancesAfter.usdcFormatted,
              liquidityAmount: addResult.liquidity,
              tickLower,
              tickUpper,
              price: currentPrice,
              lpAmount0: addResult.amount0 ? Number(addResult.amount0) / 1e6 : null,
              lpAmount1: addResult.amount1 ? Number(addResult.amount1) / 1e18 : null,
              lpPositionValueBefore: 0,  // No LP position before add
              lpPositionValueAfter: lpValueAfter,
              portfolioValueBefore: totalValue,
              portfolioValueAfter,
              // Old P&L (deprecated but kept for compatibility)
              profitLoss: totalPnL,
              profitLossPct: totalPnLPct,
              // New P&L tracking
              initialPortfolioValue: this.initialPortfolioValue,
              totalPnL,
              totalPnLPct,
              rebalanceFees,
              gasUsed: addResult.gasUsed
            });
            console.log(`   ✅ Add liquidity recorded - TX: ${addResult.txHash}`);
            console.log(`   📊 Total P&L: $${totalPnL.toFixed(2)} (${totalPnLPct.toFixed(2)}%)`);
            console.log(`   💰 Rebalance Fees: $${rebalanceFees.toFixed(2)}`);
          } else {
            // Add liquidity returned null (failed but didn't throw)
            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'add_liquidity',
              status: 'failed',
              error: 'Add liquidity returned null',
              wethBalanceBefore: finalBalances.wethFormatted,
              usdcBalanceBefore: finalBalances.usdcFormatted,
              tickLower,
              tickUpper,
              price: currentPrice,
              portfolioValueBefore: totalValue
            });
            console.log(`   ❌ Add liquidity failed - returned null`);
          }
        } catch (error) {
          // Add liquidity threw an error
          await Transaction.create({
            timestamp: new Date(),
            signal,
            txType: 'add_liquidity',
            status: 'failed',
            error: error.message,
            wethBalanceBefore: finalBalances.wethFormatted,
            usdcBalanceBefore: finalBalances.usdcFormatted,
            tickLower,
            tickUpper,
            price: currentPrice,
            portfolioValueBefore: totalValue
          });
          console.error(`   ❌ Add liquidity failed:`, error.message);
        }
      }

      // ============================================
      // OPEN-DOWN SIGNAL
      // ============================================
      else if (signal === 'Open-DOWN') {
        console.log(`\n🔴 Open-DOWN Signal!`);

        // If we have liquidity, withdraw it
        if (this.hasLiquidity) {
          console.log(`   Withdrawing liquidity...`);

          try {
            const removeResult = await this.removeLiquidity();

            if (removeResult) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'remove_liquidity',
                txHash: removeResult.txHash,
                status: 'success',
                wethBalanceBefore: balancesBefore.wethFormatted,
                usdcBalanceBefore: balancesBefore.usdcFormatted,
                liquidityAmount: removeResult.liquidity,
                price: currentPrice,
                portfolioValueBefore,
                gasUsed: removeResult.gasUsed
              });
              console.log(`   ✅ Remove liquidity recorded - TX: ${removeResult.txHash}`);
            } else {
              // Remove liquidity returned null (failed but didn't throw)
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'remove_liquidity',
                status: 'failed',
                error: 'Remove liquidity returned null',
                wethBalanceBefore: balancesBefore.wethFormatted,
                usdcBalanceBefore: balancesBefore.usdcFormatted,
                price: currentPrice,
                portfolioValueBefore
              });
              console.log(`   ❌ Remove liquidity failed - returned null`);
            }
          } catch (error) {
            // Remove liquidity threw an error
            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'remove_liquidity',
              status: 'failed',
              error: error.message,
              wethBalanceBefore: balancesBefore.wethFormatted,
              usdcBalanceBefore: balancesBefore.usdcFormatted,
              price: currentPrice,
              portfolioValueBefore
            });
            console.error(`   ❌ Remove liquidity failed:`, error.message);
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Now swap to target ratio (whether we had liquidity or not)
        const currentBalances = await this.getBalances();
        const totalValue = await this.calculatePortfolioValue(
          currentBalances.wethFormatted,
          currentBalances.usdcFormatted,
          currentPrice
        );

        console.log(`\n   Target: ${targetWethPct}% WETH, ${targetUsdcPct}% USDC`);
        const targetWethValue = totalValue * (targetWethPct / 100);
        const currentWethValue = currentBalances.wethFormatted * currentPrice;
        const wethDiff = targetWethValue - currentWethValue;

        if (Math.abs(wethDiff) > 0.5) {
          if (wethDiff > 0) {
            // Need more WETH, buy WETH with USDC (zeroForOne=true)
            const usdcToSell = Math.abs(wethDiff);
            const usdcWei = ethers.parseUnits(usdcToSell.toFixed(6), 6);

            try {
              const swapResult = await this.executeSwap(true, usdcWei, currentPrice);

              const balancesAfter = await this.getBalances();
              const portfolioValueAfter = await this.calculatePortfolioValue(
                balancesAfter.wethFormatted,
                balancesAfter.usdcFormatted,
                currentPrice
              );

              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                txHash: swapResult.txHash,
                status: 'success',
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethBalanceAfter: balancesAfter.wethFormatted,
                usdcBalanceAfter: balancesAfter.usdcFormatted,
                usdcAmount: -usdcToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue,
                portfolioValueAfter,
                profitLoss: portfolioValueAfter - this.initialPortfolioValue,
                profitLossPct: ((portfolioValueAfter - this.initialPortfolioValue) / this.initialPortfolioValue) * 100,
                gasUsed: swapResult.gasUsed
              });
              console.log(`   ✅ Swap recorded (Buy WETH) - TX: ${swapResult.txHash}`);
            } catch (error) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                status: 'failed',
                error: error.message,
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                usdcAmount: -usdcToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue
              });
              console.error(`   ❌ Swap failed (Buy WETH):`, error.message);
            }
          } else {
            // Need more USDC, sell WETH for USDC (zeroForOne=false)
            const wethToSell = Math.abs(wethDiff) / currentPrice;
            const wethWei = ethers.parseUnits(wethToSell.toFixed(18), 18);

            try {
              const swapResult = await this.executeSwap(false, wethWei, currentPrice);

              const balancesAfter = await this.getBalances();
              const portfolioValueAfter = this.calculatePortfolioValue(
                balancesAfter.wethFormatted,
                balancesAfter.usdcFormatted,
                currentPrice
              );

              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                txHash: swapResult.txHash,
                status: 'success',
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethBalanceAfter: balancesAfter.wethFormatted,
                usdcBalanceAfter: balancesAfter.usdcFormatted,
                wethAmount: -wethToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue,
                portfolioValueAfter,
                profitLoss: portfolioValueAfter - this.initialPortfolioValue,
                profitLossPct: ((portfolioValueAfter - this.initialPortfolioValue) / this.initialPortfolioValue) * 100,
                gasUsed: swapResult.gasUsed
              });
              console.log(`   ✅ Swap recorded (Sell WETH) - TX: ${swapResult.txHash}`);
            } catch (error) {
              await Transaction.create({
                timestamp: new Date(),
                signal,
                txType: 'swap',
                status: 'failed',
                error: error.message,
                wethBalanceBefore: currentBalances.wethFormatted,
                usdcBalanceBefore: currentBalances.usdcFormatted,
                wethAmount: -wethToSell,
                price: currentPrice,
                portfolioValueBefore: totalValue
              });
              console.error(`   ❌ Swap failed (Sell WETH):`, error.message);
            }
          }
        }

        console.log(`   Holding in wallet (no liquidity)`);
      }

      this.lastSignal = signal;
      console.log(`\n✅ Trading cycle completed!`);
      console.log(`${'='.repeat(60)}\n`);

    } catch (error) {
      console.error(`\n❌ Trading cycle failed with unexpected error:`, error.message);
      console.error(error);
      // Note: Individual operations already record their own failures
      // This catch block handles unexpected errors in the trading cycle itself
    } finally {
      this.isExecuting = false;
    }
  }
}

export default TradingBot;
