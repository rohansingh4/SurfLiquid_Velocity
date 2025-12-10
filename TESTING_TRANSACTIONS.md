# Transaction Testing Guide

This guide explains how to test all transaction types (swaps, add/remove liquidity) on Ramses/Shadow DEX using small amounts (~$0.50).

## Prerequisites

1. **Deployed SwapHelper Contract** (required for swaps)
   ```bash
   # Deploy first if not done:
   # Use Remix IDE or Hardhat to deploy contracts/SwapHelper.sol
   # Then update .env with: SWAP_HELPER_ADDRESS=0x...
   ```

2. **Funded Wallet**
   - ~$2-3 USDC for testing
   - ~0.001 WETH for testing
   - ~0.05 S for gas fees

3. **Environment Configuration** (`.env`)
   ```bash
   SONIC_RPC_URL=https://your-sonic-rpc-url
   PRIVATE_KEY=your_private_key_here
   SWAP_HELPER_ADDRESS=0x...  # Your deployed SwapHelper
   POOL_ADDRESS=0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
   ```

## Quick Start

### View All Available Commands
```bash
node test-all-transactions.js help
```

### Check Your Positions
```bash
npm run test:positions
# or
node test-all-transactions.js positions
```

### Test Individual Operations

#### 1. Swap USDC → WETH ($0.50)
```bash
npm run test:swap-buy
# or
node test-all-transactions.js swap-usdc-to-weth
```

This will:
- Swap 0.50 USDC for WETH
- Use SwapHelper contract
- Apply 5% slippage protection
- Display before/after balances

#### 2. Swap WETH → USDC
```bash
npm run test:swap-sell
# or
node test-all-transactions.js swap-weth-to-usdc
```

This will:
- Swap ~0.00016 WETH for USDC (~$0.50 worth)
- Use SwapHelper contract
- Apply 5% slippage protection
- Display before/after balances

#### 3. Add Liquidity (~$0.50 total)
```bash
npm run test:add-liq
# or
node test-all-transactions.js add-liquidity
```

This will:
- Add 0.25 USDC + 0.00008 WETH (~$0.50 total)
- Create position with ±0.5% range around current price
- Mint NFT position token
- Display new position details

#### 4. Remove Liquidity
```bash
node test-all-transactions.js remove-liquidity <tokenId>
```

First, check your positions to get the tokenId:
```bash
npm run test:positions
```

Then remove the position:
```bash
node test-all-transactions.js remove-liquidity 12345
```

This will:
- Decrease liquidity to 0
- Collect all tokens
- Burn the NFT position
- Display final balances

### Run All Tests in Sequence
```bash
npm run test:all
# or
node test-all-transactions.js all
```

This will:
1. Swap USDC → WETH
2. Add liquidity position
3. Remove liquidity position (first position found)
4. Swap WETH → USDC

## Output Examples

### Successful Swap
```
======================================================================
🔄 SWAP: USDC → WETH
======================================================================
📤 Swapping 0.50 USDC for WETH
   ✅ USDC already approved
   Current Price: $3100.45
   Min Acceptable: $2945.43 (5% slippage)

   🔄 Executing swap...
   ⏳ Tx submitted: 0xabc123...
   ✅ Swap successful! Gas used: 145678

💼 Token Balances:
   USDC: 1.50 ($1.50)
   WETH: 0.000161
```

### Successful Add Liquidity
```
======================================================================
➕ ADD LIQUIDITY
======================================================================
   Current Price: $3100.45
   Current Tick: 83514
   Tick Spacing: 50
   Range: $3084.95 - $3115.95
   Ticks: 83450 - 83600
   USDC: 0.25
   WETH: 0.00008

   ✅ USDC already approved
   ✅ WETH already approved
   ➕ Minting position...
   ⏳ Tx submitted: 0xdef456...
   ✅ Position minted! Gas used: 234567
   📝 Transaction: 0xdef456...
   💡 Check your NFT positions for the new tokenId

📋 Your Liquidity Positions: 1
   #12345: Liquidity=12345678, Range=$3084.95-$3115.95
```

## Important Notes

### Amounts
All test amounts are intentionally small (~$0.50) to minimize risk:
- **USDC amounts**: 0.50 for swaps, 0.25 for liquidity
- **WETH amounts**: ~0.00016 for swaps, ~0.00008 for liquidity

