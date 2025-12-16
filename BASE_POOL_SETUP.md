# Base Pool - Local Testing & PM2 Setup

## Local Testing (Without Affecting Shadow DEX Database)

### Prerequisites
- MongoDB running locally
- Base RPC URL configured in `.env`
- SwapX service stopped (to save RPC)

### Step 1: Test Base Pool Locally

```bash
# Test the Base pool service directly
node base-execution.js
```

**What to expect:**
- Connection to MongoDB ✓
- Fetching token info from Base pool ✓
- Creating 10-second candles ✓
- Saving positions to `positions_base` collection ✓
- API server running on port 3002 ✓

**Console output should show:**
```
🚀 Starting Base Pool Position Monitoring Service...
   Network: Base
   Pool: 0xd0b53d9277642d899df5c87a3966a349a798f224
   Range: 0.1% (10 ticks with spacing 10)
   Fetch interval: 3000ms
   Candle interval: 10000ms

📊 [Base] Pool Token Info:
   Token0: USDC (6 decimals)
   Token1: WETH (18 decimals)

🎯 [Base] Initial Ranges Set (centered on tick 80500):
   Upper=3150.123456, Lower=3145.678901
   Tick Range: 80495 to 80505 (±5 ticks = 0.1%)

[Base] 📊 Monitoring: 3147.500000 (Range: 3145.678901 - 3150.123456)
```

### Step 2: Verify Database Separation

```bash
# Check MongoDB collections (Base pool uses separate collection)
mongosh
> use velocity
> db.positions_base.countDocuments()  # Should show Base pool positions
> db.positions.countDocuments()        # Shadow DEX positions (unchanged)
```

**Collections:**
- `positions` - Shadow DEX (unchanged)
- `positions_swapx` - SwapX (unchanged)
- `positions_base` - Base Pool (new)

### Step 3: Test the UI

```bash
# Open index.html in browser
open index.html
```

**Then:**
1. Click the **"🔷 Base Pool (0.1%)"** tab
2. You should see:
   - Current price updating every 10 seconds
   - Chart with candlesticks/line
   - Range lines (red upper, green lower)
   - Historical data table with signals

**Note:** Make sure Base pool service is running before testing UI!

---

## PM2 Production Setup

### Install PM2 (if not installed)

```bash
npm install -g pm2
```

### PM2 Commands

#### Start All Services
```bash
# Start both Shadow DEX and Base Pool
pm2 start ecosystem.config.js

# Or start individually
pm2 start ecosystem.config.js --only shadow-dex
pm2 start ecosystem.config.js --only base-pool
```

#### Stop SwapX (Save RPC)
```bash
# If SwapX is running, stop it
pm2 stop swapx-pool
pm2 delete swapx-pool
```

#### Monitor Services
```bash
# View all running services
pm2 list

# Monitor logs in real-time
pm2 logs

# Monitor specific service
pm2 logs base-pool
pm2 logs shadow-dex

# Monitor with timestamps
pm2 logs --timestamp
```

#### Check Status
```bash
# Detailed status
pm2 status

# CPU and Memory usage
pm2 monit
```

#### Restart Services
```bash
# Restart all
pm2 restart all

# Restart specific service
pm2 restart base-pool
pm2 restart shadow-dex
```

#### Stop Services
```bash
# Stop all
pm2 stop all

# Stop specific service
pm2 stop base-pool
```

#### Delete Services
```bash
# Delete all
pm2 delete all

# Delete specific service
pm2 delete base-pool
```

#### View Logs
```bash
# Real-time logs for Base pool
pm2 logs base-pool --lines 100

# Real-time logs for Shadow DEX
pm2 logs shadow-dex --lines 100

# Show error logs only
pm2 logs base-pool --err

# Flush logs (clear old logs)
pm2 flush
```

### Auto-Start on Server Reboot

```bash
# Save current PM2 configuration
pm2 save

# Generate startup script
pm2 startup

# Follow the instructions PM2 gives you
# (It will show a command to run with sudo)
```

---

## Deployment to AWS

### Step 1: Pull Latest Code
```bash
cd /path/to/SurfLiquid_Velocity
git pull origin main
```

### Step 2: Install Dependencies (if needed)
```bash
npm install
```

### Step 3: Update .env
Make sure `.env` has the Base RPC URL:
```bash
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/FJkwko9NxbmzfMYfVrRc9
BASE_POOL_ADDRESS=0xd0b53d9277642d899df5c87a3966a349a798f224
BASE_TICK_SPACING=10
BASE_RANGE_TICKS=10
```

### Step 4: Stop Old Services
```bash
# Stop SwapX to save RPC
pm2 stop swapx-pool
pm2 delete swapx-pool

# Or stop all and restart
pm2 delete all
```

### Step 5: Start New Services
```bash
# Start with PM2
pm2 start ecosystem.config.js

# Verify they're running
pm2 list

# Check logs for any errors
pm2 logs --lines 50
```

### Step 6: Save PM2 State
```bash
# Save current configuration
pm2 save
```

---

## Troubleshooting

### Base Pool Not Starting

**Check MongoDB:**
```bash
# Verify MongoDB is running
mongosh --eval "db.serverStatus()"
```

**Check RPC Connection:**
```bash
# Test RPC connectivity
curl -X POST https://base-mainnet.g.alchemy.com/v2/FJkwko9NxbmzfMYfVrRc9 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

**Check Logs:**
```bash
pm2 logs base-pool --lines 100
```

### Port Already in Use (3002)

```bash
# Find process using port 3002
lsof -i :3002

# Kill the process
kill -9 <PID>

# Or use different port in base-execution.js (line 375)
```

### Database Collection Issues

```bash
# Verify Base collection exists
mongosh
> use velocity
> show collections
> db.positions_base.find().limit(5)
```

---

## Performance Monitoring

### Check Service Health
```bash
# CPU and Memory usage
pm2 monit

# Detailed process info
pm2 show base-pool
```

### Check API Endpoints
```bash
# Test Base pool API
curl http://localhost:3002/api/base/current
curl http://localhost:3002/api/base/positions
```

### Monitor Database Size
```bash
mongosh
> use velocity
> db.positions_base.stats()
```

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `pm2 start ecosystem.config.js` | Start all services |
| `pm2 list` | Show all running services |
| `pm2 logs` | View real-time logs |
| `pm2 monit` | Monitor CPU/Memory |
| `pm2 restart base-pool` | Restart Base pool |
| `pm2 stop all` | Stop all services |
| `pm2 save` | Save current state |
| `pm2 logs base-pool --lines 100` | View last 100 log lines |

---

## Service Ports

- **Shadow DEX API**: Port 3000
- **SwapX API**: Port 3001 (disabled to save RPC)
- **Base Pool API**: Port 3002

---

## MongoDB Collections

- `positions` - Shadow DEX (1% range, Sonic network)
- `positions_swapx` - SwapX (0.1% range, Sonic network)
- `positions_base` - Base Pool (0.1% range, Base network)

Each collection is completely independent and won't affect the others!
