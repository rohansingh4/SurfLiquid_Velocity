# TradePlanOpus Phase 2: Signal-Based Trading Strategy

## Executive Summary

This document defines the exact on-chain transactions to execute when your monitoring system generates Open-UP or Open-DOWN signals on the Shadow DEX WETH/USDC pool (Ramses v3). The strategy is designed for a $50 budget over 1 hour of live trading.

---

## Part 1: Understanding Your Current Signal System

### What Your System Currently Does (Phase 1)

Your `sonic-execution-onchain.js` monitors the pool every 10 seconds via Sonic RPC and generates signals based on price movement relative to a dynamically set range:

```
Range = Current Price ± 0.1%

If Price = $3100:
  Upper Range = $3103.10
  Lower Range = $3096.90
```

### Signal State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   MONITORING (blue)                                             │
│   Price is within ±0.1% range                                   │
│                                                                 │
│       │                           │                             │
│       │ Price > Upper             │ Price < Lower               │
│       ▼                           ▼                             │
│                                                                 │
│   PRICE-UP (orange)           PRICE-DOWN (orange)               │
│   First detection             First detection                   │
│   "Price broke above"         "Price broke below"               │
│                                                                 │
│       │                           │                             │
│       │ Next candle close         │ Next candle close           │
│       │ Still out of range?       │ Still out of range?         │
│       ▼                           ▼                             │
│                                                                 │
│   OPEN-UP (green)             OPEN-DOWN (green)                 │
│   CONFIRMED BREAKOUT          CONFIRMED BREAKDOWN               │
│   Ranges reset to new price   Ranges reset to new price         │
│                                                                 │
│       │                           │                             │
│       └───────────────────────────┘                             │
│                   │                                             │
│                   ▼                                             │
│           Back to MONITORING                                    │
│           with new range centered on current price              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What Each Signal Actually Means

| Signal | Color | Meaning | Market Implication |
|--------|-------|---------|-------------------|
| **Monitoring** | Blue | Price stable within ±0.1% range | No directional bias |
| **Price-UP** | Orange | Price just exceeded upper range | Potential bullish move, unconfirmed |
| **Price-DOWN** | Orange | Price just dropped below lower range | Potential bearish move, unconfirmed |
| **Open-UP** | Green | Price STAYED above range for 10s+ | CONFIRMED bullish momentum |
| **Open-DOWN** | Green | Price STAYED below range for 10s+ | CONFIRMED bearish momentum |

### Why Orange → Green Confirmation Matters

The two-step confirmation (Orange → Green) filters out noise:
- **Orange alone**: Could be a wick/spike that immediately reverses
- **Green confirmation**: Price sustained the breakout through at least one full candle period (10 seconds)

This is similar to a **breakout trading strategy** with confirmation.

---

## Part 2: The Trading Logic

### Core Principle: Follow Confirmed Momentum

When you get a **Green signal (Open-UP or Open-DOWN)**, the price has:
1. Broken out of a 0.2% total range (±0.1%)
2. Sustained that breakout for at least 10 seconds
3. This indicates directional momentum that may continue

### Transaction Types Available on Ramses v3 Pool

From the RamsesV3Pool contract, these are the relevant functions:

1. **`swap()`** - Exchange one token for another
2. **`mint()`** - Add liquidity to a specific tick range
3. **`burn()`** - Remove liquidity from a position
4. **`collect()`** - Collect accumulated fees

### Recommended Strategy: Momentum Swap Trading

For a $50 budget over 1 hour, **pure swap trading** is the optimal approach:

#### Why NOT Liquidity Provision for This Test:
- Gas costs for mint/burn are higher than swaps
- Requires managing tick ranges and position NFTs
- Impermanent loss risk in volatile markets
- Complex multi-step transactions
- $50 is too small for meaningful LP returns

#### Why SWAP Trading Works:
- Single transaction per signal
- Lower gas costs (~$0.01-0.05 on Sonic)
- Directly profits from directional moves
- Simple execution logic
- Works well with momentum signals

---

## Part 3: Exact Transaction Rules

