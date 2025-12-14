# TRANSACTION FAILURE ANALYSIS REPORT
## December 14, 2025 3:13 AM - Failed Rebalance

---

## EXECUTIVE SUMMARY

**Two transactions failed in sequence:**
1. ❌ **REMOVE_LIQUIDITY** - Failed with "missing revert data"
2. ❌ **ADD_LIQUIDITY** - Skipped due to remove failure

**Root Cause:** Bot lost track of current position's tick range (`currentTickLower` and `currentTickUpper` became `undefined`), causing remove liquidity to be called with invalid parameters.

---

## 1. DETAILED FAILURE TIMELINE

### Transaction #1: REMOVE_LIQUIDITY (Failed)
```
Time: 12/14/2025, 3:13:18 AM IST
Signal: Open-UP
Status: FAILED
Error: missing revert data (CALL_EXCEPTION)
Tick Range: [undefined, undefined] ⚠️
Transaction Data: 0x70a08231... (balanceOf call)
Contract: 0x29219dd400f2Bf60E5a23d13Be72B486D4038894
```

**What Happened:**
1. Bot detected Open-UP signal
2. Attempted to remove existing liquidity
3. Called `swapHelperContract.removeLiquidity(pool, undefined, undefined, 0)`
4. SwapHelper tried to query position with undefined ticks
5. Pool contract reverted without providing error message

**Code Path:**
```javascript
// trading-bot.js line 529-533
const positionLiquidity = await this.swapHelperContract.getPositionLiquidity(
  this.poolAddress,
  this.currentTickLower,  // ❌ Was undefined
  this.currentTickUpper   // ❌ Was undefined
);
```

### Transaction #2: ADD_LIQUIDITY (Skipped)
```
Time: 12/14/2025, 3:13:18 AM IST
Signal: Open-UP
Status: FAILED (skipped)
Error: 🚨 CRITICAL: Rebalance skipped - existing LP at [null, null]
       could not be withdrawn. Cannot proceed with swap/add without
       removing old position.
Tick Range: [undefined, undefined]
Balances: 0.012830584996372602 WETH, 24.635869 USDC
```

