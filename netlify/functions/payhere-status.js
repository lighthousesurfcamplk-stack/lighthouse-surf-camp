/* =========================================================================
   GET /api/payhere-status?order=LHSC-...
   -------------------------------------------------------------------------
   What thank-you.html asks so it can confirm a real payment instead of
   asserting one. The page used to say "Your deposit is received" to anyone
   who loaded the URL, including a guest who had just cancelled at the
   gateway -- the most expensive sentence on the site to get wrong.

   Returns nothing that identifies the guest: a status, the figures, and the
   line items. The order id has a random tail precisely so this can answer
   without an auth token, but that is a reason to keep the payload thin
   rather than a reason to trust the caller.
   ========================================================================= */
'use strict';

const ph = require('./_payhere');

exports.handler = async function (event) {
  const cors = ph.corsFor(event);

  if (event.httpMethod !== 'GET') {
    return ph.json(405, { error: 'Method not allowed.' }, cors);
  }

  const order = ((event.queryStringParameters || {}).order || '').trim();
  if (!/^LHSC-[A-Z0-9]{1,20}-[A-F0-9]{10}$/.test(order)) {
    return ph.json(400, { error: 'Unrecognised booking reference.' }, cors);
  }

  /* No store configured means no verdict to give. The page falls back to its
     own neutral copy rather than claiming either outcome. */
  if (!ph.dbReady()) {
    return ph.json(200, { order_id: order, status: 'unverifiable' }, cors);
  }

  const row = await ph.getBooking(order);
  if (!row || row.skipped) {
    return ph.json(404, { order_id: order, status: 'unknown' }, cors);
  }

  return ph.json(200, {
    order_id: row.order_id,
    status: row.status,
    currency: row.currency,
    symbol: (ph.SETTINGS.booking || {}).currencySymbol || '$',
    subtotal: Number(row.subtotal),
    deposit: Number(row.deposit),
    balance: Number(row.balance),
    paid_at: row.paid_at || null,
    items: (row.items || []).map(function (l) {
      return { name: l.name, qty: l.qty, total: Number(l.total) };
    })
  }, cors);
};
