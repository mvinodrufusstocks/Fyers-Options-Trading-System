// pages/api/auth/callback.js
export default async function handler(req, res) {
  try {
    const { code, auth_code } = req.query || {};
    const authCode = code || auth_code;
    if (!authCode) return res.status(400).send('Missing auth_code');

    // Exchange immediately via internal API (or inline re-use the logic)
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: authCode })
    });

    const json = await r.json();
    if (!r.ok || !json?.ok) {
      return res.status(400).send(`Token exchange failed: ${JSON.stringify(json)}`);
    }

    // Redirect to UI with success
    const redirect = `${process.env.NEXT_PUBLIC_APP_URL || '/'}?auth=success`;
    res.redirect(302, redirect);
  } catch (err) {
    res.status(500).send(`Callback error: ${String(err?.message || err)}`);
  }
}
