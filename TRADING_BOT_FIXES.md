# Trading Bot Fixes - Dec 9, 2025

## 🎯 Summary

Fixed add liquidity failures by restoring proven parameters and adding intelligent retry logic. Bot had 48 successful transactions overnight (Dec 8-9) but started failing after MAX_LIQUIDITY cap was removed.

## ✅ Changes Made

### 1. **Capital Deployment: 95% → Improved Success Rate**
- **Before:** 98% of balance
- **After:** 95% of balance
- **Why:** Provides 5% safety buffer for gas, rounding errors, and successful transaction submission
- **File:** `trading-bot.js` line 815

```javascript
// Use 95% of balance with 5% safety buffer
const capitalPct = 0.95;
```

### 2. **MAX_LIQUIDITY Cap Restored**
- **Before:** No cap (removed in "narrow tick rate" commit)
- **After:** 1 trillion cap (1000000000000n)
- **Why:** All 48 successful overnight transactions used this cap
- **File:** `trading-bot.js` lines 423-428

```javascript
const MAX_LIQUIDITY = 1000000000000n; // 1 trillion
if (liquidityAmount > MAX_LIQUIDITY) {
  liquidityAmount = MAX_LIQUIDITY;
}
```

### 3. **Intelligent Retry Logic**
- **Before:** Retried with same parameters (all 3 attempts failed identically)
- **After:** Reduces liquidity by 2%, 4% on retries to avoid precision errors
- **Why:** Error 0xe450d38c showed 6592 wei precision mismatch
- **File:** `trading-bot.js` lines 430-435

```javascript
// On retry attempts, reduce liquidity slightly to avoid precision errors
if (attempt > 1) {
  const reductionPct = BigInt(attempt - 1) * 2n; // Reduce by 2%, 4%
  liquidityAmount = (liquidityAmount * (100n - reductionPct)) / 100n;
}
```

### 4. **Separate Write RPC Support**
- **Before:** Single RPC for both reads (every 3s) and writes (transactions)
- **After:** Optional separate RPC for write operations
- **Why:** Reduces rate limiting - reads don't interfere with transaction submission
- **Files:** `trading-bot.js`, `sonic-execution-onchain.js`

**Usage in .env:**
```bash
# Primary RPC for reading pool data (every 3s)
SONIC_RPC_URL=https://sonic-mainnet.g.alchemy.com/v2/YOUR_KEY_1

# Optional: Separate RPC for writing transactions (reduces rate limiting)
SONIC_WRITE_RPC_URL=https://sonic-mainnet.g.alchemy.com/v2/YOUR_KEY_2
```

## 📊 Root Cause Analysis

### Timeline of Failures
- **Dec 8 7:30 PM → Dec 9 8:17 AM:** ✅ 48 successful (with MAX_LIQUIDITY cap)
- **Dec 9 10:50 AM onwards:** ❌ 2 failed (after cap was removed)

### The Bug
Commit "narrow tick rate" (053aac5) removed the MAX_LIQUIDITY cap:

```javascript
// REMOVED (was working):
const MAX_LIQUIDITY = 1000000000000n;
if (liquidityAmount > MAX_LIQUIDITY) {
  liquidityAmount = MAX_LIQUIDITY;
}

// ADDED (caused failures):
// Let the contract enforce its own liquidity limits
// No artificial cap
```

### Error Analysis
Failed transactions showed error `0xe450d38c`:
- Amount needed:   9665579469670033 wei
- Amount provided: 9665579469676625 wei
- **Difference: 6592 wei** (tiny precision error!)

The cap was preventing these precision errors by limiting liquidity to a known-good value.

## 🔬 Testing Strategy

### Verify These Improvements:

1. **95% Capital Deployment**
   - Check logs: "Using 95% of balance"
   - Verify: WETH deployed ≈ balance * 0.95
   - Verify: USDC deployed ≈ balance * 0.95

2. **MAX_LIQUIDITY Cap**
   - Check logs: "Using liquidity amount: 1000000000000"
   - If calculated > 1T, should see: "Calculated liquidity X exceeds max, capping at 1000000000000"

3. **Retry Logic**
   - If first attempt fails, check logs:
     - Attempt 2: "Reducing liquidity by 2% to X"
     - Attempt 3: "Reducing liquidity by 4% to X"
   - Should succeed on retry with reduced amount

4. **Separate Write RPC** (optional)
   - Add SONIC_WRITE_RPC_URL to .env
   - Check startup logs: "Using separate Write RPC to reduce rate limiting"
   - Verify: No rate limit errors during high-frequency operation

## 🎯 Expected Behavior

- **Add Liquidity:** Should succeed with 1T liquidity and 95% balance
- **Range:** 100 ticks (1%) as configured
- **Signals:** Bot responds to AI signals from positions collection
- **Success Rate:** Should match overnight performance (48/48 = 100%)

## 📝 Files Modified

1. `trading-bot.js`
   - Line 815: Changed capitalPct from 0.98 to 0.95
   - Lines 423-435: Added MAX_LIQUIDITY cap and retry reduction logic
   - Lines 29-57: Added writeProvider support

2. `sonic-execution-onchain.js`
   - Line 22: Added SONIC_WRITE_RPC_URL configuration
   - Lines 75-95: Pass writeProvider to TradingBot

## 🚀 Deployment

```bash
# Commit changes
git add trading-bot.js sonic-execution-onchain.js TRADING_BOT_FIXES.md
git commit -m "Fix: Restore MAX_LIQUIDITY cap + 95% deployment + retry logic"

# Push to main
git push origin main

# Deploy on AWS
# SSH into AWS instance
ssh ubuntu@<AWS_IP>

# Pull latest changes
cd ~/SurfLiquid_Velocity
git pull origin main

# Optionally add write RPC to .env
nano .env
# Add: SONIC_WRITE_RPC_URL=https://sonic-mainnet.g.alchemy.com/v2/YOUR_KEY_2

# Restart bot
pm2 restart velocity

# Monitor logs
pm2 logs velocity --lines 50
```

## 💡 Key Insights

1. **The MAX_LIQUIDITY cap was not arbitrary** - it was a proven safety mechanism that worked for 48 transactions
2. **Precision errors are real** - 6592 wei difference caused transaction failure
3. **Retry with adjustment is better than retry with same parameters**
4. **Separate RPC for reads/writes prevents rate limiting** - reads happen every 3s, writes are ad-hoc
5. **95% deployment gives enough buffer** for gas and rounding errors while still deploying substantial capital

## ✅ Success Criteria

- ✅ Add liquidity succeeds on first or second attempt
- ✅ No error 0xe450d38c (precision error)
- ✅ ~95% of balance deployed
- ✅ 100 tick range maintained
- ✅ AI signals respected and executed
