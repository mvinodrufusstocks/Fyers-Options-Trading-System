// pages/api/auth/validate.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tokenInfo, fyersConfig, authCode } = req.body;
    
    // Check if we have the required config
    if (!fyersConfig?.appId || !fyersConfig?.secretKey) {
      return res.status(400).json({ 
        error: 'Missing FYERS configuration',
        message: 'Please enter your APP ID and Secret Key'
      });
    }

    // If there's an auth code in the request, exchange it for a token
    if (authCode) {
      console.log('Exchanging auth code for token...');
      
      // FYERS v2 API format
      const params = new URLSearchParams({
        code: authCode,
        client_id: fyersConfig.appId,
        secret_key: fyersConfig.secretKey,
        grant_type: 'authorization_code'
      });
      
      try {
        const tokenResponse = await fetch('https://api.fyers.in/api/v2/validate-authcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString()
        });

        const tokenData = await tokenResponse.json();
        console.log('Token exchange response:', tokenData);

        if (tokenData.s === 'ok' && tokenData.data?.access_token) {
          // Token exchange successful
          const newTokenInfo = {
            accessToken: tokenData.data.access_token,
            expiresAt: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(), // 7 hours
            lastRefresh: new Date().toISOString()
          };

          return res.status(200).json({
            success: true,
            tokenInfo: newTokenInfo,
            message: 'Token obtained successfully'
          });
        } else {
          console.error('FYERS error response:', tokenData);
          return res.status(400).json({
            error: 'Token exchange failed',
            message: tokenData.message || 'Failed to obtain access token',
            details: tokenData
          });
        }
      } catch (fetchError) {
        console.error('FYERS API error:', fetchError);
        return res.status(500).json({
          error: 'FYERS API request failed',
          message: fetchError.message
        });
      }
    }

    // If no auth code but we have a token, validate it
    if (tokenInfo?.accessToken) {
      // Check token expiry
      const tokenAge = tokenInfo.expiresAt 
        ? new Date(tokenInfo.expiresAt) - new Date() 
        : -1;
      
      if (tokenAge > 0) {
        return res.status(200).json({
          success: true,
          tokenInfo: tokenInfo,
          message: 'Token is valid'
        });
      } else {
        return res.status(401).json({
          error: 'Token expired',
          message: 'Please generate a new auth URL and login again'
        });
      }
    }

    // No token and no auth code
    return res.status(401).json({
      error: 'No valid token',
      message: 'Please generate auth URL and complete login'
    });

  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({ 
      error: 'Validation failed',
      message: error.message 
    });
  }
}
