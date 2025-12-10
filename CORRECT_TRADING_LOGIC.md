# Correct Trading Bot Logic

## Current Problem
Bot removes and re-adds liquidity on EVERY signal, even if signal hasn't changed.

## Correct Logic (Option A + User Clarification)

### Decision Tree:

```
1. Check: Has signal CHANGED? (lastSignal != currentSignal)
   YES → REBALANCE (Remove LP → Swap → Add LP)
   NO → Go to step 2

2. Check: Is price OUT OF RANGE?
   NO → HOLD (do nothing, keep earning fees)
   YES → Go to step 3

3. Check: Which direction is price out of range?

   a) Price < Lower Range (out of range DOWNWARD):
      → Remove LP
      → Swap to latest ratio
      → HOLD (don't add LP back)
      → Set signal = "Monitoring" or "Out-of-Range-Down"

   b) Price > Upper Range (out of range UPWARD):
      → Remove LP
      → Swap to target ratio
      → Add LP in new range
      → Continue with current signal
```

## Example Scenarios:

### Scenario 1: Signal Stays Same, Price In Range
```
Current Signal: Open-UP
Last Signal: Open-UP
Price: $3110 (Range: $3101 - $3132)
Action: HOLD - Do nothing, keep earning fees ✅
```

### Scenario 2: Signal Changes
```
Current Signal: Open-DOWN
Last Signal: Open-UP
Price: $3110 (Range: $3101 - $3132)
Action: Remove LP → Swap to new ratio → Add LP in new range ✅
```

### Scenario 3: Price Out of Range Downward
```
Current Signal: Open-UP
Last Signal: Open-UP
Price: $3095 (Range: $3101 - $3132) ← Below lower range!
Action: Remove LP → Swap to latest ratio → HOLD (no add LP) ✅
```

### Scenario 4: Price Out of Range Upward
```
Current Signal: Open-UP
Last Signal: Open-UP
Price: $3145 (Range: $3101 - $3132) ← Above upper range!
Action: Remove LP → Swap to target ratio → Add LP in new range ✅
```

## Code Changes Needed:

### 1. Add condition to check if signal changed:
```javascript
// At start of processSignal:
const signalChanged = (this.lastSignal !== signal);
const priceInRange = (currentPrice >= lowerRange && currentPrice <= upperRange);

console.log(`   Signal Changed: ${signalChanged}`);
console.log(`   Price In Range: ${priceInRange} ($${currentPrice.toFixed(2)} in $${lowerRange.toFixed(2)} - $${upperRange.toFixed(2)})`);

// Decision logic:
if (!signalChanged && priceInRange && this.hasLiquidity) {
  console.log(`   ✅ Signal unchanged & price in range → HOLD position`);
  this.lastSignal = signal; // Update last signal
  return; // Do nothing, keep earning fees
}
```

### 2. Handle out of range downward:
```javascript
if (!signalChanged && currentPrice < lowerRange && this.hasLiquidity) {
  console.log(`   ⚠️  Price below range → Remove LP, Swap, HOLD`);

  // Remove LP
  await this.removeLiquidity();

  // Swap to target ratio
  await this.swapToTargetRatio(targetWethPct, targetUsdcPct, currentPrice);

  // HOLD - don't add LP back
  this.lastSignal = 'Out-of-Range-Down';
  return;
}
```

### 3. Update lastSignal at end:
```javascript
// At end of successful processSignal:
this.lastSignal = signal;
```

## State Tracking:

### Variables to track:
- `this.lastSignal` - Last processed signal (Open-UP, Open-DOWN, Out-of-Range-Down)
- `this.hasLiquidity` - Whether we currently have LP position
- `this.currentTickLower` - Current LP position lower tick
- `this.currentTickUpper` - Current LP position upper tick

### When to update lastSignal:
- After successfully adding LP: `this.lastSignal = signal`
- After price goes out of range down: `this.lastSignal = 'Out-of-Range-Down'`
- After signal changes and rebalances: `this.lastSignal = signal`

## P&L Calculation Fix:

### Current (WRONG):
```javascript
// P&L per transaction
profitLoss: portfolioValueAfter - portfolioValueBefore
```

### Correct (Portfolio-based):
```javascript
// Track initial portfolio value once
if (!this.initialPortfolioValue) {
  this.initialPortfolioValue = currentPortfolioValue;
}

// Calculate total P&L from start
const totalPnL = currentPortfolioValue - this.initialPortfolioValue;

// Store in transaction:
totalPnL: totalPnL,
totalPnLPct: (totalPnL / this.initialPortfolioValue) * 100
```

## Balance Tracking Fix:

### Issue:
Balances don't match between transactions because LP position value is not included.

### Solution:
```javascript
// Include LP position value in portfolio calculation
async calculatePortfolioValue(wethAmount, usdcAmount, wethPrice) {
  let walletValue = (wethAmount * wethPrice) + usdcAmount;

  // Add LP position value if we have liquidity
  if (this.hasLiquidity && this.currentLiquidity) {
    const lpValue = await this.getLPPositionValue(wethPrice);
    return walletValue + lpValue;
  }

  return walletValue;
}
```
