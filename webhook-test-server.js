// Simple test webhook server to verify data is being sent correctly
// Usage: node webhook-test-server.js
// Then set WEBHOOK_URL=http://localhost:3001/webhook in your .env

import express from 'express';

const app = express();
app.use(express.json());

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const data = req.body;
  
  console.log('\n' + '='.repeat(60));
  console.log('🔔 WEBHOOK RECEIVED');
  console.log('='.repeat(60));
  console.log(`⏰ Timestamp: ${new Date(data.timestamp).toLocaleString()}`);
  console.log(`📊 Status: ${data.status}`);
  console.log(`💰 Price: $${data.close?.toFixed(2)}`);
  console.log(`📈 Range: $${data.lower_range?.toFixed(2)} - $${data.upper_range?.toFixed(2)}`);
  console.log(`🔷 WETH: ${data.weth_pct?.toFixed(2)}%`);
  console.log(`💵 USDC: ${data.usdc_pct?.toFixed(2)}%`);
  console.log(`🔄 Rebalance: ${data.rebalance_type}`);
  console.log(`📍 Pool: ${data.pool_address}`);
  console.log(`🌐 Network: ${data.network}`);
  console.log('='.repeat(60));
  
  // Send success response
  res.status(200).json({ 
    success: true, 
    message: 'Data received',
    timestamp: Date.now()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🔔 Webhook Test Server Running`);
  console.log(`📡 Listening on: http://localhost:${PORT}/webhook`);
  console.log(`\n💡 To use this with your bot:`);
  console.log(`   1. Add to .env: WEBHOOK_URL=http://localhost:${PORT}/webhook`);
  console.log(`   2. Restart your bot: npm start`);
  console.log(`   3. Watch this console for webhook data\n`);
});

