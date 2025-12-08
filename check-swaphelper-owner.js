import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SONIC_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SWAP_HELPER_ADDRESS = process.env.SWAP_HELPER_ADDRESS;

const SWAP_HELPER_ABI = [
  'function owner() view returns (address)'
];

async function checkOwner() {
  console.log('\n🔍 Checking SwapHelper Owner...\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const swapHelper = new ethers.Contract(SWAP_HELPER_ADDRESS, SWAP_HELPER_ABI, provider);

  console.log(`SwapHelper Address: ${SWAP_HELPER_ADDRESS}`);
  console.log(`Your Wallet Address: ${wallet.address}`);

  try {
    const owner = await swapHelper.owner();
    console.log(`SwapHelper Owner: ${owner}`);

    if (owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log('\n✅ You are the owner! This is correct.');
    } else {
      console.log('\n❌ YOU ARE NOT THE OWNER!');
      console.log('   This is the problem - you need to use the correct SwapHelper address!');
    }
  } catch (error) {
    console.error('\n❌ Error reading owner:', error.message);
  }
}

checkOwner();
