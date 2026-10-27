/* =========================================================================
   POST /api/payhere-notify
   -------------------------------------------------------------------------
   PayHere's server-to-server callback. This -- not the guest's browser
   landing back on thank-you.html -- is the only thing that may mark a
   booking paid. The guest can close the tab, lose signal, or never be
   redirected at all; the money still moved, and this still fires.

   Anyone on the internet can post here. The md5sig is computed over the
   merchant secret, so it is the single fact about an inbound request worth
   trusting, and nothing below the check is allowed to run until it passes.
   ========================================================================= */
'use strict';

const ph = require('./_payhere');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const b = ph.parseBody(event);
  if (!b || !b.order_id) {
    return { statusCode: 400, body: 'Bad request' };
  }

  /* A forged callback gets a 403, not a 200. PayHere retries on anything
     other than 200, and letting it retry costs nothing -- whereas handing a
     200 to whoever posted this would tell a prober that their guess landed. */
  if (!ph.notifyVerified(b)) {
    console.warn('[payhere] REJECTED unverified notify for', String(b.order_id).slice(0, 40));
    return { statusCode: 403, body: 'Signature mismatch' };
  }

  const status = ph.statusOf(b.status_code);
  const stored = await ph.getBooking(b.order_id);

  /* Defence in depth. The signature already proves PayHere sent this and
     that the amount inside it is the amount PayHere processed, and the
     checkout endpoint is what stops a tampered price being signed in the
     first place. This catches the remaining case: the two disagreeing
     because of a bug on our side, a currency switch mid-flight, or a
     refund arriving as a fresh notify. Loud, and not fatal -- the money has
     already moved, so refusing to record it would only lose the booking. */
  if (stored && !stored.skipped && status === 'paid') {
    const expected = Number(stored.deposit);
    const got = Number(b.payhere_amount);
    if (isFinite(expected) && isFinite(got) && Math.abs(expected - got) > 0.01) {
      console.error('[payhere] AMOUNT MISMATCH on', b.order_id,
        '-- expected', expected, 'got', got, '-- recording and flagging for review');
    }
    if (String(b.payhere_currency || '').toUpperCase() !== String(stored.currency || '').toUpperCase()) {
      console.error('[payhere] CURRENCY MISMATCH on', b.order_id,
        '-- expected', stored.currency, 'got', b.payhere_currency);
    }
  }

  /* Conditional update: the second delivery of the same notify matches no
     row and comes back `first: false`, which is how a retry is kept from
     alerting the camp twice. */
  const result = await ph.markPaid(b.order_id, status, {
    payment_id: b.payment_id || null,
    method: b.method || null,
    status_code: String(b.status_code),
    status_message: b.status_message || null,
    amount: b.payhere_amount || null,
    currency: b.payhere_currency || null,
    card_holder: b.card_holder_name || null,
    card_no: b.card_no || null,
    received_at: new Date().toISOString()
  });

  if (status !== 'paid') {
    console.log('[payhere]', b.order_id, '->', status, '(' + b.status_code + ')');
    return { statusCode: 200, body: 'OK' };
  }

  if (!result.first) {
    console.log('[payhere] duplicate notify for', b.order_id, '-- already paid, not re-alerting');
    return { statusCode: 200, body: 'OK' };
  }

  /* --- A verified, first-time, successful payment. Tell the humans. ---- */

  const row = (stored && !stored.skipped && stored) || null;

  /* custom_2 carries a contact line so the camp's alert is still actionable
     when there is no database row to read it from. It is NOT used to address
     the guest's own email: custom_* travels through the browser, so its
     value is the guest's to choose, and a chosen destination for mail sent
     from the camp's domain is a spam relay. The camp's Telegram chat is a
     fixed destination, so the worst a tampered custom_2 can do there is
     mislead the people who can see it came from a payment they can check. */
  const booking = {
    order_id: b.order_id,
    payment_id: b.payment_id || '-',
    currency: (row && row.currency) || b.payhere_currency || ph.CURRENCY,
    subtotal: row ? row.subtotal : Number(b.payhere_amount),
    deposit: row ? row.deposit : Number(b.payhere_amount),
    balance: row ? row.balance : 0,
    items: row ? row.items : [{ name: String(b.items || 'Booking'), qty: 1, total: Number(b.payhere_amount) }],
    locale: (row && row.locale) || b.custom_1 || 'en',
    guest: row ? row.guest : {
      first: b.card_holder_name || 'Guest',
      last: '',
      email: '',
      phone: '',
      notes: 'No stored booking row -- contact line as submitted: ' + (b.custom_2 || 'none')
    }
  };

  const campText = ph.campEmail(booking) +
    (row ? '' : '\n\n[no database row -- details above came from the gateway callback]');

  const campAddress = (ph.SETTINGS.contact || {}).email;

  /* Three independent sends. Promise.allSettled, not await-in-sequence:
     each already swallows its own failure, and nothing here may delay the
     200 that stops PayHere retrying. The guest's confirmation is the only
     one that needs a stored row, because that row is the only place an
     address we validated ourselves exists. */
  await Promise.allSettled([
    ph.tellCamp('PAID ' + booking.order_id + '\n\n' + campText),
    campAddress ? ph.sendMail(campAddress, 'Deposit paid - ' + booking.order_id, campText) : null,
    row && row.guest && row.guest.email
      ? ph.sendMail(row.guest.email,
          'Your Light House Surf Camp booking is confirmed (' + booking.order_id + ')',
          ph.guestEmail(booking))
      : null
  ].filter(Boolean));

  console.log('[payhere] PAID', booking.order_id, b.payhere_amount, b.payhere_currency,
    row ? '(recorded)' : '(no row)');

  return { statusCode: 200, body: 'OK' };
};
