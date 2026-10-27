/* =========================================================================
   _payhere.js — the shared core behind all three payment endpoints.
   =========================================================================

   WHY THE SERVER PRICES THE CART
   ------------------------------
   The endpoint this replaces took an `amount` from the browser and signed
   it. A PayHere hash is UPPER(MD5(merchant_id + order_id + amount +
   currency + UPPER(MD5(secret)))) -- it proves the request came from us, and
   nothing else. It does not prove the amount is the right amount. So a guest
   who opened devtools and posted

       { order_id: "x", amount: "1.00", currency: "USD" }

   got back a perfectly valid hash for one dollar, and PayHere would have
   settled it without complaint, because the signature was genuinely ours.
   A $890 trip for $1.

   The fix is the only one that works: the browser never sends a price. It
   sends a cart -- [{id, qty}] -- and this file looks every id up in the same
   content/*.json the page rendered from, multiplies by the same quantities,
   and applies the same deposit rate. The number that gets signed is a number
   the server computed. There is nothing for the client to tamper with,
   because the client no longer has the figure.

   That shared source also means the two can never disagree. The owner edits
   a price in /admin, Decap commits content/packages.json, Netlify redeploys,
   and the page and this file pick up the same new number in the same build.

   NO DEPENDENCIES, ON PURPOSE
   ---------------------------
   crypto is built in, fetch is global on Node 18+, and Supabase is reached
   over its REST API rather than through @supabase/supabase-js. So the site
   keeps `command = ""` in netlify.toml: nothing to install, nothing to
   build, no lockfile to drift. The catalogue is pulled in with a static
   require so the function bundler traces the JSON and ships it automatically
   -- no included_files to keep in step.
   ========================================================================= */
'use strict';

const crypto = require('crypto');

/* Static requires: this is what makes the bundler include the JSON. */
const PACKAGES    = require('../../content/packages.json');
const EXPERIENCES = require('../../content/experiences.json');
const SETTINGS    = require('../../content/settings.json');

/* ------------------------------------------------------------------ env -- */

const MERCHANT_ID     = process.env.PAYHERE_MERCHANT_ID     || '';
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || '';
const SANDBOX         = String(process.env.PAYHERE_SANDBOX || 'true') !== 'false';

/* Netlify sets URL to the site's production address. SITE_URL overrides it
   for any other host. Deriving the return/cancel URLs from the server rather
   than accepting them from the request is what keeps this off the list of
   open redirects -- see localeReturn() below. */
const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://lighthousesurfcamp.lk')
  .replace(/\/+$/, '');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE        = process.env.SUPABASE_BOOKINGS_TABLE || 'bookings';

const CHECKOUT_URL = SANDBOX
  ? 'https://sandbox.payhere.lk/pay/checkout'
  : 'https://www.payhere.lk/pay/checkout';

const configured = () => Boolean(MERCHANT_ID && MERCHANT_SECRET);
const dbReady    = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

/* ----------------------------------------------------------- catalogue -- */

/* Both catalogues keyed by id, exactly as booking.js builds state.data.byId.
   `active: false` is the owner's way of retiring an option in /admin, so an
   inactive id must not be purchasable even if a stale cart still names it. */
const CATALOGUE = (function () {
  const out = Object.create(null);
  []
    .concat(PACKAGES.items || [], EXPERIENCES.items || [])
    .forEach(function (item) {
      if (item && item.id && item.active !== false) out[item.id] = item;
    });
  return out;
})();

function depositRate() {
  const r = Number((SETTINGS.booking || {}).depositRate);
  return (r > 0 && r < 1) ? r : 0.25;
}

const CURRENCY = ((SETTINGS.booking || {}).currency || 'USD').toUpperCase();

/* The nine language directories, as tools/i18n-build.js emits them. English
   is the source and lives at the root, hence ''. This is an allowlist, not a
   hint: anything not in it becomes ''. */
const LOCALE_DIRS = ['', 'de', 'ch', 'fr', 'it', 'es', 'ru', 'ja', 'he'];

/* ------------------------------------------------------------- pricing -- */

const MAX_LINES = 24;   // the whole catalogue is 21 items
const MAX_QTY   = 30;   // mirrors MAX_QTY in booking.js

