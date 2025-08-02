import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tokenInfo, fyersConfig } = req.body;
    
    if (!fyersConfig.appId || !fyersConfig.secretKey) {
      return res.status(400).json({ error: 'FYERS APP ID and Secret Key required' });
    }

    // Check if we have a valid token in the request
    if (tokenInfo.accessToken && tokenInfo.expiresAt) {
      const expiryTime = new Date(tokenInfo.expiresAt);
      const now = new Date();
      
      // If token is still valid (not expired), return it
      if (expiryTime > now) {
        return res.json({ 
          valid: true, 
          tokenInfo: {
            accessToken: tokenInfo.accessToken,
            expiresAt: tokenInfo.expiresAt,
            lastRefresh: tokenInfo.lastRefresh
          }
        });
      }
    }
    
    // Try to get token from database
    try {
      const result = await sql`
        SELECT * FROM tokens 
        WHERE expires_at > NOW() 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      if (result.rows.length > 0) {
        const dbToken = result.rows[0];
        return res.json({ 
          valid: true, 
          tokenInfo: {
            accessToken: dbToken.access_token,
            expiresAt: dbToken.expires_at,
            lastRefresh: dbToken.updated_at
          }
        });
      }
    } catch (dbError) {
      // Database might not be initialized yet, that's okay
      console.log('Database not initialized yet:', dbError.message);
    }
    
    // No valid token found
    return res.status(401).json({ 
      error: 'No valid token found. Please complete FYERS authentication.',
      needsAuth: true
    });
    
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({ error: 'Token validation failed' });
  }
}
