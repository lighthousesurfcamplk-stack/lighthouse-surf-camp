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

   …and three that read this page's own picture set, /content/media-*.json:

     <img  data-cms="media:hero.slide1" src="…">     → that photograph + its alt
     <div  data-cms="medialist:photos">…</div>       → a whole picture grid
     <video data-cms="video:hero.video">             → the hero background film

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

  /* WHICH PICTURE SET THIS PAGE USES.

     Every photograph on the public site is now swappable in /admin, which
     is a lot of JSON — so it is split by page area (media-home.json,
     media-stay.json, media-gallery.json …) and each page fetches only its
     own. Adding a ninth page of photographs therefore costs the other
     eight nothing.

     Stamped on <body>, deliberately NOT on <html>: tools/i18n-build.js
     rewrites the whole <html> tag when it generates a translated page, so
     an attribute parked there would survive on /index.html and vanish on
     /de/index.html — the kind of bug that only shows up in one language. */
  var MEDIA = (document.body && document.body.getAttribute('data-media')) || '';

  /* Is a runtime dictionary actually loaded? English pages get none.
     setAlt() below needs to know the difference. */
  var HAS_DICT = !!(I18N && I18N.t);
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

    var jobs = FILES.map(getJSON);

    /* The picture set is a SOFT dependency. If media-home.json is missing
       or malformed, Promise.all would reject and every price, name and
       booking card on the page would stay at its hard-coded fallback —
       a photograph problem taking down the shop. Resolve it to null
       instead and let the designed images stand. */
    jobs.push(MEDIA
      ? getJSON('media-' + MEDIA)['catch'](function (err) {
          console.warn('[LHSC] picture set "' + MEDIA + '" not loaded —', err.message);
          return null;
        })
      : Promise.resolve(null));

    pending = Promise.all(jobs).then(function (parts) {
      cache = {
        settings: parts[0],
        packages: parts[1],
        experiences: parts[2],
        reviews: parts[3],
        media: parts[4] || {}
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

  /* ALT TEXT, which is the one CMS string that is also baked into the page.
     tools/i18n-build.js translates the alt of every static <img> at build
     time via data-i18n-alt, so blindly writing the English alt from the
     shared content directory would undo that a second after the page
     painted — the same regression the runtime dictionary exists to prevent,
     just for screen readers instead of eyes.

     English pages take the CMS alt as written. A translated page accepts it
     only when t() can actually translate it; otherwise the build's own
     translation is the better answer and stays. */
  function setAlt(el, raw) {
    if (typeof raw !== 'string' || !raw) return;
    var out = t(raw);
    if (!HAS_DICT || out !== raw || !el.getAttribute('alt')) el.setAttribute('alt', out);
  }

  /* Rebuild a pure picture grid from a CMS list — the gallery masonry and
     the Instagram tiles. The first child is cloned as the template, so each
     grid keeps its own wrapper markup (.masonry holds bare <img>, .ig-grid
     holds <a class="ig-tile"><img></a>) without this file knowing about
     either.

     Only ever point this at a grid whose cards carry NO translated copy: a
     rebuild clones one card over all of them, which would replace every
     heading and paragraph in the grid with the first card's. That is why
     the room cards and the surf-spot cards use one media: hook per picture
     instead. */
  /* ---- Swap a photograph, and take its srcset with it --------------------
     Every photograph on this site ships a width-descriptor srcset, so a
     browser can pull an 800px file for a 331px masonry tile instead of the
     full-size original. That list names ONE photograph, at several widths.

     srcset BEATS src. So the moment the CMS points a slot at a different
     image, the list left behind is describing the OLD file at six widths and
     the browser goes on painting it -- the owner changes a photo in /admin,
     publishes, reloads, and nothing happens, because the src underneath is
     being overruled by an attribute nobody thought about. In fillGrid it is
     worse, since every tile is a clone of the first: one stale srcset pins
     the entire grid to the prototype's photograph.

     THE COMPARISON COMES FIRST, and it is the whole reason this is a
     function rather than two lines at each call site. /content/*.json ships
     naming the same photographs the markup was designed around, so on a page
     nobody has edited in /admin this returns immediately and the designed
     srcset survives untouched -- which matters enormously, because the CMS
     hooks sit on the heroes and the galleries, precisely the images the
     srcset was added to shrink. Without the guard, hydration would strip the
     optimisation off every CMS-backed image on every load, and the work
     would silently buy nothing on the pages that needed it most.

     On a genuine change, REWRITE beats drop wherever the page can be honest
     about the replacement. `known` is a lookup the caller harvests off the
     markup it is about to rebuild -- photograph to the exact srcset, sizes
     and width/height the build shipped for it. Those are not derived names:
     they were written next to files that demonstrably exist, and read back
     verbatim. So a photograph already on the page keeps every variant no
     matter which slot it moves to, which is what a reorder in /admin -- by
     far the likeliest edit -- actually is.

     Only a photograph the page has never seen falls back to clearing, and
     there clearing is right rather than deriving a candidate list: /admin
     uploads land in assets/img/ beside the originals (media_folder in
     admin/config.yml) and arrive with no variants next to them, so derived
     names would be a guess -- and a guessed candidate that 404s is a broken
     image, where a dropped srcset is only a larger download. Take the cheap
     failure. sizes goes with it; it means nothing without a srcset.

     Returns whether it changed anything, so callers can skip further work. */
  function applyImage(img, url, node, known) {
    if (img.getAttribute('src') === url) return false;
    img.setAttribute('src', url);
    var v = known && known[url];
    if (v) {
      /* A photograph the page already knows. Hand back the exact list the
         build wrote for it, and the width/height that belong to it. */
      img.setAttribute('srcset', v.srcset);
      if (v.sizes) img.setAttribute('sizes', v.sizes);
      else img.removeAttribute('sizes');
      if (v.width) img.setAttribute('width', v.width);
      else img.removeAttribute('width');
      if (v.height) img.setAttribute('height', v.height);
      else img.removeAttribute('height');
    } else {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
    }
    /* A matching <source> beats the <img src> underneath it for exactly the
       same reason, so a cloned <picture> would pin a rebuilt grid to the
       prototype's photograph just as a stale srcset would. No grid ships one
       today; this is here so that stops being one edit away from a silent
       bug. The hero <picture> in index.html is not rebuilt through here --
       it is kept in step deliberately, see case 'video'. */
    if (node && node !== img && node.querySelectorAll) {
      var ss = node.querySelectorAll('source');
      for (var i = 0; i < ss.length; i++) ss[i].parentNode.removeChild(ss[i]);
    }
    return true;
  }

  function fillGrid(el, items) {
    if (!Array.isArray(items) || !items.length) return;
    var proto = el.firstElementChild;
    if (!proto) return;

    var wanted = items.map(function (m) {
      return (m && m.image) ? asset(m.image) : '';
    }).filter(Boolean);
    if (!wanted.length) return;

    /* If the CMS list still matches what the page shipped with, leave the
       markup completely alone. The designed width/height pairs are correct
       per photograph and the browser has already reserved the right boxes
       from them; rebuilding would trade that for a layout shift and buy
       nothing. Day one is therefore a no-op. */
    /* Harvest those srcsets in the same walk, keyed by photograph.

       A rebuild clones the FIRST tile, so every tile would otherwise inherit
       the prototype's list -- and clearing it, the safe fallback, would cost
       the whole grid its width-descriptor sizing the first time the owner
       merely REORDERS photos in /admin. Reading the lists back off the markup
       keeps them, because a photograph that is still in the grid still has
       the variants the build made for it, whatever slot it now sits in.

       Locale pages need no special handling: their markup already carries
       ../assets/... in both src and srcset, and asset() prefixes the same
       way, so the keys line up and the harvested list is already correct for
       the page it came from. */
    var known = {};
    var current = Array.prototype.map.call(el.querySelectorAll('img'), function (i) {
      var src = i.getAttribute('src');
      if (i.getAttribute('srcset')) known[src] = {
        srcset: i.getAttribute('srcset'),
        sizes: i.getAttribute('sizes'),
        width: i.getAttribute('width'),
        height: i.getAttribute('height')
      };
      return src;
    });
    if (current.join('|') === wanted.join('|')) return;

    var frag = document.createDocumentFragment();
    items.forEach(function (m) {
      if (!m || !m.image) return;
      var node = proto.cloneNode(true);
      var img = node.tagName === 'IMG' ? node : node.querySelector('img');
      if (!img) return;
      /* A clone carries the prototype's srcset, which would outrank the src
         set here and show the first tile's photograph in every position.
         applyImage swaps in this photograph's own list when the page shipped
         one -- unless this tile IS the prototype's picture, in which case
         nothing needs touching at all. */
      var url = asset(m.image);
      if (applyImage(img, url, node, known) && !known[url]) {
        /* Only reached for a photograph the page has never seen, so the
           template's width/height describe a different file. Every grid here
           crops with object-fit or flows in a masonry column; drop the pair
           and let the browser read the real one. */
        img.removeAttribute('width');
        img.removeAttribute('height');
      }
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      setAlt(img, m.alt);
      frag.appendChild(node);
    });
    if (!frag.childNodes.length) return;
    el.textContent = '';
    el.appendChild(frag);
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
          if (item && item.image) applyImage(el, asset(item.image));
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
        case 'media': {
          /* One picture. Only swaps when the CMS actually holds an image,
             so a slot the owner has not filled keeps its designed photo. */
          var pic = dig(data.media, arg);
          if (pic && pic.image) {
            applyImage(el, asset(pic.image));
            setAlt(el, pic.alt);
          }
          break;
        }
        case 'medialist':
          fillGrid(el, dig(data.media, arg));
          break;
        case 'video': {
          /* Paths only. WHICH file plays on this viewport, whether autoplay
             was allowed, and what to do when a phone refuses, is behaviour —
             it belongs with the rest of the hero in main.js, which is
             listening for this event. Keeping the split means the film can
             also be hard-coded in the markup and still work with the JSON
             layer switched off entirely. */
          var film = dig(data.media, arg) || {};
          if (film.videoDesktop) el.setAttribute('data-desktop', asset(film.videoDesktop));
          if (film.videoMobile)  el.setAttribute('data-mobile',  asset(film.videoMobile));
          /* data-poster, NOT poster. A real poster attribute is fetched the
             instant it is set — preload="none" governs the film, not the still
             frame, and a <video> with no src at all still downloads its poster.
             That frame is a MOBILE asset, so writing it here would pull it down
             on every desktop visit as well: a megabyte-plus image for an element
             that style.css holds at opacity:0 until a film is genuinely playing,
             and desktop has no film. main.js promotes this to the real attribute
             only on the viewport that actually mounts one. */
          if (film.poster)       el.setAttribute('data-poster',  asset(film.poster));

          /* The phone hero is ALSO a <source> in the markup now -- see the
             <picture> wrapped around slide 1 in index.html -- because a
             <source> is the only form the preload scanner can find before any
             of this JavaScript has run. A matching <source> beats the <img src>
             underneath it, so hydrating the image alone would silently stop
             working the day the owner uploads a new poster in /admin: the JSON
             would change and the picture would not. Keep the two in step. */
          if (film.poster) {
            var pSrc = document.querySelector('source[data-cms-poster]');
            if (pSrc) pSrc.setAttribute('srcset', asset(film.poster));
          }
          document.dispatchEvent(new CustomEvent('lhsc:video', { detail: el }));
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
