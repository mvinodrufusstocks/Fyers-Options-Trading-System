// pages/api/auth/callback.js
// Node runtime API route. Exchanges FYERS auth_code here (no internal HTTP call).

export default async function handler(req, res) {
  try {
    // FYERS may send ?code or ?auth_code (their docs/screens sometimes differ)
    const { code, auth_code, s, status, message } = req.query || {};
    const authCode = code || auth_code;

    if (!authCode) {
      // If FYERS returned an error, surface it
      return res
        .status(400)
        .send(`Callback error: Missing auth_code. FYERS said s=${s || status} msg=${message || 'n/a'}`);
    }

    const APP_ID = process.env.FYERS_APP_ID;
    const APP_SECRET = process.env.FYERS_APP_SECRET;
    const REDIRECT_URI = process.env.FYERS_REDIRECT_URI; // must match FYERS app settings exactly

    if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
      return res.status(500).send('Callback error: Missing server credentials (check Vercel env vars).');
    }

    // Compute appIdHash = sha256("<APP_ID>:<APP_SECRET>") as lowercase hex
    const encoder = new TextEncoder();
    const data = encoder.encode(`${APP_ID}:${APP_SECRET}`); // NOTE the colon
    const digest = await crypto.subtle.digest('SHA-256', data);
    const appIdHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Build FYERS token exchange payload
    const payload = {
      grant_type: 'authorization_code',
      appIdHash,
      code: authCode,
      // Uncomment if FYERS validates this in the body for your app configuration
      // redirect_uri: REDIRECT_URI
    };

    // v2 endpoint; if your account requires v3 token endpoint, swap below accordingly.
    const tokenEndpoint = 'https://api.fyers.in/api/v2/validate-authcode';

    const r = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok || json?.s === 'error') {
      return res
        .status(400)
        .send(`Token exchange failed: ${JSON.stringify(json)}`);
    }

    // TODO: persist json.access_token (+ refresh_token if provided) in your DB against the current user.
    // For now, just confirm success and bounce to the app home.
    const redirect = '/?auth=success';
    res.redirect(302, redirect);
  } catch (err) {
    res.status(500).send(`Callback error: ${String(err?.message || err)}`);
  }
}