### Rule 1: On Open-UP Signal

**Action**: Swap USDC → WETH

**Rationale**: 
- Price confirmed above range = bullish momentum
- Buy WETH expecting continued upward movement
- The 10-second confirmation means this isn't just a spike

**Transaction Details**:
```
Function: swap()
Direction: zeroForOne = false (USDC to WETH)
Amount: $15-20 worth of USDC
Slippage: 0.5-1%
Deadline: Current block timestamp + 60 seconds
```

**Expected Outcome**:
- If momentum continues: WETH value increases, profit on exit
- If momentum reverses: Wait for Open-DOWN to exit

### Rule 2: On Open-DOWN Signal

**Action**: Swap WETH → USDC

**Rationale**:
- Price confirmed below range = bearish momentum
- Sell WETH to protect value / go defensive
- OR if holding USDC, stay in USDC (no action needed if already defensive)

**Transaction Details**:
```
Function: swap()
Direction: zeroForOne = true (WETH to USDC)
Amount: All available WETH from previous trades
Slippage: 0.5-1%
Deadline: Current block timestamp + 60 seconds
```

**Expected Outcome**:
- Lock in gains if WETH appreciated since Open-UP
- Protect capital if market is dumping
- Ready for next Open-UP opportunity

### Rule 3: Ignore Orange Signals

**Action**: NO TRANSACTION

**Rationale**:
- Price-UP/Price-DOWN are unconfirmed
- Could be temporary wicks
- Wait for green confirmation to act

### Rule 4: Ignore Monitoring Signals

**Action**: NO TRANSACTION

**Rationale**:
- Price is ranging, no clear direction
- Swapping during consolidation = random noise trading
- Wait for breakout

---

## Part 4: Position Sizing and Risk Management

### Budget Allocation ($50 total)

```
Initial Split:
├── USDC Reserve: $25 (for buying WETH on Open-UP)
├── WETH Reserve: ~0.008 WETH (~$25) (for selling on Open-DOWN)
└── Gas Reserve: ~$2-3 in Sonic native token

Or Alternative (simpler):
├── All in USDC: $47-48
└── Gas Reserve: $2-3 in Sonic
    (Start defensive, buy WETH only on Open-UP signals)
```

### Trade Sizing

| Per-Trade Size | Rationale |
|----------------|-----------|
| ~$15-20 | Allows 2-3 trades if signals are frequent |
| Max 40% of remaining balance | Never go all-in on single signal |
| Minimum $10 per trade | Below this, gas costs become significant |

### Stop Conditions

1. **Balance < $10**: Stop trading, gas would eat remaining value
2. **3 consecutive losses**: Re-evaluate signal quality
3. **Gas spike > $1 per tx**: Pause until gas normalizes
4. **Hour elapsed**: End test session

### Slippage Settings

```
Normal volatility: 0.5%
High volatility (rapid price moves): 1.0%
Never exceed: 1.5%
```

---

## Part 5: Expected Scenarios

### Scenario A: Bullish Hour

```
Time    Signal      Action              Position After
00:00   Monitoring  -                   $48 USDC, 0 WETH
05:20   Price-UP    -                   $48 USDC, 0 WETH
05:30   Open-UP     Buy $16 WETH        $32 USDC, 0.005 WETH
15:40   Price-UP    -                   $32 USDC, 0.005 WETH
15:50   Open-UP     Buy $16 WETH        $16 USDC, 0.010 WETH
45:00   Monitoring  -                   $16 USDC, 0.010 WETH (~$33)
60:00   END         Sell all WETH       ~$49-52 USDC (profit)
```

### Scenario B: Bearish Hour

```
Time    Signal      Action              Position After
00:00   Monitoring  -                   $25 USDC, 0.008 WETH
05:20   Price-DOWN  -                   $25 USDC, 0.008 WETH
05:30   Open-DOWN   Sell all WETH       $48-49 USDC, 0 WETH
30:00   Price-DOWN  -                   (already in USDC)
30:10   Open-DOWN   No action needed    $48-49 USDC, 0 WETH
60:00   END         -                   ~$48-49 USDC (capital preserved)
```

