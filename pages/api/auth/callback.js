// pages/api/auth/callback.js
// Exchanges FYERS auth_code inline. Tries v3 prod, v3 t1, then v2.
// Logs just enough to diagnose without leaking secrets.

async function exchangeWith(endpoint, payload) {
  const r = await fetch(endpoint, {
    method: 'POST',
    // Try JSON first; some setups expect url-encoded, so we’ll try both later if needed
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, json: { s: 'error', code: -999, message: 'network error' } };
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok && json?.s !== 'error', status: r.status, json };
}

function toUrlEncoded(o) {
  return Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v == null ? '' : String(v))}`)
    .join('&');
}

async function exchangeWithForm(endpoint, payload) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: toUrlEncoded(payload),
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, json: { s: 'error', code: -999, message: 'network error' } };
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok && json?.s !== 'error', status: r.status, json };
}

export default async function handler(req, res) {
  try {
    // FYERS sometimes uses ?code or ?auth_code
    const { code, auth_code, s, status, message } = req.query || {};
    const authCode = code || auth_code;
    if (!authCode) {
      return res.status(400).send(`Callback error: Missing auth_code. FYERS said s=${s || status} msg=${message || 'n/a'}`);
    }

    const APP_ID = process.env.FYERS_APP_ID;
    const APP_SECRET = process.env.FYERS_APP_SECRET;
    const REDIRECT_URI = process.env.FYERS_REDIRECT_URI; // MUST exactly match FYERS app & your auth URL

    if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
      console.error('Missing envs', { hasId: !!APP_ID, hasSecret: !!APP_SECRET, hasRedirect: !!REDIRECT_URI });
      return res.status(500).send('Callback error: Missing server credentials (check Vercel env vars).');
    }

    // appIdHash = sha256("<APP_ID>:<APP_SECRET>") as lowercase hex
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${APP_ID}:${APP_SECRET}`));
    const appIdHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');

    // Payload FYERS expects
    const basePayload = {
      grant_type: 'authorization_code',
      code: authCode,
      appIdHash,
      redirect_uri: REDIRECT_URI,
      appId: APP_ID, // include explicitly; some accounts need this
    };

    // 1) Try v3 prod
    let tried = [];
    let resp = await exchangeWith('https://api.fyers.in/api/v3/token', basePayload);
    tried.push({ ep: 'v3-prod-json', status: resp.status, body: resp.json });

    // 2) If not ok, try v3 t1
    if (!resp.ok) {
      resp = await exchangeWith('https://api-t1.fyers.in/api/v3/token', basePayload);
      tried.push({ ep: 'v3-t1-json', status: resp.status, body: resp.json });
    }

    // 3) If still not ok, try v2
    if (!resp.ok) {
      resp = await exchangeWith('https://api.fyers.in/api/v2/validate-authcode', {
        grant_type: 'authorization_code',
        code: authCode,
        appIdHash,
        redirect_uri: REDIRECT_URI,
      });
      tried.push({ ep: 'v2-json', status: resp.status, body: resp.json });
    }

    // 4) If still not ok, try urlencoded fallbacks (v3 prod -> v3 t1 -> v2)
    if (!resp.ok) {
      resp = await exchangeWithForm('https://api.fyers.in/api/v3/token', basePayload);
      tried.push({ ep: 'v3-prod-form', status: resp.status, body: resp.json });
    }
    if (!resp.ok) {
      resp = await exchangeWithForm('https://api-t1.fyers.in/api/v3/token', basePayload);
      tried.push({ ep: 'v3-t1-form', status: resp.status, body: resp.json });
    }
    if (!resp.ok) {
      resp = await exchangeWithForm('https://api.fyers.in/api/v2/validate-authcode', {
        grant_type: 'authorization_code',
        code: authCode,
        appIdHash,
        redirect_uri: REDIRECT_URI,
      });
      tried.push({ ep: 'v2-form', status: resp.status, body: resp.json });
    }

    if (!resp.ok) {
      // Log minimal diagnostics (no secrets)
      const diag = {
        tried: tried.map(t => ({ ep: t.ep, status: t.status, body: { s: t.body?.s, code: t.body?.code, message: t.body?.message } })),
        redirect: REDIRECT_URI,
        hashPrefix: appIdHash.slice(0, 8),
      };
      console.error('FYERS exchange failed', diag);
      return res.status(400).send(`Token exchange failed: ${JSON.stringify(diag)}`);
    }

    // SUCCESS: store tokens (TODO)
    // Example: const { access_token, refresh_token, expiry } = resp.json;
    return res.redirect(302, '/?auth=success');
  } catch (err) {
    console.error('Callback fatal error', err);
    return res.status(500).send(`Callback error: ${String(err?.message || err)}`);
  }
}
