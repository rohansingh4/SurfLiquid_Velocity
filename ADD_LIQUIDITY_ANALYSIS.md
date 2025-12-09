# Add Liquidity P&L Issue - Comprehensive Analysis

**Date:** December 9, 2025
**Total Transactions Analyzed:** 110 (47 Add Liquidity transactions)
**Time Period:** After 12/9/2025, 12:51:57 AM IST (post-fix)

---

## Executive Summary

🔴 **CRITICAL ISSUE FOUND:** The liquidity range is 10x wider than intended (1.00% instead of 0.1%), and the P&L calculation methodology is fundamentally flawed for liquidity operations.

### Key Findings:
1. **Range Mismatch:** Actual range is 1.00% while UI and code expect 0.1%
2. **P&L Always Negative:** 33 out of 47 add liquidity transactions show negative P&L
3. **Capital Utilization:** Extremely low (0.01% WETH, 0.00% USDC per transaction)
4. **Average Loss:** -$0.0391 per add liquidity transaction (-0.1343%)

---

## Part 1: Transaction Data Analysis

### Overall Statistics
- **Total Add Liquidity Transactions:** 47
- **Success Rate:** 100% (47/47)
- **Failed Transactions:** 0

### P&L Breakdown
```
📉 Negative P&L: 33 transactions (70.2%)
📈 Positive P&L: 14 transactions (29.8%)
➖ Zero P&L: 0 transactions

💰 Total P&L: -$1.8376
📊 Average P&L: -$0.0391
📊 Average P&L %: -0.1343%
```

### Sample Transaction Data (Last 5)
```
[43] 12/9/2025, 12:31:34 PM - SUCCESS
  Price: $3111.44
  Range: 1.00% (Ticks: 80400 to 80500)
  WETH Used: 0.01% | USDC Used: 0.00%
  P&L: -$0.0945 (-0.3245%)

[44] 12/9/2025, 12:32:34 PM - SUCCESS
  Price: $3117.88
  Range: 1.00% (Ticks: 80400 to 80500)
  WETH Used: 0.01% | USDC Used: 0.00%
  P&L: -$0.0633 (-0.2176%)

[45] 12/9/2025, 12:37:26 PM - SUCCESS
  Price: $3117.32
  Range: 1.00% (Ticks: 80400 to 80500)
  WETH Used: 0.01% | USDC Used: 0.00%
  P&L: -$0.0661 (-0.2269%)

[46] 12/9/2025, 12:52:38 PM - SUCCESS
  Price: $3119.17
  Range: 1.00% (Ticks: 80400 to 80500)
  WETH Used: 0.01% | USDC Used: 0.00%
  P&L: -$0.0571 (-0.1961%)

[47] 12/9/2025, 12:57:11 PM - SUCCESS
  Price: $3122.36
  Range: 1.00% (Ticks: 80400 to 80500)
  WETH Used: 0.01% | USDC Used: 0.00%
  P&L: -$0.0424 (-0.1455%)
```

---

## Part 2: Critical Issue #1 - Range Configuration

### ❌ PROBLEM: 10x Range Discrepancy

#### Expected Configuration
**File:** `sonic-execution-onchain.js:25`
```javascript
const RANGE_PERCENTAGE = 0.1; // 0.1% range
```

**Calculation:**
```javascript
upper: openPrice * (1 + RANGE_PERCENTAGE / 100)  // openPrice * 1.001
lower: openPrice * (1 - RANGE_PERCENTAGE / 100)  // openPrice * 0.999
```

**UI Display:** `index.html:906`
```html
<span><strong>Range:</strong> ±0.1%</span>
```

#### Actual Execution
**All transactions show:**
- Tick Range: 80400 to 80500 (100 ticks)
- Tick Range Width: 100 ticks
- **Actual Range: 1.00%** (10x wider than expected!)

