/**
 * Deep merge two objects
 * @param {Object} target
 * @param {Object} source
 * @returns {Object}
 */
export function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Parse CLI arguments for API keys and config file
 * @returns {Object}
 */
export function parseCliArgs() {
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

/**
 * Load and parse a JSON file using Bun.file
 * @param {string} path
 * @returns {Promise<Object>}
 */
export async function loadJsonFile(path) {
  if (!path) return {};
  try {
    const text = await Bun.file(path).text();
    const file = JSON.parse(text);
    console.log(`Loaded config from: ${path}`);
    return file;
  } catch (err) {
    console.error(`Failed to load config file: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Validate the bot configuration
 * @param {Object} config
 */
export function validateConfig(config) {
  if (!config.apiKey) {
    console.error('UNHEDGED_API_KEY environment variable required');
    process.exit(1);
  }
}
