/* Light House Surf Camp — content layer
   ------------------------------------------------------------------
   Everything the owner can edit in /admin lives in /content/*.json.
   This file is the single place that reads it, so the booking engine
   and the marketing pages can never drift out of sync on price.

   Static pages opt in declaratively — no page-specific JS needed:

     <span data-cms="price:pkg-7day">$590</span>     → "$590"
     <span data-cms="name:stay-dorm">…</span>        → "Bed in 6-Bed Mixed Dorm"
     <span data-cms="meta:pkg-7day">…</span>         → "All-inclusive · 6 nights"
     <ul   data-cms="list:pkg-7day">…</ul>           → one <li> per "includes" line
     <img  data-cms="img:pkg-7day" src="…">          → the package's photo
     <span data-cms="text:contact.email">…</span>    → settings.contact.email
     <a    data-cms="wa:Hi, I'd like to book">…</a>  → wa.me link with prefilled text

   The HTML keeps a real value between the tags, so the page is correct
   for search engines and for anyone whose fetch fails — hydration only
   ever overwrites with something newer.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  /* Where /content/*.json lives, relative to the page asking for it.
     Root-level English pages are simply "content/". Translated pages
     live one directory down (/ru/, /de/, /fr/) and are stamped with
     data-root="../" by tools/i18n-build.js, so the same fetch resolves
     back to the single shared content directory instead of 404-ing and
     leaving every CMS-managed price stuck at its hard-coded fallback. */
  var BASE = (document.documentElement.getAttribute('data-root') || '') + 'content/';
  var FILES = ['settings', 'packages', 'experiences', 'reviews'];
  var cache = null;
  var pending = null;

  function getJSON(name) {
    return fetch(BASE + name + '.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(name + '.json → HTTP ' + r.status);
      return r.json();
    });
  }

  /* Resolve "a.b.c" against an object without throwing on a missing branch. */
  function dig(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o == null) ? undefined : o[k];
    }, obj);
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;

    pending = Promise.all(FILES.map(getJSON)).then(function (parts) {
      cache = {
        settings: parts[0],
        packages: parts[1],
        experiences: parts[2],
        reviews: parts[3]
      };

      // One flat lookup covering both catalogues — the booking cart stores
      // only {id, qty} and rehydrates price/name from here, so a price edited
      // in the CMS applies to carts that were saved before the change.
      cache.byId = {};
      (cache.packages.items || []).forEach(function (p) {
        cache.byId[p.id] = Object.assign({ kind: 'package' }, p);
      });
      (cache.experiences.items || []).forEach(function (e) {
        cache.byId[e.id] = Object.assign({ kind: 'experience' }, e);
      });
      return cache;
    });

    return pending;
  }

  function money(n, settings) {
    var s = (settings && settings.booking && settings.booking.currencySymbol) || '$';
    var v = Number(n) || 0;
    return s + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /* Fill every [data-cms] on the page. Safe to call more than once. */
  function hydrate(data) {
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      var spec = el.getAttribute('data-cms');
      var i = spec.indexOf(':');
      var kind = i < 0 ? spec : spec.slice(0, i);
      var arg = i < 0 ? '' : spec.slice(i + 1);
      var item = data.byId[arg];

      switch (kind) {
        case 'price':
          if (item) el.textContent = money(item.price, data.settings);
          break;
        case 'name':
          if (item) el.textContent = item.name;
          break;
        case 'meta':
          if (item) el.textContent = item.meta || item.tagline || '';
          break;
        case 'img':
          /* Only swap when the CMS actually holds an image, so a package
             the owner has not given a photo keeps the designed one. */
          if (item && item.image) el.setAttribute('src', item.image);
          break;
        case 'list': {
          /* Rebuild the "what's included" bullets. The first existing child
             is cloned so each page keeps its own markup (some use a tick
             span, some are plain <li>) without this file knowing about it. */
          if (!item || !Array.isArray(item.includes) || !item.includes.length) break;
          var proto = el.firstElementChild;
          el.textContent = '';
          item.includes.forEach(function (line) {
            var li;
            if (proto) {
              li = proto.cloneNode(true);
              var slot = li.lastChild;
              if (slot && slot.nodeType === 3) slot.nodeValue = ' ' + line;
              else li.textContent = line;
            } else {
              li = document.createElement('li');
              li.textContent = line;
            }
            el.appendChild(li);
          });
          break;
        }
        case 'text': {
          var v = dig(data.settings, arg);
          if (v != null) el.textContent = v;
          break;
        }
        case 'href': {
          var h = dig(data.settings, arg);
          if (h != null) el.setAttribute('href', h);
          break;
        }
        case 'wa': {
          var num = dig(data.settings, 'contact.whatsapp');
          if (num) {
            el.setAttribute('href',
              'https://wa.me/' + num + (arg ? '?text=' + encodeURIComponent(arg) : ''));
          }
          break;
        }
      }
    });
  }

  global.LHSC = {
    load: load,
    money: money,
    hydrate: hydrate,
    get data() { return cache; }
  };

  // Marketing pages just include this file and get hydrated for free.
  // book.html calls load() itself and drives its own render.
  if (document.querySelector('[data-cms]')) {
    load().then(hydrate).catch(function (err) {
      // Non-fatal by design: the hard-coded HTML values stay on screen.
      console.warn('[LHSC] content not loaded, keeping static values —', err.message);
    });
  }
})(window);