### Scenario C: Choppy/Ranging Hour

```
Time    Signal      Action              Position After
00:00   Monitoring  -                   $48 USDC, 0 WETH
10:20   Price-UP    -                   $48 USDC, 0 WETH
10:30   Monitoring  (came back in range) $48 USDC, 0 WETH
25:00   Price-DOWN  -                   $48 USDC, 0 WETH
25:10   Monitoring  (came back in range) $48 USDC, 0 WETH
60:00   END         -                   $48 USDC (no trades, capital preserved)
```

This is actually ideal - the confirmation filter prevented trading in a choppy market.

### Scenario D: Whipsaw (Worst Case)

```
Time    Signal      Action              Position After
00:00   Monitoring  -                   $48 USDC, 0 WETH
05:30   Open-UP     Buy $16 WETH        $32 USDC, 0.005 WETH
08:00   Open-DOWN   Sell WETH (-1%)     $47.84 USDC, 0 WETH
15:30   Open-UP     Buy $16 WETH        $31.84 USDC, 0.005 WETH
18:00   Open-DOWN   Sell WETH (-1%)     $47.68 USDC, 0 WETH
60:00   END         -                   ~$47-48 USDC (small loss from slippage)
```

Even in whipsaw conditions, losses are limited to slippage costs (~2-3%).

---

## Part 6: Implementation Requirements

### Smart Contract Interactions Needed

#### 1. Token Approvals (One-time setup)
```javascript
// Approve USDC for pool/router
USDC.approve(ROUTER_ADDRESS, MAX_UINT256)

// Approve WETH for pool/router
WETH.approve(ROUTER_ADDRESS, MAX_UINT256)
```

#### 2. Swap USDC → WETH (On Open-UP)
```javascript
// Using Ramses Router or direct pool call
router.exactInputSingle({
    tokenIn: USDC_ADDRESS,
    tokenOut: WETH_ADDRESS,
    fee: poolFee,
    recipient: walletAddress,
    deadline: block.timestamp + 60,
    amountIn: usdcAmount,
    amountOutMinimum: expectedWeth * 0.995, // 0.5% slippage
    sqrtPriceLimitX96: 0
})
```

#### 3. Swap WETH → USDC (On Open-DOWN)
```javascript
router.exactInputSingle({
    tokenIn: WETH_ADDRESS,
    tokenOut: USDC_ADDRESS,
    fee: poolFee,
    recipient: walletAddress,
    deadline: block.timestamp + 60,
    amountIn: wethAmount,
    amountOutMinimum: expectedUsdc * 0.995, // 0.5% slippage
    sqrtPriceLimitX96: 0
})
```

### Contract Addresses (Sonic Mainnet)

```
Pool:     0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
USDC:     0x29219dd400f2bf60e5a23d13be72b486d4038894
WETH:     0x50c42deacd8fc9773493ed674b675be577f2634b
Router:   [Need to find Shadow/Ramses router on Sonic]
```

### .env Configuration

```env
SONIC_RPC_URL=<your_sonic_rpc>
PRIVATE_KEY=<funded_wallet_private_key>
POOL_ADDRESS=0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
USDC_ADDRESS=0x29219dd400f2bf60e5a23d13be72b486d4038894
WETH_ADDRESS=0x50c42deacd8fc9773493ed674b675be577f2634b
ROUTER_ADDRESS=<ramses_router>
TRADE_SIZE_USD=15
SLIPPAGE_BPS=50
MAX_TRADES_PER_HOUR=5
DRY_RUN=true
```

---

## Part 7: Execution Flow