/* Reprice a client cart from scratch. Returns the figures AND the resolved
   lines, so the caller never has to trust a name or a price either. */
function priceCart(cart) {
  if (!Array.isArray(cart) || !cart.length) {
    return { error: 'Your booking is empty.' };
  }
  if (cart.length > MAX_LINES) {
    return { error: 'Too many separate items in one booking.' };
  }

  const lines = [];
  const seen = Object.create(null);

  for (let i = 0; i < cart.length; i++) {
    const row = cart[i] || {};
    const item = CATALOGUE[row.id];
    if (!item) return { error: 'One of the items is no longer available.' };
    if (seen[row.id]) return { error: 'The same item was sent twice.' };
    seen[row.id] = true;

    const qty = Math.floor(Number(row.qty));
    if (!isFinite(qty) || qty < 1 || qty > MAX_QTY) {
      return { error: 'Invalid quantity.' };
    }

    const price = Number(item.price);
    if (!isFinite(price) || price < 0) {
      return { error: 'That item has no published price.' };
    }

    lines.push({ id: item.id, name: item.name, unit: item.unit || '', price: price, qty: qty, total: price * qty });
  }

  const subtotal = lines.reduce(function (s, l) { return s + l.total; }, 0);
  if (!(subtotal > 0)) return { error: 'Your booking comes to nothing payable.' };

  /* Math.round, not toFixed: booking.js shows the guest
     Math.round(subtotal * rate), and the figure we charge has to be the
     figure they were shown, to the cent. */
  const rate = depositRate();
  const deposit = Math.round(subtotal * rate);
  if (!(deposit > 0)) return { error: 'The deposit comes to nothing payable.' };

  return {
    lines: lines,
    subtotal: subtotal,
    deposit: deposit,
    balance: subtotal - deposit,
    rate: rate,
    currency: CURRENCY
  };
}

/* ------------------------------------------------------------ identity -- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function cleanGuest(g) {
  g = g || {};
  const str = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };

  const email = str(g.email, 160);
  if (!EMAIL_RE.test(email)) return { error: 'A valid email address is required.' };

  const first = str(g.first, 60);
  if (first.length < 2) return { error: 'A first name is required.' };

  /* Loose on purpose: this is dialled by a human in Arugam Bay, not parsed.
     Anything with 7+ digits is a phone number somewhere in the world. */
  const phone = str(g.phone, 40);
  if ((phone.match(/\d/g) || []).length < 7) return { error: 'A reachable phone number is required.' };

  return {
    first: first,
    last: str(g.last, 60),
    email: email,
    phone: phone,
    level: str(g.level, 40),
    guests: str(g.guests, 6),
    date: str(g.date, 20),
    country: str(g.country, 60),
    notes: str(g.notes, 900)
  };
}

/* An order id PayHere will accept and a stranger cannot guess. The random
   tail is what lets /api/payhere-status answer without an auth token: you
   cannot enumerate other people's bookings by counting. */
function newOrderId() {
  return 'LHSC-' + Date.now().toString(36).toUpperCase() + '-' +
    crypto.randomBytes(5).toString('hex').toUpperCase();
}

function localeDir(v) {
  const d = String(v == null ? '' : v).trim().toLowerCase();
  return LOCALE_DIRS.indexOf(d) > -1 ? d : '';
}

/* Built here, never accepted from the request. A return_url taken from the
   browser is an open redirect wearing a payment gateway as a hat. */
function localeReturn(dir, page, orderId) {
  const base = SITE_URL + (dir ? '/' + dir : '') + '/' + page;
  return orderId ? base + '?order=' + encodeURIComponent(orderId) : base;
}

/* ---------------------------------------------------------------- hash -- */

const md5 = function (s) { return crypto.createHash('md5').update(String(s), 'utf8').digest('hex'); };
const up  = function (s) { return String(s).toUpperCase(); };
const secretHash = function () { return up(md5(MERCHANT_SECRET)); };

const money2 = function (n) { return Number(n).toFixed(2); };

function checkoutHash(orderId, amount, currency) {
  return up(md5(MERCHANT_ID + orderId + money2(amount) + currency + secretHash()));
}

