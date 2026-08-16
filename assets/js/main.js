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
      a.textContent = 'Book Now';
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
        var first = links.querySelector('a');
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

      // Keep focus inside the drawer; the burger doubles as the close button
      var focusable = [burger].concat(Array.prototype.slice.call(links.querySelectorAll('a')));
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
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, {threshold:.14, rootMargin:'0px 0px -6% 0px'});
    els.forEach(function(el){ io.observe(el); });
  }
})();
