# SwapHelper Contract Deployment Guide

## Overview

The SwapHelper contract enables your trading bot to execute swaps on Uniswap V3 pools by implementing the required callback function. This is necessary because Uniswap V3 pools cannot be called directly from regular wallets (EOAs).

## Deployment Steps

### 1. Compile and Deploy the Contract

**Option A: Using Remix IDE (Recommended - Easiest)**

1. Go to [https://remix.ethereum.org/](https://remix.ethereum.org/)
2. Create a new file: `SwapHelper.sol`
3. Copy the contract code from `contracts/SwapHelper.sol`
4. Paste it into Remix
5. Go to the "Solidity Compiler" tab (left sidebar)
6. Select compiler version: `0.8.0` or higher
7. Click "Compile SwapHelper.sol"
8. Go to the "Deploy & Run Transactions" tab
9. Environment: Select "Injected Provider - MetaMask"
10. Connect your MetaMask wallet to Sonic network:
    - Network Name: Sonic Mainnet
    - RPC URL: `https://sonic-mainnet.g.alchemy.com/v2/njvCV1kklfcbkIquCMqyWg4GE52Z08Tk`
    - Chain ID: `146`
    - Currency Symbol: `S`
11. Make sure you have enough Sonic (S) for gas (~0.01 S should be plenty)
12. Click "Deploy"
13. Confirm the transaction in MetaMask
14. **Copy the deployed contract address** (you'll need this for the .env file)

**Option B: Using Hardhat/Foundry (Advanced)**

If you prefer using command-line tools, you can:
1. Install Hardhat: `npm install --save-dev hardhat`
2. Initialize Hardhat project
3. Add the contract to `contracts/`
4. Deploy using Hardhat scripts

**Option C: Using solcjs (Command Line)**

```bash
# Install solc compiler
npm install -g solc

# Compile the contract
npx solcjs --bin --abi contracts/SwapHelper.sol -o compiled/

# Deploy using ethers.js (you'll need to write a deployment script)
```

### 2. Approve Tokens to SwapHelper

After deploying the contract, you need to approve WETH and USDC to the SwapHelper contract.

**Using Remix:**

1. In Remix, go to the "Deploy & Run Transactions" tab
2. Under "Deployed Contracts", find your WETH and USDC token contracts
3. For WETH:
   - Address: `0x50c42deacd8fc9773493ed674b675be577f2634b`
   - Call `approve(swapHelperAddress, MaxUint256)`
   - MaxUint256 = `115792089237316195423570985008687907853269984665640564039457584007913129639935`
4. For USDC:
   - Address: `0x29219dd400f2bf60e5a23d13be72b486d4038894`
   - Call `approve(swapHelperAddress, MaxUint256)`

**The trading bot will also attempt to do this automatically** when it runs, but it's good to verify.

### 3. Update .env File

Add the deployed contract address to your `.env` file:

```bash
# SwapHelper contract address
SWAP_HELPER_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS_HERE
```

Make sure your private key is also set:

```bash
PRIVATE_KEY=your_private_key_here
```

### 4. Restart the Server

Restart your server to load the new configuration:

```bash
pm2 restart velocity
```

### 5. Verify Trading is Enabled

Check the logs to confirm:

```bash
pm2 logs velocity
```

You should see:
```
🤖 Trading Bot initialized with wallet: 0x...
   ✅ SwapHelper: 0x...
```

If you see:
```
⚠️  Trading disabled: SwapHelper contract not deployed yet
```

Then the SWAP_HELPER_ADDRESS is not set correctly in `.env`.

## Contract Details

### SwapHelper Contract

**Location**: `contracts/SwapHelper.sol`

**Functions:**
- `executeSwap()` - Execute a swap through the Uniswap V3 pool
- `uniswapV3SwapCallback()` - Callback function called by the pool
- `withdrawToken()` - Emergency function to withdraw stuck tokens
- `getTokenBalance()` - Check token balance in contract
- `owner()` - Returns the deployer address (your wallet)

**Security:**
- Only the contract owner (deployer) can call `executeSwap()` and `withdrawToken()`
- The contract forwards all received tokens directly to the owner
- No tokens should remain in the contract after swaps

### Token Addresses

- **WETH**: `0x50c42deacd8fc9773493ed674b675be577f2634b`
- **USDC**: `0x29219dd400f2bf60e5a23d13be72b486d4038894`
- **Pool**: `0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40`

## Testing

Once deployed, the trading bot will:

1. Automatically approve tokens to SwapHelper (if not already approved)
2. Monitor for rebalance signals (Open-UP / Open-DOWN)
3. Execute swaps via SwapHelper when signals trigger
4. Track all transactions in MongoDB
5. Display transactions and P&L in the frontend

## Troubleshooting

### "Trading disabled: SwapHelper contract not deployed yet"
- Make sure `SWAP_HELPER_ADDRESS` is set in `.env`
- Restart the server: `pm2 restart velocity`

### "Swap failed: SwapHelper not configured"
- The SwapHelper address is not set or is invalid
- Check `.env` file and restart

### "Execution reverted" during swap
- Check that tokens are approved to SwapHelper
- Verify wallet has sufficient token balance
- Check slippage (5% default) - might need to increase for volatile markets

### Tokens stuck in SwapHelper contract
- Use the `withdrawToken()` function to recover them
- Call from owner address only

## Cost Estimates

- **Contract Deployment**: ~0.005 - 0.01 S (Sonic)
- **Token Approvals**: ~0.0001 S each (WETH + USDC)
- **Each Swap**: ~0.0003 - 0.0005 S

Total setup cost: ~0.01 S ($0.01 - $0.02 USD)

## Next Steps

After successful deployment:

1. ✅ Contract deployed
2. ✅ Tokens approved to SwapHelper
3. ✅ .env file updated
4. ✅ Server restarted
5. ✅ Wait for next rebalance signal
6. ✅ Monitor transactions in UI

The trading bot will now automatically execute swaps when rebalance signals occur!
