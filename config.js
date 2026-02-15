// Parse CLI arguments for API keys
function parseCliArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    unhedgedKeyName: 'UNHEDGED_API_KEY',  // default
    cmcKeyName: 'CMC_API_KEY',            // default
    dryRun: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-u' || arg === '--unhedged') {
      // Next arg is the env var name
      parsed.unhedgedKeyName = args[i + 1];
      i++; // skip next
    } else if (arg === '-c' || arg === '--cmc') {
      parsed.cmcKeyName = args[i + 1];
      i++; // skip next
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  
  return parsed;
}

const cliArgs = parseCliArgs();

export const config = {
  // API Configuration - use CLI-specified env vars or defaults
  apiBaseUrl: 'https://api.unhedged.gg',
  apiKey: process.env[cliArgs.unhedgedKeyName],
  cmcApiKey: process.env[cliArgs.cmcKeyName],
  
  // CLI flags
  dryRun: cliArgs.dryRun,
  
  // Timezone for displaying times (default: UTC)
  // Examples: 'UTC', 'Asia/Jakarta', 'America/New_York'
  timezone: 'Asia/Jakarta',
  
  // Betting Configuration
  betting: {
    // Time window: start betting X minutes before close
    windowMinutes: 10,

    // Bet sizing
    minBet: 0.1,        // Minimum bet amount
    maxBet: 5,          // Maximum bet amount
    targetBetCount: 750,  // Quest requirement
    targetVolume: 2000,   // Quest requirement

    // Strategy weights (0-1)
    majorityWeight: 0.6,      // Weight to give majority bet side
    priceDeltaWeight: 0.4,    // Weight to give price delta analysis

    // Majority threshold (0-1): only bet when majority >= this percentage
    majorityThreshold: 0.80,  // 80%

    // Minimum pool size to consider a market (in CC)
    // Skip markets with smaller pools (low liquidity = risky)
    minPoolSize: 3000,  // Minimum 500 CC in pool

    // Price uncertainty threshold: skip if price within X% of target
    priceUncertaintyThreshold: 0.001,  // 0.3%

    // Cooldown between bets (ms)
    // Rate limit: 30 requests/min = 1 request every 2s minimum
    // Using 2500ms to have some buffer
    cooldownMs: 2500,
    
    // Maximum total bets to place (null = unlimited)
    // Set to a number to stop after placing that many bets
    maxTotalBets: null
  },

  // Rate Limiting
  rateLimit: {
    maxRequestsPerMinute: 30,
    bufferRequests: 5,     // Keep this many requests in reserve
    retryAfterMs: 2000     // Wait this long after hitting limit
  },

  // Server Error Retry
  serverErrorRetry: {
    enabled: true,         // Auto-retry on 502/503/504 errors
    maxRetries: 3,         // How many retries
    waitMs: 5000           // Wait time between retries (ms)
  },
  
  // Logging
  logLevel: 'info'
};

// Validate config
if (!config.apiKey) {
  console.error('❌ UNHEDGED_API_KEY environment variable required');
  process.exit(1);
}
