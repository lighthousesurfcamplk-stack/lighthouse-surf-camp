/* Light House Surf Camp — shared interactions */
(function(){
  'use strict';

  // Enable JS-only effects (content stays visible if this script ever fails to run)
  var docEl = document.documentElement;
  docEl.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------
     Language memory

     WHY THIS EXISTS. The site is statically translated: /it/index.html is a
     real file, so Google indexes every language separately, and the nav on a
     localized page already links to its localized neighbours — i18n-build.js
     rewrites those hrefs at build time and that part works correctly.

     The leak is COVERAGE, not rewriting. Only six of the twelve pages have a
     localized build (data-i18n-pages, stamped on <html> by the build so the
     list lives in exactly ONE place). Surf, Explore, Gallery and Reviews
     therefore point out of /it/ and back to the English original — and once
     the visitor is standing on an English page, that page's nav is entirely
     English, so every click after it stays English too. A one-way door.

     THE FIX. Remember the language the visitor was last reading, and on an
     English page re-point the links that DO have a localized twin back into
     that directory. Nothing is redirected and no content is swapped: the
     document served is the document read. This only changes where the NEXT
     click goes.

     SEO SAFETY. Googlebot carries no localStorage, so a crawler always sees
     the English links exactly as they were served; canonical and hreflang are
     never touched. The language switcher is deliberately left alone — it is
     the one control whose whole job is to leave the current language, and
     rewriting it would trap the visitor.
     --------------------------------------------------------- */
  (function(){
    var KEY   = 'lhsc:lang';
    var here  = docEl.getAttribute('data-lang-dir')    || '';   // '' on English
    var dirs  = (docEl.getAttribute('data-i18n-dirs')  || '').split(' ');
    var pages = (docEl.getAttribute('data-i18n-pages') || '').split(' ');

    /* Private mode, storage disabled by policy and cross-origin iframes all
       throw on the very first touch of localStorage, so every access is
       guarded and every failure degrades to "no memory" — i.e. exactly the
       site the build produced. */
    function recall(){ try { return localStorage.getItem(KEY) || ''; } catch(e){ return ''; } }
    function remember(v){
      try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch(e){}
    }

    /* Choosing from the switcher is the visitor stating a preference out
       loud — including choosing English, which MUST clear the memory or they
       could never get back out of Italian. Delegated from the document so it
       covers both copies of the switcher (bar and drawer) without caring
       which one the build injected where. */
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('.lang-menu a[hreflang]');
      if(!a) return;
      if(a.getAttribute('hreflang') === 'en'){ remember(''); return; }
      // 'de/index.html' and '../de/index.html' both yield 'de'.
      var parts = (a.getAttribute('href') || '').split('/');
      for(var k = 0; k < parts.length; k++){
        if(dirs.indexOf(parts[k]) > -1){ remember(parts[k]); return; }
      }
      // Own-language link on a localized page: the href carries no directory.
      if(here) remember(here);
    });

    /* Reading a localized page IS the preference — record it and stop. Every
       link on this page that CAN be localized already is. */
    if(here){ remember(here); return; }

    var want = recall();
    if(!want || dirs.indexOf(want) < 0) return;  // no memory, or a language that no longer builds

    /* Only bare, same-directory page links qualify. Absolute URLs, mailto:,
       tel:, #anchors and anything already inside a language directory fall
       straight through, and so does any page with no localized twin. */
    var self  = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/i, '');
    var links = document.querySelectorAll('a[href]');
    for(var i = 0; i < links.length; i++){
      var a = links[i];
      if(a.closest('.lang')) continue;                    // never touch the switcher
      var m = /^([a-z0-9-]+)\.html((?:[?#].*)?)$/i.exec(a.getAttribute('href') || '');
      if(!m || pages.indexOf(m[1]) < 0) continue;         // external, anchor, or untranslated
      if(m[1] === self) continue;                         // the link back to the page you are on
      a.setAttribute('href', want + '/' + m[1] + '.html' + m[2]);
    }
  })();

  /* ---------------------------------------------------------
     Sticky nav
     `data-solid="true"` pins the light nav on pages with no hero
     behind it (thank-you.html) — previously that page hardcoded
     `class="nav scrolled"` and this handler stripped it on load.
     --------------------------------------------------------- */
  var nav = document.querySelector('.nav');
  if(nav){
    var alwaysSolid = nav.dataset.solid === 'true';
    var onScroll = function(){
      nav.classList.toggle('scrolled', alwaysSolid || window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive:true});

    // Publish the real nav height so hero/anchor offsets stay in step with it.
    // Observe the BORDER box: the breakpoints only change the nav's padding, so
    // its content box stays 44px tall and a default content-box observer never
    // fires — --nav-h would stay stuck at whatever it measured on load.
    var syncNavHeight = function(){
      docEl.style.setProperty('--nav-h', Math.round(nav.offsetHeight) + 'px');
    };
    syncNavHeight();
    if('ResizeObserver' in window) new ResizeObserver(syncNavHeight).observe(nav, {box:'border-box'});
    window.addEventListener('resize', syncNavHeight, {passive:true});
  }

  /* ---------------------------------------------------------
     Mobile drawer
     Adds: aria-expanded, burger→X, scrim, body scroll lock,
     Escape / outside-click / link-click close, focus handling,
     and a Book Now CTA pinned inside the drawer.
     --------------------------------------------------------- */
  var burger = document.querySelector('.burger');
  var links  = document.querySelector('.nav-links');

  if(burger && links){
    burger.setAttribute('aria-expanded','false');
    burger.setAttribute('aria-controls', links.id || (links.id = 'primary-nav'));
    burger.setAttribute('aria-label','Open menu');

    // Book Now inside the drawer — the top-bar button stays put as well
    if(!links.querySelector('.nav-drawer-cta')){
      var ctaSrc = document.querySelector('.nav-cta .btn-primary');
      var li = document.createElement('li');
      li.className = 'nav-drawer-cta';
      var a = document.createElement('a');
      a.className = 'btn btn-primary';
      a.href = ctaSrc ? ctaSrc.getAttribute('href') : 'book.html';
      /* Mirror the bar button's own label rather than hard-coding it: the
         bar copy is translated at build time, so a literal 'Book Now' here
         put an English CTA at the bottom of every German, French and
         Russian drawer. */
      a.textContent = (ctaSrc && ctaSrc.textContent.trim()) || 'Book Now';
      li.appendChild(a);
      links.appendChild(li);
    }

    var scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    scrim.hidden = false;
    document.body.appendChild(scrim);

    var lockedY = 0;

    var setDrawer = function(open){
      links.classList.toggle('open', open);
      scrim.classList.toggle('on', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');

      if(open){
        lockedY = window.scrollY;
        document.body.style.top = -lockedY + 'px';
        document.body.classList.add('nav-open');
        /* The first <a> in the drawer is now one of the nine options
           inside the collapsed language panel, and a visibility:hidden
           element refuses focus silently — which dropped focus to <body>
           and broke the Tab trap. Focus the first control that is
           actually painted instead. */
        var first = Array.prototype.slice.call(links.querySelectorAll('a[href],button'))
          .filter(function(el){
            /* Two ways a control in here can be unfocusable, and both
               fail silently rather than throwing: visibility:hidden (the
               collapsed language panel) and display:none (the drawer's
               language row, retired once the switcher moved into the
               bar). getClientRects() is empty for both, and unlike
               offsetParent it stays correct for position:fixed. */
            return el.getClientRects().length > 0 &&
                   getComputedStyle(el).visibility !== 'hidden';
          })[0];
        if(first) first.focus({preventScroll:true});
      }else{
        document.body.classList.remove('nav-open');
        document.body.style.top = '';
        window.scrollTo(0, lockedY);
      }
    };

    var isOpen = function(){ return links.classList.contains('open'); };
    var close  = function(returnFocus){
      if(!isOpen()) return;
      setDrawer(false);
      if(returnFocus) burger.focus({preventScroll:true});
    };

    burger.addEventListener('click', function(){ setDrawer(!isOpen()); });
    scrim.addEventListener('click', function(){ close(true); });
    links.querySelectorAll('a').forEach(function(link){
      link.addEventListener('click', function(){ close(false); });
    });

    document.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      if(e.key === 'Escape'){ e.preventDefault(); close(true); return; }
      if(e.key !== 'Tab') return;

      /* Keep focus inside the drawer; the burger doubles as the close button.
         Buttons count too — the language dropdown's trigger is one, and
         leaving it out of this list put the wrap boundary in the wrong
         place. The visibility filter matters for the same component: its
         nine options live in a collapsed panel, and the last of them was
         being handed focus by the Shift+Tab wrap while visibility:hidden,
         which fails silently and dropped focus to the document body. */
      var focusable = [burger].concat(
        Array.prototype.slice.call(links.querySelectorAll('a[href],button'))
          .filter(function(el){ return getComputedStyle(el).visibility !== 'hidden'; }));
      var firstEl = focusable[0], lastEl = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === firstEl){ e.preventDefault(); lastEl.focus(); }
      else if(!e.shiftKey && document.activeElement === lastEl){ e.preventDefault(); firstEl.focus(); }
    });

    // Reset cleanly if the viewport grows past the drawer breakpoint
    var wide = window.matchMedia('(min-width: 1181px)');
    var onWide = function(e){ if(e.matches) close(false); };
    if(wide.addEventListener) wide.addEventListener('change', onWide);
    else if(wide.addListener) wide.addListener(onWide);
  }

  /* ---------------------------------------------------------
     Language dropdown
     Progressive enhancement over markup that already works: with this
     file absent the CSS still paints the trigger and the panel stays
     shut, but every option is a real <a href> inside it, so a crawler
     reads all nine and a keyboard user can still Tab to them. What is
     added here is only the disclosure behaviour.

     There are two instances on a page — .lang-bar in the nav rail and
     .lang-drawer in the slide-in menu — and each is wired independently
     rather than through a single shared "open" variable, because only
     one of the two is ever visible at a given width and a shared flag
     would have the hidden copy silently claiming the open state.
     --------------------------------------------------------- */
  var langWidgets = Array.prototype.slice.call(document.querySelectorAll('[data-lang]'))
    .map(function(root){
      var toggle = root.querySelector('.lang-toggle');
      var menu   = root.querySelector('.lang-menu');
      if(!toggle || !menu) return null;

      var options = Array.prototype.slice.call(menu.querySelectorAll('a'));

      var isOpen = function(){ return toggle.getAttribute('aria-expanded') === 'true'; };

      var set = function(open, focusIndex){
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        /* The state is mirrored onto a class as well as the attribute.
           The stylesheet's primary selector is
           .lang-toggle[aria-expanded="true"] + .lang-menu — an adjacent
           sibling combinator, which stops matching the moment anything is
           inserted between the button and the list, and then the panel
           stays at opacity:0 while the JS believes it is open. A class on
           the wrapper cannot be broken that way. */
        root.classList.toggle('is-open', !!open);
        /* The panel animates via visibility, and a visibility:hidden
           element refuses focus without reporting an error, so moving
           focus has to wait for the attribute above to have taken
           effect. It has by the time this line runs — attribute writes
           are synchronous and the CSS transition on visibility is a 0s
           step with no delay in the open direction. */
        if(open && typeof focusIndex === 'number' && options.length){
          var i = focusIndex < 0 ? options.length - 1 : focusIndex;
          options[i].focus();
        }
      };

      var close = function(returnFocus){
        if(!isOpen()) return false;
        set(false);
        if(returnFocus) toggle.focus();
        return true;
      };

      toggle.addEventListener('click', function(e){
        /* The trigger sits inside <nav>, next to an <a class="btn"> and
           inside a header that some browsers treat as a click-through
           region. Claiming the event outright stops any ancestor handler
           from re-closing the panel in the same gesture that opened it. */
        e.preventDefault();
        e.stopPropagation();
        /* Only one panel at a time. Closing the others first also covers
           the case where a widget was left open and the viewport crossed
           the breakpoint, swapping which copy is on screen. */
        langWidgets.forEach(function(w){ if(w && w.root !== root) w.close(false); });
        set(!isOpen());
      });

      toggle.addEventListener('keydown', function(e){
        if(e.key === 'ArrowDown' || e.key === 'Down'){ e.preventDefault(); set(true, 0); }
        else if(e.key === 'ArrowUp' || e.key === 'Up'){ e.preventDefault(); set(true, -1); }
        else if(e.key === 'Escape' || e.key === 'Esc'){
          /* Consume it here so the mobile drawer's own Escape handler,
             which is bound to document and would otherwise see the same
             event bubble up, does not close the whole menu when the user
             only meant to dismiss the language panel. */
          if(close(true)) e.stopPropagation();
        }
      });

      menu.addEventListener('keydown', function(e){
        var i = options.indexOf(document.activeElement);
        if(e.key === 'Escape' || e.key === 'Esc'){ if(close(true)) e.stopPropagation(); return; }
        if(i === -1) return;
        if(e.key === 'ArrowDown' || e.key === 'Down'){
          e.preventDefault(); options[(i + 1) % options.length].focus();
        }else if(e.key === 'ArrowUp' || e.key === 'Up'){
          e.preventDefault(); options[(i - 1 + options.length) % options.length].focus();
        }else if(e.key === 'Home'){ e.preventDefault(); options[0].focus(); }
        else if(e.key === 'End'){ e.preventDefault(); options[options.length - 1].focus(); }
      });

      /* focusout rather than blur: it bubbles, so one listener covers the
         trigger and all nine options. relatedTarget is where focus is
         going — null when it leaves the document entirely (an alt-tab),
         which should NOT close the panel out from under the user. */
      root.addEventListener('focusout', function(e){
        if(e.relatedTarget && !root.contains(e.relatedTarget)) close(false);
      });

      return { root: root, close: close, isOpen: isOpen };
    })
    .filter(Boolean);

  if(langWidgets.length){
    /* pointerdown, not click: a click on a link elsewhere on the page can
       navigate before the click listener runs, leaving the panel painted
       open through the page transition. */
    document.addEventListener('pointerdown', function(e){
      /* composedPath() rather than e.target alone: inside a shadow tree
         or on a browser that retargets the event, e.target can be an
         ancestor of the widget and contains() then reports false for a
         pointerdown that actually landed ON the trigger — closing the
         panel in the same gesture that opened it, which is exactly what
         "the button does nothing" looks like. */
      var path = (typeof e.composedPath === 'function') ? e.composedPath() : null;
      langWidgets.forEach(function(w){
        var inside = path ? path.indexOf(w.root) !== -1 : w.root.contains(e.target);
        if(!inside) w.close(false);
      });
    });

    /* Restoring a page from the back/forward cache replays the DOM as it
       was left, panel open and all, but not the JS state that got it
       there. Shut everything on the way back in. */
    window.addEventListener('pageshow', function(e){
      if(e.persisted) langWidgets.forEach(function(w){ w.close(false); });
    });
  }

  /* ---------------------------------------------------------
     Hero slideshow — dots, swipe, pause when hidden
     --------------------------------------------------------- */
  /* Assigned by the slideshow below and called by the video controller
     further down, so the two never both own the hero at once. Two-way,
     because the cover can come off again: a phone turned landscape crosses
     760px, drops the portrait still frame, and wants a moving hero back. */
  var setSlideshow = null;

  var show = document.querySelector('.hero-media.slideshow');
  if(show){
    var slides = Array.prototype.slice.call(show.querySelectorAll('.slide'));
    var dotsWrap = document.querySelector('.hero-dots');
    var idx = 0, timer = null, stood = false;
    var DURATION = 7000; // matches the 7s kenburns pass so the zoom never cuts mid-flight

    if(dotsWrap && slides.length > 1){
      slides.forEach(function(_, i){
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Show slide ' + (i + 1) + ' of ' + slides.length);
        if(i === 0){ b.classList.add('on'); b.setAttribute('aria-current','true'); }
        b.addEventListener('click', function(){ go(i); reset(); });
        dotsWrap.appendChild(b);
      });
    }
    var dots = dotsWrap ? Array.prototype.slice.call(dotsWrap.children) : [];

    function go(n){
      slides[idx].classList.remove('active');
      if(dots[idx]){ dots[idx].classList.remove('on'); dots[idx].removeAttribute('aria-current'); }
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add('active');
      if(dots[idx]){ dots[idx].classList.add('on'); dots[idx].setAttribute('aria-current','true'); }
    }
    function reset(){
      clearInterval(timer);
      if(slides.length > 1) timer = setInterval(function(){ go(idx + 1); }, DURATION);
    }

    if(slides.length > 1){
      reset();

      // Don't advance while the tab is in the background
      document.addEventListener('visibilitychange', function(){
        if(document.hidden) clearInterval(timer);
        else if(!stood) reset();   // …and never restart one we stood down
      });

      /* Something is covering the photographs — the film, or the phone still
         frame. Either way they are nobody's hero any more: stop paying for a
         crossfade that cannot be seen, and set `stood` so the visibilitychange
         handler above does not quietly start it again on the way back into the
         tab. Passing true undoes both, for the one case that needs it. */
      setSlideshow = function(on){
        stood = !on;
        clearInterval(timer);
        timer = null;
        if(on && slides.length > 1) timer = setInterval(function(){ go(idx + 1); }, DURATION);
      };

      // Swipe between slides on touch
      var hero = show.closest('.hero') || show;
      var sx = 0, sy = 0, tracking = false;
      hero.addEventListener('touchstart', function(e){
        if(e.touches.length !== 1) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
      }, {passive:true});
      hero.addEventListener('touchend', function(e){
        if(!tracking) return;
        tracking = false;
        var t = e.changedTouches[0];
        var dx = t.clientX - sx, dy = t.clientY - sy;
        if(Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5){
          go(idx + (dx < 0 ? 1 : -1));
          reset();
        }
      }, {passive:true});
    }
  }

  /* ---------------------------------------------------------
     Hero background video
     ---------------------------------------------------------
     Pure progressive enhancement over the slideshow above. Until the
     owner uploads a film in /admin the three photographs ARE the hero,
     byte for byte as before; the moment a film exists this fades it in
     over them and stands the slideshow down.

     WHY THE SOURCE IS CHOSEN HERE, and not with <source media="…">:
     a media attribute inside <video> is evaluated once, while the
     element is loading, and is never re-read — so a phone held in
     portrait that is then turned landscape keeps the portrait cut, and
     a desktop browser that starts at a narrow window keeps the mobile
     one. Safari has also never honoured it dependably inside <video>
     (it is a <picture> feature that <video> borrowed on paper). A
     matchMedia listener is read on every change, so a rotation swaps
     the file, and it behaves identically in every engine.

     The film is deliberately NOT the LCP: preload="none" plus a src
     that is only attached after the content layer has answered means
     the hero photograph still paints first, exactly as the preload hint
     in the <head> intends.
     --------------------------------------------------------- */
  var heroVideo = document.querySelector('.hero-video');
  if(heroVideo){
    var heroEl   = heroVideo.closest('.hero');
    var portrait = window.matchMedia('(max-width: 760px)');
    var attempt  = 0;

    function pickSource(){
      var mob  = heroVideo.getAttribute('data-mobile');
      var desk = heroVideo.getAttribute('data-desktop');
      /* The fallback runs ONE WAY, and only one way.

         A landscape desktop cut dropped onto a phone is fine: object-fit:cover
         takes the middle band of it and it reads as intended, so a single
         upload is still enough to get a film onto every screen.

         The reverse is not. A phone cut is portrait, and very often 9:16
         padded into a 16:9 container by whatever exported it. Covering a wide
         desktop hero with that either blows a narrow strip up past the
         resolution it was encoded at or — when the padding is baked into the
         frame — paints the black bars straight across the hero. The old
         two-way fallback did exactly that whenever the owner filled in the
         mobile film and left the desktop one empty, which is the ordinary
         case, because the footage came off a phone. Desktop now keeps the
         photo slideshow, which is the right hero for it. */
      return (portrait.matches ? (mob || desk) : desk) || '';
    }

    function live(on){
      if(!heroEl) return;
      heroEl.classList.toggle('has-video', !!on);
      if(on && setSlideshow) setSlideshow(false);
    }

    /* The source we WANT playing, tracked separately from the element's own
       src attribute. Those two diverge in exactly the case that goes wrong —
       file fully loaded, element paused — and the old guard could not tell
       that apart from "already mounted", so a single refused autoplay attempt
       froze the hero on the photograph for good. */
    var wanted    = '';
    var armed     = false;
    var retryOn   = ['pointerdown', 'touchstart', 'keydown', 'scroll'];
    /* ONE object, reused for both add and remove: browsers that understand
       options read {passive:true} and default capture to false, and the few
       that still coerce it to a boolean get `true` on both calls. Either way
       the pair matches and the listener genuinely comes back off. */
    var retryOpts = { passive: true };

    function attemptPlay(){
      if(!wanted || reduceMotion.matches) return;
      var token   = attempt;
      var started = heroVideo.play();
      if(started && started['catch']) started['catch'](function(err){
        /* A rejection is not always a refusal. Pointing the element at a new
           source aborts whatever play() was still in flight for the old one,
           and that rejects with AbortError — treating it as "autoplay
           declined" would hide a film that is about to start perfectly well.
           Only the newest attempt gets to draw any conclusion.

           A real refusal — iOS Low Power Mode, data-saver, some corporate
           policies, all of which decline even muted inline video — puts the
           photographs back on screen without nagging. It is no longer the end
           of the story: armRetry() below will ask again. */
        if(token !== attempt || (err && err.name === 'AbortError')) return;
        live(false);
      });
    }

    /* MEASURED, not theorised. With the film the owner pasted into the CMS,
       a phone-width viewport reaches readyState 4 — fully buffered, no error
       at all — and still sits paused, because the autoplay attempt fired
       before the browser was willing to grant it. One refusal used to be
       fatal: nothing ever asked again, so the hero stayed on the photograph
       and the film looked to the owner like it had failed to load.

       So ask again, twice over: once when frames actually arrive (see the
       loadeddata/canplay listeners below), and once on the visitor's first
       interaction of any kind — which on a full-bleed hero is a scroll within
       a second or two. Both are free when the film is already running: each
       checks .paused first, and the gesture listeners take themselves off. */
    function armRetry(){
      if(armed) return;
      armed = true;
      function go(){
        for(var r = 0; r < retryOn.length; r++)
          window.removeEventListener(retryOn[r], go, retryOpts);
        armed = false;
        if(heroVideo.paused) attemptPlay();
      }
      for(var r = 0; r < retryOn.length; r++)
        window.addEventListener(retryOn[r], go, retryOpts);
    }

    /* ---- The still frame, which is NOT the film -------------------------
       Autoplay is a request a phone is free to refuse. iOS Low Power Mode,
       Data Saver and several MDM profiles all decline muted inline video, and
       under Reduce Motion we never even ask. The poster is none of those
       things: it is a JPEG the owner uploaded as the phone hero, and it should
       be on screen in every one of those cases.

       It used to be hostage to the film. content.js parks the path on
       data-poster rather than poster — a real poster attribute downloads the
       instant it is set, even on an element with no src, and this is a portrait
       phone asset no desktop visit should ever pay for — and main.js promoted
       it only AFTER deciding a film was going to mount, onto an element
       style.css held at opacity:0 until something was genuinely playing.
       Refused autoplay therefore showed the DESKTOP photo slideshow on a phone,
       which is precisely the report that came back from the client's iPhone.

       So it now stands on its own: decode first, then reveal. Decoding first is
       not fussiness — .hero-video sits on an espresso ground, so revealing the
       element before the JPEG is ready would swap a live slideshow for a brown
       rectangle, which is worse than the thing being fixed. If the poster 404s
       or fails to decode, nothing is revealed at all and the slideshow keeps
       the hero exactly as it does today.

       There is a second, quieter win in here. iOS weighs whether an element is
       actually visible when it decides whether to grant autoplay, and this puts
       the video at opacity:1 BEFORE play() is ever called — it used to ask from
       behind opacity:0, which is the weakest position to ask from. */
    var stillSrc = '';

    function showStill(){
      var still = heroVideo.getAttribute('data-poster');
      if(!still || still === stillSrc) return;
      stillSrc = still;
      var probe = new Image();
      probe.onload = function(){
        if(stillSrc !== still) return;        // a rotation changed its mind mid-decode
        heroVideo.setAttribute('poster', still);
        if(heroEl) heroEl.classList.add('has-still');
        if(setSlideshow) setSlideshow(false);
      };
      /* Missing or broken: forget it, so a later mount() is free to try again,
         and leave the slideshow holding the hero in the meantime. */
      probe.onerror = function(){ if(stillSrc === still) stillSrc = ''; };
      probe.src = still;
    }

    function hideStill(){
      if(!stillSrc) return;
      stillSrc = '';
      if(heroEl) heroEl.classList.remove('has-still');
      /* Only hand the hero back to the slideshow if nothing else is holding
         it — a phone turned landscape keeps playing the film it already has. */
      if(setSlideshow && !(heroEl && heroEl.classList.contains('has-video')))
        setSlideshow(true);
    }

    function mount(){
      /* A viewport of zero width satisfies '(max-width: 760px)', so a page
         laid out before the browser has a real width — a prerender, a
         background tab, an in-app webview mid-open — would pick the phone
         cut, then swap to the desktop one the moment a width arrived and
         pay for the film twice. Measured, not theorised: without this the
         network log shows BOTH files downloaded on a desktop visit. Wait
         for a real width; the listener below fires as soon as there is one,
         and after that every change event is a genuine rotation or resize.

         This gate now guards the still frame as well as the film, which is
         why it moved above the reduced-motion return below: a zero-width
         prerender must not pull down a phone poster for what turns out to
         be a desktop. */
      if(!window.innerWidth) return;

      /* Portrait only, and independently of everything after it. The poster is
         an 810x1440 portrait crop: on a desktop hero it would be both the wrong
         shape and a download that surface has no use for, so desktop keeps the
         photo slideshow and still fetches nothing at all from /assets/video. */
      if(portrait.matches) showStill(); else hideStill();

      /* A full-bleed MOVING background is the exact thing this preference asks
         us not to do, so there is no film — but the still above has already
         gone up, and a photograph is not motion. Disown any film hard-coded
         into the markup on the way out, because the reduced-motion rule in
         style.css now has a .has-still door in it and an autoplaying <video>
         must not be able to walk through it. */
      if(reduceMotion.matches){
        heroVideo.removeAttribute('autoplay');
        if(!heroVideo.paused) heroVideo.pause();
        return;
      }

      var src = pickSource();
      if(!src) return;

      /* Same film as last time: never re-download it, but do give a stalled
         one another push. Separating "which file" from "is it running" is the
         whole point — the old single guard conflated them. */
      if(src === wanted){
        if(heroVideo.paused) attemptPlay();
        armRetry();
        return;
      }

      wanted = src;
      attempt++;
      heroVideo.setAttribute('src', src);
      heroVideo.load();
      attemptPlay();
      armRetry();
    }

    // Only reveal it once frames are actually on screen, never on the
    // optimistic assumption that play() worked.
    heroVideo.addEventListener('playing', function(){ live(true); });
    heroVideo.addEventListener('error',   function(){ live(false); });

    /* The film may finish buffering AFTER the autoplay attempt was refused.
       The moment there are real frames, ask once more; .paused keeps this a
       no-op whenever the film is already running. */
    heroVideo.addEventListener('loadeddata', function(){ if(heroVideo.paused) attemptPlay(); });
    heroVideo.addEventListener('canplay',    function(){ if(heroVideo.paused) attemptPlay(); });

    // Rotating the phone, or dragging a desktop window across 760px, re-picks.
    if(portrait.addEventListener) portrait.addEventListener('change', mount);
    else if(portrait.addListener) portrait.addListener(mount);

    /* And resize as well as the query, because the query only reports a
       CROSSING: a viewport going 0 → 400px stays "narrow" throughout, so the
       change event never fires and the width gate above would hold the film
       back for ever on exactly the phones it was written to serve. mount()
       returns immediately when the chosen source has not changed, so paying
       for this listener costs an attribute read. */
    window.addEventListener('resize', mount);

    // content.js fires this once the CMS paths are on the element.
    document.addEventListener('lhsc:video', mount);

    // …and run once now, in case the paths are hard-coded in the markup
    // and there is no content layer to wait for.
    mount();
  }

  /* ---------------------------------------------------------
     Scroll reveal
     --------------------------------------------------------- */
  var els = document.querySelectorAll('.reveal');
  if(reduceMotion.matches || !('IntersectionObserver' in window)){
    els.forEach(function(el){ el.classList.add('in'); });
  }else{
    /* Stagger: siblings that reveal together arrive as a cascade rather
       than one synchronised block. The delay is the element's index among
       its .reveal siblings, capped at 4 so a long grid never keeps the
       visitor waiting. A lone section heading has no siblings, so it gets
       0ms and still leads. */
    var stagger = function(el){
      var sibs = el.parentNode ? el.parentNode.children : [];
      var i = 0;
      for(var k = 0; k < sibs.length; k++){
        if(sibs[k] === el) break;
        if(sibs[k].classList && sibs[k].classList.contains('reveal')) i++;
      }
      return Math.min(i, 4) * 90;
    };
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.style.transitionDelay = stagger(entry.target) + 'ms';
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, {threshold:.14, rootMargin:'0px 0px -6% 0px'});
    els.forEach(function(el){ io.observe(el); });
  }

  /* ---------------------------------------------------------
     Accordions
     Progressive enhancement: the markup ships open and the
     panels only collapse once this runs, so a visitor without
     JS reads the full text instead of an empty page.
     --------------------------------------------------------- */
  document.querySelectorAll('.acc').forEach(function(acc){
    var single = acc.hasAttribute('data-single');
    acc.querySelectorAll('.acc-item').forEach(function(item, i){
      var head  = item.querySelector('.acc-head');
      var panel = item.querySelector('.acc-panel');
      if(!head || !panel) return;

      if(!panel.id) panel.id = 'accp-' + Math.random().toString(36).slice(2,8);
      head.setAttribute('aria-controls', panel.id);

      // First item stays open so the section never looks empty.
      var open = item.hasAttribute('data-open') || i === 0;
      set(open);

      head.addEventListener('click', function(){
        var next = head.getAttribute('aria-expanded') !== 'true';
        if(single && next){
          acc.querySelectorAll('.acc-item.open').forEach(function(other){
            if(other === item) return;
            other.classList.remove('open');
            var h = other.querySelector('.acc-head');
            if(h) h.setAttribute('aria-expanded','false');
          });
        }
        set(next);
      });

      function set(on){
        item.classList.toggle('open', on);
        head.setAttribute('aria-expanded', on ? 'true' : 'false');
      }
    });
  });

  /* ---------------------------------------------------------
     Read more
     The clamp itself is CSS and only applies under 760px, so
     the button is pointless on a desktop — it is hidden there
     rather than removed, keeping one DOM across breakpoints.
     --------------------------------------------------------- */
  document.querySelectorAll('.readmore').forEach(function(box){
    var body = box.querySelector('.readmore-body');
    if(!body) return;

    var btn = box.querySelector('.readmore-btn');
    if(!btn){
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'readmore-btn';
      box.appendChild(btn);
    }
    if(!body.id) body.id = 'rm-' + Math.random().toString(36).slice(2,8);
    btn.setAttribute('aria-controls', body.id);

    var more = box.getAttribute('data-more') || 'Read more';
    var less = box.getAttribute('data-less') || 'Read less';
    label(false);

    btn.addEventListener('click', function(){
      var on = !box.classList.contains('open');
      box.classList.toggle('open', on);
      label(on);
    });

    function label(on){
      btn.textContent = on ? less : more;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
  });

  /* ---------------------------------------------------------
     Sticky mobile CTA
     Held back until the hero has scrolled past — showing it
     over the hero would cover the very buttons it duplicates.
     Hidden again over the closing CTA band for the same reason.
     --------------------------------------------------------- */
  var cta = document.querySelector('.mobile-cta');
  if(cta){
    /* The data-* attributes hold a *selector*, not the element itself —
       they live on the bar and point at the sections that gate it. */
    var pick = function(attr, fallback){
      var sel = cta.getAttribute(attr);
      return (sel && document.querySelector(sel)) || document.querySelector(fallback);
    };
    var afterEl  = pick('data-cta-after',  '.hero');
    var beforeEl = pick('data-cta-before', '.cta-band');
    var shown = false;

    var syncCta = function(){
      var y = window.pageYOffset;
      /* rect-based, so a hero inside any offsetParent still measures right */
      var past  = afterEl ? afterEl.getBoundingClientRect().bottom < 120 : y > 400;
      var atEnd = false;
      if(beforeEl){
        var r = beforeEl.getBoundingClientRect();
        atEnd = r.top < window.innerHeight * 0.9;
      }
      var want = past && !atEnd;
      if(want !== shown){ shown = want; cta.classList.toggle('on', want); }
    };

    window.addEventListener('scroll', syncCta, {passive:true});
    window.addEventListener('resize', syncCta, {passive:true});
    syncCta();
  }
})();
