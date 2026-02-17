# Unhedged Quest Bot

Automated betting bot for Unhedged prediction markets. Designed to complete quest milestones while minimizing losses
through smart outcome selection.

## Features

- **Multi-account support** — Run multiple accounts with different configs
- **Custom per-account configs** — Different strategies per account
- **Proxy support** — Use different IPs for each account
- **Auto market selection** — Finds best 1-hour binary markets
- **Smart betting strategy** — Follows majority + price + payout analysis
- **Achievement tracking** — Tracks quest progress automatically

## Quick Start

```bash
# Clone repo
git clone https://github.com/shadewaltz/unhedged-quest-bot.git
cd unhedged-quest-bot

# Create .env file
cp .env.example .env
# Edit .env with your API keys

# Run
bun run bot.js

# Or compile to executable
bun run build
./unhedged-bot
```

## Multi-Account Setup

### 1. Create account-specific env vars

```bash
# .env
UNHEDGED_API_KEY=default_key
UNHEDGED_ACCOUNT1=key1
UNHEDGED_ACCOUNT2=key2
UNHEDGED_ACCOUNT3=key3
CMC_API_KEY=your_cmc_key
```

### 2. Create account-specific configs

```bash
mkdir config

# config/account1.json - aggressive
{
  "betting": {
    "majorityThreshold": 0.70,
    "minPoolSize": 2000,
    "maxTotalBets": 50
  }
}

# config/account2.json - conservative
{
  "betting": {
    "majorityThreshold": 0.90,
    "minPoolSize": 5000,
    "maxTotalBets": 20
  }
}
```

### 3. Run multiple accounts (different terminals)

```bash
# Terminal 1 - Account 1
bun run bot.js -u UNHEDGED_ACCOUNT1 -f config/account1.json

# Terminal 2 - Account 2
bun run bot.js -u UNHEDGED_ACCOUNT2 -f config/account2.json

# Terminal 3 - Account 3
bun run bot.js -u UNHEDGED_ACCOUNT3 -f config/account3.json
```

## CLI Flags

| Flag             | Description                       |
|------------------|-----------------------------------|
| `-u, --unhedged` | Env var name for Unhedged API key |
| `-c, --cmc`      | Env var name for CMC API key      |
| `-f, --config`   | Path to custom config JSON        |
| `--dry-run`      | Simulate without placing bets     |

## Proxy Support

The bot supports multiple proxies for better rate limit avoidance. Create a `proxies.txt` file in the root directory and
add one proxy per line:

```text
http://user:pass@proxy1:port
http://user:pass@proxy2:port
```

The bot rotates to a different proxy for every API request.

## Configuration Options

See `config.example.json` for all options:

| Setting                             | Default      | Description                      |
|-------------------------------------|--------------|----------------------------------|
| `timezone`                          | Asia/Jakarta | Display timezone                 |
| `betting.windowMinutes`             | 10           | Start betting X min before close |
| `betting.majorityThreshold`         | 0.90         | Min majority % to bet            |
| `betting.minPayoutThreshold`        | 0            | Min payout in CC (e.g. 10.5)     |
| `betting.minPoolSize`               | 3000         | Min pool size in CC              |
| `betting.priceUncertaintyThreshold` | 0.001        | Skip if price within X%          |
| `betting.cooldownMs`                | 2500         | Delay between bets               |
| `betting.maxTotalBets`              | null         | Stop after N bets                |
| `betting.useAllBalance`             | false        | Use entire balance for each bet  |

## Strategy

The bot combines two signals:

1. **Majority** (60% weight) — crowd wisdom
2. **Price delta** (40% weight) — current vs target price

Payout estimation is calculated using a pari-mutuel formula that accounts for your bet size (dilution) and platform
fees:
`payout_multiplier = (Total Pool + Your Bet) / (Outcome Pool + Your Bet) * (1 - Platform Fee)`
`total_payout_cc = Your Bet * payout_multiplier`

Only bets when:

- Majority >= threshold (default 90%)
- Pool size >= min (default 3000 CC)
- Payout (in CC) >= min threshold (default 0 - disabled)
- Price delta > uncertainty threshold

## Safety Features

- Idempotency keys prevent duplicates
- Rate limit protection (30 req/min)
- Auto-retry on server errors
- Resume tracking on restart
- Balance checks before betting

## Disclaimer

This bot is for educational purposes. Use at your own risk. Gambling involves financial risk.
