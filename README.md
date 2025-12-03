# Sonic Execution Layer - WETH/USDC Pool Monitor

Real-time monitoring and position management system for the WETH/USDC pool on Shadow DEX.

## Features

- **Real-time Data Fetching**: Polls Shadow DEX API every 15 seconds
- **Price Calculation**: Calculates actual price from sqrtPrice using Uniswap V3 formula
- **15-Second Candles**: Creates OHLC candles with liquidity data
- **Position Management**: Automatically opens positions and monitors price ranges
- **Rebalancing Logic**: Detects when price moves out of ±0.1% range
- **CSV Export**: Saves all candle and position data to CSV files
- **Live Dashboard**: Real-time web interface with charts and metrics

## Strategy Overview

1. **Create 15s Candles**: Captures pool liquidity data every 15 seconds
2. **Define Range**: Sets ±0.1% range at the open of each candle
3. **Distribution**: Calculates % distribution of WETH & USDC
4. **Open Position**: Opens position at candle open
5. **Monitor Position**:
   - UP: Price > Upper Range
   - DOWN: Price < Lower Range
6. **Rebalance**: When out of range, triggers rebalance (A for UP, B for DOWN)
7. **Next Candle**: Opens new position on next 15-second candle after rebalance

## Installation

1. **Install Dependencies**:
```bash
npm install
```

## Usage

1. **Start the Application**:
```bash
npm start
```

2. **Open Dashboard**:
   - Navigate to `http://localhost:3000/index.html`
   - Dashboard updates automatically every 5 seconds

3. **Monitor Console**:
   - The terminal shows real-time logs of:
     - Price updates
     - Candle creation
     - Position status
     - Rebalancing events

## Data Output

### CSV Files

Two CSV files are created in the root directory:

1. **candles.csv**:
   - Timestamp
   - Open, High, Low, Close prices
   - Liquidity
   - WETH Amount
   - USDC Amount

2. **positions.csv**:
   - Timestamp
   - Status (Position Open, Out of Range - UP/DOWN, Waiting for Rebalance)
   - Current Price
   - Upper Range, Lower Range
   - WETH %, USDC %
   - Rebalance Type (A or B)

## API Endpoints

The backend provides the following endpoints:

- `GET /api/current` - Current candle, position, and recent tick data
- `GET /api/candles` - Last 15 minutes of candles
- `GET /api/positions` - Position history
- `GET /api/all-data` - Complete dataset (last hour)

## Dashboard Features

- **Current Price**: Real-time WETH/USDC price
- **Position Status**: Shows if position is open, out of range, or waiting
- **Range Indicators**: Visual upper and lower range boundaries
- **Token Distribution**: Live WETH/USDC percentage breakdown
- **15s Candle Data**: Current candle OHLC values
- **Price Chart**: Last hour of price data with range lines

## Configuration

Edit `sonic-execution.js` to modify:

```javascript
const POOL_ADDRESS = '0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40'; // Pool to monitor
const FETCH_INTERVAL = 15000; // 15 seconds
const RANGE_PERCENTAGE = 0.1; // 0.1% range
```

## Technical Details

### Price Calculation

The price is calculated from the pool's `sqrtPrice` value:

```javascript
price = (sqrtPrice / 2^96)^2 * 10^(decimals1 - decimals0)
```

Where:
- `sqrtPrice`: Square root price from the pool
- USDC decimals: 6
- WETH decimals: 18

### Distribution Calculation

Token distribution is calculated based on:
- Reserve values in the pool
- Current price
- Total value locked (TVL)

```javascript
USDC % = (USDC_value / Total_value) * 100
WETH % = (WETH_value_in_USDC / Total_value) * 100
```

## Running for Extended Periods

To run the monitor for extended periods (e.g., multiple hours):

1. Use `nohup` or a process manager like `pm2`:
```bash
npm install -g pm2
pm2 start sonic-execution.js --name sonic-monitor
pm2 logs sonic-monitor
```

2. To stop:
```bash
pm2 stop sonic-monitor
```

## Data Analysis

After running for an hour or more, you can analyze the CSV files:

1. **Excel/Google Sheets**: Open the CSV files directly
2. **Python**: Use pandas for analysis
3. **Custom Analysis**: The data is structured for easy processing

## Pool Information

- **Pool Address**: `0x6fb30f3fcb864d49cdff15061ed5c6adfee40b40`
- **DEX**: Shadow (Sonic Network)
- **Tokens**: WETH/USDC
- **Fee Tier**: Dynamic (shown in API response)

## Troubleshooting

1. **API Not Responding**: Check if Shadow API is accessible
2. **No Data in Dashboard**: Ensure backend is running on port 3000
3. **CSV Files Not Created**: Check write permissions in directory
4. **Chart Not Updating**: Check browser console for CORS or fetch errors

## Next Steps (Phase 2)

Future enhancements could include:
- Actual on-chain transaction execution for rebalancing
- Multiple pool monitoring
- Alert system (email/Telegram)
- Historical data analysis and backtesting
- Advanced charting with TradingView

## License

MIT
