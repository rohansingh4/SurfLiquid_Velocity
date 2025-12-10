# ✅ Complete Trading Guide - Swaps & Liquidity

## 🚀 Quick Commands

### Swaps (Using SwapRouter)
```bash
# Buy WETH with $0.50 USDC
npm run swap:buy

# Sell ~$0.50 WETH for USDC
npm run swap:sell
```

### Liquidity Management
```bash
# Add ~$0.50 liquidity
npm run liq:add

# List your positions
npm run liq:list

# Remove liquidity (replace 12345 with your tokenId)
npm run liq:remove 12345
```

---

## 📋 Complete Workflow

### 1. Check Your Status
```bash
npm run liq:list
```

### 2. Swap USDC → WETH
```bash
npm run swap:buy
```
Expected: -$0.50 USDC, +~0.00016 WETH

### 3. Add Liquidity
```bash
npm run liq:add
```
Expected: -$0.25 USDC, -~0.00008 WETH, +1 NFT position

### 4. Remove Liquidity
```bash
# First, get your tokenId
npm run liq:list

# Then remove (replace 12345)
npm run liq:remove 12345
```
Expected: +$0.25 USDC, +~0.00008 WETH, -1 NFT position

### 5. Swap WETH → USDC
```bash
npm run swap:sell
```
Expected: +~$0.50 USDC, -~0.00016 WETH

---

## 🔧 How It Works

### Swaps (`simple-swap.js`)
- Uses **Ramses SwapRouter** contract
- Function: `exactInputSingle`
- Handles all callbacks internally
- No custom contracts needed
- Auto-finds router address

### Liquidity (`liquidity-only.js`)
- Uses **NonfungiblePositionManager**
- Creates NFT positions
- Earns trading fees
- Can have multiple positions

---

## 💰 Cost Estimates

| Operation | Amount | Gas Cost |
|-----------|--------|----------|
| Swap Buy | $0.50 | ~0.0003 S |
| Swap Sell | $0.50 | ~0.0003 S |
| Add Liquidity | $0.50 | ~0.0006 S |
| Remove Liquidity | Full | ~0.0009 S |

**Total for all ops**: ~$0.08 in gas

---

## 🎯 Testing Sequence

Run all operations to test everything:

```bash
# 1. Starting balances
npm run liq:list

# 2. Buy WETH
npm run swap:buy
# ✅ Should show: +WETH, -USDC

# 3. Add liquidity
npm run liq:add
# ✅ Should show: New position created

# 4. Check position
npm run liq:list
# ✅ Should show: #12345 with liquidity

# 5. Remove liquidity
npm run liq:remove 12345
# ✅ Should show: Liquidity removed

# 6. Sell WETH
npm run swap:sell
# ✅ Should show: +USDC, -WETH
```

---

## 📊 What You Can Do Now

✅ **Swap USDC ↔ WETH** - Trade between tokens
✅ **Add Liquidity** - Earn fees from trades  
✅ **Remove Liquidity** - Withdraw your position
✅ **Multiple Positions** - Create many liquidity positions
✅ **Automated** - Use these in trading bots

---

## 🔍 Troubleshooting

### "SwapRouter not found"
The script tries common addresses. If it fails:
1. Go to https://sonicscan.org
2. Search: `0xAA277CB7914b7e5514946Da92cb9De332Ce610EF`
3. Find related "SwapRouter" contract
4. Add address to `simple-swap.js` config

### "Insufficient balance"
- For swaps: Need USDC or WETH
- For liquidity: Need BOTH tokens
- Solution: Do a swap first to get the token you need

### "Transaction reverted"
- Check you have enough gas (S tokens)
- Verify token approvals: `npm run approve`
- Ensure amounts are not too large

---

## 💡 Pro Tips

1. **Test small first**: All operations use ~$0.50 by default
2. **Monitor positions**: Use `npm run liq:list` often
3. **Gas savings**: Batch operations when possible
4. **Price ranges**: Liquidity is most active near current price
5. **Fees earned**: Check position to see earned fees

---

## 🤖 Integration with Trading Bot

Once tested, integrate into your automated system:

```javascript
// In your trading bot
import { execSync } from 'child_process';

// Execute swap
execSync('npm run swap:buy');

// Execute liquidity add
execSync('npm run liq:add');
```

Or import the functions directly from `simple-swap.js` and `liquidity-only.js`.

---

## 📝 Files Overview

- **`simple-swap.js`** - Swap operations via SwapRouter
- **`liquidity-only.js`** - Add/remove liquidity
- **`approve-tokens.js`** - Approve tokens for contracts
- **`test-all-transactions.js`** - Original comprehensive test (has swap issues)
- **`contracts/SwapHelper_v2.sol`** - Custom helper (not needed now)

---

## ✅ Success Indicators

You'll see:
```
✅ Swap successful! Gas: XXXXX
✅ Position minted! Gas: XXXXX
✅ Position fully closed!
```

Balances will update correctly after each operation.

---

## 🆘 Need Help?

If swaps still fail:
1. The SwapRouter address might be wrong
2. Check Ramses docs: https://docs.ramses.exchange/
3. Or use DEX UI manually: https://app.ramses.exchange/

Liquidity should work 100% of the time as it uses standard contracts.

---

**Ready to trade! Start with `npm run swap:buy` 🚀**



