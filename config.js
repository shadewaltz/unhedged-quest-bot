import {parseCliArgs, deepMerge, validateConfig, loadJsonFile} from './lib/utils.js';

const cliArgs = parseCliArgs();

// Default configuration
const defaultConfig = {
  timezone: 'Asia/Jakarta',
  betting: {
    windowMinutes: 1,
    majorityWeight: 0.6,
    priceDeltaWeight: 0.4,
    majorityThreshold: 0.70,
    minPayoutThreshold: 10,
    minPoolSize: 2000,
    priceUncertaintyThreshold: 0.005,
    cooldownMs: 2500,
    marketSearchIntervalMs: 10000,
    marketResolutionCheckIntervalMs: 30000,
    betResolutionCheckIntervalMs: 60000,
    maxTotalBets: null,
    useAllBalance: true
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
};

// Load custom config if specified
const fileConfig = await loadJsonFile(cliArgs.configFile);

// Merge: default <- file config <- CLI overrides
const mergedConfig = deepMerge(deepMerge({}, defaultConfig), fileConfig);

// Load proxies from proxies.txt if it exists
const fileProxies = [];
try {
  const proxiesFile = Bun.file('proxies.txt');
  if (await proxiesFile.exists()) {
    const content = await proxiesFile.text();
    fileProxies.push(...content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')));
    console.log(`Loaded ${fileProxies.length} proxies from proxies.txt`);
  }
} catch (err) {
  // Ignore errors reading proxies.txt
}

export const config = {
  ...mergedConfig,
  apiKey: process.env[cliArgs.unhedgedKeyName],
  cmcApiKey: process.env[cliArgs.cmcKeyName],
  dryRun: cliArgs.dryRun,
  proxies: [...new Set(fileProxies)]
};

// Validate config
validateConfig(config);
