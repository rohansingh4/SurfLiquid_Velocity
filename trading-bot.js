import { ethers } from 'ethers';
import Transaction from './models/Transaction.js';

// ERC20 ABI for token approvals and balances
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

// Pool ABI (provided by user)
const POOL_ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"AI","type":"error"},{"inputs":[],"name":"AS","type":"error"},{"inputs":[],"name":"F0","type":"error"},{"inputs":[],"name":"F1","type":"error"},{"inputs":[],"name":"I","type":"error"},{"inputs":[],"name":"IIA","type":"error"},{"inputs":[],"name":"L","type":"error"},{"inputs":[],"name":"LOK","type":"error"},{"inputs":[],"name":"M0","type":"error"},{"inputs":[],"name":"M1","type":"error"},{"inputs":[],"name":"NOT_AUTHORIZED","type":"error"},{"inputs":[],"name":"OLD","type":"error"},{"inputs":[],"name":"R","type":"error"},{"inputs":[],"name":"SPL","type":"error"},{"inputs":[],"name":"T","type":"error"},{"inputs":[],"name":"TF","type":"error"},{"inputs":[],"name":"TLM","type":"error"},{"inputs":[],"name":"TLU","type":"error"},{"inputs":[],"name":"TUM","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"address","name":"recipient","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"Collect","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"CollectProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid1","type":"uint256"}],"name":"Flash","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextOld","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextNew","type":"uint16"}],"name":"IncreaseObservationCardinalityNext","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Initialize","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint8","name":"feeProtocol0Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol0New","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1New","type":"uint8"}],"name":"SetFeeProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"int256","name":"amount0","type":"int256"},{"indexed":false,"internalType":"int256","name":"amount1","type":"int256"},{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"uint128","name":"liquidity","type":"uint128"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Swap","type":"event"},{"inputs":[],"name":"_advancePeriod","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collect","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collectProtocol","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal0X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal1X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"flash","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"}],"name":"increaseObservationCardinalityNext","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"lastPeriod","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"liquidity","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxLiquidityPerTick","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"mint","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"index","type":"uint256"}],"name":"observations","outputs":[{"internalType":"uint32","name":"blockTimestamp","type":"uint32"},{"internalType":"int56","name":"tickCumulative","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityCumulativeX128","type":"uint160"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint32[]","name":"secondsAgos","type":"uint32[]"}],"name":"observe","outputs":[{"internalType":"int56[]","name":"tickCumulatives","type":"int56[]"},{"internalType":"uint160[]","name":"secondsPerLiquidityCumulativeX128s","type":"uint160[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"period","type":"uint256"}],"name":"periods","outputs":[{"internalType":"uint32","name":"previousPeriod","type":"uint32"},{"internalType":"int24","name":"startTick","type":"int24"},{"internalType":"int24","name":"lastTick","type":"int24"},{"internalType":"uint160","name":"endSecondsPerLiquidityPeriodX128","type":"uint160"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"period","type":"uint256"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint256","name":"index","type":"uint256"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"positionPeriodSecondsInRange","outputs":[{"internalType":"uint256","name":"periodSecondsInsideX96","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"key","type":"bytes32"}],"name":"positions","outputs":[{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"feeGrowthInside0LastX128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthInside1LastX128","type":"uint256"},{"internalType":"uint128","name":"tokensOwed0","type":"uint128"},{"internalType":"uint128","name":"tokensOwed1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFees","outputs":[{"internalType":"uint128","name":"","type":"uint128"},{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"slots","type":"bytes32[]"}],"name":"readStorage","outputs":[{"internalType":"bytes32[]","name":"returnData","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint24","name":"_fee","type":"uint24"}],"name":"setFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"setFeeProtocol","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"slot0","outputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"internalType":"int24","name":"tick","type":"int24"},{"internalType":"uint16","name":"observationIndex","type":"uint16"},{"internalType":"uint16","name":"observationCardinality","type":"uint16"},{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"},{"internalType":"uint8","name":"feeProtocol","type":"uint8"},{"internalType":"bool","name":"unlocked","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"snapshotCumulativesInside","outputs":[{"internalType":"int56","name":"tickCumulativeInside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityInsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsInside","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"bool","name":"zeroForOne","type":"bool"},{"internalType":"int256","name":"amountSpecified","type":"int256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[{"internalType":"int256","name":"amount0","type":"int256"},{"internalType":"int256","name":"amount1","type":"int256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int16","name":"tick","type":"int16"}],"name":"tickBitmap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tickSpacing","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tick","type":"int24"}],"name":"ticks","outputs":[{"internalType":"uint128","name":"liquidityGross","type":"uint128"},{"internalType":"int128","name":"liquidityNet","type":"int128"},{"internalType":"uint256","name":"feeGrowthOutside0X128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthOutside1X128","type":"uint256"},{"internalType":"int56","name":"tickCumulativeOutside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityOutsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsOutside","type":"uint32"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}];

class TradingBot {
  constructor(provider, wallet, poolAddress, wethAddress, usdcAddress) {
    this.provider = provider;
    this.wallet = wallet;
    this.poolAddress = poolAddress;
    this.wethAddress = wethAddress;
    this.usdcAddress = usdcAddress;

    // Initialize contracts
    this.poolContract = new ethers.Contract(poolAddress, POOL_ABI, wallet);
    this.wethContract = new ethers.Contract(wethAddress, ERC20_ABI, wallet);
    this.usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);

    // State tracking
    this.lastSignal = null;
    this.hasLiquidity = false; // Track if we currently have liquidity in pool
    this.currentLiquidity = null;
    this.currentTickLower = null;
    this.currentTickUpper = null;
    this.isExecuting = false;
    this.initialPortfolioValue = null;
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
  calculatePortfolioValue(wethAmount, usdcAmount, wethPrice) {
    return (wethAmount * wethPrice) + usdcAmount;
  }

  // Price to tick conversion
  priceToTick(price) {
    // price = (1.0001^tick)
    // tick = log(price) / log(1.0001)
    return Math.floor(Math.log(price) / Math.log(1.0001));
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

    try {
      console.log(`\n🔓 Approving tokens (one-time, high amounts)...`);

      // Check and approve WETH
      const wethAllowance = await this.wethContract.allowance(this.wallet.address, this.poolAddress);
      if (wethAllowance < ethers.parseUnits('100', 18)) {
        console.log(`   Approving WETH...`);
        const wethTx = await this.wethContract.approve(this.poolAddress, ethers.MaxUint256, {
          gasLimit: 100000 // Fixed gas for approval
        });
        await wethTx.wait();
        console.log(`   ✅ WETH approved`);
      }

      // Check and approve USDC
      const usdcAllowance = await this.usdcContract.allowance(this.wallet.address, this.poolAddress);
      if (usdcAllowance < ethers.parseUnits('100', 6)) {
        console.log(`   Approving USDC...`);
        const usdcTx = await this.usdcContract.approve(this.poolAddress, ethers.MaxUint256, {
          gasLimit: 100000 // Fixed gas for approval
        });
        await usdcTx.wait();
        console.log(`   ✅ USDC approved`);
      }

      this.tokensApproved = true;
      console.log(`✅ All tokens approved!`);
    } catch (error) {
      console.error('Error approving tokens:', error);
      throw error;
    }
  }

  // Execute swap with 150% gas limit
  async executeSwap(zeroForOne, amountIn, currentPrice) {
    try {
      console.log(`\n💱 Executing Swap...`);
      console.log(`   Direction: ${zeroForOne ? 'USDC → WETH' : 'WETH → USDC'}`);
      console.log(`   Amount In: ${ethers.formatUnits(amountIn, zeroForOne ? 6 : 18)}`);

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

      // Estimate gas and add 50% buffer
      const estimatedGas = await this.poolContract.swap.estimateGas(
        this.wallet.address,
        zeroForOne,
        amountIn.toString(),
        sqrtPriceLimitX96.toString(),
        '0x'
      );

      const gasLimit = (estimatedGas * 150n) / 100n; // 150% of estimated
      console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

      // Execute swap
      const tx = await this.poolContract.swap(
        this.wallet.address,
        zeroForOne,
        amountIn.toString(),
        sqrtPriceLimitX96.toString(),
        '0x',
        { gasLimit }
      );

      console.log(`   TX Hash: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Swap completed! Gas used: ${receipt.gasUsed.toString()}`);

      return { txHash: tx.hash, gasUsed: receipt.gasUsed.toString() };
    } catch (error) {
      console.error('❌ Swap failed:', error.message);
      throw error;
    }
  }

  // Add liquidity with 150% gas limit
  async addLiquidity(tickLower, tickUpper, wethAmount, usdcAmount) {
    try {
      console.log(`\n➕ Adding Liquidity...`);
      console.log(`   Tick Range: ${tickLower} to ${tickUpper}`);
      console.log(`   WETH: ${wethAmount.toFixed(6)}`);
      console.log(`   USDC: ${usdcAmount.toFixed(2)}`);

      // Calculate liquidity amount (rough estimation)
      const liquidityAmount = ethers.parseUnits('1', 18);

      // Estimate gas
      const estimatedGas = await this.poolContract.mint.estimateGas(
        this.wallet.address,
        0, // index
        tickLower,
        tickUpper,
        liquidityAmount,
        '0x'
      );

      const gasLimit = (estimatedGas * 150n) / 100n; // 150% of estimated
      console.log(`   Gas: Estimated ${estimatedGas.toString()}, Using ${gasLimit.toString()} (150%)`);

      // Mint liquidity
      const tx = await this.poolContract.mint(
        this.wallet.address,
        0, // index
        tickLower,
        tickUpper,
        liquidityAmount,
        '0x',
        { gasLimit }
      );

      console.log(`   TX Hash: ${tx.hash}`);
      const receipt = await tx.wait();

      // Parse Mint event to get actual liquidity added
      const mintEvent = receipt.logs.find(log => {
        try {
          const parsed = this.poolContract.interface.parseLog(log);
          return parsed && parsed.name === 'Mint';
        } catch {
          return false;
        }
      });

      let actualLiquidity = liquidityAmount;
      if (mintEvent) {
        const parsed = this.poolContract.interface.parseLog(mintEvent);
        actualLiquidity = parsed.args.amount;
      }

      console.log(`✅ Liquidity added! Amount: ${actualLiquidity.toString()}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

      // Store position info
      this.currentLiquidity = actualLiquidity;
      this.currentTickLower = tickLower;
      this.currentTickUpper = tickUpper;
      this.hasLiquidity = true;

      return {
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        liquidity: actualLiquidity.toString()
      };
    } catch (error) {
      console.error('❌ Add liquidity failed:', error.message);
      throw error;
    }
  }

  // Remove liquidity with 150% gas limit
  async removeLiquidity() {
    try {
      if (!this.hasLiquidity || !this.currentLiquidity) {
        console.log('⚠️  No active liquidity position to remove');
        return null;
      }

      console.log(`\n➖ Removing Liquidity...`);
      console.log(`   Amount: ${this.currentLiquidity.toString()}`);
      console.log(`   Tick Range: ${this.currentTickLower} to ${this.currentTickUpper}`);

      // Estimate gas for burn
      const estimatedGas = await this.poolContract.burn.estimateGas(
        0, // index
        this.currentTickLower,
        this.currentTickUpper,
        this.currentLiquidity
      );

      const gasLimit = (estimatedGas * 150n) / 100n; // 150% of estimated

      // Burn liquidity
      const tx = await this.poolContract.burn(
        0, // index
        this.currentTickLower,
        this.currentTickUpper,
        this.currentLiquidity,
        { gasLimit }
      );

      console.log(`   TX Hash: ${tx.hash}`);
      let receipt = await tx.wait();
      console.log(`✅ Liquidity burned! Gas used: ${receipt.gasUsed.toString()}`);

      // Collect tokens
      console.log(`   Collecting tokens...`);
      const collectGas = await this.poolContract.collect.estimateGas(
        this.wallet.address,
        0, // index
        this.currentTickLower,
        this.currentTickUpper,
        ethers.MaxUint128,
        ethers.MaxUint128
      );

      const collectGasLimit = (collectGas * 150n) / 100n;

      const collectTx = await this.poolContract.collect(
        this.wallet.address,
        0, // index
        this.currentTickLower,
        this.currentTickUpper,
        ethers.MaxUint128,
        ethers.MaxUint128,
        { gasLimit: collectGasLimit }
      );

      await collectTx.wait();
      console.log(`✅ Tokens collected!`);

      const result = {
        txHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        liquidity: this.currentLiquidity.toString()
      };

      // Clear position
      this.currentLiquidity = null;
      this.currentTickLower = null;
      this.currentTickUpper = null;
      this.hasLiquidity = false;

      return result;
    } catch (error) {
      console.error('❌ Remove liquidity failed:', error.message);
      throw error;
    }
  }

  // Main trading logic - CORRECTED FOR CONSECUTIVE SIGNALS
  async processSignal(signal, targetWethPct, targetUsdcPct, upperRange, lowerRange, currentPrice) {
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
      const portfolioValueBefore = this.calculatePortfolioValue(
        balancesBefore.wethFormatted,
        balancesBefore.usdcFormatted,
        currentPrice
      );

      if (!this.initialPortfolioValue) {
        this.initialPortfolioValue = portfolioValueBefore;
      }

      console.log(`\n📊 Current Portfolio:`);
      console.log(`   WETH: ${balancesBefore.wethFormatted.toFixed(6)}`);
      console.log(`   USDC: ${balancesBefore.usdcFormatted.toFixed(2)}`);
      console.log(`   Total Value: $${portfolioValueBefore.toFixed(2)}`);

      // ============================================
      // OPEN-UP SIGNAL
      // ============================================
      if (signal === 'Open-UP') {
        console.log(`\n🟢 Open-UP Signal!`);

        // If we already have liquidity, we need to withdraw first
        if (this.hasLiquidity) {
          console.log(`   Already in liquidity → Need to withdraw first`);
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
          }

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Get fresh balances after potential withdraw
        const currentBalances = await this.getBalances();
        const totalValue = this.calculatePortfolioValue(
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
            const swapResult = await this.executeSwap(true, usdcWei, currentPrice);

            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'swap',
              txHash: swapResult.txHash,
              status: 'success',
              wethBalanceBefore: currentBalances.wethFormatted,
              usdcBalanceBefore: currentBalances.usdcFormatted,
              usdcAmount: -usdcToSell,
              price: currentPrice,
              portfolioValueBefore: totalValue,
              gasUsed: swapResult.gasUsed
            });
          } else {
            // Need more USDC, sell WETH for USDC (zeroForOne=false)
            const wethToSell = Math.abs(wethDiff) / currentPrice;
            const wethWei = ethers.parseUnits(wethToSell.toFixed(18), 18);
            const swapResult = await this.executeSwap(false, wethWei, currentPrice);

            await Transaction.create({
              timestamp: new Date(),
              signal,
              txType: 'swap',
              txHash: swapResult.txHash,
              status: 'success',
              wethBalanceBefore: currentBalances.wethFormatted,
              usdcBalanceBefore: currentBalances.usdcFormatted,
              wethAmount: -wethToSell,
              price: currentPrice,
              portfolioValueBefore: totalValue,
              gasUsed: swapResult.gasUsed
            });
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Step 2: Add 100% liquidity
        const finalBalances = await this.getBalances();
        const tickLower = this.priceToTick(lowerRange);
        const tickUpper = this.priceToTick(upperRange);

        const addResult = await this.addLiquidity(
          tickLower,
          tickUpper,
          finalBalances.wethFormatted,
          finalBalances.usdcFormatted
        );

        const balancesAfter = await this.getBalances();
        const portfolioValueAfter = this.calculatePortfolioValue(
          balancesAfter.wethFormatted,
          balancesAfter.usdcFormatted,
          currentPrice
        );

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
          portfolioValueBefore: totalValue,
          portfolioValueAfter,
          profitLoss: portfolioValueAfter - this.initialPortfolioValue,
          profitLossPct: ((portfolioValueAfter - this.initialPortfolioValue) / this.initialPortfolioValue) * 100,
          gasUsed: addResult.gasUsed
        });
      }

      // ============================================
      // OPEN-DOWN SIGNAL
      // ============================================
      else if (signal === 'Open-DOWN') {
        console.log(`\n🔴 Open-DOWN Signal!`);

        // If we have liquidity, withdraw it
        if (this.hasLiquidity) {
          console.log(`   Withdrawing liquidity...`);
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
          }

          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        // Now swap to target ratio (whether we had liquidity or not)
        const currentBalances = await this.getBalances();
        const totalValue = this.calculatePortfolioValue(
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
            const swapResult = await this.executeSwap(true, usdcWei, currentPrice);

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
              usdcAmount: -usdcToSell,
              price: currentPrice,
              portfolioValueBefore: totalValue,
              portfolioValueAfter,
              profitLoss: portfolioValueAfter - this.initialPortfolioValue,
              profitLossPct: ((portfolioValueAfter - this.initialPortfolioValue) / this.initialPortfolioValue) * 100,
              gasUsed: swapResult.gasUsed
            });
          } else {
            // Need more USDC, sell WETH for USDC (zeroForOne=false)
            const wethToSell = Math.abs(wethDiff) / currentPrice;
            const wethWei = ethers.parseUnits(wethToSell.toFixed(18), 18);
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
          }
        }

        console.log(`   Holding in wallet (no liquidity)`);
      }

      this.lastSignal = signal;
      console.log(`\n✅ Trading cycle completed!`);
      console.log(`${'='.repeat(60)}\n`);

    } catch (error) {
      console.error(`\n❌ Trading failed:`, error.message);
      console.error(error);

      // Record failed transaction
      await Transaction.create({
        timestamp: new Date(),
        signal,
        txType: 'swap',
        status: 'failed',
        error: error.message,
        price: currentPrice
      });
    } finally {
      this.isExecuting = false;
    }
  }
}

export default TradingBot;