### Slippage
- Swaps use **5% slippage tolerance** by default
- Adjust in the script if needed for volatile markets

### Gas Fees
Typical gas costs on Sonic:
- Swap: ~0.0003 S ($0.01-0.02)
- Add Liquidity: ~0.0006 S ($0.02-0.03)
- Remove Liquidity: ~0.0009 S total (3 transactions)

### Position Ranges
When adding liquidity, the script automatically:
- Calculates ±0.5% range around current price
- Rounds ticks to match pool's tick spacing
- Ensures position is "in range" for immediate fee earning

### NFT Position Manager
Liquidity positions are represented as NFTs:
- Each position has a unique `tokenId`
- You can have multiple positions
- Must fully remove liquidity before burning NFT
- NFTs are transferrable (use with caution)

## Troubleshooting

### "Insufficient balance"
**Problem**: Not enough tokens for the operation

**Solutions**:
1. Check balances: `npm run test:positions`
2. Swap some tokens first to balance your portfolio
3. Top up your wallet with more tokens

### "Transfer from owner failed"
**Problem**: Token not approved for contract

**Solutions**:
1. Script auto-approves, but check manually if needed
2. Ensure SwapHelper contract is deployed correctly
3. Verify wallet address matches deployed contract owner

### "SPL" or price limit error
**Problem**: Price moved too much / slippage exceeded

**Solutions**:
1. Increase slippage tolerance in script (currently 5%)
2. Try again immediately (price volatility)
3. Check pool has sufficient liquidity

### "Not the owner of position"
**Problem**: Trying to remove someone else's position

**Solutions**:
1. Run `npm run test:positions` to see YOUR positions
2. Only use tokenIds from your own positions

### "Position has no liquidity"
**Problem**: Position already withdrawn

**Solutions**:
1. Check position status: `npm run test:positions`
2. This position may have already been closed

## Advanced Usage

### Custom Amounts

Edit `test-all-transactions.js`:

```javascript
const config = {
  // ...
  testAmountUSDC: '1.00',    // Change from 0.50
  testAmountWETH: '0.00032', // Change from 0.00016
};
```

### Custom Slippage

In swap functions, modify:

```javascript
const minPrice = currentPrice * 0.90; // 10% instead of 5%
```

### Custom Liquidity Range

In `addLiquidity()` function:

```javascript
const lowerPrice = currentPrice * 0.99;  // ±1% instead of ±0.5%
const upperPrice = currentPrice * 1.01;
```

### Remove Multiple Positions

```bash
# Remove all positions in a loop
npm run test:positions  # Note the tokenIds
node test-all-transactions.js remove-liquidity 12345
node test-all-transactions.js remove-liquidity 12346
node test-all-transactions.js remove-liquidity 12347
```

## Integration with Trading Bot

This test script uses the same contracts and logic as the production trading bot:

1. **SwapHelper**: Used by both for executing swaps
2. **NonfungiblePositionManager**: Standard Uniswap V3 interface
3. **Pool Contract**: Direct interaction for price/state queries

After testing successfully:
1. Verify all transactions work as expected
2. Review gas costs
3. Enable automated trading with confidence

## Safety Checklist

Before running tests:
- [ ] `.env` file configured with correct addresses
- [ ] SwapHelper deployed and address in `.env`
- [ ] Wallet has sufficient token balances
- [ ] Wallet has sufficient S for gas (~0.05 S minimum)
- [ ] Using testnet/small amounts first
- [ ] Understand each operation before running

## Support

If issues persist:
1. Check Sonic network status
2. Verify RPC URL is working
3. Ensure contracts are deployed correctly
4. Review transaction on block explorer
5. Check pool liquidity is sufficient

## Contract Addresses (Sonic Mainnet)

```
USDC: 0x29219dd400f2bf60e5a23d13be72b486d4038894
WETH: 0x50c42deacd8fc9773493ed674b675be577f2634b
Pool: 0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
NonfungiblePositionManager: 0xAA277CB7914b7e5514946Da92cb9De332Ce610EF
SwapHelper: <YOUR_DEPLOYED_ADDRESS>
```

---

**⚠️ Important**: Always test with small amounts first. These are real blockchain transactions that cannot be reversed.



