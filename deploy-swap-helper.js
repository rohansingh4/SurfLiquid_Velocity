import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Read the Solidity contract
const contractSource = fs.readFileSync('./contracts/SwapHelper.sol', 'utf8');

async function compileContract() {
  console.log('⚠️  Note: This script requires solc compiler installed globally');
  console.log('   Install with: npm install -g solc');
  console.log('\n📝 Contract source loaded. Please compile manually using:');
  console.log('\n   npx solcjs --bin --abi contracts/SwapHelper.sol -o compiled/');
  console.log('\n   Or use Remix IDE: https://remix.ethereum.org/');
  console.log('\n📋 Steps to deploy:');
  console.log('   1. Go to https://remix.ethereum.org/');
  console.log('   2. Create new file: SwapHelper.sol');
  console.log('   3. Paste the contract code from contracts/SwapHelper.sol');
  console.log('   4. Compile with Solidity 0.8.0 or higher');
  console.log('   5. Deploy to Sonic network:');
  console.log(`      - RPC URL: ${RPC_URL}`);
  console.log(`      - Chain ID: 146 (Sonic)`);
  console.log('      - Use your wallet private key');
  console.log('   6. Copy the deployed contract address');
  console.log('   7. Update .env file: SWAP_HELPER_ADDRESS=<deployed-address>');
  console.log('\n✅ After deployment, approve tokens:');
  console.log('   - Approve WETH to SwapHelper');
  console.log('   - Approve USDC to SwapHelper');
}

async function deployWithCompiledBytecode() {
  try {
    // This function can be used if you have the compiled bytecode
    console.log('🚀 Deploying SwapHelper contract...');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`📍 Deploying from: ${wallet.address}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} S`);

    if (balance < ethers.parseEther('0.01')) {
      console.log('❌ Insufficient balance for deployment (need ~0.01 S for gas)');
      return;
    }

    // If you have the compiled bytecode and ABI, use this:
    // const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);
    // const contract = await factory.deploy();
    // await contract.waitForDeployment();
    // console.log(`✅ SwapHelper deployed at: ${await contract.getAddress()}`);

    console.log('\n⚠️  Please compile the contract first and provide bytecode.');
    console.log('   Or use Remix IDE for easy deployment.');

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
  }
}

console.log('='.repeat(70));
console.log('📦 SwapHelper Contract Deployment');
console.log('='.repeat(70));
console.log('');

compileContract();
