export class UnhedgedAPI {
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.unhedged.gg';
    this.rateLimit = {
      maxRequestsPerMinute: 30,
      bufferRequests: 5,
      retryAfterMs: 2000,
      ...config.rateLimit
    };
    this.serverErrorRetry = {
      enabled: true,
      maxRetries: 1,
      waitMs: 5000,
      ...config.serverErrorRetry
    };

    // Rate limit tracking
    this._requestTimestamps = [];
    this.minRequestInterval = (60 * 1000) / (this.rateLimit.maxRequestsPerMinute - this.rateLimit.bufferRequests);
  }

  async request(endpoint, options = {}) {
    // Enforce rate limiting
    await this.enforceRateLimit();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // Track this request
    this._requestTimestamps.push(Date.now());
    this.cleanupOldTimestamps();

    // Handle rate limit response
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || this.rateLimit.retryAfterMs / 1000;
      console.log(`⏳ Rate limited. Waiting ${retryAfter}s...`);
      await this.sleep(retryAfter * 1000);
      return this.request(endpoint, options); // Retry
    }

    // Handle server errors (502, 503, 504) with retry
    if (response.status >= 502 && response.status <= 504) {
      const errorText = await response.text();
      const isHtml = errorText.includes('<!DOCTYPE html>');
      const cleanError = isHtml 
        ? `Server error ${response.status}` 
        : errorText.substring(0, 200);
      
      // Auto-retry if enabled
      if (this.serverErrorRetry.enabled) {
        const currentRetry = options._serverRetryCount || 0;
        if (currentRetry < this.serverErrorRetry.maxRetries) {
          console.log(`⚠️ ${cleanError}, retrying ${currentRetry + 1}/${this.serverErrorRetry.maxRetries} in ${this.serverErrorRetry.waitMs}ms...`);
          await this.sleep(this.serverErrorRetry.waitMs);
          return this.request(endpoint, { 
            ...options, 
            _serverRetryCount: currentRetry + 1 
          });
        }
      }
      
      throw new Error(cleanError);
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error.substring(0, 500)}`);
    }

    return response.json();
  }

  async enforceRateLimit() {
    this.cleanupOldTimestamps();

    const now = Date.now();
    const requestsInWindow = this._requestTimestamps.length;
    const maxAllowed = this.rateLimit.maxRequestsPerMinute - this.rateLimit.bufferRequests;

    if (requestsInWindow >= maxAllowed) {
      // Calculate wait time until oldest request falls out of the 1-minute window
      const oldestTimestamp = this._requestTimestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp) + 100; // +100ms buffer

      if (waitTime > 0) {
        console.log(`⏳ Rate limit buffer: waiting ${(waitTime/1000).toFixed(1)}s...`);
        await this.sleep(waitTime);
      }
    }

    // Also enforce minimum interval between requests
    if (this._requestTimestamps.length > 0) {
      const lastRequest = this._requestTimestamps[this._requestTimestamps.length - 1];
      const timeSinceLastRequest = now - lastRequest;

      if (timeSinceLastRequest < this.minRequestInterval) {
        const waitTime = this.minRequestInterval - timeSinceLastRequest;
        await this.sleep(waitTime);
      }
    }
  }

  cleanupOldTimestamps() {
    const oneMinuteAgo = Date.now() - 60000;
    this._requestTimestamps = this._requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Markets
  async listMarkets(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/v1/markets/?${query}`);
  }

  async getMarket(id) {
    return this.request(`/api/v1/markets/${id}`);
  }

  async getMarketStats(id) {
    return this.request(`/api/v1/markets/${id}/stats`);
  }

  // Bets
  async listBets(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/v1/bets/?${query}`);
  }

  async placeBet({ marketId, outcomeIndex, amount, idempotencyKey }) {
    return this.request('/api/v1/bets/', {
      method: 'POST',
      body: JSON.stringify({
        marketId,
        outcomeIndex,
        amount,
        idempotencyKey
      })
    });
  }

  // Portfolio
  async getPortfolio() {
    return this.request('/api/v1/portfolio/me');
  }

  async getBalance() {
    return this.request('/api/v1/balance/');
  }

  async getEquity() {
    return this.request('/api/v1/portfolio/me/equity');
  }

  // Achievements
  async getAchievements() {
    return this.request('/api/v1/achievements');
  }

  async getAchievementProgress() {
    return this.request('/api/v1/achievements/progress');
  }
}