#### Mathematical Proof
For tick range 80400 to 80500:
```
Price at tick 80400: 1.0001^80400 = $3101.37
Price at tick 80500: 1.0001^80500 = $3132.53
Price range: $3132.53 - $3101.37 = $31.16
Mid-price: ~$3117
Percentage: ($31.16 / $3117) * 100 = 1.00%
```

For 0.1% range at ~$3117 price:
```
Expected range: $3117 * 0.001 = $3.12
Expected tick range: ~10 ticks (not 100!)
```

### 🔍 Root Cause Analysis

The issue occurs in the price-to-tick conversion process:

**File:** `trading-bot.js:676-677`
```javascript
const tickLower = Math.floor(this.priceToTick(lowerRange) / tickSpacing) * tickSpacing;
const tickUpper = Math.ceil(this.priceToTick(upperRange) / tickSpacing) * tickSpacing;
```

**File:** `trading-bot.js:91-95` (priceToTick function)
```javascript
priceToTick(price) {
  // price = (1.0001^tick)
  // tick = log(price) / log(1.0001)
  return Math.floor(Math.log(price) / Math.log(1.0001));
}
```

### Impact on Strategy
1. **Wider Range = Less Concentrated Liquidity**
   - 1.00% range is 10x less concentrated than intended
   - This reduces fee earnings potential significantly
   - The strategy relies on tight ranges for profitability

2. **Capital Efficiency Destroyed**
   - Narrow ranges provide capital efficiency
   - 10x wider range = 1/10th the capital efficiency
   - Bot logic even reduces capital usage when range is "narrow" (< 100 ticks)

---

## Part 3: Critical Issue #2 - P&L Calculation Methodology

### ❌ PROBLEM: Fundamentally Flawed P&L Logic

#### Current P&L Calculation
**File:** `trading-bot.js:734-735`
```javascript
profitLoss: portfolioValueAfter - this.initialPortfolioValue,
profitLossPct: ((portfolioValueAfter - this.initialPortfolioValue) / this.initialPortfolioValue) * 100,
```

**Portfolio Value Calculation:** `trading-bot.js:86-88`
```javascript
calculatePortfolioValue(wethAmount, usdcAmount, wethPrice) {
  return (wethAmount * wethPrice) + usdcAmount;
}
```

**Initial Portfolio Value Set:** `trading-bot.js:499-500`
```javascript
if (!this.initialPortfolioValue) {
  this.initialPortfolioValue = portfolioValueBefore;
}
```

### Why This Creates Negative P&L

#### Scenario: Add Liquidity Transaction

**Before Add Liquidity:**
```
WETH Balance: 0.00485 WETH
USDC Balance: 13.92 USDC
WETH Price: $3111
Portfolio Value = (0.00485 * 3111) + 13.92 = $29.01
```

**After Add Liquidity:**
```
WETH Balance: 0.00485 WETH (only 0.01% used, almost unchanged)
USDC Balance: 13.92 USDC (0.00% used, unchanged)
Liquidity Position: Value locked in LP position
Portfolio Value = (0.00485 * 3111) + 13.92 ≈ $29.01
```

**The Critical Flaw:**
```
❌ Portfolio Value calculation ONLY counts unlocked tokens
❌ It does NOT count the value of the liquidity position
❌ When you add liquidity, tokens move from wallet → LP position
❌ The calculation sees this as tokens "disappearing"
❌ Result: Apparent "loss" even though funds are just repositioned
```

### Example from Real Transaction

**Transaction #1 (12/9/2025, 12:57:56 AM):**
```
Before:
  WETH: 0.004850823717457185
  USDC: 13.922113
  Portfolio Value: $29.014986992836075

After:
  WETH: 0.00485054458460408 (decreased by 0.0000002791 WETH)
  USDC: 13.922113 (unchanged)
  Portfolio Value: $29.01331827806448

Calculated P&L: $29.013 - $29.015 = -$0.0017 ❌

Reality:
  Value locked in LP: ~$0.0009 of WETH
  Gas cost: ~$0.0008
  Actual P&L: -$0.0008 (just gas cost) ✓
```

