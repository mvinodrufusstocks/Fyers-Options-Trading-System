export default async function handler(req, res) {
  try {
    console.log('Callback received:', req.query);
    
    const { code, auth_code, s } = req.query;
    
    // FYERS sends auth_code, not code
    const authCode = auth_code || code;
    
    if (!authCode) {
      console.log('No auth code in query');
      return res.redirect('/?error=no_auth_code');
    }

    if (s !== 'ok') {
      console.log('FYERS auth failed, status:', s);
      return res.redirect('/?error=fyers_auth_failed');
    }

    const fyersAppId = process.env.FYERS_APP_ID;
    const fyersSecret = process.env.FYERS_SECRET;
    
    console.log('Environment check:', {
      appId: fyersAppId ? 'EXISTS' : 'MISSING',
      secret: fyersSecret ? 'EXISTS' : 'MISSING'
    });
    
    if (!fyersAppId || !fyersSecret) {
      console.log('Missing FYERS credentials');
      return res.redirect('/?error=missing_credentials');
    }

    console.log('Making token request to FYERS with auth_code...');
    
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api-t1.fyers.in/api/v3/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appid: fyersAppId,
        secret: fyersSecret,
        code: authCode  // Use the auth_code from FYERS
      })
    });

    if (!tokenResponse.ok) {
      console.log('Token request failed:', tokenResponse.status);
      return res.redirect('/?error=token_request_failed&status=' + tokenResponse.status);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token response:', tokenData);
    
    if (tokenData.s === 'ok' && tokenData.access_token) {
      console.log('🎉 Authentication successful!');
      // Store token in URL for now (we'll improve this later)
      return res.redirect('/?auth=success&message=Connected to FYERS successfully&token=received');
    } else {
      console.log('Token exchange failed:', tokenData);
      return res.redirect('/?auth=error&message=' + encodeURIComponent(tokenData.message || 'Token exchange failed'));
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    return res.redirect('/?auth=error&message=' + encodeURIComponent('System error: ' + error.message));
  }
}
