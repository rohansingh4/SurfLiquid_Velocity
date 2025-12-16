# 🔄 Redeploy SwapHelper for Ramses V3

## Problem
Your current SwapHelper only has `uniswapV3SwapCallback`, but **Ramses V3 uses `ramsesV3SwapCallback`**.

The error `0xfcdf4aa7` indicates the pool is reverting because it can't find the correct callback function.

## Solution
Deploy the updated `SwapHelper_v2.sol` which supports **both** callback names.

---

## 🚀 Quick Deploy (Using Remix)

### 1. Open Remix IDE
Go to: https://remix.ethereum.org/

### 2. Create New File
- Click the "+" icon in File Explorer
- Name it: `SwapHelper_v2.sol`

### 3. Paste Contract Code
Copy the entire contents of `contracts/SwapHelper_v2.sol` and paste into Remix.

### 4. Compile
- Click the "Solidity Compiler" icon (left sidebar)
- Select compiler version: `0.8.0` or higher
- Click **"Compile SwapHelper_v2.sol"**
- Ensure no errors (green checkmark)

### 5. Deploy to Sonic
- Click "Deploy & Run Transactions" icon (left sidebar)
- **Environment**: Select "Injected Provider - MetaMask"
- Connect your MetaMask wallet
- **Network**: Ensure MetaMask is on **Sonic Mainnet**
  - Chain ID: 146
  - RPC: https://rpc.soniclabs.com
- **Contract**: Select `SwapHelper` from dropdown
- Click **"Deploy"**
- Confirm transaction in MetaMask

### 6. Copy New Address
After deployment succeeds:
- Expand the deployed contract in Remix
- Copy the contract address (looks like `0x...`)

### 7. Update .env
```bash
# Update this line in your .env file:
SWAP_HELPER_ADDRESS=0xYourNewContractAddress
```

### 8. Approve Tokens (Important!)
```bash
# Run these commands to approve the new contract:
node approve-tokens.js
```

Or manually approve USDC and WETH for the new SwapHelper address.

---

## 📋 What Changed

**Old Contract** (`SwapHelper.sol`):
- Only had `uniswapV3SwapCallback`
- ❌ Doesn't work with Ramses V3

**New Contract** (`SwapHelper_v2.sol`):
- Has `ramsesV3SwapCallback` ← **NEW!**
- Has `uniswapV3SwapCallback` (for compatibility)
- ✅ Works with both Ramses and standard Uniswap V3

The key addition:
```solidity
function ramsesV3SwapCallback(
    int256 amount0Delta,
    int256 amount1Delta,
    bytes calldata data
) external {
    _handleCallback(amount0Delta, amount1Delta, data);
}
```

---

## ✅ Verify Deployment

After redeploying and updating `.env`:

```bash
# Test the swap again
npm run test:swap-buy
```

You should see:
```
✅ Swap successful! Gas used: XXXXX
```

---

## 🔍 Alternative: Check Current Contract

Before redeploying, you can verify your current contract is missing the Ramses callback:

1. Go to Sonicscan: https://sonicscan.org
2. Search for your SwapHelper address
3. Go to "Contract" tab → "Read Contract"
4. If you don't see `ramsesV3SwapCallback` in the functions list, you need to redeploy

---

## 💡 Why This Happened

Ramses (and Shadow DEX) is a fork of Uniswap V3 that uses its own callback name. This is common with V3 forks:

- **Uniswap V3**: `uniswapV3SwapCallback`
- **Ramses V3**: `ramsesV3SwapCallback`
- **Algebra/QuickSwap**: `algebraSwapCallback`
- **PancakeSwap V3**: `pancakeV3SwapCallback`

The updated contract supports multiple callback names to work with different DEXs.

---

## 🆘 Troubleshooting

**Gas estimation failed**
- Ensure wallet has sufficient S for gas (~0.001 S)
- Check you're on Sonic Mainnet (Chain ID 146)

**Deployment transaction pending forever**
- Increase gas price in MetaMask
- Try resubmitting with higher gas

**Contract address not showing in Remix**
- Check MetaMask for successful transaction
- Get address from transaction details

**Swap still fails after redeployment**
- Verify you updated `.env` with NEW address
- Approve tokens for new contract
- Restart your node script

---

## 📝 Cost Estimate

- Deployment: ~0.002-0.004 S (~$0.06-$0.12)
- Token Approvals: ~0.0006 S total (~$0.02)
- **Total**: ~$0.10

---

## ⚡ Quick Commands After Redeploy

```bash
# 1. Update .env with new address
nano .env  # or use your editor

# 2. Test positions (should work - read-only)
npm run test:positions

# 3. Test swap
npm run test:swap-buy

# 4. If swap works, try liquidity
npm run test:add-liq
```

---

Good luck! Once redeployed with the Ramses callback, all operations should work smoothly. 🚀









