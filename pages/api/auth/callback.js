// pages/api/auth/callback.js
export default async function handler(req, res) {
  console.log('Callback API hit:', {
    method: req.method,
    query: req.query
  });

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, auth_code, s, state } = req.query;
    const authCode = code || auth_code;

    if (!authCode) {
      console.error('No auth code received');
      return res.status(400).json({ 
        error: 'Missing auth code',
        receivedQuery: req.query 
      });
    }

    console.log('Auth code received:', authCode.substring(0, 20) + '...');

    // Redirect to the main page with the auth code
    const redirectUrl = `/?auth_code=${encodeURIComponent(authCode)}&state=${state || ''}`;
    
    console.log('Redirecting to:', redirectUrl);
    
    // Use HTML meta refresh as backup
    res.status(200).send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        </head>
        <body>
          <p>Authentication successful! Redirecting...</p>
          <p>If you're not redirected, <a href="${redirectUrl}">click here</a>.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
