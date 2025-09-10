// pages/api/auth/callback.js
// Exchanges FYERS auth_code for tokens inline.
// Node runtime required.

export default async function handler(req, res) {
  try {
    // FYERS sometimes sends ?code, sometimes ?auth_code
    const { code, auth_code, s, status, message } = req.query || {};
    const authCode = code || auth_code;
    if (!authCode) {
      return res
        .status(400)
        .send(`Callback error: Missing auth_code. FYERS said s=${s || status} msg=${message || 'n/a'}`);
    }

    const APP_ID = process.env.FYERS_APP_ID;
    const APP_SECRET = process.env.FYERS_APP_SECRET;
    const REDIRECT_URI = process.env.FYERS_REDIRECT_URI;

    if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
      console.error('Missing envs', { hasId: !!APP_ID, hasSecret: !!APP_SECRET, hasRedirect: !!REDIRECT_URI });
      return res.status(500).send('Callback error: Missing server credentials (check Vercel env vars).');
    }

    // appIdHash = sha256("<APP_ID>:<APP_SECRET>") in lowercase hex
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${APP_ID}:${APP_SECRET}`));
    const appIdHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');

    // --- v3 token endpoint (works for most accounts). If your account is on v2, swap the URL below. ---
    const tokenEndpoint = 'https://api-t1.fyers.in/api/v3/token';
    // If v3 fails in your logs with a version error, try:
    // const tokenEndpoint = 'https://api.fyers.in/api/v2/validate-authcode';

    const payload = {
      grant_type: 'authorization_code',
      code: authCode,
      appIdHash,
      redirect_uri: REDIRECT_URI, // include explicitly to avoid -17
      // Some accounts also accept appId (not always required):
      // appId: APP_ID
    };

    const r = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await r.json().catch(() => ({}));

    if (!r.ok || json?.s === 'error') {
      // Common -17 causes: redirect mismatch, reused/expired code, bad hash
      console.error('FYERS token exchange error', { status: r.status, json });
      return res.status(400).send(`Token exchange failed: ${JSON.stringify(json)}`);
    }

    // TODO: persist json.access_token (+ refresh_token, expiry) in DB for the current user
    // For now we just redirect with success:
    return res.redirect(302, '/?auth=success');
  } catch (err) {
    console.error('Callback fatal error', err);
    return res.status(500).send(`Callback error: ${String(err?.message || err)}`);
  }
}
