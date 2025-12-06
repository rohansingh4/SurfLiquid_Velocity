# TradePlan_Phase2

## Context
- Pool: Ramses v3 WETH/USDC on Sonic.
- Signals: Price-UP/DOWN (orange, informational), Open-UP/Open-DOWN (green, confirmed), Monitoring (blue).
- Data cadence: 10s updates (positions/candles in MongoDB).
- Budget: ~$50 total, 3-hour test window.

## Objectives
- Keep risk low; act only on confirmed signals (Open-UP/Open-DOWN).
- Small trade sizes; cap total actions.
- Optional tiny liquidity only in bullish context; otherwise stick to swaps.

## Budget & Limits
- Per trade size: ~$10–$15 equivalent.
- Total actions cap: 3 actions in 3 hours.
- Slippage: 0.5–1%.
- Stop if remaining balance < $10 or gas above cap.
- One action per Open-* signal (no repeats on the same signal).

## Action Rules 
1) On Open-UP (bullish confirmation)
   - Swap USDC → WETH for ~$12 (slippage 0.5–1%).
   - Optional tiny LP (only if desired and funded): add liquidity around current price with a tight range (±0.1%), using ≤$8 split across tokens. Skip if not enough WETH+USDC post-swap.

2) On Open-DOWN (defensive)
   - Swap WETH → USDC for ~$12 (slippage 0.5–1%).
   - If tiny LP was opened earlier, close it here; otherwise, just hold USDC.

3) Ignore Price-UP/DOWN alone
   - No trades on orange without a following green.

4) Stop conditions
   - Hit 3 actions, or funds < $10, or gas too high.

## Sequence Examples
- Bullish: Price-UP → Open-UP → Swap USDC→WETH (~$12). Optionally add tiny LP (≤$8).
- Bearish: Price-DOWN → Open-DOWN → Swap WETH→USDC (~$12). If LP was opened earlier, remove it.
- Mixed: If Open-UP then Open-DOWN comes soon after, execute the first swap, then switch defensive; respect one-action-per-signal and total cap.

## Safety
- Slippage + deadline on every swap.
- Gas cap; skip if above threshold.
- Balance checks pre/post; halt if low.
- Log signal time, action, tx hash, balances.

## Liquidity (optional, small test only)
- Do at most once, only after an Open-UP.
- Range: ±0.1% around current price.
- Size: ≤$8 total.
- Remove if an Open-DOWN follows.

## Implementation Outline (when building)
- Hardhat tasks: swap (USDC↔WETH), mint/close tiny LP, with slippage/gas/deadline.
- Poll signals every 10s; act only on Open-*; enforce one-action-per-signal and total cap.
- Config via .env (RPC, PK, slippage, size, gas cap).
- Dry-run flag to simulate without sending txs.

