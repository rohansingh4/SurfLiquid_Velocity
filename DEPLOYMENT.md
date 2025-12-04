# 🚀 AWS Deployment Guide - MongoDB Migration

## ⚠️ CRITICAL: Pre-Deployment Steps

Your AWS instance has 24+ hours of valuable CSV data. Follow these steps **exactly** to ensure no data loss.

---

## 📋 Deployment Process

### Step 1: Commit & Push Your Changes (Local)

```bash
# In your local machine
git add .
git commit -m "Migrate to MongoDB with pagination and zoom features"
git push origin main
```

### Step 2: Connect to AWS

```bash
ssh your-aws-instance
cd /path/to/SurfLiquid_Velocity
```

### Step 3: Backup Current CSV Files (Safety First!)

```bash
# Create backup directory with timestamp
mkdir -p backups
cp candles.csv backups/candles_$(date +%Y%m%d_%H%M%S).csv
cp positions.csv backups/positions_$(date +%Y%m%d_%H%M%S).csv

echo "✅ Backup created successfully"
ls -lh backups/
```

### Step 4: Pull Latest Code (WITHOUT stopping the app)

```bash
# App is still running and collecting data
git pull origin main
```

### Step 5: Install New Dependencies

```bash
npm install
# This will install mongoose if not already installed
```

### Step 6: Run Migration Script (App STILL running)

```bash
# This migrates ALL CSV data to MongoDB
# Duplicates are automatically handled
# Your app continues to write to CSV during this
npm run migrate
```

**Expected Output:**
```
══════════════════════════════════════════════════════════════════════
🚀 CSV TO MONGODB MIGRATION TOOL
══════════════════════════════════════════════════════════════════════
This script will migrate all CSV data to MongoDB.
Duplicates will be safely skipped based on timestamps.

📂 Found CSV files:
   ✅ candles.csv
   ✅ positions.csv

📊 Starting candles.csv migration...
  📈 Progress: 50 processed | 50 inserted | 0 duplicates | 0 errors
  📈 Progress: 100 processed | 100 inserted | 0 duplicates | 0 errors
  ...
  📈 Progress: 5000 processed | 4500 inserted | 500 duplicates | 0 errors

✅ Candles migration complete!
   📊 Total processed: 5760
   ✅ Successfully inserted: 5260
   ⚠️  Duplicates skipped: 500
   ❌ Errors: 0

📍 Starting positions.csv migration...
  📈 Progress: 50 processed | 50 inserted
  ...

✅ Positions migration complete!
   📊 Total processed: 120
   ✅ Successfully inserted: 120
   ❌ Errors: 0

🔍 Verifying migration...

📊 MongoDB Database Status:
   🕯️  Total Candles: 5,760
   📍 Total Positions: 120
   🕐 Latest Candle: 12/4/2025, 6:00:00 PM
      Price: $3185.45

══════════════════════════════════════════════════════════════════════
🎉 MIGRATION COMPLETED SUCCESSFULLY!
══════════════════════════════════════════════════════════════════════
⏱️  Duration: 12.34 seconds
📝 CSV files have been preserved as backup
🗄️  All data is now safely stored in MongoDB

✅ Your application is ready to run with MongoDB!
   Start your app with: npm start
```

### Step 7: Stop Old PM2 Process

```bash
pm2 stop all
pm2 delete all
```

### Step 8: Run Migration ONE MORE TIME (Get latest data)

```bash
# This catches any data written while migration was running
npm run migrate
```

This second migration will:
- Insert only NEW records (written after first migration)
- Skip all duplicates automatically
- Take just a few seconds

### Step 9: Start New MongoDB-Powered Application

```bash
# Start with PM2
pm2 start npm --name "velocity" -- start

# Save PM2 configuration
pm2 save

# Check status
pm2 logs velocity --lines 50
```

**You should see:**
```
✅ MongoDB connected successfully to Velocity database
🎯 Sonic Execution Layer - WETH/USDC Pool Monitor (ON-CHAIN)
Pool: 0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40
...
💾 Candle saved: O:3185.45 H:3185.45 L:3185.45 C:3185.45
```

### Step 10: Verify Everything Works

```bash
# Check MongoDB has all data
curl http://localhost:3000/api/db/stats | python3 -m json.tool

# Should show:
# {
#   "candleCount": 5760,
#   "positionCount": 120,
#   ...
# }

# Check PM2 status
pm2 status

# Check logs
pm2 logs velocity --lines 20
```

---

## 🎉 Success Checklist

- ✅ All CSV data migrated to MongoDB
- ✅ No duplicates created
- ✅ Application running with PM2
- ✅ New data being saved to MongoDB
- ✅ CSV files preserved as backup
- ✅ Dashboard accessible
- ✅ Tables showing paginated data
- ✅ Chart zoom/scroll working

---

## 🔄 What Changed?

1. **Data Storage**: CSV files → MongoDB database
2. **Duplicate Prevention**: Unique timestamp indexes
3. **Pagination**: Tables load 100 records per page
4. **Chart Features**: Zoom in/out, scroll through history
5. **TVL Display**: Shows dollar value instead of raw liquidity
6. **Performance**: Indexed queries for fast data access

---

## 🆘 Troubleshooting

### Migration Shows Many Duplicates
**This is normal!** Duplicates mean:
- You already had some data in MongoDB (from local testing)
- The migration script correctly skipped them
- Look at "Successfully inserted" count for new records

### PM2 Logs Show Connection Error
```bash
# Check MongoDB connection string
cat .env | grep MONGODB

# Test connection
node -e "import('./db.js').then(m => m.connectDB())"
```

### Want to Re-run Migration
**Safe to run multiple times:**
```bash
npm run migrate
```
Duplicates are always skipped automatically.

### Need to Restart Application
```bash
pm2 restart velocity
pm2 logs velocity
```

---

## 📊 Monitoring

```bash
# Watch logs in real-time
pm2 logs velocity

# Check memory usage
pm2 monit

# View dashboard
# Open browser: http://your-aws-ip:3000/index.html
```

---

## 🔐 Security Notes

- MongoDB connection string is in the code (consider using environment variables)
- Port 3000 should be accessible in AWS security group
- CSV files remain as backup (consider moving to backups/ folder)

---

## 📝 Post-Deployment

1. **Test the dashboard** - Check all features work
2. **Monitor PM2 logs** - Watch for any errors
3. **Check MongoDB data** - Verify new records being added
4. **Backup CSV files** - Move to safe location or delete after confirming MongoDB works

---

## ✅ You're Done!

Your application is now running with MongoDB, with all 24+ hours of historical data safely migrated. The dashboard has professional zoom/scroll features, paginated tables, and optimized MongoDB queries.

**No data was lost. Everything is working. You're ready to rock! 🚀**
