// Mobile content scrolls inside the shell; desktop pages use the window.
export function pageScroller(){
  return document.body.classList.contains('phone')?document.querySelector('.shell')||window:window;
}
export function pageScrollY(){const scroller=pageScroller();return scroller===window?window.scrollY:scroller.scrollTop;}
export function scrollPageTo(options){pageScroller().scrollTo(options);}
// Keep keyboard-sized dialogs and safe-area spacing in sync without moving page scroll.
export function viewportMetrics({height,offsetTop=0,layoutHeight,editing=false}) {
  return {height:Math.max(1,Math.round(height)),top:Math.max(0,Math.round(offsetTop)),keyboard:editing&&layoutHeight-height>120};
}
export function installMobileViewport(){
  const root=document.documentElement,bar=document.getElementById('bnav'),header=document.getElementById('appbar');
  let frame=0;
  function update(){
    frame=0;
    const v=window.visualViewport,active=document.activeElement;
    const editing=!!active?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),[contenteditable=true]');
    const m=viewportMetrics({height:v?.height||window.innerHeight,offsetTop:v?.offsetTop||0,layoutHeight:window.innerHeight,editing});
    root.style.setProperty('--app-visible-height',`${m.height}px`);
    root.style.setProperty('--app-viewport-top',`${m.top}px`);
    document.body.classList.toggle('keyboard-open',m.keyboard);
    if(bar?.getBoundingClientRect().height)root.style.setProperty('--bottom-bar-height',`${Math.ceil(bar.getBoundingClientRect().height)}px`);
    if(header)root.style.setProperty('--app-header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);
  window.addEventListener('resize',schedule);
  window.addEventListener('orientationchange',schedule);
  window.addEventListener('pageshow',schedule);
  document.addEventListener('focusin',schedule);
  document.addEventListener('focusout',schedule);
  if(typeof ResizeObserver!=='undefined'){
    const observer=new ResizeObserver(schedule);if(bar)observer.observe(bar,{box:'border-box'});if(header)observer.observe(header,{box:'border-box'});
  }
  update();
}
