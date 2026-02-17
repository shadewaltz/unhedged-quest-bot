export class Strategy {
  constructor(config) {
    this.config = config.betting;
    this.lastBetTime = 0;
  }

  decide(market, stats, currentPrice, availableBalance, minBet) {
    const now = Date.now();
    const timeSinceLastBet = now - this.lastBetTime;

    // Enforce cooldown
    if (timeSinceLastBet < this.config.cooldownMs) {
      return {shouldBet: false, reason: 'Cooldown active'};
    }

    // Check balance
    if (availableBalance < minBet) {
      return {shouldBet: false, reason: `Insufficient balance: ${availableBalance} CC < ${minBet} CC min bet`};
    }

    // Use all balance or minimum bet
    const amount = this.config.useAllBalance ? availableBalance : minBet;

    // Determine outcome with confidence check
    const outcome = this.selectOutcome(market, stats, currentPrice, amount);

    // Skip if confidence is too low (uncertain)
    if (!outcome.shouldBet) {
      return {shouldBet: false, reason: outcome.reason};
    }

    this.lastBetTime = now;

    return {
      shouldBet: true,
      outcomeIndex: outcome.index,
      amount: amount,
      reason: outcome.reason,
      confidence: outcome.confidence
    };
  }

  selectOutcome(market, stats, currentPrice, amount = 0) {
    const outcomes = market.outcomes || [];
    if (outcomes.length !== 2) {
      return {shouldBet: false, reason: 'Not a binary market', index: 0, confidence: 0};
    }

    // Get pool distribution from stats
    const outcomeStats = stats?.stats?.outcomeStats || [];
    const pool0 = parseFloat(outcomeStats[0]?.totalAmount || '0');
    const pool1 = parseFloat(outcomeStats[1]?.totalAmount || '0');
    const totalPool = pool0 + pool1;

    // Also get implied probability (what website shows)
    const prob0 = outcomeStats[0]?.impliedProbability || 0;
    const prob1 = outcomeStats[1]?.impliedProbability || 0;

    const majorityIndex = pool0 > pool1 ? 0 : 1;
    const majorityConfidence = totalPool > 0 ? Math.max(pool0, pool1) / totalPool : 0;

    // Use implied probability for display
    const impliedMajorityProb = Math.max(prob0, prob1);

    // Signal 1: Majority must meet threshold
    const majorityThreshold = this.config.majorityThreshold || 0.80;
    if (majorityConfidence < majorityThreshold) {
      return {
        shouldBet: false,
        reason: `Majority too weak: ${(majorityConfidence * 100).toFixed(0)}% pool / ${(impliedMajorityProb * 100).toFixed(0)}% implied (need >=${(majorityThreshold * 100).toFixed(0)}%)`,
        index: 0,
        confidence: 0
      };
    }

    // Price delta analysis
    if (!currentPrice || !this.isPriceMarket(market.question)) {
      return {
        shouldBet: false,
        reason: 'No price data available',
        index: 0,
        confidence: 0
      };
    }

    const {targetPrice, isAbove} = this.parsePriceTarget(market.question);

    if (!targetPrice) {
      return {
        shouldBet: false,
        reason: 'Could not parse target price',
        index: 0,
        confidence: 0
      };
    }

    // Calculate price delta
    const priceDelta = currentPrice - targetPrice;
    const percentDelta = Math.abs(priceDelta / targetPrice);

    // Signal 2: Skip if price difference is too tight
    const uncertaintyThreshold = this.config.priceUncertaintyThreshold || 0.003;

    if (percentDelta <= uncertaintyThreshold) {
      return {
        shouldBet: false,
        reason: `Price too tight: $${currentPrice.toLocaleString()} vs $${targetPrice.toLocaleString()} = ${(percentDelta * 100).toFixed(2)}% (need >=${(uncertaintyThreshold * 100).toFixed(1)}%)`,
        index: 0,
        confidence: 0
      };
    }

    // Price signal strength based on distance from target
    // Further away = stronger signal
    let priceScore;
    let priceSignal;

    if (isAbove) {
      // Market: "Will BTC be above $X?"
      if (priceDelta > 0) {
        // Current > Target = bullish for YES
        priceScore = 0.8;
        priceSignal = `Bullish: +${(percentDelta * 100).toFixed(2)}% above target`;
      } else {
        // Current < Target = bearish for YES (favor NO)
        priceScore = 0.2;
        priceSignal = `Bearish: -${(percentDelta * 100).toFixed(2)}% below target`;
      }
    } else {
      // Market: "Will BTC be below $X?"
      if (priceDelta < 0) {
        // Current < Target = bullish for YES (below)
        priceScore = 0.8;
        priceSignal = `Bullish for BELOW: -${(percentDelta * 100).toFixed(2)}% below target`;
      } else {
        // Current > Target = bearish for YES (favor NO/above)
        priceScore = 0.2;
        priceSignal = `Bearish for BELOW: +${(percentDelta * 100).toFixed(2)}% above target`;
      }
    }

    // Combine signals
    // Majority >= 90% gives strong signal (0.9 or 0.1)
    const majorityScore = majorityIndex === 0 ? 0.9 : 0.1;
    const combinedScore = (majorityScore * this.config.majorityWeight) +
      (priceScore * this.config.priceDeltaWeight);

    const finalIndex = combinedScore > 0.5 ? 0 : 1;
    const finalConfidence = Math.abs(combinedScore - 0.5) * 2;

    // Signal 3: Adjusted Payout check (accounts for slippage/dilution)
    const outcomePool = finalIndex === 0 ? pool0 : pool1;
    const betAmount = amount || 0;

    // Formula: (Total Pool + bet) / (Outcome Pool + bet)
    let estimatedPayout = (totalPool + betAmount) / (outcomePool + betAmount);

    // Apply platform fee if available
    const feeRate = parseFloat(market.platformFeeRate || '0');
    if (feeRate > 0) {
      estimatedPayout *= (1 - feeRate);
    }

    const minPayoutThreshold = this.config.minPayoutThreshold || 0;
    const expectedPayoutAmount = betAmount * estimatedPayout;

    if (minPayoutThreshold > 0 && expectedPayoutAmount < minPayoutThreshold) {
      return {
        shouldBet: false,
        reason: `Payout too low: ${expectedPayoutAmount.toFixed(2)} CC (need >=${minPayoutThreshold.toFixed(2)} CC)`,
        index: finalIndex,
        confidence: 0
      };
    }

    const reason = `Majority: ${(majorityConfidence * 100).toFixed(0)}% on ${outcomes[majorityIndex].label} | ${priceSignal} | Payout: ${expectedPayoutAmount.toFixed(2)} CC (${estimatedPayout.toFixed(2)}x) | Combined: ${(combinedScore * 100).toFixed(0)}%`;

    return {
      shouldBet: true,
      index: finalIndex,
      confidence: finalConfidence,
      reason
    };
  }

  isPriceMarket(question) {
    const priceKeywords = ['price', 'above', 'below', 'btc', 'eth', 'bitcoin', 'ethereum', '$'];
    const lower = question.toLowerCase();
    return priceKeywords.some(kw => lower.includes(kw));
  }

  parsePriceTarget(question) {
    // Extract price target from question like:
    // "Will BTC price be above $98,000 at 8 PM?"
    // "Will ETH close below $2,500?"

    const priceMatch = question.match(/\$?([\d,]+(?:\.\d+)?)/);
    const isAbove = question.toLowerCase().includes('above');

    if (priceMatch) {
      const targetPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
      return {targetPrice, isAbove};
    }

    return {targetPrice: null, isAbove};
  }
}
