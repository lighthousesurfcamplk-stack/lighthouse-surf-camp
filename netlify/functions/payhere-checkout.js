/* =========================================================================
   POST /api/payhere-checkout
   -------------------------------------------------------------------------
   Called when the guest presses "Pay Deposit & Confirm". Takes a cart and a
   set of contact details; returns the fully signed set of form fields the
   browser is to POST to PayHere.

   The browser sends no price, no order id, and no merchant id. It sends
   [{id, qty}] and who to reach. Everything money-shaped in the response was
   computed here -- see the long note at the top of _payhere.js for why that
   is the whole point of this endpoint existing.

   The response is deliberately shaped as { action, fields }: the page
   stamps the fields out as hidden inputs and submits, without knowing what
   any of them mean. Adding a field PayHere later requires is then a change
   to this file alone.
   ========================================================================= */
'use strict';

const ph = require('./_payhere');

exports.handler = async function (event) {
  const cors = ph.corsFor(event);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: Object.assign({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }, cors),
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') {
    return ph.json(405, { error: 'Method not allowed.' }, cors);
  }

  /* An unconfigured gateway is not an error the guest should have to read as
     one. booking.js treats this exact shape as "fall back to WhatsApp", so
     the booking still completes -- it just completes the way it did before
     card payments existed. */
  if (!ph.configured()) {
    return ph.json(503, {
      error: 'Card payment is not switched on yet.',
      fallback: 'whatsapp'
    }, cors);
  }

  const body = ph.parseBody(event);
  if (!body) return ph.json(400, { error: 'Could not read that request.' }, cors);

  const priced = ph.priceCart(body.cart);
  if (priced.error) return ph.json(400, { error: priced.error }, cors);

  const guest = ph.cleanGuest(body.guest);
  if (guest.error) return ph.json(400, { error: guest.error }, cors);

  const orderId = ph.newOrderId();
  const dir = ph.localeDir(body.locale);
  const amount = ph.money2(priced.deposit);

  /* PayHere truncates a long items string in its own UI and in the receipt,
     so shorten it here where we can choose where the cut falls. */
  let items = priced.lines.map(function (l) { return l.name + ' x' + l.qty; }).join(', ');
  items = (items.length > 190 ? items.slice(0, 187) + '...' : items) + ' (deposit)';

  /* Recorded before the guest leaves for PayHere, so a payment that
     completes while their laptop dies still has somewhere to land. The row
     is the only copy of who booked what: PayHere's callback carries the
     money, not the surf level or the dietary notes. */
  const recorded = await ph.insertPending({
    order_id: orderId,
    status: 'pending',
    currency: priced.currency,
    subtotal: priced.subtotal,
    deposit: priced.deposit,
    balance: priced.balance,
    deposit_rate: priced.rate,
    items: priced.lines,
    guest: guest,
    locale: dir || 'en',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  /* A booking we cannot write down is a booking we can still take -- the
     camp is told by Telegram and email either way, and the signed callback
     is the receipt. Worth a loud log line and nothing more. */
  if (!recorded.ok) {
    console.warn('[payhere] proceeding without a stored row for', orderId);
  }

  return ph.json(200, {
    action: ph.CHECKOUT_URL,
    order_id: orderId,
    sandbox: ph.SANDBOX,
    amount: amount,
    currency: priced.currency,
    fields: {
      merchant_id: ph.MERCHANT_ID,
      order_id: orderId,
      items: items,
      currency: priced.currency,
      amount: amount,
      hash: ph.checkoutHash(orderId, priced.deposit, priced.currency),
      return_url: ph.localeReturn(dir, 'thank-you.html', orderId),
      cancel_url: ph.localeReturn(dir, 'book.html', ''),
      notify_url: ph.SITE_URL + '/api/payhere-notify',
      first_name: guest.first,
      last_name: guest.last || guest.first,
      email: guest.email,
      phone: guest.phone,
      address: 'Arugam Bay',
      city: 'Arugam Bay',
      country: guest.country || 'Sri Lanka',
      /* Echoed back verbatim in the notify callback. These exist so that a
         camp with no database configured still gets an alert it can act on
         -- see the note in payhere-notify.js about why custom_2 is trusted
         to address the camp and never the guest. */
      custom_1: dir || 'en',
      custom_2: (guest.email + ' / ' + guest.phone).slice(0, 250)
    }
  }, cors);
};
