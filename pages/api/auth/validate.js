// pages/api/auth/validate.js - Multiple token exchange methods
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { auth_code } = req.body;

    if (!auth_code) {
      return res.status(400).json({ error: 'Auth code is required' });
    }

    const appId = process.env.FYERS_APP_ID;
    const secretKey = process.env.FYERS_SECRET;

    console.log('Starting token exchange process...');
    console.log('App ID present:', appId ? 'Yes' : 'No');
    console.log('Secret present:', secretKey ? 'Yes' : 'No');
    console.log('Auth code present:', auth_code ? 'Yes' : 'No');

    // Method 1: Try with generated appIdHash (SHA256 of appId:secret)
    try {
      console.log('Trying Method 1: Generated App Hash...');
      
      const appIdHash = crypto.createHash('sha256').update(`${appId}:${secretKey}`).digest('hex');
      
      const tokenData1 = {
        grant_type: "authorization_code",
        appIdHash: appIdHash,
        code: auth_code
      };

      const response1 = await fetch('https://api-t1.fyers.in/api/v3/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tokenData1)
      });

      const result1 = await response1.json();
      console.log('Method 1 Response:', result1);

      if (response1.ok && result1.code === 200) {
        console.log('✅ Method 1 SUCCESS - Token exchange successful!');
        return res.status(200).json({
          success: true,
          access_token: result1.access_token,
          expires_in: result1.expires_in || 3600,
          method_used: 'Generated App Hash'
        });
      }
    } catch (error) {
      console.log('Method 1 failed:', error.message);
    }

    // Method 2: Try with Basic Auth header
    try {
      console.log('Trying Method 2: Basic Auth...');
      
      const basicAuth = Buffer.from(`${appId}:${secretKey}`).toString('base64');
      
      const tokenData2 = {
        grant_type: "authorization_code",
        code: auth_code
      };

      const response2 = await fetch('https://api-t1.fyers.in/api/v3/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${basicAuth}`
        },
        body: JSON.stringify(tokenData2)
      });

      const result2 = await response2.json();
      console.log('Method 2 Response:', result2);

      if (response2.ok && result2.code === 200) {
        console.log('✅ Method 2 SUCCESS - Token exchange successful!');
        return res.status(200).json({
          success: true,
          access_token: result2.access_token,
          expires_in: result2.expires_in || 3600,
          method_used: 'Basic Auth'
        });
      }
    } catch (error) {
      console.log('Method 2 failed:', error.message);
    }

    // Method 3: Try with appId and secret in body
    try {
      console.log('Trying Method 3: App credentials in body...');
      
      const tokenData3 = {
        grant_type: "authorization_code",
        appId: appId,
        secret: secretKey,
        code: auth_code
      };

      const response3 = await fetch('https://api-t1.fyers.in/api/v3/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tokenData3)
      });

      const result3 = await response3.json();
      console.log('Method 3 Response:', result3);

      if (response3.ok && result3.code === 200) {
        console.log('✅ Method 3 SUCCESS - Token exchange successful!');
        return res.status(200).json({
          success: true,
          access_token: result3.access_token,
          expires_in: result3.expires_in || 3600,
          method_used: 'Credentials in body'
        });
      }
    } catch (error) {
      console.log('Method 3 failed:', error.message);
    }

    // Method 4: Try with environment variable App Hash (if you have it)
    if (process.env.FYERS_APP_HASH) {
      try {
        console.log('Trying Method 4: Environment App Hash...');
        
        const tokenData4 = {
          grant_type: "authorization_code",
          appIdHash: process.env.FYERS_APP_HASH,
          code: auth_code
        };

        const response4 = await fetch('https://api-t1.fyers.in/api/v3/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(tokenData4)
        });

        const result4 = await response4.json();
        console.log('Method 4 Response:', result4);

        if (response4.ok && result4.code === 200) {
          console.log('✅ Method 4 SUCCESS - Token exchange successful!');
          return res.status(200).json({
            success: true,
            access_token: result4.access_token,
            expires_in: result4.expires_in || 3600,
            method_used: 'Environment App Hash'
          });
        }
      } catch (error) {
        console.log('Method 4 failed:', error.message);
      }
    }

    // If all methods fail
    console.log('❌ All token exchange methods failed');
    return res.status(400).json({
      error: 'All token exchange methods failed',
      message: 'Please check your FYERS app credentials and permissions'
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
},
