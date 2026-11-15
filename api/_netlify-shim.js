/*
   _netlify-shim.js — run a Netlify-style handler as a Vercel function.

   WHY THIS EXISTS
   ---------------
   The payment endpoints were written for Netlify, whose handlers take a
   single `event` object and RETURN a response:

       exports.handler = async (event) => ({ statusCode, headers, body })

   Vercel instead hands a function the Node request/response pair and
   expects it to WRITE the reply:

       module.exports = (req, res) => { res.end(...) }

   The site is deployed on Vercel, so `netlify/functions/` is never built
   and `/api/payhere-checkout` answers 404. Rather than rewrite three
   working, signature-verifying payment handlers against a second runtime -
   and have two copies of the logic that decides what a guest is charged -
   this translates between the two shapes. The handlers stay the single
   source of truth, and `server/payhere-server.js` keeps working against
   them unchanged.

   Underscore-prefixed files in /api are not routed by Vercel, so this is
   bundled but never reachable as an endpoint.
*/

'use strict';

/* Collect the request body as the raw string the handlers expect.

   parseBody() in netlify/functions/_payhere.js reads `event.body` as text
   and parses it itself, by content-type. Vercel's runtime has usually
   already parsed JSON and form bodies into an object by the time we are
   called, and consumed the stream doing it, so hand the text back.

   Re-serialising cannot invalidate a PayHere callback: notifyVerified()
   hashes named fields (merchant_id, order_id, payhere_amount,
   payhere_currency, status_code) and never the raw body, so a round trip
   through the parser is lossless where it counts. */
function serialize(req, body) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');

  const type = String(req.headers['content-type'] || '');
  if (type.indexOf('application/x-www-form-urlencoded') > -1) {
    const p = new URLSearchParams();
    Object.keys(body).forEach(function (k) {
      p.append(k, body[k] === null || body[k] === undefined ? '' : String(body[k]));
    });
    return p.toString();
  }
  return JSON.stringify(body);
}

function readStream(req) {
  return new Promise(function (resolve) {
    const chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', function () { resolve(''); });
  });
}

async function bodyOf(req) {
  if (req.body !== undefined && req.body !== null) return serialize(req, req.body);
  /* These two carry no body, so there is nothing to wait for. Worth stating
     outright: /api/payhere-status is a GET, and it is the one endpoint a
     guest hits repeatedly while the payment window is open. */
  if (req.method === 'GET' || req.method === 'HEAD') return '';
  /* Nothing parsed. If the stream is still open the body is ours to read;
     if it is already finished there was no body. Checking first matters -
     waiting for 'end' on a consumed stream never returns. */
  if (req.readableEnded || req.complete || typeof req.on !== 'function') return '';
  return readStream(req);
}

function queryOf(req) {
  if (req.query) return req.query;
  const out = {};
  new URL(req.url || '/', 'http://x').searchParams.forEach(function (v, k) { out[k] = v; });
  return out;
}

/* Wrap one handler. Export the result as a Vercel function. */
module.exports = function adapt(handler) {
  return async function (req, res) {
    try {
      const body = await bodyOf(req);
      const result = await handler({
        httpMethod: req.method,
        path: (req.url || '/').split('?')[0],
        headers: req.headers,            // lowercased by Node, as on Netlify
        queryStringParameters: queryOf(req),
        body: body,
        isBase64Encoded: false
      }, {});

      const headers = (result && result.headers) || {};
      Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
      res.statusCode = (result && result.statusCode) || 200;
      res.end(result && result.body !== undefined && result.body !== null ? result.body : '');
    } catch (e) {
      /* Never let a stack trace reach a guest, and never answer 200 to
         PayHere on an error - it retries on anything else, which is what
         we want if the write to the booking store failed. */
      console.error('[api] handler threw:', (e && e.stack) || e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Something went wrong on our side.' }));
    }
  };
};
