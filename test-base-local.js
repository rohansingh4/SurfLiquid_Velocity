// Quick test script for Base pool - validates setup without running full service
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { connectDB, mongoose } from './db.js';

dotenv.config();

const RPC_URL = process.env.BASE_RPC_URL;
const POOL_ADDRESS = process.env.BASE_POOL_ADDRESS;

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)',
  'function tickSpacing() external view returns (int24)'
];

const ERC20_ABI = [
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function name() external view returns (string)'
];

async function testBaseSetup() {
  console.log('\n🧪 Testing Base Pool Setup...\n');

  // Test 1: Environment Variables
  console.log('1️⃣ Checking Environment Variables...');
  if (!RPC_URL || RPC_URL === 'YOUR_PAID_BASE_RPC_URL_HERE') {
    console.error('   ❌ BASE_RPC_URL not configured in .env');
    process.exit(1);
  }
  console.log(`   ✅ BASE_RPC_URL: ${RPC_URL.substring(0, 30)}...`);
  console.log(`   ✅ BASE_POOL_ADDRESS: ${POOL_ADDRESS}`);

  // Test 2: RPC Connection
  console.log('\n2️⃣ Testing Base RPC Connection...');
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✅ Connected to Base network`);
    console.log(`   ✅ Current block: ${blockNumber}`);
  } catch (error) {
    console.error(`   ❌ RPC connection failed: ${error.message}`);
    process.exit(1);
  }

  // Test 3: Pool Contract
  console.log('\n3️⃣ Testing Pool Contract...');
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

    const slot0 = await poolContract.slot0();
    const tick = Number(slot0.tick);
    const fee = await poolContract.fee();
    const tickSpacing = await poolContract.tickSpacing();

    console.log(`   ✅ Pool contract accessible`);
    console.log(`   ✅ Current tick: ${tick}`);
    console.log(`   ✅ Pool fee: ${Number(fee) / 10000}%`);
    console.log(`   ✅ Tick spacing: ${Number(tickSpacing)}`);
  } catch (error) {
    console.error(`   ❌ Pool contract error: ${error.message}`);
    process.exit(1);
  }

  // Test 4: Token Info
  console.log('\n4️⃣ Fetching Token Information...');
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const poolContract = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);

    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();

    const token0Contract = new ethers.Contract(token0Address, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(token1Address, ERC20_ABI, provider);

    const token0Symbol = await token0Contract.symbol();
    const token0Decimals = await token0Contract.decimals();
    const token0Name = await token0Contract.name();

    const token1Symbol = await token1Contract.symbol();
    const token1Decimals = await token1Contract.decimals();
    const token1Name = await token1Contract.name();

    console.log(`   ✅ Token0: ${token0Symbol} (${token0Name})`);
    console.log(`      Decimals: ${token0Decimals}`);
    console.log(`      Address: ${token0Address}`);
    console.log(`   ✅ Token1: ${token1Symbol} (${token1Name})`);
    console.log(`      Decimals: ${token1Decimals}`);
    console.log(`      Address: ${token1Address}`);
  } catch (error) {
    console.error(`   ❌ Token info error: ${error.message}`);
    process.exit(1);
  }

  // Test 5: MongoDB Connection
  console.log('\n5️⃣ Testing MongoDB Connection...');
  try {
    await connectDB();
    console.log(`   ✅ Connected to MongoDB`);

    // Check if positions_base collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const baseCollection = collections.find(c => c.name === 'positions_base');

    if (baseCollection) {
      const count = await mongoose.connection.db.collection('positions_base').countDocuments();
      console.log(`   ✅ Collection 'positions_base' exists (${count} documents)`);
    } else {
      console.log(`   ℹ️  Collection 'positions_base' will be created on first save`);
    }

    // Check other collections are intact
    const positionsCount = await mongoose.connection.db.collection('positions').countDocuments();
    console.log(`   ✅ Shadow DEX collection intact (${positionsCount} documents)`);

    await mongoose.connection.close();
  } catch (error) {
    console.error(`   ❌ MongoDB error: ${error.message}`);
    process.exit(1);
  }

  // Test 6: API Port Availability
  console.log('\n6️⃣ Checking API Port Availability...');
  try {
    const net = await import('net');
    const server = net.createServer();

    await new Promise((resolve, reject) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`   ⚠️  Port 3002 already in use (stop existing service first)`);
          resolve();
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        console.log(`   ✅ Port 3002 available for Base pool API`);
        server.close();
        resolve();
      });

      server.listen(3002);
    });
  } catch (error) {
    console.error(`   ❌ Port check error: ${error.message}`);
  }

  console.log('\n✅ All tests passed! Base pool is ready to run.\n');
  console.log('📝 Next steps:');
  console.log('   1. Start the service: node base-execution.js');
  console.log('   2. Or use PM2: pm2 start ecosystem.config.js --only base-pool');
  console.log('   3. Open index.html and click "🔷 Base Pool (0.1%)" tab\n');

  process.exit(0);
}

testBaseSetup().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
