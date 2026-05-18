// One-time helper to regenerate SPOTIFY_REFRESH_TOKEN with the correct scopes.
// 1) Visit /api/spotify-setup — get a link, click to authorize.
// 2) Spotify redirects back to this same endpoint with ?code=...
// 3) The refresh_token is shown on the page; paste into Vercel env.
//
// Prereq: add the redirect URI to your Spotify app dashboard:
//   https://bobby.md/api/spotify-setup

const SCOPE = 'user-read-currently-playing user-read-playback-state';

function html(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:14px/1.5 system-ui;max-width:640px;margin:48px auto;padding:0 20px;color:#222;}
code{background:#f4f0e8;padding:2px 6px;border-radius:4px;}
pre{background:#f4f0e8;padding:16px;border-radius:8px;overflow:auto;word-break:break-all;white-space:pre-wrap;}
a.button{display:inline-block;background:#1db954;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600;}
.warn{background:#fff4e0;border:1px solid #f0c266;padding:12px;border-radius:8px;margin:16px 0;}</style>
<h1>${title}</h1>${body}`;
}

export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(500).send(html('Spotify setup', '<p>Missing env vars on server.</p>'));
  }

  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const redirect_uri = `${proto}://${host}/api/spotify-setup`;
  const code = req.query.code;

  // Step 1: no code yet — show the link to authorize
  if (!code) {
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirect_uri);
    authUrl.searchParams.set('scope', SCOPE);
    authUrl.searchParams.set('show_dialog', 'true');

    return res.status(200).setHeader('content-type', 'text/html').send(html(
      'Spotify setup — step 1',
      `<p>Click below to authorize. Spotify will redirect you back here with a new refresh token.</p>
       <div class="warn"><b>Before clicking:</b> in your Spotify app dashboard
       (https://developer.spotify.com/dashboard), make sure <code>${redirect_uri}</code> is in the Redirect URIs list.</div>
       <p><a class="button" href="${authUrl.toString()}">Authorize Spotify →</a></p>
       <p>Scopes requested: <code>${SCOPE}</code></p>`
    ));
  }

  // Step 2: we have a code — exchange it for a refresh token
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri
    }).toString()
  });
  const text = await tokenResp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 500) }; }

  if (!data.refresh_token) {
    return res.status(500).setHeader('content-type', 'text/html').send(html(
      'Spotify setup — error',
      `<p>Token exchange failed (status ${tokenResp.status}):</p><pre>${JSON.stringify(data, null, 2)}</pre>`
    ));
  }

  return res.status(200).setHeader('content-type', 'text/html').send(html(
    'Spotify setup — done',
    `<p>Copy this value into the Vercel env var <code>SPOTIFY_REFRESH_TOKEN</code> (Production + Preview), then redeploy:</p>
     <pre>${data.refresh_token}</pre>
     <p>Scopes granted: <code>${data.scope || '(none reported)'}</code></p>
     <p>After updating + redeploying, visit <a href="/api/spotify?debug=1">/api/spotify?debug=1</a> to verify.</p>`
  ));
}
