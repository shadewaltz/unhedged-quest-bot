# Unhedged Quest Bot

Automated betting bot for Unhedged prediction markets. Designed to complete the quest milestones (750 bets, 2000 CC volume) while minimizing losses through smart outcome selection.

## How It Works

1. **Monitors** a target market (auto-selects largest pool or specify manually)
2. **Waits** until 5 minutes before market close
3. **Analyzes** market data:
   - Majority bet side (crowd wisdom)
   - Current vs target price delta (for price markets)
4. **Places** strategic bets to hit quest targets

## Setup

```bash
cd bots/unhedged-quest-bot

# Install dependencies
npm install

# Set environment variables
export UNHEDGED_API_KEY="your_api_key_here"
export TARGET_MARKET_ID="optional_specific_market_id"

# Dry run first (simulates without placing bets)
npm run dry-run

# Run live
npm start
```

## Configuration

Edit `config.js` to tune:

| Setting | Default | Description |
|---------|---------|-------------|
| `windowMinutes` | 5 | Start betting X min before close |
| `minBet` | 0.1 | Minimum bet size |
| `maxBet` | 5 | Maximum bet size |
| `majorityWeight` | 0.6 | Weight given to crowd wisdom |
| `priceDeltaWeight` | 0.4 | Weight given to price analysis |
| `cooldownMs` | 5000 | Delay between bets |

## Strategy

The bot uses a weighted scoring system:

```
Final Score = (Majority_Side × 0.6) + (Price_Signal × 0.4)
```

**Price Analysis** (for BTC/ETH markets):
- Parses target price from market question
- Compares current price from Binance API
- Adjusts confidence based on how far current price is from target

Example:
- Market: "Will BTC be above $98,000 at 8 PM?"
- Current: $97,500 (0.51% below target)
- Signal: Slightly bearish → favor "No"

## Quest Progress Tracking

The bot tracks your progress toward:
- Step 1: 5 bets, 5 CC ✓
- Step 2: 50 bets, 100 CC (in progress)
- Step 3: 200 bets, 500 CC
- Step 4: 500 bets, 1000 CC  
- Step 5: 750 bets, 2000 CC

**Total reward: 680 CC**

## Safety Features

- Idempotency keys prevent duplicate bets
- Cooldown between bets to avoid rate limits
- Dry run mode for testing
- Auto-stops when quest complete