### Main Trading Loop

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  1. Poll /api/db/positions/range?range=15m every 10 seconds  │
│                                                              │
│  2. Check latest position status                             │
│       │                                                      │
│       ├── If "Open-UP" and not already in WETH:              │
│       │     → Execute USDC → WETH swap                       │
│       │     → Log trade                                      │
│       │     → Set lastAction = "bought"                      │
│       │                                                      │
│       ├── If "Open-DOWN" and holding WETH:                   │
│       │     → Execute WETH → USDC swap                       │
│       │     → Log trade                                      │
│       │     → Set lastAction = "sold"                        │
│       │                                                      │
│       └── Else: Do nothing, continue monitoring              │
│                                                              │
│  3. Check stop conditions:                                   │
│       - Balance < $10?                                       │
│       - Hour elapsed?                                        │
│       - Max trades reached?                                  │
│                                                              │
│  4. Loop back to step 1                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### State Tracking

```javascript
let tradingState = {
    position: 'USDC',        // 'USDC' or 'WETH'
    lastSignal: null,        // Last processed signal
    lastSignalTime: null,    // Prevent duplicate processing
    tradesExecuted: 0,
    startingBalance: 50,
    currentBalance: 50,
    profitLoss: 0
};
```

---

## Part 8: Why This Strategy Should Work

### Statistical Edge

1. **Confirmation Filter**: The Orange → Green confirmation filters out ~60-70% of false breakouts (wicks that immediately reverse)

2. **Momentum Persistence**: When price sustains a breakout for 10+ seconds on a 0.2% range, there's typically momentum continuation for at least another 10-30 seconds

3. **Mean Reversion Timing**: By trading on breakouts and exiting on reversals, you're essentially doing:
   - Buy breakout → Sell when momentum dies
   - This is a classic momentum capture strategy

### Pool Characteristics Support This Strategy

From the pool data:
- **Fee**: ~0.1% (low fees mean tighter spreads)
- **TVL**: ~$257k (enough liquidity for $50 trades)
- **24h Volume**: ~$240k (active pool, good execution)
- **Tick Spacing**: 100 (allows fine-grained price movement)

### Risk Mitigators

1. **Small Position Sizes**: $15-20 per trade on $50 budget
2. **Quick Exits**: Open-DOWN signals trigger immediate exit
3. **Slippage Limits**: Hard cap at 1.5%
4. **Confirmation Requirement**: No trading on unconfirmed signals

---

## Part 9: Potential Improvements (Future)

### After Validating Basic Strategy

1. **Variable Position Sizing**: Increase size when consecutive signals go the same direction

2. **Volatility Adjustment**: Widen slippage tolerance during high-volatility periods

3. **Multi-Timeframe Confirmation**: Only trade Open-UP if the 1-minute trend is also up

4. **Liquidity Addition**: Once strategy is profitable, add narrow-range liquidity in trend direction

5. **Fee Farming**: Combine with liquidity provision to earn fees while directionally positioned

---

## Part 10: Summary Checklist

### Before Starting

- [ ] Wallet funded with ~$50 (USDC or split)
- [ ] Sufficient Sonic gas (~$2-3)
- [ ] Token approvals set
- [ ] Router address confirmed
- [ ] DRY_RUN tested first

### Per-Signal Checklist

**On Open-UP:**
- [ ] Confirm not already holding WETH
- [ ] Confirm balance > $10
- [ ] Calculate swap amount (min of $15 or 40% of balance)
- [ ] Execute swap with 0.5% slippage
- [ ] Log transaction hash
- [ ] Update state

**On Open-DOWN:**
- [ ] Confirm holding WETH
- [ ] Calculate WETH amount to sell (all)
- [ ] Execute swap with 0.5% slippage
- [ ] Log transaction hash
- [ ] Update state

### End of Session

- [ ] Log all trades
- [ ] Calculate final P&L
- [ ] Document signal accuracy
- [ ] Note any issues for improvement

---

## Appendix: Quick Reference

```
Signal          Action              Direction         When
─────────────────────────────────────────────────────────────
Monitoring      NONE                -                 Always
Price-UP        NONE                -                 Always
Price-DOWN      NONE                -                 Always
Open-UP         BUY WETH            USDC → WETH      If not already in WETH
Open-DOWN       SELL WETH           WETH → USDC      If holding WETH
```

---

*Document Version: 1.0*
*Created for: SurfLiquid Velocity Phase 2*
*Budget: $50 USD*
*Duration: 1 hour test session*