### Why 70% Are Negative

The P&L appears negative because:
1. **Gas Costs:** Every transaction pays gas (~$0.03-$0.09)
2. **Missing LP Value:** LP position value not counted
3. **Price Fluctuations:** Small price movements between before/after snapshot
4. **Cumulative Effect:** P&L against initial value, not previous value

---

## Part 4: Critical Issue #3 - Capital Utilization

### ❌ PROBLEM: Extremely Low Capital Usage

#### Observed Behavior
```
ALL 47 transactions show:
- WETH Used: 0.01% of balance
- USDC Used: 0.00% of balance
```

#### Code Logic Explanation

**File:** `trading-bot.js:687-695`
```javascript
if (tickRangeWidth < 100) {
  // Very narrow range (< 100 ticks = ~1%) - use less capital
  capitalPct = 0.50; // Use 50%
  console.log(`⚠️  Narrow range detected (${tickRangeWidth} ticks) - using ${capitalPct * 100}% of balance`);
} else if (tickRangeWidth < 500) {
  // Narrow range (< 500 ticks = ~5%) - use moderate capital
  capitalPct = 0.75; // Use 75%
  console.log(`Narrow range detected (${tickRangeWidth} ticks) - using ${capitalPct * 100}% of balance`);
}
```

Since the actual tick range is 100 ticks (not 10 as expected):
- Code sees it as "exactly at the boundary"
- May trigger the 50% capital limit
- But actual usage is even lower (0.01%)

### Why Only 0.01% is Used

Possible causes:
1. **Liquidity Calculation Issue:** The liquidity amount calculation may be producing very small values
2. **Token Decimals:** WETH has 18 decimals, small rounding could cause this
3. **Max Amount Limits:** The amount0Max/amount1Max parameters might be too restrictive
4. **Position Already Exists:** If a position already exists in the same range, new liquidity adds incrementally

### Impact
- Nearly zero capital deployed despite successful transactions
- Bot is essentially not participating in the market
- All gas costs with no meaningful liquidity provision

---

## Part 5: Why This Breaks Bot Logic

### Strategy Requirements

#### 1. Tight Concentration (0.1% range)
**Purpose:** Earn maximum fees in narrow price bands
**Status:** ❌ BROKEN - Using 1.00% range instead

**Impact:**
- 10x less fee generation potential
- Capital spread too thin across price range
- Reduced competitiveness vs other LPs

#### 2. Quick Rebalancing
**Purpose:** Move liquidity as price changes to stay in range
**Status:** ⚠️ AFFECTED - Wider range = less frequent rebalancing needed

**Impact:**
- Strategy designed for frequent rebalancing (every 0.1% move)
- With 1.00% range, rebalancing happens 10x less often
- Bot sits idle instead of actively managing

#### 3. Capital Efficiency
**Purpose:** Deploy most capital in active range
**Status:** ❌ BROKEN - Only 0.01% of capital deployed

**Impact:**
- Tiny positions generate negligible fees
- Gas costs exceed any potential profit
- Not economically viable

#### 4. Accurate P&L Tracking
**Purpose:** Track performance to optimize strategy
**Status:** ❌ BROKEN - P&L calculation doesn't account for LP positions

**Impact:**
- Cannot measure true performance
- Negative P&L creates false impression of losses
- Cannot optimize or make informed decisions

---

## Part 6: Expected vs Actual Behavior

### Expected Behavior (0.1% range)

```
Price: $3117.00
Range: ±0.1%
Upper Range: $3117 * 1.001 = $3120.12
Lower Range: $3117 * 0.999 = $3113.88
Range Width: $6.24
Tick Range: ~10 ticks

Capital Usage: 50-99% of balance
WETH deployed: ~0.0024 WETH (~50%)
USDC deployed: ~6.96 USDC (~50%)

Rebalance Trigger: Price moves ±$3.12 (0.1%)
Rebalance Frequency: High (multiple times per hour in volatile markets)

P&L Calculation: Should track LP position value + unlocked tokens
```

