// Parse CLI arguments for API keys and config file
function parseCliArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    unhedgedKeyName: 'UNHEDGED_API_KEY',
    cmcKeyName: 'CMC_API_KEY',
    proxyKeyName: null,  // null = no proxy
    configFile: null,
    dryRun: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-u' || arg === '--unhedged') {
      parsed.unhedgedKeyName = args[i + 1];
      i++;
    } else if (arg === '-c' || arg === '--cmc') {
      parsed.cmcKeyName = args[i + 1];
      i++;
    } else if (arg === '-p' || arg === '--proxy') {
      parsed.proxyKeyName = args[i + 1];
      i++;
    } else if (arg === '-f' || arg === '--config') {
      parsed.configFile = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
  }
  
  return parsed;
}

const cliArgs = parseCliArgs();

// Default configuration
const defaultConfig = {
  apiBaseUrl: 'https://api.unhedged.gg',
  timezone: 'Asia/Jakarta',
  
  proxy: process.env[cliArgs.proxyKeyName] || null,
  
  betting: {
    windowMinutes: 10,
    minBet: 0.1,
    maxBet: 5,
    targetBetCount: 750,
    targetVolume: 2000,
    majorityWeight: 0.6,
    priceDeltaWeight: 0.4,
    majorityThreshold: 0.80,
    minPoolSize: 3000,
    priceUncertaintyThreshold: 0.001,
    cooldownMs: 2500,
    maxTotalBets: null
  },

  rateLimit: {
    maxRequestsPerMinute: 30,
    bufferRequests: 5,
    retryAfterMs: 2000
  },

  serverErrorRetry: {
    enabled: true,
    maxRetries: 3,
    waitMs: 5000
  },
  
  logLevel: 'info'
};

// Load custom config if specified
let fileConfig = {};
if (cliArgs.configFile) {
  try {
    const file = await Bun.file(cliArgs.configFile).json();
    fileConfig = file;
    console.log(`Loaded config from: ${cliArgs.configFile}`);
  } catch (err) {
    console.error(`Failed to load config file: ${err.message}`);
    process.exit(1);
  }
}

// Deep merge function
function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Merge: default <- file config <- CLI overrides
const mergedConfig = deepMerge(deepMerge({}, defaultConfig), fileConfig);

export const config = {
  ...mergedConfig,
  apiKey: process.env[cliArgs.unhedgedKeyName],
  cmcApiKey: process.env[cliArgs.cmcKeyName],
  dryRun: cliArgs.dryRun
};

// Debug: log loaded config
if (cliArgs.configFile) {
  console.log(`Config loaded: majorityWeight=${config.betting.majorityWeight}, priceDeltaWeight=${config.betting.priceDeltaWeight}`);
}

// Validate config
if (!config.apiKey) {
  console.error('UNHEDGED_API_KEY environment variable required');
  process.exit(1);
}
