import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, symbol, tradingConfig } = req.body;
    const alerts = [];

    if (!data.options || data.options.length === 0) {
      return res.json({ alerts: [] });
    }

    // Initialize alerts table if it doesn't exist
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS alerts (
          id VARCHAR(50) PRIMARY KEY,
          alert_type VARCHAR(50) NOT NULL,
          symbol VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          details TEXT,
          priority VARCHAR(20) DEFAULT 'MEDIUM',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `;
    } catch (createError) {
      console.log('Alerts table might already exist');
    }

    // Calculate Greeks for all options
    const optionsWithGreeks = data.options.map(option => {
      const greeks = calculateGreeks(option, data.spot);
      return { ...option, ...greeks };
    });

    // Detect Gamma Spreads
    const calls = optionsWithGreeks.filter(o => o.type === 'CE').sort((a, b) => a.strike - b.strike);
    const puts = optionsWithGreeks.filter(o => o.type === 'PE').sort((a, b) => a.strike - b.strike);
    
    [calls, puts].forEach(options => {
      for (let i = 0; i < options.length - 1; i++) {
        const current = options[i];
        const next = options[i + 1];
        
        if (Math.abs(current.strike - next.strike) <= tradingConfig.spreadWidth) {
          const gammaSpread = Math.abs(current.gamma - next.gamma);
          
          if (gammaSpread >= tradingConfig.gammaThreshold) {
            const confidence = Math.min(gammaSpread * 1000, 100);
            const priority = confidence > 70 ? 'HIGH' : 'MEDIUM';
            
            alerts.push({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              type: 'GAMMA_SPREAD',
              symbol,
              message: `Gamma Spread: ${current.strike}/${next.strike} ${current.type}`,
              details: `Spread: ${gammaSpread.toFixed(6)}, Confidence: ${confidence.toFixed(1)}%, Current Γ: ${current.gamma.toFixed(4)}, Next Γ: ${next.gamma.toFixed(4)}`,
              priority,
              recommendation: current.gamma > next.gamma ? 
                `Long Gamma: Buy ${current.strike} ${current.type}, Sell ${next.strike} ${current.type}` :
                `Short Gamma: Sell ${current.strike} ${current.type}, Buy ${next.strike} ${current.type}`
            });
          }
        }
      }
    });

    // Detect High Theta Decay
    const highThetaOptions = optionsWithGreeks
      .filter(option => option.theta <= tradingConfig.thetaDecayMin)
      .sort((a, b) => a.theta - b.theta)
      .slice(0, 5); // Top 5 theta decay opportunities

    highThetaOptions.forEach(option => {
      const priority = option.theta < -0.15 ? 'HIGH' : 'MEDIUM';
      
      alerts.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type: 'THETA_DECAY',
        symbol,
        message: `High Theta Decay: ${option.strike} ${option.type}`,
        details: `Theta: ${option.theta.toFixed(4)}/day, IV: ${option.iv}%, Delta: ${option.delta.toFixed(4)}, LTP: ₹${option.ltp}`,
        priority,
        recommendation: `Consider selling ${option.type} at ${option.strike} strike for theta decay strategy`
      });
    });

    // Save alerts to database (but don't fail if it doesn't work)
    for (const alert of alerts) {
      try {
        await sql`
          INSERT INTO alerts (id, alert_type, symbol, message, details, priority)
          VALUES (${alert.id}, ${alert.type}, ${alert.symbol}, ${alert.message}, ${alert.details}, ${alert.priority})
        `;
      } catch (saveError) {
        console.log('Failed to save alert to database:', saveError.message);
        // Don't fail the request if database save fails
      }
    }

    return res.json({ 
      alerts,
      summary: {
        totalAlerts: alerts.length,
        gammaSpreadAlerts: alerts.filter(a => a.type === 'GAMMA_SPREAD').length,
        thetaDecayAlerts: alerts.filter(a => a.type === 'THETA_DECAY').length,
        highPriorityAlerts: alerts.filter(a => a.priority === 'HIGH').length
      }
    });
    
  } catch (error) {
    console.error('Alert generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate alerts',
      details: error.message
    });
  }
}

// Black-Scholes Greeks Calculation
function calculateGreeks(option, spot, timeToExpiry = 21/365, riskFreeRate = 0.065) {
  try {
    const S = spot;
    const K = option.strike;
    const T = Math.max(timeToExpiry, 1/365); // Minimum 1 day
    const r = riskFreeRate;
    const sigma = Math.max((option.iv || 20) / 100, 0.01); // Minimum 1% IV
    
    if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) {
      return { delta: 0, gamma: 0, theta: 0, vega: 0 };
    }
    
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    // Improved normal CDF approximation (Abramowitz and Stegun)
    const normCDF = (x) => {
      const a1 = 0.254829592;
      const a2 = -0.284496736;
      const a3 = 1.421413741;
      const a4 = -1.453152027;
      const a5 = 1.061405429;
      const p = 0.3275911;
      
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x);
      
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      
      return 0.5 * (1.0 + sign *
