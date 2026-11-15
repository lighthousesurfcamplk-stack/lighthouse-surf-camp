/*
   /api/auth — step one of signing in to /admin with GitHub.

   WHY THIS EXISTS
   ---------------
   Decap CMS can commit to GitHub directly, but a browser cannot be trusted
   with an OAuth client secret, so the code-for-token swap has to happen on
   a server. On Netlify that server was Git Gateway, bundled with Netlify
   Identity. This site is on Vercel, where neither exists - hence these two
   small functions, which are the whole of what Git Gateway was doing for
   us: hold the secret, and hand the finished token to the CMS.

   THE FLOW
   --------
     1. Owner clicks "Login with GitHub" in /admin.
     2. Decap opens a popup at  /api/auth?provider=github&scope=repo
     3. THIS function stores a one-time `state` in an HttpOnly cookie and
        redirects the popup to GitHub.
     4. Owner approves. GitHub redirects back to /api/callback?code=…&state=…
     5. /api/callback checks the state, swaps the code for a token, and
        postMessages it to the CMS window. The popup closes.

   Zero dependencies: `crypto` is built in and nothing else is needed, which
   is what lets this project keep having no package.json and no build step.

   SETUP — two environment variables in the Vercel project:
     GITHUB_OAUTH_ID       the OAuth app's Client ID
     GITHUB_OAUTH_SECRET   the OAuth app's Client Secret
   and optionally
     ALLOWED_GITHUB_LOGINS  comma-separated usernames allowed to sign in
     OAUTH_REDIRECT_URI     override, if the callback is not on this host
   See ADMIN-GUIDE.md for the click-by-click version.
*/

'use strict';

const crypto = require('crypto');

/* GitHub's own endpoint. Not configurable on purpose: a settable authorize
   URL is a redirect waiting to be abused. */
const AUTHORIZE = 'https://github.com/login/oauth/authorize';

/* `repo` is needed to commit to a private repository; `public_repo` is the
   narrower grant that is enough for a public one. Decap asks for one of
   these in the query string, and anything else is ignored rather than
   passed through - the scope decides what the token can do, so it is not a
   value to take from a URL unchecked. */
const ALLOWED_SCOPES = ['repo', 'public_repo'];
const DEFAULT_SCOPE = 'repo';

const COOKIE = 'lhsc_oauth_state';

/* The origin this request arrived on, so the callback URL is right on the
   production domain, on *.vercel.app and on a preview deployment alike
   without anything to edit. Vercel terminates TLS at the edge, so the
   scheme is only knowable from the forwarded header. */
function originOf(req) {
  const first = function (v) { return String(v || '').split(',')[0].trim(); };
  const proto = first(req.headers['x-forwarded-proto']) || 'https';
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  return proto + '://' + host;
}

function plainError(res, code, message) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    '<!doctype html><meta charset="utf-8">' +
    '<title>Cannot sign in</title>' +
    '<body style="font:16px/1.6 system-ui,sans-serif;max-width:34em;margin:12vh auto;padding:0 24px;color:#272019">' +
    '<h1 style="font-size:1.15rem">Cannot sign in yet</h1><p>' + message + '</p></body>'
  );
}

module.exports = function (req, res) {
  const clientId = process.env.GITHUB_OAUTH_ID;

  /* Say which half is missing. "It does not work" is the error message this
     setup is most likely to produce, and the least useful one. */
  if (!clientId || !process.env.GITHUB_OAUTH_SECRET) {
    return plainError(res, 500,
      'The content manager’s GitHub sign-in is not configured. ' +
      'Set <strong>GITHUB_OAUTH_ID</strong> and <strong>GITHUB_OAUTH_SECRET</strong> ' +
      'in the Vercel project settings, then redeploy.');
  }

  const asked = (req.query && req.query.scope) || '';
  const scope = ALLOWED_SCOPES.indexOf(String(asked)) > -1 ? String(asked) : DEFAULT_SCOPE;

  /* CSRF. Without this, anyone could feed the callback a code obtained in
     their own name and have the CMS adopt it. The cookie is HttpOnly so
     page scripts cannot read it, Lax so it still travels on the top-level
     redirect back from GitHub, scoped to /api, and short-lived. */
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',
    COOKIE + '=' + state + '; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600');

  const redirectUri = process.env.OAUTH_REDIRECT_URI || (originOf(req) + '/api/callback');

  const url = AUTHORIZE +
    '?client_id=' + encodeURIComponent(clientId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(scope) +
    '&state=' + state +
    /* Nobody should be creating a GitHub account from our login popup. */
    '&allow_signup=false';

  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};
