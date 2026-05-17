const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENT_ENDPOINT = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN
    })
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const json = await res.json();
  return json.access_token;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    const token = await getAccessToken();

    // Try currently playing first
    const nowRes = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (nowRes.status === 200) {
      const data = await nowRes.json();
      if (data && data.item) {
        return res.status(200).json({
          isPlaying: data.is_playing === true,
          title: data.item.name,
          artist: data.item.artists.map(a => a.name).join(', '),
          album: data.item.album.name,
          url: data.item.external_urls.spotify
        });
      }
    }

    // Not currently playing — fall back to most recent
    const recentRes = await fetch(RECENT_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (recentRes.ok) {
      const data = await recentRes.json();
      const item = data.items && data.items[0] && data.items[0].track;
      if (item) {
        return res.status(200).json({
          isPlaying: false,
          title: item.name,
          artist: item.artists.map(a => a.name).join(', '),
          album: item.album.name,
          url: item.external_urls.spotify
        });
      }
    }

    return res.status(200).json({ isPlaying: false });
  } catch (err) {
    console.error('Spotify error:', err);
    return res.status(500).json({ error: 'Failed to fetch' });
  }
}
