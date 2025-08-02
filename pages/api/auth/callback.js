import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    // Get FYERS config from environment variables or request
    const fyersAppId = process.env.FYERS_APP_ID || req.query.app_id;
    const fyersSecret = process.env.FYERS_SECRET || req.query.secret;
    
    if (!fyersAppId || !fyersSecret) {
      console.error('FYERS credentials missing from environment variables');
      return res.redirect('/?error=config_missing');
    }

    // Initialize database tables if they don't exist
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS tokens (
          id SERIAL PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `;
    } catch (createError) {
      console.log('Table might already exist:', createError.message);
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
      // Save token to database
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      try {
        await sql`
          INSERT INTO tokens (access_token, refresh_token, expires_at)
          VALUES (${tokenData.access_token}, ${tokenData.refresh_token || null}, ${expiresAt})
        `;
        
        console.log('Token saved successfully');
        
        // Redirect to main app with success
        return res.redirect('/?auth=success&message=Authentication successful');
        
      } catch (dbError) {
        console.error('Database save error:', dbError);
        return res.redirect('/?auth=error&message=Database save failed');
      }
      
    } else {
      console.error('Token exchange failed:', tokenData);
      return res.redirect(`/?auth=error&message=${encodeURIComponent(tokenData.message || 'Token exchange failed')}`);
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.redirect(`/?auth=error&message=${encodeURIComponent(error.message)}`);
  }
}
