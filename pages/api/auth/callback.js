// pages/api/auth/callback.js
export default async function handler(req, res) {
  console.log('Callback hit!', req.method, req.query);
  
  // Handle both GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, auth_code, s } = req.query;
  const authCode = code || auth_code;

  if (!authCode) {
    return res.status(400).json({ 
      error: 'Missing auth code',
      query: req.query 
    });
  }

  // Your existing token exchange logic here...
  res.redirect('/');
}
