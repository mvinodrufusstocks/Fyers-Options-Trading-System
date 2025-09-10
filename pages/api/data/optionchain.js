// pages/api/data/optionchain.js
// Next.js API route (Node runtime). Fetches quotes/option data from FYERS for a list of symbols.
// Usage:
//  - POST  /api/data/optionchain   body: { symbols: ["NSE:NIFTY50-INDEX", "NSE:BANKNIFTY24SEP46000CE", ...] }
//  - GET   /api/data/optionchain?symbols=NSE:NIFTY50-INDEX,NSE:BANKNIFTY24SEP46000CE

const DEFAULT_FYERS_QUOTES_URL =
  process.env.FYERS_QUOTES_URL || 'https://api-t1.fyers.in/data/quotes';

// ---- Replace this with your real DB fetch (Neon, etc.) ----
async function getStoredFyersAccessToken() {
  // TODO: return the most recent valid access token for the current user/account from DB.
  // Return null to fall back to env for now.
  return null;
}
// -----------------------------------------------------------

function ensureBearer(token) {
  if (!token) return null;
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function parseSymbols(req) {
  // POST body takes precedence
  if (req.method === 'POST') {
    try {
      const { symbols } = req.body || {};
      if (Array.isArray(symbols) && symbols.length) return symbols;
    } catch (_) {}
  }
  // GET ?symbols=SYM1,SYM2
  if (req.method === 'GET') {
    const raw = (req.query.symbols || '').toString().trim();
    if (raw) return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const symbols = parseSymbols(req);
    if (!symbols.length) {
      return res.status(400).json({ error: 'No symbols provided. Pass POST {symbols:[...]} or GET ?symbols=...' });
    }

    // 1) Get a token (DB first; fallback to env for testing)
    let token = await getStoredFyersAccessToken();
    if (!token) token = process.env.FYERS_ACCESS_TOKEN || ''; // <- safe for testing only
    const authHeader = ensureBearer(token);
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing FYERS access token (DB/env).' });
    }

    // 2) FYERS quotes endpoint usually accepts comma-separated symbols.
    //    Keep batches small to avoid URL-size issues (tune if needed).
    const batches = chunk(symbols, 35);

    const allResults = [];
    for (const group of batches) {
      const url = `${DEFAULT_FYERS_QUOTES_URL}?symbols=${encodeURIComponent(group.join(','))}`;
      const r = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        // If FYERS needs keepalive or specific agent, add it here.
      });

      const json = await r.json().catch(() => ({}));
      if (!r.ok || json?.s === 'error') {
        // Surface the FYERS error to the client for debugging
        return res.status(r.status || 502).json({
          error: 'FYERS quotes fetch failed',
          url,
          fyers: json,
        });
      }

      // FYERS typically returns { s: 'ok', d: [...] } (d=data)
      if (Array.isArray(json?.d)) {
        allResults.push(...json.d);
      } else if (json?.d) {
        allResults.push(json.d);
      } else {
        // Unexpected shape—still push raw to aid debugging
        allResults.push(json);
      }
    }

    return res.status(200).json({
      s: 'ok',
      count: allResults.length,
      data: allResults
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Server error while fetching option chain',
      detail: String(err?.message || err)
    });
  }
}
