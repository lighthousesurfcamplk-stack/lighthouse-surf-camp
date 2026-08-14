/* Light House Surf Camp — shared interactions */
(function(){
  // Enable JS-only effects (content stays visible if this script ever fails to run)
  document.documentElement.classList.add('js');
  // Sticky nav
  const nav=document.querySelector('.nav');
  if(nav){
    const onScroll=()=>nav.classList.toggle('scrolled',window.scrollY>40);
    onScroll();window.addEventListener('scroll',onScroll,{passive:true});
  }
  // Mobile menu
  const burger=document.querySelector('.burger');
  const links=document.querySelector('.nav-links');
  if(burger&&links){
    burger.addEventListener('click',()=>links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>links.classList.remove('open')));
  }
  // Hero slideshow
  const show=document.querySelector('.hero-media.slideshow');
  if(show){
    const slides=[...show.querySelectorAll('.slide')];
    const dotsWrap=document.querySelector('.hero-dots');
    let idx=0, timer;
    if(dotsWrap){
      slides.forEach((_,i)=>{
        const b=document.createElement('button');
        b.setAttribute('aria-label','Slide '+(i+1));
        if(i===0)b.classList.add('on');
        b.addEventListener('click',()=>{go(i);reset();});
        dotsWrap.appendChild(b);
      });
    }
    const dots=dotsWrap?[...dotsWrap.children]:[];
    function go(n){
      slides[idx].classList.remove('active'); if(dots[idx])dots[idx].classList.remove('on');
      idx=(n+slides.length)%slides.length;
      slides[idx].classList.add('active'); if(dots[idx])dots[idx].classList.add('on');
    }
    function reset(){clearInterval(timer);timer=setInterval(()=>go(idx+1),5500);}
    if(slides.length>1)reset();
  }

  // Scroll reveal
  const els=document.querySelectorAll('.reveal');
  if('IntersectionObserver'in window){
    const io=new IntersectionObserver((es)=>{
      es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:.14});
    els.forEach(el=>io.observe(el));
  }else{els.forEach(el=>el.classList.add('in'));}
})();
