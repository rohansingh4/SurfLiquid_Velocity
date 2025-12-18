# Base V3 Scripts

Scripts for interacting with Base Pool (WETH/USDC) via BasePoolHelper contract.

## Setup

All configuration is in the main `.env` file:
- `BASE_RPC_URL`: Base mainnet RPC
- `BASE_POOL_ADDRESS`: Pool address (0xd0b53d9277642d899df5c87a3966a349a798f224)
- `BASE_HELPER_SOL`: Helper contract address (0x5489717198AB0004077c4f9564B2D54ddF039804)
- `PUBLIC_KEY`: Your wallet address
- `PRIVATE_KEY`: Your wallet private key

## Pool Details

- **Pool**: 0xd0b53d9277642d899df5c87a3966a349a798f224
- **Token0 (WETH)**: 0x4200000000000000000000000000000000000006
- **Token1 (USDC)**: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- **Fee**: 0.05% (500)
- **Tick Spacing**: 10

## Scripts

### swap_usdc_to_weth.js
Swaps 1 USDC to WETH.

Usage:
```bash
node baseV3/swap_usdc_to_weth.js
```

Features:
- Checks balances before/after
- Auto-approves USDC if needed
- Shows swap details and effective price
- Handles errors gracefully

## Prerequisites

Make sure you have:
1. USDC on Base (at least 1 USDC for testing)
2. ETH for gas (0.001-0.002 ETH)
3. Proper .env configuration

## Coming Soon

- `swap_weth_to_usdc.js` - Swap WETH to USDC
- `add_liquidity.js` - Add liquidity to pool
- `remove_liquidity.js` - Remove liquidity from pool
- `monitor_positions.js` - Monitor active positions
- `bot.js` - Automated trading bot similar to shadow bot
