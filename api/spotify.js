// Serverless function: returns currently playing Spotify track for the configured account.
// Requires env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

async function jsonFetch(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); }
  catch (e) { body = { __rawText: text.slice(0, 400), __parseError: String(e) }; }
  return { status: r.status, ok: r.ok, contentType: r.headers.get('content-type'), body };
}

export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Missing env vars', has: {
      client_id: !!SPOTIFY_CLIENT_ID,
      client_secret: !!SPOTIFY_CLIENT_SECRET,
      refresh_token: !!SPOTIFY_REFRESH_TOKEN
    }});
  }

  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  const token = await jsonFetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(SPOTIFY_REFRESH_TOKEN)}`
  });

  if (!token.ok || !token.body.access_token) {
    return res.status(500).json({ stage: 'token_exchange', ...token });
  }

  const access = token.body.access_token;

  if (req.query && req.query.debug) {
    const me = await jsonFetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access}` }
    });
    return res.status(200).json({
      stage: 'debug',
      token_scope: token.body.scope,
      token_expires_in: token.body.expires_in,
      me
    });
  }

  const now = await jsonFetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { 'Authorization': `Bearer ${access}` }
  });

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (now.status === 204) return res.status(200).json({ playing: false });
  if (!now.ok) return res.status(200).json({ playing: false, status: now.status, body: now.body });
  if (!now.body || !now.body.is_playing || !now.body.item) return res.status(200).json({ playing: false });

  return res.status(200).json({
    playing: true,
    title: now.body.item.name,
    artist: now.body.item.artists.map(a => a.name).join(', '),
    url: now.body.item.external_urls && now.body.item.external_urls.spotify
  });
}
