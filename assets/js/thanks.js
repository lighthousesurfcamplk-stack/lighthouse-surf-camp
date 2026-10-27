/* =========================================================================
   thank-you.html — confirm the payment instead of asserting it
   -------------------------------------------------------------------------
   This page used to open with "Your deposit is received and your spot is
   locked in." to anyone who loaded the URL. That sentence was true for most
   of the people who saw it and badly wrong for the rest: the guest who
   pressed cancel at the gateway, the one whose card was declined, the one
   who bookmarked the page. It is also the most expensive sentence on the
   site to get wrong, because a guest who believes they have paid stops
   trying to pay.

   So the page now carries five mutually exclusive states and this file asks
   /api/payhere-status which one is true. The guest's return from PayHere is
   never treated as proof of payment — PayHere's own server-to-server
   callback is what marks a booking paid, and this only reads the result.

   Three decisions worth keeping:

   1. "idle" is the state in the markup, and the one every unresolved case
      falls back to. It says we have the booking and says nothing about
      money. With JavaScript off, a dead endpoint, no database configured,
      or a reference we cannot find, that is what the guest reads — honest
      in all of those cases rather than right in one.

   2. A pending payment keeps polling in the background after the copy has
      already switched to "still clearing". Bank redirects and 3-D Secure
      flows land the guest here before the callback does surprisingly often,
      so the page is given about a minute to catch up and flip to paid.

   3. The cart is cleared here, not when the guest left for the gateway.
      Emptying it at handoff wiped the basket of everybody who cancelled;
      now it survives until a payment is actually confirmed, and a guest who
      comes back to book.html finds their trip still in it.
   ========================================================================= */
