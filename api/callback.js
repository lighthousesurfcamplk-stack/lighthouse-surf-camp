/*
   /api/callback — step two of signing in to /admin with GitHub.

   GitHub sends the owner back here with a short-lived `code`. This function
   swaps it for an access token using the client secret - the one step that
   cannot happen in a browser - and hands the token to the CMS window.

   HOW THE TOKEN REACHES THE CMS
   -----------------------------
   This page is a popup. Decap is listening on the window that opened it, so
   the two talk by postMessage, in the exact three-step handshake Decap's
   auth client implements (decap-cms-lib-auth):

     1. popup  -> opener : "authorizing:github"
     2. opener -> popup  : the same string, echoed, revealing its origin
     3. popup  -> opener : "authorization:github:success:{json}"

   Step 2 is what makes step 3 safe: the reply is addressed to the origin
   the echo came from rather than to "*", so the token is never broadcast to
   whatever else might be listening. Decap for its part ignores any message
   whose origin is not its configured base_url, which admin/index.html sets
   to this same site. Both ends therefore check the other.

   See api/auth.js for the setup and the environment variables.
*/

'use strict';

const crypto = require('crypto');

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const COOKIE = 'lhsc_oauth_state';
const PROVIDER = 'github';

function cookiesOf(header) {
  const out = {};
  String(header || '').split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

/* Compare without leaking how much of the value matched. */
function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length || x.length === 0) return false;
  try { return crypto.timingSafeEqual(x, y); } catch (e) { return false; }
}

/* The handshake page, for both outcomes. Decap recognises
   "authorization:<provider>:success:<json>" and ":error:<json>", so an
   error gets reported in the CMS instead of leaving the popup sitting
   there with the owner guessing. */
function handshake(res, code, status, content) {
  /* JSON.stringify gives a safe JS string literal; escaping "<" as well
     closes the one way a value could still end the script element early.
     The token passes through here, so this is not the place to be casual. */
  const message = 'authorization:' + PROVIDER + ':' + status + ':' + JSON.stringify(content);
  const literal = JSON.stringify(message).replace(/</g, '\\u003c');

  res.statusCode = code;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* A cached token page would be a token left on disk. */
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  /* Clear the one-time state either way - it has been spent. */
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0');

  res.end(
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>Signing in…</title></head>' +
    '<body style="font:16px/1.6 system-ui,sans-serif;max-width:34em;margin:12vh auto;padding:0 24px;color:#272019">' +
    '<p id="m">' + (status === 'success'
      ? 'Signed in. This window will close itself.'
      : 'Sign-in failed. You can close this window and try again.') + '</p>' +
    '<script>(function(){' +
    'var sent=false;' +
    'function reply(e){' +
      /* Only answer the echo of our own opening message. */
      'if(sent||e.data!=="authorizing:' + PROVIDER + '")return;' +
      'sent=true;' +
      'window.removeEventListener("message",reply,false);' +
      'window.opener.postMessage(' + literal + ',e.origin);' +
    '}' +
    'if(!window.opener){' +
      'document.getElementById("m").textContent=' +
        '"Open the content manager at /admin/ and use its sign-in button — ' +
        'this page only works as part of that.";' +
      'return;' +
    '}' +
    'window.addEventListener("message",reply,false);' +
    'window.opener.postMessage("authorizing:' + PROVIDER + '","*");' +
    '})();</script></body></html>'
  );
}

const fail = function (res, code, message) {
  return handshake(res, code, 'error', { message: message });
};

module.exports = async function (req, res) {
  const clientId = process.env.GITHUB_OAUTH_ID;
  const clientSecret = process.env.GITHUB_OAUTH_SECRET;
  if (!clientId || !clientSecret) {
    return fail(res, 500, 'GitHub sign-in is not configured on this site.');
  }

  const q = req.query || {};

  /* The owner pressed Cancel, or GitHub refused. Its own wording is more
     accurate than anything invented here. */
  if (q.error) {
    return fail(res, 400, String(q.error_description || q.error).slice(0, 200));
  }
  if (!q.code) return fail(res, 400, 'GitHub did not send an authorization code.');

  if (!sameSecret(q.state, cookiesOf(req.headers.cookie)[COOKIE])) {
    return fail(res, 400,
      'This sign-in could not be verified. Start again from /admin/ — and ' +
      'if it keeps happening, check that cookies are not being blocked.');
  }

  let token;
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'lighthouse-surf-camp-cms'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(q.code),
        /* Must match what /api/auth sent, or GitHub rejects the swap. */
        redirect_uri: process.env.OAUTH_REDIRECT_URI || undefined
      })
    });
    const data = await r.json();
    if (!data || !data.access_token) {
      /* GitHub's error, not ours - a reused or expired code usually. */
      console.warn('[oauth] token exchange refused:', (data && data.error) || r.status);
      return fail(res, 401, 'GitHub would not complete the sign-in. Please try again.');
    }
    token = data.access_token;
  } catch (e) {
    console.error('[oauth] token exchange failed:', (e && e.stack) || e);
    return fail(res, 502, 'Could not reach GitHub. Please try again in a moment.');
  }

  /* An OAuth app will authenticate ANY GitHub user who approves it. GitHub
     still refuses their writes to this repository, so nothing can be
     changed - but they would reach the admin interface and a confusing
     permissions error. Naming the permitted accounts restores the
     invite-only behaviour Netlify Identity gave us. Left unset, anyone with
     push access to the repository can sign in, which is the sensible
     default for a one-owner site. */
  const allowed = String(process.env.ALLOWED_GITHUB_LOGINS || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

  if (allowed.length) {
    try {
      const r = await fetch(USER_URL, {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'lighthouse-surf-camp-cms'
        }
      });
      const user = await r.json();
      const login = String((user && user.login) || '').toLowerCase();
      if (!login || allowed.indexOf(login) < 0) {
        console.warn('[oauth] refused login for', login || '(unknown)');
        return fail(res, 403, 'That GitHub account is not allowed to edit this site.');
      }
    } catch (e) {
      console.error('[oauth] could not check the account:', (e && e.stack) || e);
      return fail(res, 502, 'Could not confirm that account with GitHub. Please try again.');
    }
  }

  return handshake(res, 200, 'success', { token: token, provider: PROVIDER });
};