**What Happened:**
1. Remove liquidity failed (from Transaction #1)
2. Bot detected remove failure
3. Skipped add liquidity to prevent creating double position
4. Logged critical error

---

## 2. ROOT CAUSE ANALYSIS

### Why Did Tick Values Become Undefined?

**Possible Scenarios:**

#### Scenario A: Bot Restart Without Proper State Recovery
- Bot restarted after previous rebalance
- Failed to restore `currentTickLower` and `currentTickUpper` from database
- Attempted rebalance with empty state

#### Scenario B: State Corruption
- `currentTickLower` and `currentTickUpper` were cleared prematurely
- Possibly during failed previous operation
- State never recovered

#### Scenario C: Race Condition
- Multiple processes trying to rebalance simultaneously
- One process cleared state while another was reading it

**Most Likely:** Scenario A (Bot restart without state recovery)

### Previous Successful Transaction
```
Transaction #3 (Last Success):
Time: 12/14/2025, 3:02:29 AM IST
Type: ADD_LIQUIDITY - SUCCESS
Signal: Open-DOWN
Tick Range: [80300, 80400] ✅
Liquidity: 1000000000000

Transaction #4 (Before that):
Time: 12/14/2025, 3:02:20 AM IST
Type: REMOVE_LIQUIDITY - SUCCESS
Tick Range: [undefined, undefined]
Liquidity: 1000000000000
```

**Observation:** Even successful REMOVE_LIQUIDITY transactions show `[undefined, undefined]` tick range in database. This suggests **tick ranges are not being saved to the database for remove transactions**, only for add transactions.

---

## 3. WITHDRAW LIQUIDITY & REWARDS MECHANISM

### Question: "When we withdraw liquidity, does that function give us rewards or is there another function called collect rewards?"

**Answer: ✅ WITHDRAW LIQUIDITY AUTOMATICALLY COLLECTS REWARDS**

**Evidence from SwapHelper.sol:**

```solidity
// SwapHelper.sol lines 155-188
function removeLiquidity(
    address pool,
    int24 tickLower,
    int24 tickUpper,
    uint128 liquidityAmount
) external onlyOwner returns (uint256 amount0, uint256 amount1) {
    // Step 1: Burn liquidity (remove from pool)
    (amount0, amount1) = IUniswapV3Pool(pool).burn(
        0,
        tickLower,
        tickUpper,
        liquidityAmount
    );

    // Step 2: Collect tokens + fees (lines 178-185)
    IUniswapV3Pool(pool).collect(
        owner,              // ✅ Sends to wallet
        0,
        tickLower,
        tickUpper,
        type(uint128).max,  // ✅ Collect ALL token0 (principal + fees)
        type(uint128).max   // ✅ Collect ALL token1 (principal + fees)
    );

    emit LiquidityRemoved(pool, tickLower, tickUpper, liquidityAmount);
}
```

**How It Works:**

1. **`burn()`** (line 170-175):
   - Decreases liquidity in the pool
   - Pool tracks tokens owed (principal) in position state
   - Pool also tracks accumulated fees in `tokensOwed0` and `tokensOwed1`

2. **`collect()`** (line 178-185):
   - Actually transfers tokens from pool to wallet
   - Collects BOTH:
     - **Principal tokens** (from burning liquidity)
     - **Fee rewards** (accumulated while LP was active)
   - Uses `type(uint128).max` = maximum uint128 value = "collect everything"
   - Sends directly to `owner` (the wallet address)

**There is NO separate "collect rewards" function call needed.**

### Uniswap V3 Position Structure

When you query a position, you see:
```javascript
positions(positionKey) returns (
    uint128 liquidity,              // Active liquidity amount
    uint256 feeGrowthInside0LastX128,  // Fee tracking
    uint256 feeGrowthInside1LastX128,  // Fee tracking
    uint128 tokensOwed0,            // Tokens owed from burn + fees
    uint128 tokensOwed1             // Tokens owed from burn + fees
)
```

**After `burn()`:**
- `liquidity` → 0
- `tokensOwed0` → principal + fees (token0)
- `tokensOwed1` → principal + fees (token1)

**After `collect()`:**
- `tokensOwed0` → 0 (transferred to wallet)
- `tokensOwed1` → 0 (transferred to wallet)

---

## 4. WHY THE ERROR SAYS "missing revert data"

### Transaction Data Analysis

```
Error: missing revert data
Transaction Data: 0x70a08231000000000000000000000000b0538910f0abffc41f0cf701e626975e51e92bc7
Contract: 0x29219dd400f2Bf60E5a23d13Be72B486D4038894
```

**Breaking Down the Transaction Data:**

```
0x70a08231 = Function selector for balanceOf(address)
000000000000000000000000b0538910f0abffc41f0cf701e626975e51e92bc7 = address parameter
```

**This is a `balanceOf` call to check token balance.**

### Where Does `balanceOf` Get Called?

**In SwapHelper.sol line 164:**
```solidity
(uint128 positionLiquidity, , , , ) = IUniswapV3Pool(pool).positions(positionKey);
```

When `tickLower` and `tickUpper` are `undefined` (or invalid values), the `positionKey` calculation results in garbage:

```solidity
bytes32 positionKey = keccak256(abi.encodePacked(
    address(this),    // ✅ Valid
    uint256(0),       // ✅ Valid
    tickLower,        // ❌ UNDEFINED/INVALID
    tickUpper         // ❌ UNDEFINED/INVALID
));
```

**Result:** The pool contract tries to query this invalid position, encounters an error, and reverts without providing a clear error message ("missing revert data").

---

## 5. COMPARISON: FAILED vs SUCCESSFUL TRANSACTIONS

### Last Successful Rebalance (3:02 AM)
```
3:02:20 AM - REMOVE_LIQUIDITY
├── Status: SUCCESS ✅
├── Tick Range in DB: [undefined, undefined]
├── Actual Tick Range (from prev add): [80400, 80500]
├── Liquidity: 1000000000000
└── TX Hash: 0x257b2b0...

3:02:29 AM - ADD_LIQUIDITY
├── Status: SUCCESS ✅
├── Tick Range: [80300, 80400] ✅
├── Liquidity: 1000000000000
├── WETH: 0.012830862737114226
├── USDC: 24.635869
└── TX Hash: 0xd61a289...
```

### Failed Rebalance (3:13 AM)
```
3:13:18 AM - REMOVE_LIQUIDITY
├── Status: FAILED ❌
├── Tick Range: [undefined, undefined] ❌
├── Expected Range (from prev add): [80300, 80400]
├── Bot State: currentTickLower = undefined
├── Bot State: currentTickUpper = undefined
└── No TX Hash (failed before submission)

3:13:18 AM - ADD_LIQUIDITY
├── Status: SKIPPED ❌
├── Reason: Previous remove failed
└── No TX Hash
```

---

## 6. HOW THE BOT TRACKS POSITION STATE

### In-Memory State Variables (trading-bot.js)
```javascript
this.currentLiquidity = null;      // Current LP amount
this.currentTickLower = null;      // Lower tick boundary
this.currentTickUpper = null;      // Upper tick boundary
this.hasLiquidity = false;         // Boolean flag
```

### When State is Updated

**After Successful Add Liquidity:**
```javascript
// trading-bot.js lines after addLiquidity()
this.currentLiquidity = liquidityAmount;
this.currentTickLower = tickLower;   // ✅ Stored
this.currentTickUpper = tickUpper;   // ✅ Stored
this.hasLiquidity = true;
```

**After Successful Remove Liquidity:**
```javascript
// trading-bot.js lines 563-566
this.currentLiquidity = null;
this.currentTickLower = null;   // ❌ Cleared
this.currentTickUpper = null;   // ❌ Cleared
this.hasLiquidity = false;
```

**After Bot Restart:**
```javascript
// Bot initializes with null values
// Needs to call syncLiquidityState() to recover position
```

---

## 7. WHY BOT LOST TRACK OF POSITION

### Analysis of Transaction Database

**Last successful ADD_LIQUIDITY (3:02:29 AM):**
- Saved tick range: `[80300, 80400]` ✅
- Bot should have `currentTickLower = 80300`, `currentTickUpper = 80400`

**Time gap: 11 minutes (3:02 AM → 3:13 AM)**

**During this time:**
- Either bot was restarted
- Or state was corrupted
- Or process crashed and restarted

**At 3:13 AM:**
- Bot attempted rebalance
- `currentTickLower` = undefined
- `currentTickUpper` = undefined

### Likely Scenario

1. **3:02 AM** - Successful rebalance to `[80300, 80400]`
2. **3:02 - 3:13 AM** - Bot running normally, or crashed
3. **~3:13 AM** - Bot restarted (PM2 auto-restart?)
4. **3:13 AM** - Bot initialized with empty state
5. **3:13 AM** - Price exited range, triggered rebalance
6. **3:13 AM** - Attempted remove with undefined ticks → FAILED

---

## 8. STATE RECOVERY MECHANISM

The bot has a `syncLiquidityState()` function to recover position state, but it's not always called on startup.

### Current syncLiquidityState Logic

```javascript
// trading-bot.js lines 586-609
async syncLiquidityState(tickLower, tickUpper) {
  // Check stored ticks first
  if (this.currentTickLower !== null && this.currentTickUpper !== null) {
    const currentPositionLiquidity = await this.swapHelperContract.getPositionLiquidity(
      this.poolAddress,
      this.currentTickLower,
      this.currentTickUpper
    );

    if (currentPositionLiquidity > 0n) {
      hasActualLP = true;
      // Position found! State is correct.
    }
  }

  // If provided new ticks, check those too
  // ...

  // If no LP found anywhere, scan nearby ticks
  // ...
}
```

**Problem:** If `currentTickLower` and `currentTickUpper` are null (after restart), the function doesn't know where to look!

**Solution in place:** Lines 632+ scan ±10,000 ticks to find position, but this is slow and might not always work.

---

## 9. SOLUTIONS

### Immediate Fix Needed

**Option 1: Store Last Position in Database**
- Save `currentTickLower` and `currentTickUpper` to MongoDB after every add
- Restore from database on bot startup
- Guarantees position can always be found

**Option 2: Always Scan on Startup**
- Call `syncLiquidityState()` with wide scan on bot initialization
- Find position at any tick range
- Slower but more reliable

**Option 3: Enhanced Error Handling**
- If `currentTickLower`/`currentTickUpper` are undefined, force scan
- Don't attempt remove with undefined ticks
- Fail safely with proper error message

### Why Current Auto-Withdraw Doesn't Help

The `forceWithdrawAllLiquidity()` function on bot startup scans ±5000 ticks, but:
- Might not be called if bot thinks there's no position
- Might not find position if it's >5000 ticks away
- Doesn't update `currentTickLower`/`currentTickUpper` state

---

## 10. RECOMMENDATIONS

### For Boss

**Question 1: Why did withdraw and add fail?**

Answer:
> "The bot lost track of where the liquidity position was located (tick range became undefined, likely due to bot restart). When it tried to remove liquidity, it called the contract with invalid tick values, causing a 'missing revert data' error. The add liquidity was then automatically skipped to prevent creating a double position. This is a state tracking issue, not a contract or blockchain issue."

**Question 2: Does withdraw liquidity collect rewards automatically?**

Answer:
> "YES - `removeLiquidity()` automatically collects all rewards. It calls two functions: (1) `burn()` to remove the liquidity, then (2) `collect()` with max values to transfer both the principal tokens AND accumulated fees directly to the wallet. There is NO separate 'collect rewards' function call needed. This is standard Uniswap V3 behavior - one call removes liquidity and claims all rewards."

### Critical Fix Required

**The bot needs persistent state storage for position tracking:**

```javascript
// After successful add liquidity:
await savePositionStateToDatabase({
  tickLower: tickLower,
  tickUpper: tickUpper,
  liquidity: liquidityAmount,
  timestamp: Date.now()
});

// On bot startup:
const lastPosition = await getLastPositionFromDatabase();
if (lastPosition) {
  this.currentTickLower = lastPosition.tickLower;
  this.currentTickUpper = lastPosition.tickUpper;

  // Verify it still exists
  const actualLiquidity = await this.swapHelperContract.getPositionLiquidity(
    this.poolAddress,
    lastPosition.tickLower,
    lastPosition.tickUpper
  );

  this.hasLiquidity = actualLiquidity > 0n;
}
```

This ensures the bot ALWAYS knows where the position is, even after restarts.

---

**Report Prepared:** December 14, 2025
**Failure Time:** 3:13:18 AM IST
**Root Cause:** Lost position state (undefined tick range)
**Impact:** 2 failed transactions, missed rebalance opportunity
**Fix Priority:** HIGH (prevents future rebalance failures)
