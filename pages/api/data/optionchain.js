import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol, tokenInfo, fyersConfig } = req.body;
    
    if (!tokenInfo.accessToken) {
      return res.status(401).json({ error: 'No access token provided' });
    }

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Initialize historical data table if it doesn't exist
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS historical_data (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(50) NOT NULL,
          market_data JSONB NOT NULL,
          timestamp TIMESTAMP DEFAULT NOW()
        );
      `;
    } catch (createError) {
      console.log('Historical data table might already exist');
    }

    // Fetch current price quote
    const quoteResponse = await fetch(
      `https://api-t1.fyers.in/api/v3/data/quotes/?symbols=${symbol}`,
      {
        headers: {
          'Authorization': `${fyersConfig.appId}:${tokenInfo.accessToken}`
        }
      }
    );

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error('Quote API failed:', quoteResponse.status, errorText);
      return res.status(500).json({ 
        error: `Quote API failed: ${quoteResponse.status}`,
        details: errorText
      });
    }

    const quoteData = await quoteResponse.json();
    
    if (quoteData.s !== 'ok' || !quoteData.d || quoteData.d.length === 0) {
      return res.status(500).json({ 
        error: 'Invalid quote data received',
        data: quoteData
      });
    }

    const currentPrice = quoteData.d[0]?.v?.lp || 0;

    // Fetch option chain data
    const optionResponse = await fetch(
      `https://api-t1.fyers.in/api/v3/data/optionchain/?symbol=${symbol}&strikecount=15&datecount=2`,
      {
        headers: {
          'Authorization': `${fyersConfig.appId}:${tokenInfo.accessToken}`
        }
      }
    );

    if (!optionResponse.ok) {
      const errorText = await optionResponse.text();
      console.error('Option Chain API failed:', optionResponse.status, errorText);
      return res.status(500).json({ 
        error: `Option Chain API failed: ${optionResponse.status}`,
        details: errorText
      });
    }

    const optionData = await optionResponse.json();

    // Process option chain data
    const processedData = {
      symbol,
      spot: currentPrice,
      timestamp: new Date().toISOString(),
      options: [],
      optionsCount: 0
    };

    if (optionData.s === 'ok' && optionData.d?.optionsChain) {
      optionData.d.optionsChain.forEach(expiry => {
        if (expiry.options) {
          expiry.options.forEach(strike => {
            // Process Call options
            if (strike.call) {
              processedData.options.push({
                strike: strike.strikePrice,
                type: 'CE',
                ltp: strike.call.ltp || 0,
                iv: strike.call.iv || 0,
                volume: strike.call.volume || 0,
                oi: strike.call.oi || 0,
                expiry: expiry.expiryDate
              });
            }
            
            // Process Put options
            if (strike.put) {
              processedData.options.push({
                strike: strike.strikePrice,
                type: 'PE',
                ltp: strike.put.ltp || 0,
                iv: strike.put.iv || 0,
                volume: strike.put.volume || 0,
                oi: strike.put.oi || 0,
                expiry: expiry.expiryDate
              });
            }
          });
        }
      });
      
      processedData.optionsCount = processedData.options.length;
    }

    // Store historical data (but don't fail if it doesn't work)
    try {
      await sql`
        INSERT INTO historical_data (symbol, market_data)
        VALUES (${symbol}, ${JSON.stringify(processedData)})
      `;
    } catch (historyError) {
      console.log('Failed to store historical data:', historyError.message);
      // Don't fail the request if historical storage fails
    }
    
    return res.json(processedData);
    
  } catch (error) {
    console.error('Option chain fetch error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch option chain data',
      details: error.message
    });
  }
}
