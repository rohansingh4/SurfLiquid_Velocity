# Base Pool Testing Guide

## Pool Information
- **Pool Address**: `0xd0b53d9277642d899df5c87a3966a349a798f224`
- **Token0 (WETH)**: `0x4200000000000000000000000000000000000006` (18 decimals)
- **Token1 (USDC)**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- **Fee**: 500 (0.05%)
- **Tick Spacing**: 10
- **Current Tick**: -196754

## Deployment Steps (Remix)

### 1. Deploy Contract
1. Open Remix IDE: https://remix.ethereum.org
2. Create a new file `BasePoolHelper.sol` and paste the contract code
3. Compile with Solidity 0.7.6
4. Switch to Base network in MetaMask
5. Deploy with constructor parameter: `0xd0b53d9277642d899df5c87a3966a349a798f224`
6. Save the deployed contract address

### 2. Prepare Tokens

You'll need:
- **WETH**: ~0.01 ETH worth (~$30-40 at current prices)
- **USDC**: ~$60

#### Get WETH:
- WETH Address: `0x4200000000000000000000000000000000000006`
- Wrap ETH to WETH (use a DEX like Uniswap on Base, or call `deposit()` on WETH contract)

#### Get USDC:
- USDC Address: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Bridge from another chain or buy on Base DEX

### 3. Approve Tokens
Before any operation, approve the BasePoolHelper contract to spend your tokens:

```javascript
// In Remix or Web3:
// For WETH (approve 1 WETH = 1e18)
WETH.approve(basePoolHelperAddress, "1000000000000000000")

// For USDC (approve 100 USDC = 100e6)
USDC.approve(basePoolHelperAddress, "100000000")
```

## Test 1: Add Liquidity

### Calculate Tick Range
Current tick: -196754
- Lower tick: -196760 (must be multiple of 10)
- Upper tick: -196740 (must be multiple of 10)

### Parameters:
```javascript
tickLower: -196760
tickUpper: -196740
amount0Desired: "5000000000000000" // 0.005 WETH
amount1Desired: "20000000" // 20 USDC
liquidityAmount: "1000000" // Start with small liquidity amount
```

### Expected Result:
- Contract should add liquidity to the pool
- You'll receive a position with specified ticks
- Unused tokens will be returned to you

## Test 2: Execute Swap

### Swap USDC for WETH:
```javascript
tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC
tokenOut: "0x4200000000000000000000000000000000000006" // WETH
amountIn: "10000000" // 10 USDC
sqrtPriceLimitX96: "4295128739" // Min price (or use 0 for no limit)
```

### Swap WETH for USDC:
```javascript
tokenIn: "0x4200000000000000000000000000000000000006" // WETH
tokenOut: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" // USDC
amountIn: "1000000000000000" // 0.001 WETH
sqrtPriceLimitX96: "1461446703485210103287273052203988822378723970342" // Max price (or use max uint160)
```

### Expected Result:
- Contract swaps the input token for output token
- Output tokens sent directly to your wallet
- Swap event emitted with amounts

## Test 3: Remove Liquidity

### Get Position Info First:
```javascript
// Call getUserPositionCount(yourAddress)
// Call getUserPosition(yourAddress, 0) to get first position details
```

### Remove Liquidity:
```javascript
tickLower: -196760 // From your position
tickUpper: -196740 // From your position
liquidityAmount: "1000000" // Amount you added (or partial)
```

### Expected Result:
- Liquidity is burned from the pool
- You receive WETH and USDC tokens
- Position is closed (if removing all liquidity)

## Helper Functions

### Check Pool Info:
```javascript
getPoolInfo()
// Returns: token0, token1, fee, tickSpacing, sqrtPriceX96, tick
```

### Check Position:
```javascript
getPositionInfo(tickLower, tickUpper)
// Returns: liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1
```

### Check Token Balance:
```javascript
getTokenBalance(tokenAddress)
// Returns balance of token held by contract
```

## Troubleshooting

### Common Issues:

1. **"STF" (SafeTransferFrom failed)**
   - Make sure you approved tokens first
   - Check you have enough balance

2. **"LOK" (Locked)**
   - Pool is currently locked by another transaction
   - Wait and try again

3. **"TLU" (TickLower >= TickUpper)**
   - Make sure tickLower < tickUpper
   - Both must be multiples of tickSpacing (10)

4. **"M0" or "M1" (Mint failed)**
   - Not enough tokens transferred
   - Increase amount0Desired or amount1Desired

5. **Price Limit Issues in Swap**
   - For USDC→WETH: use very small sqrtPriceLimitX96 (like "4295128739")
   - For WETH→USDC: use very large sqrtPriceLimitX96 (like max uint160)

## Important Notes

1. **Tick Spacing**: All ticks MUST be multiples of 10
2. **Slippage**: Consider price impact when swapping
3. **Gas**: Keep some ETH for gas fees
4. **Testing**: Start with small amounts first!
5. **Fees**: Pool has 0.05% fee, you'll earn fees as LP

## Price Calculation

Current tick -196754 means:
- Price = 1.0001^(-196754) ≈ 0.000473 WETH/USDC
- Or ~2114 USDC/WETH (~$2114 per ETH)

## Expected Costs

- **Add Liquidity**: ~$5-10 in USDC + 0.002-0.005 WETH
- **Swap**: $10-20 USDC or 0.005-0.01 WETH
- **Remove Liquidity**: No additional tokens needed
- **Gas**: ~0.001-0.002 ETH per transaction on Base
