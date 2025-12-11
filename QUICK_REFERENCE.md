# Quick Reference - Transaction Testing

## 🚀 Quick Commands

```bash
# Check balances and positions
npm run test:positions

# Swap $0.50 USDC → WETH
npm run test:swap-buy

# Swap ~$0.50 WETH → USDC  
npm run test:swap-sell

# Add ~$0.50 liquidity
npm run test:add-liq

# Remove liquidity (need tokenId from positions)
node test-all-transactions.js remove-liquidity <tokenId>

# Run all tests in sequence
npm run test:all
```

## 📋 Operation Checklist

Before running transactions:
- [ ] `.env` configured with `SWAP_HELPER_ADDRESS`
- [ ] Wallet has ~$2 USDC
- [ ] Wallet has ~0.001 WETH
- [ ] Wallet has ~0.05 S for gas

## 🔄 Typical Test Flow

1. **Check starting balances**
   ```bash
   npm run test:positions
   ```

2. **Test swap (buy WETH)**
   ```bash
   npm run test:swap-buy
   ```
   Expected: -$0.50 USDC, +~0.00016 WETH

3. **Add liquidity**
   ```bash
   npm run test:add-liq
   ```
   Expected: -$0.25 USDC, -~0.00008 WETH, +1 NFT position

4. **Check positions**
   ```bash
   npm run test:positions
   ```
   Note the tokenId (e.g., #12345)

5. **Remove liquidity**
   ```bash
   node test-all-transactions.js remove-liquidity 12345
   ```
   Expected: +$0.25 USDC, +~0.00008 WETH, -1 NFT position

6. **Test swap (sell WETH)**
   ```bash
   npm run test:swap-sell
   ```
   Expected: +~$0.50 USDC, -~0.00016 WETH

## 💰 Test Amounts

| Operation | USDC | WETH | Total Value |
|-----------|------|------|-------------|
| Swap Buy  | -0.50 | +0.00016 | ~$0.50 |
| Swap Sell | +0.50 | -0.00016 | ~$0.50 |
| Add Liq   | -0.25 | -0.00008 | ~$0.50 |
| Remove Liq | +0.25 | +0.00008 | ~$0.50 |

## ⚡ Gas Costs (Sonic)

- Swap: ~0.0003 S (~$0.01)
- Add Liquidity: ~0.0006 S (~$0.02)
- Remove Liquidity: ~0.0009 S (~$0.03)
- Total for all ops: ~0.002 S (~$0.06)

## 🛠️ Contract Addresses

```bash
# Add to .env
POOL_ADDRESS=0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
SWAP_HELPER_ADDRESS=<your_deployed_address>

# Built-in addresses (hardcoded):
USDC: 0x29219dd400f2bf60e5a23d13be72b486d4038894
WETH: 0x50c42deacd8fc9773493ed674b675be577f2634b
NFT_POSITION_MGR: 0xAA277CB7914b7e5514946Da92cb9De332Ce610EF
```

## 🔍 View Transaction Details

After any transaction, check:
```
Tx Hash: https://sonicscan.org/tx/<your_tx_hash>
```

## ⚠️ Common Errors

| Error | Meaning | Solution |
|-------|---------|----------|
| "Insufficient balance" | Not enough tokens | Check balances, swap to rebalance |
| "Transfer failed" | Token not approved | Script auto-approves, check SwapHelper deployed |
| "SPL" / Price limit | Slippage exceeded | Price moved >5%, try again |
| "Not owner" | Not your position | Check `test:positions` for your tokenIds |

## 🎯 Success Indicators

You'll see:
```
✅ Swap successful! Gas used: 145678
✅ Position minted! Gas used: 234567
✅ Position fully closed!
```

## 📊 Check Results

After operations, verify:
1. Balances changed as expected
2. Transaction hash shows "Success" on explorer
3. Gas fees were reasonable
4. Positions list updated correctly

## 🔐 Safety Notes

- ⚠️ These are **REAL transactions** on mainnet
- ✅ Amounts kept small (~$0.50) to minimize risk
- ✅ Always test individual operations first
- ✅ Use `npm run test:all` only after verifying each works
- ✅ Keep private key secure, never commit to git

## 📚 More Info

- Full guide: [TESTING_TRANSACTIONS.md](./TESTING_TRANSACTIONS.md)
- Main README: [README.md](./README.md)
- Webhook setup: [WEBHOOK_SETUP.md](./WEBHOOK_SETUP.md)





