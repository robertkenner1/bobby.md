// Serverless function: returns currently playing Spotify track for the configured account.
// Requires env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Missing Spotify env vars' });
  }

  try {
    const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(SPOTIFY_REFRESH_TOKEN)}`
    });
    const tokenJson = await tokenResp.json();
    if (!tokenJson.access_token) {
      return res.status(500).json({ error: 'Refresh failed', detail: tokenJson });
    }

    const nowResp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': `Bearer ${tokenJson.access_token}` }
    });

    // 204 = nothing playing. Cache briefly so we don't hammer the API.
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

    if (nowResp.status === 204) return res.status(200).json({ playing: false });
    if (!nowResp.ok) return res.status(200).json({ playing: false });

    const data = await nowResp.json();
    if (!data || !data.is_playing || !data.item) {
      return res.status(200).json({ playing: false });
    }

    return res.status(200).json({
      playing: true,
      title: data.item.name,
      artist: data.item.artists.map(a => a.name).join(', '),
      url: data.item.external_urls && data.item.external_urls.spotify
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
