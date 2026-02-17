import {parseCliArgs, deepMerge, validateConfig, loadJsonFile} from './utils.js';

const cliArgs = parseCliArgs();

// Default configuration
const defaultConfig = {
  timezone: 'Asia/Jakarta',
  betting: {
    windowMinutes: 10,
    majorityWeight: 0.6,
    priceDeltaWeight: 0.4,
    majorityThreshold: 0.90,
    minPoolSize: 3000,
    priceUncertaintyThreshold: 0.01,
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
};

// Load custom config if specified
const fileConfig = await loadJsonFile(cliArgs.configFile);

// Merge: default <- file config <- CLI overrides
const mergedConfig = deepMerge(deepMerge({}, defaultConfig), fileConfig);

export const config = {
  ...mergedConfig,
  apiKey: process.env[cliArgs.unhedgedKeyName],
  cmcApiKey: process.env[cliArgs.cmcKeyName],
  dryRun: cliArgs.dryRun
};

// Validate config
validateConfig(config);
