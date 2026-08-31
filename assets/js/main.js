/* Light House Surf Camp — shared interactions */
(function(){
  'use strict';

  // Enable JS-only effects (content stays visible if this script ever fails to run)
  var docEl = document.documentElement;
  docEl.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

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
  var show = document.querySelector('.hero-media.slideshow');
  if(show){
    var slides = Array.prototype.slice.call(show.querySelectorAll('.slide'));
    var dotsWrap = document.querySelector('.hero-dots');
    var idx = 0, timer = null;
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
        if(document.hidden) clearInterval(timer); else reset();
      });

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
