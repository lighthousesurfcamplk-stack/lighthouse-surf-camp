/* =========================================================================
   Light House Surf Camp — PayHere payment backend (standalone)
   -------------------------------------------------------------------------
   The site deploys on Netlify, where netlify/functions/* serve these three
   endpoints and this file is not used at all. It exists for two other cases:

     • local development — `npm start` here, then point
       content/settings.json → payhere.endpoint at http://localhost:3000
     • a VPS or Render/Railway/Fly host, if the camp ever moves off Netlify

   It is deliberately a shim. Every rule that matters — repricing the cart
   server-side, signing the hash, verifying the callback, writing to Supabase,
   alerting the camp — lives in ../netlify/functions/, and this file only
   translates between Express and the handler signature those use. One
   implementation, so a fix in either deployment is a fix in both.

   Run:     node payhere-server.js          (PORT, default 3000)
   Env:     see .env.example — the same variables Netlify needs.
   ========================================================================= */
const express = require('express');
const cors    = require('cors');

const checkout = require('../netlify/functions/payhere-checkout');
const notify   = require('../netlify/functions/payhere-notify');
const status   = require('../netlify/functions/payhere-status');

const app = express();

/* The handlers do their own parsing, because PayHere posts
   application/x-www-form-urlencoded while the booking page posts JSON, and
   the Netlify side has to cope with both from one entry point. So keep the
   body as the raw string it arrived as and let parseBody() in _payhere.js
   decide — rather than having express.json() decide differently here. */
app.use(express.text({ type: '*/*', limit: '64kb' }));

/* The handlers also set their own same-origin CORS headers. This is the
   pre-flight safety net for a dev setup where the pages are served from a
   different port than this server. */
app.use(cors());

/* --- Express request  ->  the { httpMethod, headers, body, ... } shape
       Netlify hands a function. ------------------------------------------ */
function toEvent(req) {
  return {
    httpMethod: req.method,
    headers: req.headers,
    queryStringParameters: req.query || {},
    body: typeof req.body === 'string' ? req.body : '',
    isBase64Encoded: false
  };
}

function mount(path, mod) {
  app.all(path, async function (req, res) {
    try {
      const out = await mod.handler(toEvent(req));
      res.status(out.statusCode || 200)
         .set(out.headers || {})
         .send(out.body == null ? '' : out.body);
    } catch (err) {
      /* Never echo the error back: these messages can carry an env var name
         or a Supabase URL. The log is the place for it. */
      console.error('[payhere]', path, 'failed:', err && err.stack || err);
      res.status(500).json({ error: 'Something went wrong on our side.' });
    }
  });
}

mount('/api/payhere-checkout', checkout);
mount('/api/payhere-notify',   notify);
mount('/api/payhere-status',   status);

app.get('/', function (_req, res) {
  res.type('text/plain').send('Light House Surf Camp payment server is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Payment server on :' + PORT);
  console.log('  POST /api/payhere-checkout   GET /api/payhere-status   POST /api/payhere-notify');
});
