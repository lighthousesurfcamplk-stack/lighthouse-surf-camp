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
  var ROOT = document.documentElement.getAttribute('data-root') || '';
  var BASE = ROOT + 'content/';

  /* Turn a CMS-relative path into one that resolves from THIS page.
     content/*.json stores "assets/img/foo.jpg" — correct for /index.html,
     but a page at /it/index.html resolves that to /it/assets/img/foo.jpg
     and paints a broken-image icon. This is why the package photos went
     missing on every translated page while the hard-coded HTML ones,
     which the build rewrote to "../assets/…", stayed fine: the JS
     overwrote a correct src with a relative one after load.

     Every translated page is stamped data-root="../" by
     tools/i18n-build.js, so prefixing with it is all that is needed.
     Absolute URLs, root-absolute paths and data: URIs are already
     unambiguous and pass through untouched, so this stays correct if the
     owner ever pastes a full CDN URL into the admin. */
  function asset(p) {
    if (typeof p !== 'string' || !p) return p;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(p)) return p;
    return ROOT + p.replace(/^(?:\.\/)+/, '');
  }
  /* THE RUNTIME DICTIONARY.

     All nine languages share ONE content directory, so every string that
     arrives from /content/*.json arrives in English. Hydration therefore
     used to overwrite a correctly translated German package name with the
     English one about a second after the page painted — the visitor watched
     the page revert. tools/i18n-build.js now stamps an inline
     window.__LHSC_I18N onto every translated page (English gets none), and
     everything that writes CMS copy goes through t() first.

     Keyed by the English string itself, not by an id: the same sentence is
     translated once no matter which package, room or lesson carries it, and
     a string the owner adds in /admin simply falls through untranslated
     rather than rendering an empty element. */
  var I18N = global.__LHSC_I18N || {};
  var DICT = I18N.t || {};

  function t(s) {
    if (typeof s !== 'string' || !s) return s;
    var hit = DICT[s];
    if (hit) return hit;
    // The admin round-trips values through form fields, so a stray trailing
    // space would otherwise silently miss an entry that is right there.
    hit = DICT[s.trim()];
    return hit || s;
  }

  /* Fill {x}/{n}/{p} in a translated template. Word order differs by
     language — Hebrew puts the item name where English puts the verb — so
     the placeholder travels inside the translation instead of the caller
     concatenating fragments in English order. */
  function tf(s, vars) {
    var out = t(s);
    for (var k in vars) out = out.split('{' + k + '}').join(vars[k]);
    return out;
  }

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

  /* Italian and Spanish write the symbol after the amount ("190 $"); the
     other seven write it before. The flag comes from the ALL_LANGS table in
     tools/i18n-build.js so the runtime and the static pages agree — the
     hand-written prices in it/*.html are already postfixed, and a hydrated
     card sitting next to them must not flip to "$190" a second later. */
  function money(n, settings) {
    var s = (settings && settings.booking && settings.booking.currencySymbol) || '$';
    var v = Number(n) || 0;
    var amount = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return I18N.postfix ? amount + ' ' + s : s + amount;
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
          if (item) el.textContent = t(item.name);
          break;
        case 'meta':
          if (item) el.textContent = t(item.meta || item.tagline || '');
          break;
        case 'img':
          /* Only swap when the CMS actually holds an image, so a package
             the owner has not given a photo keeps the designed one. */
          if (item && item.image) el.setAttribute('src', asset(item.image));
          break;
        case 'list': {
          /* Rebuild the "what's included" bullets. The first existing child
             is cloned so each page keeps its own markup (some use a tick
             span, some are plain <li>) without this file knowing about it. */
          if (!item || !Array.isArray(item.includes) || !item.includes.length) break;
          var proto = el.firstElementChild;
          el.textContent = '';
          item.includes.forEach(function (raw) {
            var line = t(raw);
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
          /* `arg` is deliberately NOT passed through t(). This text is not read
             by the visitor — it is the message that lands in the camp's inbox in
             Arugam Bay, and the team there triages it in English. A Hebrew or
             Russian prefill would translate a guest-facing string into a delay
             in answering that guest. The link LABEL is still translated, by
             data-i18n on the same anchor; only the payload is pinned.
             Locked by decision — do not "fix" this by adding t(arg). */
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
    /* Exported so booking.js resolves its thumbnails through the same
       rule instead of keeping a second copy of it. */
    asset: asset,
    /* booking.js renders the whole catalogue and the form's own UI strings;
       both go through this dictionary rather than a second copy of it. */
    t: t,
    tf: tf,
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