/* PayHere signs its callback over the same secret, which is why this is the
   only thing that may be trusted about an inbound notify: the body arrives
   over plain HTTP POST from an address we cannot verify, and anyone may
   post to it. Compared with timingSafeEqual out of habit -- both sides are
   32 hex characters, so length never differs in practice. */
function notifyVerified(b) {
  if (!configured()) return false;
  const expected = up(md5(
    String(b.merchant_id) + String(b.order_id) + String(b.payhere_amount) +
    String(b.payhere_currency) + String(b.status_code) + secretHash()
  ));
  const got = up(String(b.md5sig || ''));
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

/* PayHere's own vocabulary. 0 means "we have it but it is not settled yet",
   which is not a confirmed booking and must not read as one. */
const STATUS = { '2': 'paid', '0': 'pending', '-1': 'cancelled', '-2': 'failed', '-3': 'chargedback' };
const statusOf = function (code) { return STATUS[String(code)] || 'unknown'; };

/* ------------------------------------------------------------ supabase -- */

/* The service-role key bypasses RLS, so it lives only in the function
   environment and this file is the only thing that ever holds it. It is
   never returned to a caller, never logged, and never reaches the browser.
   Every call is wrapped: a database that is unreachable, or simply not set
   up yet, must never be the reason a guest's payment fails. */
async function db(method, path, body, prefer) {
  if (!dbReady()) return { skipped: true };

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error('supabase ' + res.status + ' ' + text.slice(0, 300));
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

async function insertPending(row) {
  try {
    const out = await db('POST', TABLE, row, 'return=representation');
    return { ok: true, skipped: Boolean(out && out.skipped) };
  } catch (e) {
    console.error('[payhere] could not record pending booking', row.order_id, '--', e.message);
    return { ok: false, error: e.message };
  }
}

/* The conditional PATCH is the idempotency guard. PayHere retries a notify
   it did not get a 200 for, and a retry must not send the camp a second
   booking alert. `status=neq.paid` means the second attempt matches no row,
   returns [], and tells us plainly that someone already did this work. */
async function markPaid(orderId, status, payload) {
  const patch = {
    status: status,
    payhere: payload,
    updated_at: new Date().toISOString()
  };
  if (status === 'paid') patch.paid_at = new Date().toISOString();

  try {
    const out = await db(
      'PATCH',
      TABLE + '?order_id=eq.' + encodeURIComponent(orderId) + '&status=neq.' + encodeURIComponent(status),
      patch,
      'return=representation'
    );
    if (out && out.skipped) return { skipped: true, first: true };
    const rows = Array.isArray(out) ? out : [];
    return { first: rows.length > 0, row: rows[0] || null };
  } catch (e) {
    console.error('[payhere] could not update booking', orderId, '--', e.message);
    return { error: e.message, first: true };
  }
}

async function getBooking(orderId) {
  try {
    const out = await db(
      'GET',
      TABLE + '?order_id=eq.' + encodeURIComponent(orderId) +
        '&select=order_id,status,currency,subtotal,deposit,balance,items,locale,paid_at&limit=1'
    );
    if (out && out.skipped) return { skipped: true };
    return (Array.isArray(out) ? out[0] : null) || null;
  } catch (e) {
    console.error('[payhere] could not read booking', orderId, '--', e.message);
    return null;
  }
}

/* --------------------------------------------------------- notifications -- */

/* Two independent channels, each in its own try/catch, neither able to stop
   the other and neither able to stop the 200 going back to PayHere. The
   money has already moved by the time any of this runs; a mail provider
   having a bad afternoon is not a reason to let PayHere believe the
   callback failed and retry it all night. */

async function tellCamp(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { skipped: 'telegram not configured' };
  try {
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text, disable_web_page_preview: true })
    });
    if (!res.ok) throw new Error('telegram ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return { ok: true };
  } catch (e) {
    console.error('[payhere] telegram alert failed --', e.message);
    return { error: e.message };
  }
}

async function sendMail(to, subject, text) {
  const key  = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM;
  if (!key || !from || !to) return { skipped: 'email not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: (SETTINGS.contact || {}).email || undefined,
        subject: subject,
        text: text
      })
    });
    if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return { ok: true };
  } catch (e) {
    console.error('[payhere] confirmation email failed --', e.message);
    return { error: e.message };
  }
}

