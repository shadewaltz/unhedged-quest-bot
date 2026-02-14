#!/bin/bash

# Quest progress monitor script
# Run this to check your current progress

API_KEY=${UNHEDGED_API_KEY}

if [ -z "$API_KEY" ]; then
    echo "❌ Set UNHEDGED_API_KEY environment variable"
    exit 1
fi

# Get portfolio data
PORTFOLIO=$(curl -s -H "Authorization: Bearer $API_KEY" https://api.unhedged.gg/api/v1/portfolio/me)
EQUITY=$(curl -s -H "Authorization: Bearer $API_KEY" https://api.unhedged.gg/api/v1/portfolio/me/equity)

# Parse values (requires jq)
if command -v jq &> /dev/null; then
    TOTAL_BETS=$(echo $PORTFOLIO | jq -r '.portfolio.summary.totalBets // 0')
    TOTAL_WAGERED=$(echo $PORTFOLIO | jq -r '.portfolio.summary.totalWagered // 0')
    TOTAL_PROFIT=$(echo $PORTFOLIO | jq -r '.portfolio.summary.totalProfit // 0')
    WIN_RATE=$(echo $PORTFOLIO | jq -r '.portfolio.summary.winRate // 0')
    AVAILABLE=$(echo $EQUITY | jq -r '.equity.available // 0')
    
    # Quest calculations
    TARGET_BETS=750
    TARGET_VOLUME=2000
    
    BETS_REMAINING=$((TARGET_BETS - TOTAL_BETS))
    VOLUME_REMAINING=$(echo "$TARGET_VOLUME - $TOTAL_WAGERED" | bc)
    
    echo "========================================"
    echo "     UNHEDGED QUEST PROGRESS"
    echo "========================================"
    echo ""
    echo "📊 Stats:"
    echo "   Total Bets:    $TOTAL_BETS / $TARGET_BETS"
    echo "   Total Volume:  $TOTAL_WAGERED / $TARGET_VOLUME CC"
    echo "   Win Rate:      $(echo "$WIN_RATE * 100" | bc)%"
    echo "   Total Profit:  $TOTAL_PROFIT CC"
    echo "   Balance:       $AVAILABLE CC"
    echo ""
    echo "🎯 Quest Progress:"
    
    # Progress bars
    BETS_PCT=$((TOTAL_BETS * 100 / TARGET_BETS))
    VOLUME_PCT=$(echo "$TOTAL_WAGERED * 100 / $TARGET_VOLUME" | bc)
    
    printf "   Bets:    [%s%s] %d%%\n" \
        $(printf '#%.0s' $(seq 1 $((BETS_PCT/5)))) \
        $(printf ' %.0s' $(seq 1 $((20 - BETS_PCT/5)))) \
        $BETS_PCT
        
    printf "   Volume:  [%s%s] %d%%\n" \
        $(printf '#%.0s' $(seq 1 $((VOLUME_PCT/5)))) \
        $(printf ' %.0s' $(seq 1 $((20 - VOLUME_PCT/5)))) \
        $VOLUME_PCT
    
    echo ""
    echo "💰 Remaining for max reward:"
    echo "   Bets:   $BETS_REMAINING"
    echo "   Volume: $VOLUME_REMAINING CC"
    echo ""
    
    # Step breakdown
    echo "📋 Quest Steps:"
    [ $TOTAL_BETS -ge 5 ] && echo "   ✅ Step 1: 5 bets / 5 CC (Reward: 5 CC)" || echo "   ⏳ Step 1: $TOTAL_BETS/5 bets"
    [ $TOTAL_BETS -ge 50 ] && echo "   ✅ Step 2: 50 bets / 100 CC (Reward: 25 CC)" || echo "   ⏳ Step 2: $TOTAL_BETS/50 bets"
    [ $TOTAL_BETS -ge 200 ] && echo "   ✅ Step 3: 200 bets / 500 CC (Reward: 50 CC)" || echo "   ⏳ Step 3: $TOTAL_BETS/200 bets"
    [ $TOTAL_BETS -ge 500 ] && echo "   ✅ Step 4: 500 bets / 1000 CC (Reward: 100 CC)" || echo "   ⏳ Step 4: $TOTAL_BETS/500 bets"
    [ $TOTAL_BETS -ge 750 ] && echo "   ✅ Step 5: 750 bets / 2000 CC (Reward: 500 CC)" || echo "   ⏳ Step 5: $TOTAL_BETS/750 bets"
    
    echo ""
else
    echo "⚠️ Install jq for better formatting: sudo apt install jq"
    echo "Raw response:"
    echo $PORTFOLIO | python3 -m json.tool 2>/dev/null || echo $PORTFOLIO
fi
