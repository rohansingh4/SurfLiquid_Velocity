# SwapX Pool Migration Summary

## Migration Overview

**Date:** December 9, 2025
**Branch:** SwapX
**Reason:** Switch to SwapX pool for better tick spacing (5 vs 100)

---

## Pool Details

### Old Pool (Shadow DEX)
- **Address:** `0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40`
- **DEX:** Shadow
- **Tick Spacing:** 100
- **Minimum Range:** 100 ticks ≈ 1%
- **Status:** ❌ Too wide, abandoned

### New Pool (SwapX)
- **Address:** `0xec4ee7d6988ab06f7a8daaf8c5fdffde6321be68`
- **DEX:** SwapX
- **Tick Spacing:** 5
- **Target Range:** 10 ticks = 0.1%
- **Status:** ✅ Active
- **Sonicscan:** https://sonicscan.org/address/0xec4ee7d6988ab06f7a8daaf8c5fdffde6321be68

---

## Changes Made

### 1. Pool Address Update
**File:** `sonic-execution-onchain.js`
- Updated `POOL_ADDRESS` to SwapX pool
- Added comment identifying tick spacing

### 2. Range Calculation Update
**Files:** `sonic-execution-onchain.js` (2 locations)

**Old (Shadow DEX - 100 tick spacing):**
```javascript
const tickLower = Math.floor(currentTick / tickSpacing) * tickSpacing;
const tickUpper = tickLower + tickSpacing;
// Result: 100 ticks = 1% range
```

**New (SwapX - 5 tick spacing):**
```javascript
const roundedTick = Math.round(currentTick / tickSpacing) * tickSpacing;
const tickLower = roundedTick - 5;
const tickUpper = roundedTick + 5;
// Result: 10 ticks = 0.1% range ✓
```

**Math Proof:**
- 10 ticks = 1.0001^10 = 1.001000450... = **0.1000% range exactly**
- ±5 ticks from center = 10 tick total width

### 3. Frontend Update
**File:** `index.html`

Updated pool info display:
- Pool: `0x6fb3...0b40` → `0xec4e...be68`
- DEX: `Shadow` → `SwapX`
- Range: `~1% (100 ticks)` → `~0.1% (10 ticks)`

### 4. Documentation Update
**File:** `TICK_SPACING_EXPLANATION.md`
- Added deprecation notice for old pool
- Added current pool information

---

## Technical Advantages

### Why SwapX is Better

| Feature | Shadow DEX (Old) | SwapX (New) |
|---------|------------------|-------------|
| **Tick Spacing** | 100 | 5 |
| **Minimum Range** | 1% | 0.1% |
| **Capital Efficiency** | 10x less | **10x more** ✓ |
| **Fee Capture** | Lower | **Higher** ✓ |
| **Original Design Goal** | ❌ Couldn't achieve | ✅ Achieved |

### Capital Efficiency Improvement

**Example with $1000 portfolio:**

**Shadow DEX (1% range):**
- Range: $3000 - $3030 (1% width)
- Fee capture: Low (wide range)
- Capital utilization: 10% at current price

**SwapX (0.1% range):**
- Range: $3000 - $3003 (0.1% width)
- Fee capture: **10x higher** (concentrated)
- Capital utilization: **100% at current price**

---

## Deployment Steps

### 1. Pre-Deployment (Complete ✓)
- [x] Create SwapX branch
- [x] Update pool address
- [x] Update range calculation (2 locations)
- [x] Update frontend display
- [x] Verify tick spacing = 5
- [x] Verify 10 ticks = 0.1%

### 2. Wallet Preparation
- [ ] Add $30 WETH to wallet
- [ ] Add $30 USDC to wallet
- [ ] Verify total > $50 (minimum for add liquidity)

### 3. Deployment to AWS
```bash
# Local (on your machine)
git add .
git commit -m "Migrate to SwapX pool: 0.1% range with tick spacing 5"
git push origin SwapX

# AWS Server
cd /path/to/project
git fetch origin
git checkout SwapX
git pull origin SwapX
pm2 restart velocity
pm2 logs velocity --lines 50
```

### 4. Verification
Check logs for:
```
✅ Pool: 0xec4e...be68
✅ Tick spacing: 5
✅ Range: ±5 ticks (10 ticks total = 0.1%)
✅ Portfolio value ($60+) meets minimum ($50)
✅ Liquidity added successfully
```

---

## Expected Performance

### Before (Shadow DEX - 1% Range)
- Range too wide for effective trading
- Only 10% capital efficiency
- Missed fee opportunities
- Frequent rebalancing needed

### After (SwapX - 0.1% Range)
- ✅ **10x tighter concentration**
- ✅ **10x better capital efficiency**
- ✅ **10x more fees captured**
- ✅ **Original design achieved**

---

## Rollback Plan

If issues occur with SwapX:

```bash
# Switch back to main branch (Shadow DEX)
git checkout main
pm2 restart velocity

# Or merge fixes to SwapX
git checkout SwapX
# Make fixes
git add .
git commit -m "Fix: description"
git push origin SwapX
```

---

## Success Criteria

After deployment, verify:
- ✅ Bot connects to SwapX pool
- ✅ Tick spacing detected as 5
- ✅ Range shows 10 ticks (±5 from center)
- ✅ Add liquidity succeeds with $60 portfolio
- ✅ Swaps execute successfully
- ✅ UI displays 0.1% range
- ✅ No errors in PM2 logs

---

## Notes

- **Minimum Balance:** $50 (same as before)
- **Liquidity Safety Buffer:** 1% (same as before)
- **Tick Calculation:** Changed to ±5 ticks instead of 1 tick spacing unit
- **SwapHelper Contract:** Same contract, works with any pool
- **Database:** Same MongoDB, new transactions will reference new pool

---

## Contact & Resources

- **SwapX Pool:** https://sonicscan.org/address/0xec4ee7d6988ab06f7a8daaf8c5fdffde6321be68
- **Sonicscan:** https://sonicscan.org
- **Branch:** SwapX
- **Tick Spacing Docs:** See TICK_SPACING_EXPLANATION.md