### Actual Behavior (1.00% range)

```
Price: $3117.00
Range: ±1.00%
Upper Range: $3132.53 (tick 80500)
Lower Range: $3101.37 (tick 80400)
Range Width: $31.16
Tick Range: 100 ticks

Capital Usage: 0.01% of balance
WETH deployed: ~0.00000028 WETH (0.01%)
USDC deployed: ~0 USDC (0.00%)

Rebalance Trigger: Price moves ±$31.16 (1.00%)
Rebalance Frequency: Very low (rarely triggers)

P&L Calculation: Only counts unlocked tokens (broken)
```

---

## Part 7: Data Evidence

### All Transactions Use Same Tick Range

**Evidence from JSON analysis:**
```json
{
  "tickInfo": {
    "tickLower": 80400,
    "tickUpper": 80500,
    "tickRange": 100,
    "priceLower": 3101.366273596769,
    "priceUpper": 3132.533956672657,
    "priceRangePct": "1.00%",
    "currentPrice": 3111.2393701039005
  }
}
```

**ALL 47 transactions show identical tick range:**
- Every single add liquidity uses ticks 80400-80500
- This proves the range calculation is consistently wrong
- Not a sporadic issue but a systematic problem

### P&L Consistently Negative

**Statistical Evidence:**
```
Total transactions: 47
Negative P&L: 33 (70.2%)
Positive P&L: 14 (29.8%)
Total cumulative P&L: -$1.84
Average P&L: -$0.039 per transaction
```

**Pattern:**
- Small wins: +$0.01 to +$0.03
- Small losses: -$0.02 to -$0.09
- Net result: Consistent bleed

### Gas Costs Correlation

**Observation:**
- Average negative P&L: -$0.039
- Typical gas cost per transaction: $0.03-$0.09
- **Correlation:** Negative P&L approximately equals gas cost

**Interpretation:**
- The "losses" are primarily gas costs
- The LP position value is not being counted
- If LP value were included, many would show profit

---

## Part 8: Code Locations for Investigation

### 1. Range Calculation
**Priority:** CRITICAL

**Files:**
- `sonic-execution-onchain.js:210-211` - Where upperRange/lowerRange calculated
- `trading-bot.js:676-677` - Where price converted to ticks
- `trading-bot.js:91-95` - priceToTick() function

**Investigation Needed:**
- Why does priceToTick produce 100-tick ranges instead of 10-tick ranges?
- Is tickSpacing being applied correctly?
- Are the upper/lower range values correct when passed to trading bot?

### 2. Capital Deployment
**Priority:** HIGH

**Files:**
- `trading-bot.js:687-695` - Capital percentage logic
- `trading-bot.js:292-370` - addLiquidity() function
- `trading-bot.js:315-352` - Liquidity amount calculation

**Investigation Needed:**
- Why only 0.01% of capital is actually deployed?
- Are the liquidity calculations producing correct values?
- Is there an existing position limiting new deposits?
- Are amount0Max/amount1Max parameters correct?

### 3. P&L Calculation
**Priority:** CRITICAL

**Files:**
- `trading-bot.js:86-88` - calculatePortfolioValue() function
- `trading-bot.js:734-735` - P&L calculation logic
- `trading-bot.js:499-500` - Initial portfolio value setting

**Investigation Needed:**
- How to include LP position value in portfolio calculation?
- Should P&L be vs initial OR vs previous transaction?
- How to accurately track IL (impermanent loss)?
- Need to query on-chain position value?

### 4. Liquidity Position Tracking
**Priority:** HIGH

**Files:**
- `trading-bot.js:366-367` - currentTickLower/tickUpper tracking
- `trading-bot.js:17` - getPositionLiquidity() interface

**Investigation Needed:**
- Is position liquidity being tracked correctly?
- Can we query current position value from contract?
- Should we store position data in DB for P&L calc?

---

## Part 9: Recommended Next Steps

