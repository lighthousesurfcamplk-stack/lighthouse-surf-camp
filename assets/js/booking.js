/* Light House Surf Camp — booking engine
   ==================================================================
   Replaces the inline <script> that used to live in book.html.

   The old flow kept one module-level `sel` variable holding "the
   currently highlighted option", and Add-to-Cart read it. Switching
   between "Our Packages" and "Build Your Own" hid the highlighted
   element but left `sel` pointing at it, so a guest who picked the
   $590 camp, changed their mind, switched tabs and pressed Add got
   $590 in the cart with nothing visibly selected. That is the class
   of bug this rewrite removes rather than patches: there is no
   ambient selection any more. Every card owns its own quantity, and
   pressing + on a card is the only way anything enters the cart.

   Also fixed here:
     · quantities were `+value` — "2.5" bought two and a half lessons
     · contact validation was presence-only — "abc" passed as a phone
     · nothing persisted, so a reload emptied the cart
     · adding an item gave no feedback on mobile (the cart sits ~1300px
       further down the page)
     · alert() for every error; now inline, per-field, non-blocking
     · scrolled to `offsetTop - 70` against a nav that is 80–100px tall
   ================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('book');
  if (!root || !window.LHSC) return;

  var MAX_QTY = 30;
  var STORE_KEY = 'lhsc.cart.v1';
  var STORE_TTL = 7 * 24 * 60 * 60 * 1000; // a stale cart from last month helps nobody

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    data: null,
    mode: 'packages',
    category: 'stay',
    cart: [],            // [{id, qty}] — price/name always rehydrated from CMS data
    step: 1,
    touched: false       // has the guest attempted step 2 yet? gates live re-validation
  };

  /* ---------------------------------------------------------------
     Money
     --------------------------------------------------------------- */
  function money(n) { return window.LHSC.money(n, state.data.settings); }
  function depositRate() {
    var r = Number(state.data.settings.booking.depositRate);
    return (r > 0 && r < 1) ? r : 0.25;
  }
  function lines() {
    return state.cart.map(function (c) {
      var item = state.data.byId[c.id];
      return item ? { id: c.id, qty: c.qty, item: item, total: item.price * c.qty } : null;
    }).filter(Boolean);
  }
  function subtotal() { return lines().reduce(function (s, l) { return s + l.total; }, 0); }
  function deposit() { return Math.round(subtotal() * depositRate()); }
  function count() { return state.cart.reduce(function (s, c) { return s + c.qty; }, 0); }

  /* ---------------------------------------------------------------
     Persistence — only {id, qty}. Prices are re-read from the CMS on
     load, so a cart saved before a price change is never stale, and
     no personal detail is ever written to the device.
     --------------------------------------------------------------- */
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ at: Date.now(), items: state.cart }));
    } catch (e) { /* private mode / quota — the cart just won't survive a reload */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.items) || Date.now() - saved.at > STORE_TTL) {
        localStorage.removeItem(STORE_KEY);
        return;
      }
      state.cart = saved.items
        .filter(function (c) { return state.data.byId[c.id] && state.data.byId[c.id].active !== false; })
        .map(function (c) { return { id: c.id, qty: clampQty(c.qty) }; });
    } catch (e) { /* corrupt payload — start empty */ }
  }

  function clampQty(n) {
    n = Math.floor(Number(n));                      // "2.5" → 2, "abc" → NaN
    if (!isFinite(n) || n < 0) n = 0;
    return Math.min(n, MAX_QTY);
  }

  /* ---------------------------------------------------------------
     Cart mutation — the single entry point
     --------------------------------------------------------------- */
  function setQty(id, qty, announce) {
    if (!state.data.byId[id]) return;
    qty = clampQty(qty);
    var i = state.cart.findIndex(function (c) { return c.id === id; });

    if (qty === 0) {
      if (i > -1) state.cart.splice(i, 1);
    } else if (i > -1) {
      state.cart[i].qty = qty;
    } else {
      state.cart.push({ id: id, qty: qty });
    }

    save();
    render();
    if (announce) toast(announce);
  }
  function qtyOf(id) {
    var c = state.cart.find(function (x) { return x.id === id; });
    return c ? c.qty : 0;
  }

  /* ---------------------------------------------------------------
     Toast — replaces alert(). Non-blocking, announced to screen
     readers, and it is the feedback the mobile layout was missing.
     --------------------------------------------------------------- */
  var toastTimer = null;
  function toast(msg, tone) {
    var el = $('bkToast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'bk-toast show' + (tone ? ' ' + tone : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'bk-toast'; }, 2600);
  }

  /* ---------------------------------------------------------------
     Rendering — options
     --------------------------------------------------------------- */
  function optionCard(item, big) {
    var qty = qtyOf(item.id);
    var card = document.createElement('article');
    card.className = 'opt' + (big ? ' opt-lg' : '') + (qty ? ' in-cart' : '');
    card.dataset.id = item.id;

    if (item.image) {
      var img = document.createElement('img');
      img.className = 'opt-img';
      /* Same /it/, /de/ subdirectory problem as content.js — resolve
         through the shared helper so a localized build shows real photos. */
      img.src = (window.LHSC && window.LHSC.asset) ? window.LHSC.asset(item.image) : item.image;
      img.alt = item.alt || item.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      card.appendChild(img);
    }

    var body = document.createElement('div');
    body.className = 'opt-body';

    var h = document.createElement('h4');
    h.textContent = item.name;
    body.appendChild(h);

    var meta = item.meta || item.tagline;
    if (meta) {
      var p = document.createElement('p');
      p.className = 'opt-meta';
      p.textContent = meta;
      body.appendChild(p);
    }

    if (big && item.blurb) {
      var b = document.createElement('p');
      b.className = 'opt-blurb';
      b.textContent = item.blurb;
      body.appendChild(b);
    }

    if (big && Array.isArray(item.includes) && item.includes.length) {
      var ul = document.createElement('ul');
      ul.className = 'opt-inc';
      item.includes.forEach(function (t) {
        var li = document.createElement('li');
        li.textContent = t;
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    var price = document.createElement('div');
    price.className = 'opt-price';
    var strong = document.createElement('b');
    strong.textContent = money(item.price);
    var em = document.createElement('em');
    em.textContent = item.unit || '';
    price.appendChild(strong);
    price.appendChild(em);
    body.appendChild(price);

    card.appendChild(body);
    card.appendChild(stepper(item, qty));
    return card;
  }

  function stepper(item, qty) {
    var wrap = document.createElement('div');
    wrap.className = 'opt-add';

    if (!qty) {
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-gold opt-btn';
      add.dataset.act = 'add';
      add.dataset.id = item.id;
      add.textContent = 'Add';
      add.setAttribute('aria-label', 'Add ' + item.name + ' to your booking');
      wrap.appendChild(add);
      return wrap;
    }

    var st = document.createElement('div');
    st.className = 'stepper';
    st.appendChild(stepBtn('dec', '−', item, 'Remove one ' + item.name));
    var n = document.createElement('span');
    n.className = 'stepper-n';
    n.textContent = String(qty);
    n.setAttribute('aria-live', 'polite');
    n.setAttribute('aria-label', qty + ' × ' + item.name);
    st.appendChild(n);
    st.appendChild(stepBtn('inc', '+', item, 'Add another ' + item.name));
    wrap.appendChild(st);

    var unit = document.createElement('span');
    unit.className = 'opt-unitword';
    unit.textContent = unitWord(item);
    wrap.appendChild(unit);
    return wrap;
  }

  function stepBtn(act, glyph, item, label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = act;
    b.dataset.id = item.id;
    b.textContent = glyph;
    b.setAttribute('aria-label', label);
    return b;
  }

  /* "3 Nights" reads better than "3 People" against a cabana. */
  function unitWord(item) {
    var cats = (state.data.experiences.categories || []);
    var c = cats.find(function (x) { return x.id === item.category; });
    if (c && c.unitWord) return c.unitWord;
    return item.kind === 'package' ? 'People' : 'Qty';
  }

  function renderOptions() {
    var host = $('bkOptions');
    if (!host) return;
    host.textContent = '';

    if (state.mode === 'packages') {
      var grid = document.createElement('div');
      grid.className = 'opt-grid opt-grid-lg';
      (state.data.packages.items || [])
        .filter(function (p) { return p.active !== false; })
        .forEach(function (p) { grid.appendChild(optionCard(p, true)); });
      host.appendChild(grid);
      return;
    }

    // Build Your Own: 18 items used to render as one 1,826px wall on a
    // phone — 2.2 screens of scrolling. Category chips cut it to one.
    var cats = state.data.experiences.categories || [];
    var chips = document.createElement('div');
    chips.className = 'cat-chips';
    chips.setAttribute('role', 'tablist');
    chips.setAttribute('aria-label', 'Experience category');
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (c.id === state.category ? ' on' : '');
      b.dataset.cat = c.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', c.id === state.category ? 'true' : 'false');
      b.textContent = c.label;
      var n = itemsIn(c.id).reduce(function (s, it) { return s + qtyOf(it.id); }, 0);
      if (n) {
        var dot = document.createElement('span');
        dot.className = 'chip-n';
        dot.textContent = String(n);
        b.appendChild(dot);
      }
      chips.appendChild(b);
    });
    host.appendChild(chips);

    var active = cats.find(function (c) { return c.id === state.category; });
    if (active && active.note) {
      var note = document.createElement('p');
      note.className = 'cat-note';
      note.textContent = active.note;
      host.appendChild(note);
    }

    var list = document.createElement('div');
    list.className = 'opt-grid';
    itemsIn(state.category).forEach(function (it) { list.appendChild(optionCard(it, false)); });
    host.appendChild(list);
  }

  function itemsIn(cat) {
    return (state.data.experiences.items || []).filter(function (i) {
      return i.category === cat && i.active !== false;
    });
  }

  /* ---------------------------------------------------------------
     Rendering — cart, totals, sticky bar
     --------------------------------------------------------------- */
  function renderCart() {
    var host = $('cartList');
    if (!host) return;
    host.textContent = '';
    var ls = lines();

    if (!ls.length) {
      var empty = document.createElement('p');
      empty.className = 'cart-empty';
      empty.textContent = 'Nothing reserved yet — pick a camp package or build your own trip above.';
      host.appendChild(empty);
    } else {
      ls.forEach(function (l) {
        var row = document.createElement('div');
        row.className = 'cart-item';

        var main = document.createElement('div');
        main.className = 'ci-main';
        var b = document.createElement('b');
        b.textContent = l.item.name;
        var em = document.createElement('em');
        em.textContent = money(l.item.price) + ' ' + (l.item.unit || '');
        main.appendChild(b);
        main.appendChild(em);
        row.appendChild(main);

        var q = document.createElement('div');
        q.className = 'ci-qty';
        q.appendChild(stepBtn('dec', '−', l.item, 'Remove one ' + l.item.name));
        var n = document.createElement('span');
        n.textContent = String(l.qty);
        q.appendChild(n);
        q.appendChild(stepBtn('inc', '+', l.item, 'Add another ' + l.item.name));
        row.appendChild(q);

        var price = document.createElement('span');
        price.className = 'ci-price';
        price.textContent = money(l.total);
        row.appendChild(price);

        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ci-x';
        x.dataset.act = 'del';
        x.dataset.id = l.id;
        x.textContent = '×';
        x.setAttribute('aria-label', 'Remove ' + l.item.name + ' from your booking');
        row.appendChild(x);

        host.appendChild(row);
      });
    }

    var sub = subtotal(), dep = deposit();
    setText('sumSubtotal', money(sub));
    setText('sumDeposit', money(dep));
    setText('sumBalance', money(sub - dep));

    var badge = $('cartCount');
    if (badge) {
      badge.textContent = String(count());
      badge.hidden = count() === 0;
    }
  }

  function renderBar() {
    var bar = $('bkBar');
    if (!bar) return;
    var n = count();
    bar.classList.toggle('on', n > 0 && state.step === 1);
    setText('barCount', n + (n === 1 ? ' item' : ' items'));
    setText('barTotal', money(subtotal()));
  }

  function setText(id, v) { var el = $(id); if (el) el.textContent = v; }

  function render() {
    renderOptions();
    renderCart();
    renderBar();
  }

  /* ---------------------------------------------------------------
     Steps
     --------------------------------------------------------------- */
  function goStep(n) {
    if (n >= 2 && !state.cart.length) {
      toast('Add at least one item before continuing.', 'warn');
      var opts = $('bkOptions');
      if (opts) opts.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (n === 3) {
      if (!validateDetails(true)) return;
      buildReview();
    }

    state.step = n;
    document.querySelectorAll('.step').forEach(function (s) {
      var on = Number(s.dataset.step) === n;
      s.classList.toggle('hidden', !on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    document.querySelectorAll('#bkSteps li').forEach(function (li) {
      var i = Number(li.dataset.s);
      li.classList.toggle('on', i <= n);
      li.classList.toggle('current', i === n);
      li.setAttribute('aria-current', i === n ? 'step' : 'false');
    });

    renderBar();

    // The old code scrolled to `offsetTop - 70` against a nav that is
    // 80px on phones and 100px on desktop, tucking the heading under it.
    var navH = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-h'), 10) || 80;
    var top = root.getBoundingClientRect().top + window.scrollY - navH - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    var head = document.querySelector('.step[data-step="' + n + '"] .step-h');
    if (head) head.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------
     Validation — inline and per-field. The old check was
     `if(!value)`, which let "abc" through as a phone number and
     "not-an-email" through as an email; those bookings then went to
     WhatsApp with no way to reply.
     --------------------------------------------------------------- */
  var RULES = {
    fname: {
      test: function (v) { return v.trim().length >= 2; },
      msg: 'Please tell us your first name.'
    },
    email: {
      test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
      msg: 'Please enter a valid email — this is where your confirmation goes.'
    },
    phone: {
      test: function (v) { return v.replace(/[^\d]/g, '').length >= 7; },
      msg: 'Please enter a reachable phone or WhatsApp number.'
    },
    date: {
      optional: true,
      test: function (v) {
        if (!v) return true;
        var today = new Date(); today.setHours(0, 0, 0, 0);
        return new Date(v + 'T00:00:00') >= today;
      },
      msg: 'Please choose a date from today onwards.'
    },
    guests: {
      optional: true,
      test: function (v) { return !v || (/^\d+$/.test(v) && +v >= 1 && +v <= 40); },
      msg: 'Group size should be a whole number between 1 and 40.'
    }
  };

  function fieldError(id, msg) {
    var input = $(id);
    if (!input) return;
    var holder = input.closest('.field') || input.parentNode;
    var err = holder.querySelector('.field-err');

    if (msg) {
      if (!err) {
        err = document.createElement('span');
        err.className = 'field-err';
        err.id = id + '-err';
        holder.appendChild(err);
      }
      err.textContent = msg;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id);
      holder.classList.add('has-err');
    } else {
      if (err) err.remove();
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      holder.classList.remove('has-err');
    }
  }

  function validateDetails(focusFirst) {
    state.touched = true;
    var firstBad = null;
    Object.keys(RULES).forEach(function (id) {
      var input = $(id);
      if (!input) return;
      var v = input.value || '';
      var ok = RULES[id].optional && !v.trim() ? true : RULES[id].test(v);
      fieldError(id, ok ? null : RULES[id].msg);
      if (!ok && !firstBad) firstBad = input;
    });

    if (firstBad) {
      if (focusFirst) {
        firstBad.focus();
        firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      toast('Please check the highlighted fields.', 'warn');
      return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------
     Review
     --------------------------------------------------------------- */
  function buildReview() {
    var box = $('reviewBox');
    if (!box) return;
    box.textContent = '';
    var sub = subtotal(), dep = deposit();

    lines().forEach(function (l) {
      var row = document.createElement('div');
      row.className = 'rv-line';
      var name = document.createElement('span');
      name.textContent = l.item.name + ' × ' + l.qty;
      var amt = document.createElement('b');
      amt.textContent = money(l.total);
      row.appendChild(name);
      row.appendChild(amt);
      box.appendChild(row);
    });

    box.appendChild(rvTotal('Subtotal', money(sub), false));
    box.appendChild(rvTotal('Deposit due now (' + Math.round(depositRate() * 100) + '%)', money(dep), true));
    box.appendChild(rvTotal('Balance on arrival', money(sub - dep), false));

    var who = document.createElement('p');
    who.className = 'rv-who';
    who.textContent = [
      ($('fname').value + ' ' + $('lname').value).trim(),
      $('email').value.trim(),
      $('phone').value.trim()
    ].filter(Boolean).join(' · ');
    box.appendChild(who);
  }

  function rvTotal(label, value, strong) {
    var row = document.createElement('div');
    row.className = 'rv-total' + (strong ? ' rv-strong' : '');
    var l = document.createElement('span'); l.textContent = label;
    var v = document.createElement('b'); v.textContent = value;
    row.appendChild(l); row.appendChild(v);
    return row;
  }

  /* ---------------------------------------------------------------
     Submission
     --------------------------------------------------------------- */
  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }

  function bookingText() {
    var sub = subtotal(), dep = deposit();
    var out = ['🏄 NEW BOOKING — Light House Surf Camp', ''];
    lines().forEach(function (l) {
      out.push('• ' + l.item.name + ' × ' + l.qty +
        ' (' + money(l.item.price) + ' ' + (l.item.unit || '') + ') = ' + money(l.total));
    });
    out.push('',
      'Subtotal: ' + money(sub),
      'Deposit (' + Math.round(depositRate() * 100) + '%): ' + money(dep),
      'Balance on arrival: ' + money(sub - dep),
      '—',
      'Name: ' + (val('fname') + ' ' + val('lname')).trim(),
      'Email: ' + val('email'),
      'Phone: ' + val('phone'),
      'Surf level: ' + val('level'),
      'Guests: ' + (val('guests') || '-'),
      'Start date: ' + (val('date') || 'flexible'),
      'Country: ' + (val('country') || '-'),
      'Notes: ' + (val('notes') || '-'));
    return out.join('\n');
  }

  function openWhatsApp(prefix) {
    var num = state.data.settings.contact.whatsapp;
    var text = (prefix ? prefix + '\n' : '') + bookingText();
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  function payHere() {
    var ph = state.data.settings.payhere || {};
    var dep = deposit().toFixed(2);
    var orderId = 'LHSC-' + Date.now();

    if (!ph.enabled) {
      toast('Sending your booking to our team on WhatsApp…');
      openWhatsApp('DEPOSIT BOOKING (' + money(deposit()) + ')');
      return;
    }

    var btn = $('payBtn');
    btn.disabled = true;
    btn.classList.add('is-loading');

    fetch(ph.hashEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderId,
        amount: dep,
        currency: state.data.settings.booking.currency
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('hash endpoint ' + r.status);
        return r.json();
      })
      .then(function (res) {
        if (!res || !res.hash) throw new Error('no hash returned');
        var form = $('payhereForm');
        form.action = ph.sandbox
          ? 'https://sandbox.payhere.lk/pay/checkout'
          : 'https://www.payhere.lk/pay/checkout';

        var f = {
          ph_merchant_id: ph.merchantId, ph_return_url: ph.returnUrl,
          ph_cancel_url: ph.cancelUrl, ph_notify_url: ph.notifyUrl,
          ph_order_id: orderId,
          ph_items: lines().map(function (l) { return l.item.name + '×' + l.qty; }).join(', ') + ' (deposit)',
          ph_currency: state.data.settings.booking.currency, ph_amount: dep, ph_hash: res.hash,
          ph_first_name: val('fname'), ph_last_name: val('lname'),
          ph_email: val('email'), ph_phone: val('phone')
        };
        Object.keys(f).forEach(function (k) { if ($(k)) $(k).value = f[k]; });

        localStorage.removeItem(STORE_KEY); // the cart has become an order
        form.submit();
      })
      .catch(function (err) {
        console.warn('[LHSC] PayHere unavailable —', err.message);
        btn.disabled = false;
        btn.classList.remove('is-loading');
        toast('Card payment is unavailable right now — sending via WhatsApp instead.', 'warn');
        openWhatsApp();
      });
  }

  /* ---------------------------------------------------------------
     Wiring
     --------------------------------------------------------------- */
  function bind() {
    // One delegated handler covers every add / +/− / remove control,
    // in the option grid and in the cart, now and after any re-render.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn || !root.contains(btn) && !btn.closest('.summary')) return;
      var id = btn.dataset.id;
      if (!id) return;
      var item = state.data.byId[id];
      if (!item) return;

      switch (btn.dataset.act) {
        case 'add': setQty(id, 1, item.name + ' added — nice choice.'); break;
        case 'inc': setQty(id, qtyOf(id) + 1); break;
        case 'dec': setQty(id, qtyOf(id) - 1); break;
        case 'del': setQty(id, 0, item.name + ' removed.'); break;
      }
    });

    // Mode tabs — switching wipes nothing from the cart, and because
    // there is no ambient selection there is nothing to leak across.
    document.querySelectorAll('.bk-mode').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.dataset.mode;
        document.querySelectorAll('.bk-mode').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('on', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderOptions();
      });
    });

    // Category chips are rendered by us, so delegate.
    var host = $('bkOptions');
    if (host) {
      host.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) return;
        state.category = chip.dataset.cat;
        renderOptions();
      });
    }

    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { goStep(Number(b.dataset.goto)); });
    });

    // Let a guest jump back to a step they have already completed.
    document.querySelectorAll('#bkSteps li').forEach(function (li) {
      li.addEventListener('click', function () {
        var i = Number(li.dataset.s);
        if (i < state.step) goStep(i);
      });
    });

    // Re-validate on blur, but only once they have tried to continue —
    // scolding someone for an incomplete email while they type it is rude.
    Object.keys(RULES).forEach(function (id) {
      var input = $(id);
      if (!input) return;
      input.addEventListener('blur', function () {
        if (!state.touched) return;
        var v = input.value || '';
        var ok = RULES[id].optional && !v.trim() ? true : RULES[id].test(v);
        fieldError(id, ok ? null : RULES[id].msg);
      });
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') !== 'true') return;
        var v = input.value || '';
        var ok = RULES[id].optional && !v.trim() ? true : RULES[id].test(v);
        if (ok) fieldError(id, null);   // clear the moment it becomes valid
      });
    });

    var wa = $('waBtn');
    if (wa) wa.addEventListener('click', function () { openWhatsApp(); });
    var pay = $('payBtn');
    if (pay) pay.addEventListener('click', payHere);

    var barBtn = $('barBtn');
    if (barBtn) barBtn.addEventListener('click', function () { goStep(2); });

    // Can't book yesterday.
    var date = $('date');
    if (date && !date.min) date.min = new Date().toISOString().slice(0, 10);
  }

  /* ---------------------------------------------------------------
     Boot
     --------------------------------------------------------------- */
  window.LHSC.load().then(function (data) {
    state.data = data;

    var cats = data.experiences.categories || [];
    if (cats.length) state.category = cats[0].id;

    restore();
    bind();
    render();

    var shell = $('bkLoading');
    if (shell) shell.remove();
    root.classList.add('bk-ready');

    if (state.cart.length) toast('We saved your last selection.');
  }).catch(function (err) {
    console.error('[LHSC] booking content failed to load —', err);
    var host = $('bkOptions');
    if (host) {
      host.innerHTML = '';
      var box = document.createElement('div');
      box.className = 'bk-fallback';
      var h = document.createElement('h4');
      h.textContent = 'Our live booking form is having a moment.';
      var p = document.createElement('p');
      p.textContent = 'Message us on WhatsApp and we will set the whole trip up for you personally — usually within the hour.';
      var a = document.createElement('a');
      a.className = 'btn btn-gold';
      a.href = 'https://wa.me/94702828819';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Book on WhatsApp';
      box.appendChild(h); box.appendChild(p); box.appendChild(a);
      host.appendChild(box);
    }
    var shell = $('bkLoading');
    if (shell) shell.remove();
  });
})();
