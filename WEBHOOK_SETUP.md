# Webhook Setup Guide

## Overview

The webhook feature sends real-time position data to an external endpoint (e.g., your AI scientist) every time new position data is generated (approximately every 10 seconds).

## Quick Start

### 1. Configure Webhook URL

Add this to your `.env` file:

```bash
WEBHOOK_URL=https://your-ai-endpoint.com/api/positions
```

### 2. Start the Monitor

```bash
npm start
```

That's it! Position data will now be automatically sent to your webhook endpoint.

## Testing Locally

### Option 1: Test Server (Recommended for Development)

Run the included test webhook server:

```bash
npm run webhook:test
```

This starts a local server at `http://localhost:3001/webhook` that logs all received data.

Then in your `.env`:
```bash
WEBHOOK_URL=http://localhost:3001/webhook
```

### Option 2: Test with Request Inspector

Use services like:
- [webhook.site](https://webhook.site) - Get instant webhook URL
- [RequestBin](https://requestbin.com) - Inspect HTTP requests
- [Beeceptor](https://beeceptor.com) - Mock API endpoints

Example:
```bash
WEBHOOK_URL=https://webhook.site/your-unique-id
```

## Webhook Payload

Every 10 seconds (on position update), the following JSON is sent via POST:

```json
{
  "timestamp": 1702345678901,
  "status": "Monitoring",
  "upper_range": 3103.09,
  "lower_range": 3096.91,
  "open": 3100.0,
  "high": 3102.5,
  "low": 3098.0,
  "close": 3101.2,
  "weth_pct": 51.2,
  "usdc_pct": 48.8,
  "rebalance_type": "N/A",
  "pool_address": "0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40",
  "network": "sonic"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | number | Unix timestamp in milliseconds |
| `status` | string | One of: `Monitoring`, `Price-UP`, `Price-DOWN`, `Open-UP`, `Open-DOWN` |
| `upper_range` | number | Upper price boundary (current price + 0.1%) |
| `lower_range` | number | Lower price boundary (current price - 0.1%) |
| `open` | number | Opening price of current 10s candle |
| `high` | number | Highest price in current 10s candle |
| `low` | number | Lowest price in current 10s candle |
| `close` | number | Current/closing price |
| `weth_pct` | number | Percentage of pool value in WETH (0-100) |
| `usdc_pct` | number | Percentage of pool value in USDC (0-100) |
| `rebalance_type` | string | `N/A`, `Rebalance UP`, or `Rebalance DOWN` |
| `pool_address` | string | Pool contract address |
| `network` | string | Blockchain network (`sonic`) |

### Status Values

- **`Monitoring`**: Price is within range (normal state)
- **`Price-UP`**: Price moved above upper range (confirmation pending)
- **`Price-DOWN`**: Price moved below lower range (confirmation pending)
- **`Open-UP`**: Rebalance confirmed, new position opened with higher range
- **`Open-DOWN`**: Rebalance confirmed, new position opened with lower range

## Implementation Details

### Error Handling

- 5-second timeout for webhook requests
- Errors logged to console but don't stop data collection
- Non-blocking - failed webhooks won't affect monitoring

### Logs

When webhook is enabled, you'll see:

```
📡 Webhook: ENABLED → https://your-endpoint.com...
```

On each successful send:
```
📡 Webhook sent: Monitoring @ $3100.50
```

On errors:
```
⚠️  Webhook failed: 500 Internal Server Error
```

### Security Considerations

1. **Use HTTPS**: Always use `https://` URLs in production
2. **Authentication**: Add auth tokens to your endpoint if needed
3. **Rate Limiting**: Your endpoint receives ~6 requests/minute (every 10s)
4. **Validation**: Verify `pool_address` and `network` match your expectations

## Advanced Configuration

### Custom Headers (if needed)

Edit `sonic-execution-onchain.js` to add authentication:

```javascript
const response = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`, // Add this
    'X-API-Key': process.env.API_KEY // Or this
  },
  body: JSON.stringify(payload)
});
```

### Filtering Data

To send only specific statuses (e.g., only rebalance events):

```javascript
// In sendWebhook() function
if (positionData.status === 'Monitoring') return; // Skip monitoring events
```

## Troubleshooting

### Webhook not sending

1. Check `.env` has `WEBHOOK_URL` configured
2. URL must start with `http://` or `https://`
3. Check console for startup message: `📡 Webhook: ENABLED`

### Timeout errors

- Your endpoint is taking >5 seconds to respond
- Increase timeout in `sendWebhook()` function
- Or optimize your endpoint response time

### Data not arriving

1. Check endpoint logs/dashboard
2. Test with webhook.site first
3. Verify firewall allows outbound connections
4. Check console for `⚠️  Webhook failed` messages

## Example: AI Scientist Integration

```python
# Flask example endpoint
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/positions', methods=['POST'])
def receive_position():
    data = request.json
    
    # Store in database
    db.positions.insert_one(data)
    
    # Run ML model
    if data['status'] in ['Open-UP', 'Open-DOWN']:
        prediction = ml_model.predict(data)
        print(f"Predicted next move: {prediction}")
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=5000)
```

Then set: `WEBHOOK_URL=http://your-server:5000/api/positions`

## Support

For issues or questions:
1. Check console logs for error messages
2. Test with the included webhook test server
3. Verify payload structure matches your endpoint expectations

