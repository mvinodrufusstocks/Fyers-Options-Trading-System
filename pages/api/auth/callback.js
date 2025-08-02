export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.redirect('/?error=no_code');
    }

    // Get environment variables
    const fyersAppId = process.env.FYERS_APP_ID;
    const fyersSecret = process.env.FYERS_SECRET;
    
    if (!fyersAppId || !fyersSecret) {
      return res.redirect('/?error=missing_config');
    }

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

    const tokenData = await tokenResponse.json();
    
    if (tokenData.s === 'ok' && tokenData.access_token) {
      // Store token in a way the frontend can access it
      // For now, redirect back with success
      return res.redirect('/?auth=success&token=' + encodeURIComponent(tokenData.access_token));
    } else {
      return res.redirect('/?auth=error&message=' + encodeURIComponent(tokenData.message || 'Token exchange failed'));
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.redirect('/?auth=error&message=' + encodeURIComponent(error.message));
  }
}
