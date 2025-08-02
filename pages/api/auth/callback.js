export default async function handler(req, res) {
  try {
    console.log('Callback received:', req.query);
    
    const { code, state } = req.query;
    
    if (!code) {
      console.log('No code in query');
      return res.redirect('/?error=no_code');
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

    console.log('Making token request to FYERS...');
    
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
        code: code
      })
    });

    if (!tokenResponse.ok) {
      console.log('Token request failed:', tokenResponse.status);
      return res.redirect('/?error=token_request_failed');
    }

    const tokenData = await tokenResponse.json();
    console.log('Token response status:', tokenData.s);
    
    if (tokenData.s === 'ok' && tokenData.access_token) {
      console.log('Authentication successful!');
      return res.redirect('/?auth=success&message=Connected to FYERS successfully');
    } else {
      console.log('Token exchange failed:', tokenData);
      return res.redirect('/?auth=error&message=' + encodeURIComponent(tokenData.message || 'Authentication failed'));
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    return res.redirect('/?auth=error&message=' + encodeURIComponent('System error: ' + error.message));
  }
}
