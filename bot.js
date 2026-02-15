import { config } from './config.js';
import { UnhedgedAPI } from './api.js';
import { Strategy } from './strategy.js';
import { Logger, colorize } from './logger.js';

class QuestBot {
  constructor() {
    this.api = new UnhedgedAPI(config.apiKey, { 
      rateLimit: config.rateLimit,
      serverErrorRetry: config.serverErrorRetry 
    });
    this.strategy = new Strategy(config);
    this.logger = new Logger();
    this.isRunning = false;
    this.dryRun = config.dryRun;
    this.betsInWindow = [];
    this.currentMarket = null;
    this.totalBetsPlaced = 0; // Track total bets across all markets
    this.maxTotalBets = config.betting.maxTotalBets || null;
  }

  async init() {
    this.logger.info('Unhedged Quest Bot initializing...');
    this.logger.info(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE TRADING'}`);
    if (this.maxTotalBets) {
      this.logger.info(`Max bets limit: ${this.maxTotalBets}`);
    }
    this.logger.info(`Price threshold: ${colorize((config.betting.priceUncertaintyThreshold * 100).toFixed(2) + '%', 'cyan')}`);
    this.logger.info(`Majority threshold: ${colorize((config.betting.majorityThreshold * 100).toFixed(0) + '%', 'cyan')}`);
    this.logger.info(`Min pool size: ${colorize(config.betting.minPoolSize + ' CC', 'cyan')}`);
    
    // Check for existing pending bets and resume tracking
    await this.checkPendingBets();
    
    // Show achievement progress
    await this.showAchievementProgress();
  }

  async checkPendingBets() {
    try {
      this.logger.info('Checking for pending bets...');
      // Check for both PENDING and CONFIRMED bets (waiting for resolution)
      const pendingBets = await this.api.listBets({ status: 'PENDING', limit: 10 });
      const confirmedBets = await this.api.listBets({ status: 'CONFIRMED', limit: 10 });
      
      const allBets = [...(pendingBets.bets || []), ...(confirmedBets.bets || [])];
      this.logger.info(`Found ${allBets.length} active bets (pending + confirmed)`);
      
      if (allBets.length > 0) {
        const bet = allBets[0];
        this.logger.info(`Active bet marketId: ${bet.marketId}, status: ${bet.status}`);
        
        // Get market details
        const market = await this.api.getMarket(bet.marketId);
        this.currentMarket = market.market || market;
        
        this.logger.info(colorize(`Resuming tracking: ${this.currentMarket.question}`, 'green'));
      } else {
        this.logger.info('No active bets found');
      }
    } catch (err) {
      this.logger.error('Error checking pending bets:', err.message);
    }
  }

  async showAchievementProgress() {
    try {
      const progress = await this.api.getAchievementProgress();
      
      if (!progress.progress || progress.progress.length === 0) {
        return;
      }
      
      const quest = progress.progress[0];
      const achievement = quest.achievement;
      const currentStep = achievement.steps.find(s => s.stepNumber === quest.completedStep + 1);
      
      this.logger.info(`Achievement: ${achievement.name}: Step ${quest.completedStep}/5 complete`);
      const pctBets = Math.round((quest.currentBets / 750) * 100);
      const pctVol = Math.round((parseFloat(quest.currentVolume) / 2000) * 100);
      this.logger.info(`Progress: ${quest.currentBets} bets ${colorize('(' + pctBets + '%)', 'cyan')} / ${quest.currentVolume} CC ${colorize('(' + pctVol + '%)', 'cyan')}`);
      
      if (currentStep) {
        const betsNeeded = currentStep.requiredBets - quest.currentBets;
        const volumeNeeded = parseFloat(currentStep.requiredVolume) - parseFloat(quest.currentVolume);
        this.logger.info(`Current: Step ${currentStep.stepNumber} — need ${colorize(Math.max(0, betsNeeded) + ' more bets', 'yellow')}, ${colorize(Math.max(0, volumeNeeded.toFixed(2)) + ' more CC', 'yellow')}`);
        this.logger.info(`Reward: ${colorize(currentStep.rewardAmount + ' CC', 'green')}`);
      } else {
        this.logger.info(colorize('Quest complete! Total reward: 680 CC', 'green'));
      }
    } catch (err) {
      // Silently fail if achievements endpoint doesn't work
      this.logger.debug('Could not fetch achievement progress:', err.message);
    }
  }

  async run() {
    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.cycle();
      } catch (err) {
        this.logger.error('Error in cycle:', err.message);
        await this.sleep(30000); // Wait 30s on error
      }
    }
  }

  async cycle() {
    // Step 1: Find the best 1-hour binary market (if we don't have one)
    if (!this.currentMarket) {
      this.logger.info('Finding best 1-hour binary market...');
      this.currentMarket = await this.findBestMarket();

      if (!this.currentMarket) {
        this.logger.info(colorize('No 1-hour market available. Waiting 60s...', 'yellow'));
        await this.sleep(60000);
        return;
      }
    }

    const market = this.currentMarket;

    this.logger.info('Market: ' + market.question);
    
    // Format time in configured timezone
    const closeTimeStr = new Date(market.endTime).toLocaleString('en-US', {
      timeZone: config.timezone,
      hour12: false,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    // Calculate time left
    const now = new Date();
    const endTime = new Date(market.endTime);
    const timeToClose = endTime - now;
    
    // If market already closed and we have pending bets, just wait quietly
    if (timeToClose <= 0) {
      // Check if we have pending bets in this market
      const hasPending = await this.hasPendingBetsInMarket(market.id);
      if (hasPending) {
        this.logger.info('Market closed. Waiting for resolution...');
        await this.waitForMarketToResolve(market.id);
        this.currentMarket = null;
        return;
      }
      // No bets placed and market closed - find new market
      this.currentMarket = null;
      return;
    }
    
    this.logger.info(`Closes at: ${closeTimeStr} (${config.timezone}) — ${Math.floor(timeToClose / 60000)}m left`);
    this.logger.info(`Min bet: ${market.minimumBet || '0.1'} CC`);

    // Show target and current price
    const asset = this.parseAssetFromQuestion(market.question);
    if (asset) {
      const priceMatch = market.question.match(/\$?([\d,]+(?:\.\d+)?)/);
      const targetPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
      const currentPrice = await this.getCurrentPrice(asset);
      
      if (targetPrice && currentPrice) {
        const delta = ((currentPrice - targetPrice) / targetPrice * 100).toFixed(2);
        const sign = delta >= 0 ? '+' : '';
        const deltaColor = parseFloat(delta) >= 0 ? 'green' : 'red';
        this.logger.info(`Target: ${colorize('$' + targetPrice.toFixed(2), 'yellow')} | Current: ${colorize('$' + currentPrice.toFixed(2), 'green')} (${colorize(sign + delta + '%', deltaColor)})`);
      }
    }

    // Step 2: Check balance
    const balance = await this.api.getBalance();
    const availableBalance = parseFloat(balance.balance?.available || '0');
    const minBet = parseFloat(market.minimumBet || '0.1');

    this.logger.info(`Balance: ${colorize(availableBalance.toFixed(2) + ' CC', 'green')}`);

    if (availableBalance < minBet) {
      this.logger.warn(colorize('Low balance! Waiting for bets to resolve...', 'yellow'));
      await this.waitForBetsToResolve();
      return;
    }

    // Step 3: Wait until betting window before close
    const windowMs = config.betting.windowMinutes * 60 * 1000;

    if (timeToClose > windowMs) {
      const waitTime = timeToClose - windowMs;
      this.logger.info(`Sleeping ${Math.floor(waitTime / 60000)}m until ${config.betting.windowMinutes}min betting window...`);
      await this.sleep(Math.min(waitTime, 300000)); // Max 5 min sleep intervals to stay responsive
      return; // Go back to cycle start to recheck
    }

    // Step 4: SPAM BET in the final 5 minutes
    await this.spamBets(market, availableBalance);

    // Step 5: Wait for this market to resolve before finding next
    this.logger.info('Market closed. Waiting for resolution...');
    await this.waitForMarketToResolve(market.id);
    this.currentMarket = null;
  }

  async findBestMarket() {
    // Search for all active 1-hour binary markets
    try {
      const markets = await this.api.listMarkets({
        status: 'ACTIVE',
        limit: 20
      });

      if (!markets.markets || markets.markets.length === 0) {
        return null;
      }

      // Filter for 1-hour binary markets
      // 1-hour markets close within 60-70 minutes of opening
      // We detect by checking endTime is within reasonable range
      const oneHourMarkets = [];
      const now = new Date();
      
      for (const m of markets.markets) {
        const question = m.question?.toLowerCase() || '';
        const isBinary = question.includes('above') || question.includes('below');
        
        // Check if it's roughly 1-hour duration (closes within 90 minutes)
        const endTime = new Date(m.endTime);
        const timeToClose = endTime - now;
        const isShortTerm = timeToClose > 0 && timeToClose <= 90 * 60 * 1000; // 90 min max
        
        if (isBinary && isShortTerm) {
          oneHourMarkets.push(m);
        }
      }

      if (oneHourMarkets.length === 0) {
        return null;
      }

      // Sort by end time (soonest first)
      oneHourMarkets.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

      // Check each market for favorable conditions
      const windowMs = config.betting.windowMinutes * 60 * 1000;
      
      for (const m of oneHourMarkets) {
        const endTime = new Date(m.endTime);
        const timeToClose = endTime - now;
        
        // Skip if market already closed (status check is more reliable than time)
        // Markets should be ACTIVE to consider
        if (m.status !== 'ACTIVE') {
          continue;
        }

        // Get stats to check if market is favorable
        try {
          const stats = await this.api.getMarketStats(m.id);
          const outcomeStats = stats?.stats?.outcomeStats || [];
          const prob0 = outcomeStats[0]?.impliedProbability || 0;
          const prob1 = outcomeStats[1]?.impliedProbability || 0;
          const maxProb = Math.max(prob0, prob1);
          const totalPool = parseFloat(stats?.stats?.totalPool || '0');
          
          // Check if majority meets threshold AND pool is large enough
          const majorityOk = maxProb >= config.betting.majorityThreshold;
          const poolOk = totalPool >= config.betting.minPoolSize;
          
          if (majorityOk && poolOk) {
            this.logger.info(colorize(`Found favorable market: ${m.question}`, 'green'));
            this.logger.info(`Majority: ${colorize((maxProb * 100).toFixed(0) + '%', 'green')} | Pool: ${colorize(totalPool.toFixed(0) + ' CC', 'green')}`);
            return m;
          }
        } catch (err) {
          // Skip if can't get stats
          continue;
        }
      }

      // No favorable market found - return null to trigger wait and retry
      this.logger.info(colorize('No favorable market found. Waiting for better conditions...', 'yellow'));
      return null;

    } catch (err) {
      this.logger.error('Failed to fetch markets:', err.message);
      return null;
    }
  }

  async waitForMarketToResolve(marketId) {
    this.logger.info('Waiting for market to resolve (checking every 30s)...');

    while (this.isRunning) {
      try {
        const response = await this.api.getMarket(marketId);
        const market = response.market || response; // Handle wrapped response

        if (!market || !market.status) {
          this.logger.info(`Market data incomplete, retrying...`);
          await this.sleep(5000);
          continue;
        }

        if (market.status === 'RESOLVED' || market.status === 'VOIDED') {
          this.logger.info(`Market ${market.status.toLowerCase()}!`);
          return;
        }

        this.logger.info(`Market status: ${market.status}, waiting...`);
      } catch (err) {
        this.logger.error('Error checking market:', err.message);
      }

      await this.sleep(30000);
    }
  }

  async spamBets(market, availableBalance) {
    const minBet = parseFloat(market.minimumBet || '0.1');
    const endTime = new Date(market.endTime);

    this.logger.info('ENTERING BETTING WINDOW - SPAM MODE ACTIVATED');
    
    // Check if market is favorable at start of window
    try {
      const stats = await this.api.getMarketStats(market.id);
      const outcomeStats = stats?.stats?.outcomeStats || [];
      const prob0 = outcomeStats[0]?.impliedProbability || 0;
      const prob1 = outcomeStats[1]?.impliedProbability || 0;
      const maxProb = Math.max(prob0, prob1);
      const totalPool = parseFloat(stats?.stats?.totalPool || '0');
      
      const majorityOk = maxProb >= config.betting.majorityThreshold;
      const poolOk = totalPool >= config.betting.minPoolSize;
      
      if (!majorityOk || !poolOk) {
        const reasons = [];
        if (!majorityOk) reasons.push(`${(maxProb * 100).toFixed(0)}% majority (need ${(config.betting.majorityThreshold * 100).toFixed(0)}%)`);
        if (!poolOk) reasons.push(`${totalPool.toFixed(0)} CC pool (need ${config.betting.minPoolSize})`);
        this.logger.info(`Market unfavorable: ${colorize(reasons.join(', '), 'yellow')} — will skip all bets`);
      }
    } catch (err) {
      // Silently continue if can't check
    }
    
    // Check if we've reached max bets limit
    if (this.maxTotalBets && this.totalBetsPlaced >= this.maxTotalBets) {
      this.logger.info(`Reached max bets limit (${this.maxTotalBets}). Stopping.`);
      this.isRunning = false;
      return;
    }

    while (this.isRunning) {
      const now = new Date();
      const timeLeft = endTime - now;

      // Stop when market closes
      if (timeLeft <= 0) {
        this.logger.info('Market closed!');
        break;
      }

      // Check max bets limit
      if (this.maxTotalBets && this.totalBetsPlaced >= this.maxTotalBets) {
        this.logger.info(`Reached max bets limit (${this.maxTotalBets}). Stopping.`);
        this.isRunning = false;
        break;
      }

      // Check balance again
      if (availableBalance < minBet) {
        this.logger.warn(colorize('Out of balance during spam!', 'red'));
        break;
      }

      // Check rate limit
      const remainingRequests = await this.getRemainingRequests();
      if (remainingRequests < 2) {
        this.logger.info('Rate limit buffer, waiting...');
        await this.sleep(2000);
        continue;
      }

      // Get fresh market stats
      let stats, currentPrice;
      try {
        stats = await this.api.getMarketStats(market.id);
        
        // Get current price for the correct asset
        const asset = this.parseAssetFromQuestion(market.question);
        if (!asset) {
          this.logger.info('Cannot fetch price for this asset type, using majority only');
          currentPrice = null;
        } else {
          currentPrice = await this.getCurrentPrice(asset);
        }
      } catch (err) {
        this.logger.error('Failed to get market data:', err.message);
        await this.sleep(1000);
        continue;
      }

      // Decide and place bet
      const decision = this.strategy.decide(market, stats, currentPrice, availableBalance, minBet);

      if (decision.shouldBet) {
        // Final check: ensure market hasn't closed during decision making
        const timeLeftNow = endTime - Date.now();
        if (timeLeftNow <= 0) {
          this.logger.info('Market closed while deciding, skipping bet');
          break;
        }
        
        await this.placeBet(market, decision);
        availableBalance -= minBet; // Deduct locally for tracking

        // Update progress every 10 bets
        if ((this.betsInWindow.length % 10) === 0) {
          this.logger.info(`Progress: ${this.betsInWindow.length} bets in current window`);
        }
      } else {
        this.logger.info(`Skipped: ${decision.reason}`);
      }

      // Small delay between bets (respect cooldown)
      await this.sleep(config.betting.cooldownMs);
    }
  }

  async placeBet(market, decision) {
    const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const marketId = market.id;
    
    // Get outcome label (YES/NO)
    const outcomeLabel = market.outcomes?.[decision.outcomeIndex]?.label || `outcome ${decision.outcomeIndex}`;

    if (this.dryRun) {
      this.logger.info(`[DRY RUN] Would bet ${decision.amount} CC on ${outcomeLabel}`);
      this.totalBetsPlaced++;
      if (this.maxTotalBets) {
        this.logger.info(`Progress: Progress: ${this.totalBetsPlaced}/${this.maxTotalBets} bets (dry run)`);
      }
      return;
    }

    this.betsInWindow.push(Date.now());
    this.cleanupBetTimestamps();

    try {
      const result = await this.api.placeBet({
        marketId,
        outcomeIndex: decision.outcomeIndex,
        amount: decision.amount,
        idempotencyKey
      });

      this.logger.success(colorize(`Bet placed: ${decision.amount} CC on ${outcomeLabel}`, 'green'));
      this.totalBetsPlaced++;
      
      if (this.maxTotalBets) {
        this.logger.info(`Progress: Progress: ${this.totalBetsPlaced}/${this.maxTotalBets} bets`);
      }

    } catch (err) {
      this.logger.error(colorize('Bet failed:', 'red'), err.message);
    }
  }

  async hasPendingBetsInMarket(marketId) {
    try {
      const bets = await this.api.listBets({ status: 'PENDING', marketId, limit: 1 });
      return bets.bets && bets.bets.length > 0;
    } catch {
      return false;
    }
  }

  async waitForBetsToResolve() {
    this.logger.info('Waiting for bets to resolve (checking every 60s)...');

    while (this.isRunning) {
      // Check if we have any pending bets at all
      try {
        const bets = await this.api.listBets({ status: 'PENDING', limit: 1 });

        if (!bets.bets || bets.bets.length === 0) {
          this.logger.info('All bets resolved!');
          const balance = await this.api.getBalance();
          this.logger.info(`New balance: ${balance.balance?.available} CC`);
          return;
        }
      } catch (err) {
        this.logger.error('Error checking bets:', err.message);
      }

      await this.sleep(60000);
    }
  }

  async getRemainingRequests() {
    this.cleanupBetTimestamps();
    const requestsMade = this.betsInWindow.length + (this.api._requestTimestamps?.length || 0);
    return 30 - requestsMade;
  }

  parseAssetFromQuestion(question) {
    const lower = question.toLowerCase();
    
    if (lower.includes('bitcoin') || lower.includes('btc')) return 'BTC';
    if (lower.includes('ethereum') || lower.includes('eth')) return 'ETH';
    if (lower.includes('solana') || lower.includes('sol')) return 'SOL';
    if (lower.includes('canton coin') || lower.includes('cc')) return null; // No price API
    
    // Default to BTC if can't determine
    return 'BTC';
  }

  cleanupBetTimestamps() {
    const oneMinuteAgo = Date.now() - 60000;
    this.betsInWindow = this.betsInWindow.filter(ts => ts > oneMinuteAgo);
  }

  async getCurrentPrice(asset = 'BTC') {
    // Fetch price from CoinMarketCap
    if (!config.cmcApiKey) {
      this.logger.error('CMC_API_KEY not set. Cannot fetch price.');
      return null;
    }
    
    try {
      const response = await fetch(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${asset}`,
        {
          headers: {
            'X-CMC_PRO_API_KEY': config.cmcApiKey,
            'Accept': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`CMC API error: ${response.status}`);
      }
      
      const data = await response.json();
      const price = data.data?.[asset]?.quote?.USD?.price;
      
      if (!price || isNaN(price)) {
        throw new Error(`Invalid CMC price for ${asset}`);
      }
      
      return price;
    } catch (err) {
      this.logger.error(`Failed to fetch ${asset} price from CMC:`, err.message);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
    this.logger.info('Bot stopped');
  }
}

// Run the bot
const bot = new QuestBot();

process.on('SIGINT', () => {
  bot.stop();
  process.exit(0);
});

bot.init().then(() => bot.run()).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