(function (global) {
  'use strict';

  var root = document.querySelector('.ty-wrap');
  if (!root || !global.LHSC) return;

  var ORDER_KEY = 'lhsc.order.v1';   // written by booking.js at handoff
  var CART_KEY  = 'lhsc.cart.v1';

  /* Root-absolute on purpose: /de/thank-you.html must reach the same
     function as the English page, not /de/api/payhere-status. */
  var DEFAULT_ENDPOINT = '/api/payhere-status';

  /* Same shape the server mints and validates. Checking it here keeps a
     junk ?order= in the address bar from becoming a request at all. */
  var ORDER_RE = /^LHSC-[A-Z0-9]{1,20}-[A-F0-9]{10}$/;

  /* Roughly a minute, front-loaded: most answers arrive on the first or
     second ask, and the later gaps exist for the slow bank redirect. */
  var DELAYS = [0, 1800, 2600, 3600, 4800, 6000, 8000, 10000, 12000, 15000];

  var t = global.LHSC.t || function (v) { return v; };
  var settings = null;               // filled by LHSC.load()
  var attempt = 0;
  var netFails = 0;
  var resolved = false;              // a verdict was reached; stop asking

  function $(id) { return document.getElementById(id); }

  function money(n) { return global.LHSC.money(n, settings || {}); }

  /* ---------------------------------------------------------------- states */

  function show(name) {
    var states = root.querySelectorAll('[data-ty]');
    for (var i = 0; i < states.length; i++) {
      var on = states[i].getAttribute('data-ty') === name;
      states[i].classList.toggle('hidden', !on);
      states[i].setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    var retry = $('tyRetry');
    if (retry) retry.classList.toggle('hidden', name !== 'failed');
  }

  function reveal(el, on) {
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  /* --------------------------------------------------------------- receipt */

  function row(label, value) {
    var div = document.createElement('div');
    div.className = 'sum-row';
    var a = document.createElement('span');
    a.textContent = label;
    var b = document.createElement('span');
    b.textContent = value;
    div.appendChild(a);
    div.appendChild(b);
    return div;
  }

  function receipt(data) {
    var order = $('tyOrder');
    if (order) order.textContent = data.order_id;

    /* The symbol travels with the answer, so an old booking still reads in
       the currency it was taken in even if the camp changes it later. */
    settings = settings || {};
    settings.booking = settings.booking || {};
    if (data.symbol) settings.booking.currencySymbol = data.symbol;

    var lines = $('tyLines');
    if (lines) {
      lines.textContent = '';
      (data.items || []).forEach(function (l) {
        var name = t(l.name) + (l.qty > 1 ? ' × ' + l.qty : '');
        lines.appendChild(row(name, money(l.total)));
      });
    }

    var bal = $('tyBalance');
    var dep = $('tyDeposit');
    if (bal) bal.textContent = money(data.balance);
    if (dep) dep.textContent = money(data.deposit);

    reveal($('tyReceipt'), true);
  }

  /* --------------------------------------------------------------- polling */

  function settle(status, data) {
    resolved = true;
    if (status === 'paid') {
      receipt(data);
      show('paid');
      /* Only now, with a confirmed payment, is the basket spent. */
      try { localStorage.removeItem(CART_KEY); } catch (e) {}
      try { sessionStorage.removeItem(ORDER_KEY); } catch (e) {}
      return true;
    }
    if (status === 'failed' || status === 'cancelled' || status === 'chargedback') {
      show('failed');
      return true;
    }
    /* "unverifiable" (no database configured) and "unknown" (no such row)
       both mean we cannot say, and neither will change by asking again. */
    if (status === 'unverifiable' || status === 'unknown') {
      show('idle');
      return true;
    }
    resolved = false;
    return false;                    // "pending" — keep asking
  }

  function poll(endpoint, order) {
    fetch(endpoint + '?order=' + encodeURIComponent(order), {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store'
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; });
      })
      .then(function (data) {
        /* No status to act on: a host with no functions deployed answering
           404 with an HTML error page, or a proxy in the way. That is a
           failure to ask, not an answer of "pending", so it goes down the
           same path as a dropped request instead of burning the whole
           schedule on a service that is not there. */
        if (!data || !data.status) throw new Error('no status in that response');

        netFails = 0;
        if (settle(data.status, data)) return;

        /* Still pending. Say so after the second ask rather than spinning at
           the guest indefinitely, then carry on in the background so the
           page can still flip to paid when the callback lands. */
        if (attempt >= 2) show('pending');
        next(endpoint, order);
      })
      .catch(function (err) {
        if (resolved) {              // settle() got there and then threw
          console.warn('[LHSC] confirmation rendered with an error —', err.message);
          return;
        }
        /* A blocked request, a phone that went offline, a function cold
           starting. Worth two more tries, then the neutral state. */
        if (++netFails >= 3) {
          console.warn('[LHSC] could not reach the booking status service —', err.message);
          show('idle');
          return;
        }
        next(endpoint, order);
      });
  }

  function next(endpoint, order) {
    if (resolved) return;
    if (attempt >= DELAYS.length) {
      /* Out of patience, not out of hope: whichever of "still clearing" or
         the neutral copy is on screen is already the truthful one. */
      if (!root.querySelector('[data-ty="pending"]:not(.hidden)')) show('idle');
      return;
    }
    var wait = DELAYS[attempt++];
    setTimeout(function () { poll(endpoint, order); }, wait);
  }

  /* -------------------------------------------------------------- start up */

  function orderId() {
    var fromUrl = '';
    try {
      fromUrl = (new URLSearchParams(location.search).get('order') || '').trim();
    } catch (e) {}
    if (ORDER_RE.test(fromUrl)) return fromUrl;

    /* PayHere is given a return_url carrying ?order=, but a guest can also
       arrive by way of their bank's own redirect, which does not always
       preserve a query string. booking.js stashes the reference at handoff
       for exactly that case. */
    var stashed = '';
    try { stashed = (sessionStorage.getItem(ORDER_KEY) || '').trim(); } catch (e) {}
    return ORDER_RE.test(stashed) ? stashed : '';
  }

  var order = orderId();
  if (!order) return;                // no reference: the markup's copy stands

  show('checking');

  /* settings.json carries the currency symbol the receipt prints in, and the
     configured checkout endpoint — whose sibling is the status endpoint. On
     Netlify both are /api/*; on a local Express run both are on :3000, and
     deriving one from the other keeps that working without a second setting
     to forget. */
  global.LHSC.load().then(function (data) {
    settings = data.settings || {};
    var checkout = ((settings.payhere || {}).endpoint) || '';
    next(checkout.indexOf('payhere-checkout') > -1
      ? checkout.replace('payhere-checkout', 'payhere-status')
      : DEFAULT_ENDPOINT, order);
  }).catch(function () {
    /* The content directory is not needed to read a status, only to print it
       prettily. Ask anyway and let money() fall back to "$". */
    next(DEFAULT_ENDPOINT, order);
  });
})(window);