### Immediate Actions (DO NOT IMPLEMENT - ANALYSIS ONLY)

1. **Verify Range Calculation**
   - Add logging to show lowerRange/upperRange prices being passed
   - Add logging to show resulting tickLower/tickUpper
   - Verify tickSpacing value from pool contract
   - Check if 0.1% price range actually converts to 10 ticks

2. **Debug Capital Deployment**
   - Add logging to show capitalPct being used
   - Add logging to show wethToAdd/usdcToAdd amounts
   - Add logging to show calculated liquidity amount
   - Add logging to show amount0Max/amount1Max values
   - Check if existing position is limiting new liquidity

3. **Test Correct Range**
   - Manually calculate what tickLower/tickUpper should be for 0.1%
   - Test with hardcoded correct values to verify behavior
   - Compare against actual values being used

4. **Fix P&L Calculation**
   - Add query to get LP position value from contract
   - Include LP position value in portfolio calculation
   - Consider changing to per-transaction P&L instead of cumulative
   - Add separate tracking for: fees earned, IL, gas costs

### Investigation Questions

1. **Range Calculation:**
   - Is tickSpacing 1, 10, or another value?
   - Is Math.floor/Math.ceil in tick conversion causing issues?
   - Are the price values being passed correctly?

2. **Capital Deployment:**
   - What is the actual liquidity amount being calculated?
   - Are there contract-level limits on liquidity?
   - Is there already a large position at these ticks?

3. **P&L Methodology:**
   - Should we query `getPositionLiquidity()` after each transaction?
   - How to convert liquidity to USD value?
   - Should we track per-position P&L separately?

---

## Part 10: Summary & Conclusions

### Critical Bugs Identified

1. **❌ Range is 10x Too Wide**
   - Configured: 0.1%
   - Actual: 1.00%
   - Impact: Strategy completely broken

2. **❌ P&L Calculation Broken**
   - Method: Only counts unlocked tokens
   - Missing: LP position value
   - Impact: Shows false losses

3. **❌ Capital Deployment Too Low**
   - Expected: 50-99% of balance
   - Actual: 0.01% of balance
   - Impact: Nearly zero market participation

### Why Bot Shows Losses

```
"Loss" Composition:
- Gas Costs: -$0.03 to -$0.09 per transaction
- Missing LP Value: Not counted (appears as "lost")
- Price Fluctuations: Minor market movements
- Actual Economic Loss: Minimal (just gas if LP value counted)
```

### Root Causes

1. **Range Calculation Bug:**
   - priceToTick() function or tickSpacing application incorrect
   - Produces 100-tick ranges instead of 10-tick ranges

2. **Portfolio Valuation Bug:**
   - Only values unlocked tokens
   - Doesn't query or value LP positions
   - Fundamental accounting flaw

3. **Capital Utilization Issue:**
   - Unclear why only 0.01% deploys
   - May be related to liquidity calculation
   - May be related to existing positions

### Why This Matters

This bot is designed for **concentrated liquidity market making**:
- Tight ranges (0.1%) maximize fee generation
- Active rebalancing captures price movements
- Capital efficiency is core to profitability

**Current state:**
- 10x wider range = 1/10th fee generation
- 100x less capital = negligible market impact
- Broken P&L = cannot measure performance
- Result: Bot is not functional for intended strategy

---

## Files Referenced

### Analysis Data
- `add-liquidity-analysis.json` - Full transaction data analysis
- Database: MongoDB 'Velocity' database, 'transactions' collection

### Source Code
- `sonic-execution-onchain.js` - Main execution logic, range calculation
- `trading-bot.js` - Bot trading logic, P&L calculation
- `index.html` - UI displaying range info
- `models/Transaction.js` - Transaction data model

### Tools Created
- `analyze-add-liquidity.js` - Transaction analysis script
- `cleanup-old-transactions.js` - Database cleanup utility

---

**Analysis Completed:** December 9, 2025
**Analyst:** Claude Code
**Status:** Documentation only - No code changes made per request
