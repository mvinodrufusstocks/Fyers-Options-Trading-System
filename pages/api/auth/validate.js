// pages/api/auth/validate.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { auth_code } = req.body || {};
    if (!auth_code) return res.status(400).json({ error: 'Auth code is required' });

    const APP_ID = process.env.FYERS_APP_ID;
    const APP_SECRET = process.env.FYERS_APP_SECRET;
    const REDIRECT_URI = process.env.FYERS_REDIRECT_URI || ''; // optional, but must match if you include it

    if (!APP_ID || !APP_SECRET) {
      return res.status(500).json({ error: 'Missing server credentials', have: { APP_ID: !!APP_ID, APP_SECRET: !!APP_SECRET } });
    }

    // Compute appIdHash = sha256("<APP_ID>:<APP_SECRET>") hex
    const encoder = new TextEncoder();
    const data = encoder.encode(`${APP_ID}:${APP_SECRET}`); // NOTE the colon
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

    const body = {
      grant_type: 'authorization_code',
      appIdHash: hash,
      code: auth_code,
      // Uncomment if FYERS requires explicit redirect URI match in your app:
      // redirect_uri: REDIRECT_URI
    };

    const r = await fetch('https://api.fyers.in/api/v2/validate-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.s === 'error' || json.code >= 400) {
      return res.status(400).json({ error: 'FYERS exchange failed', fyers: json });
    }

    // Expect json.access_token (+ refresh?) depending on FYERS; store securely.
    // TODO: Persist in Neon (encrypt or at least restrict access).
    return res.status(200).json({ ok: true, token: !!json.access_token, fyers: json });

  } catch (err) {
    return res.status(500).json({ error: 'Internal error', detail: String(err?.message || err) });
  }
}