const sym = function () { return ((SETTINGS.booking || {}).currencySymbol) || '$'; };
const amount = function (n) { return sym() + Number(n).toFixed(2); };

function receiptLines(b) {
  return (b.items || []).map(function (l) {
    return '  - ' + l.name + ' x ' + l.qty + ' = ' + amount(l.total);
  }).join('\n');
}

function guestEmail(b) {
  const wa = (SETTINGS.contact || {}).whatsappDisplay || '';
  return [
    'Hi ' + (b.guest.first || 'there') + ',',
    '',
    'Your deposit has arrived and your spot at Light House Surf Camp is held.',
    '',
    'Booking reference: ' + b.order_id,
    '',
    receiptLines(b),
    '',
    'Subtotal:            ' + amount(b.subtotal),
    'Deposit paid now:    ' + amount(b.deposit),
    'Balance on arrival:  ' + amount(b.balance),
    '',
    ((SETTINGS.booking || {}).note || ''),
    '',
    'We will message you on WhatsApp shortly to arrange transfers and the',
    'finer details. If anything needs changing before then, just reply to',
    'this email' + (wa ? ' or message us on ' + wa : '') + '.',
    '',
    'See you in the water.',
    'Light House Surf Camp, Arugam Bay'
  ].join('\n');
}

function campEmail(b) {
  return [
    'DEPOSIT PAID - ' + b.order_id,
    '',
    receiptLines(b),
    '',
    'Subtotal:  ' + amount(b.subtotal),
    'Deposit:   ' + amount(b.deposit) + '  (received)',
    'Balance:   ' + amount(b.balance) + '  (on arrival)',
    '',
    'Name:       ' + (b.guest.first + ' ' + (b.guest.last || '')).trim(),
    'Email:      ' + b.guest.email,
    'Phone:      ' + b.guest.phone,
    'Surf level: ' + (b.guest.level || '-'),
    'Guests:     ' + (b.guest.guests || '-'),
    'Arrival:    ' + (b.guest.date || 'flexible'),
    'Country:    ' + (b.guest.country || '-'),
    'Notes:      ' + (b.guest.notes || '-'),
    '',
    'Language:   ' + (b.locale ? b.locale : 'en'),
    'PayHere:    ' + (b.payment_id || '-')
  ].join('\n');
}

/* ----------------------------------------------------------------- http -- */

const json = function (status, body, extra) {
  return {
    statusCode: status,
    headers: Object.assign({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }, extra || {}),
    body: JSON.stringify(body)
  };
};

/* Same-origin only. The booking page is served from this site, so there is
   no reason for a cross-origin caller to reach the checkout endpoint, and
   every reason to keep one from minting orders against the camp's merchant
   account from somewhere else. */
function corsFor(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  return origin && origin.replace(/\/+$/, '') === SITE_URL
    ? { 'Access-Control-Allow-Origin': SITE_URL, Vary: 'Origin' }
    : {};
}

function parseBody(event) {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    const type = (event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || '';
    if (type.indexOf('application/json') > -1) return JSON.parse(raw || '{}');
    const out = {};
    new URLSearchParams(raw).forEach(function (v, k) { out[k] = v; });
    return out;
  } catch (e) {
    return null;
  }
}

module.exports = {
  MERCHANT_ID: MERCHANT_ID,
  CHECKOUT_URL: CHECKOUT_URL,
  CURRENCY: CURRENCY,
  SANDBOX: SANDBOX,
  SITE_URL: SITE_URL,
  SETTINGS: SETTINGS,
  configured: configured,
  dbReady: dbReady,
  priceCart: priceCart,
  cleanGuest: cleanGuest,
  newOrderId: newOrderId,
  localeDir: localeDir,
  localeReturn: localeReturn,
  checkoutHash: checkoutHash,
  notifyVerified: notifyVerified,
  statusOf: statusOf,
  money2: money2,
  depositRate: depositRate,
  insertPending: insertPending,
  markPaid: markPaid,
  getBooking: getBooking,
  tellCamp: tellCamp,
  sendMail: sendMail,
  guestEmail: guestEmail,
  campEmail: campEmail,
  json: json,
  corsFor: corsFor,
  parseBody: parseBody
};
