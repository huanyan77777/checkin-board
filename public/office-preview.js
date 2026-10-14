'use strict';
const $=id=>document.getElementById(id);
let svg=null,loopTimer=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function syncButton(){ $('pause').textContent=svg?.animationsPaused()?'继续':'暂停'; }
function play(){if(!svg)return;clearTimeout(loopTimer);loopTimer=null;svg.setCurrentTime(0);svg.unpauseAnimations();syncButton();}
$('animation').addEventListener('load',()=>{
 svg=$('animation').contentDocument?.documentElement;
 if(!svg?.setCurrentTime){$('notice').textContent='浏览器不支持时间轴控制，请使用 Chrome 或 Edge 查看。';svg=null;return;}
 if(reduced){$('loop').checked=false;svg.setCurrentTime(6.2);svg.pauseAnimations();}
 syncButton();
});
$('replay').onclick=play;
$('pause').onclick=()=>{if(!svg)return;clearTimeout(loopTimer);loopTimer=null;if(svg.animationsPaused())svg.unpauseAnimations();else svg.pauseAnimations();syncButton();};
$('seek').oninput=()=>{if(!svg)return;clearTimeout(loopTimer);loopTimer=null;svg.pauseAnimations();svg.setCurrentTime(Number($('seek').value));syncButton();};
$('loop').onchange=()=>{if(!$('loop').checked){clearTimeout(loopTimer);loopTimer=null;}else play();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch{$('notice').textContent='此浏览器无法进入全屏，可使用浏览器 F11。';}};
setInterval(()=>{
 if(!svg)return;
 const t=Math.min(6.2,svg.getCurrentTime());$('seek').value=t;$('time').textContent=t.toFixed(1)+' / 6.2 s';
 if(t>=6.2&&!svg.animationsPaused()){svg.pauseAnimations();syncButton();if($('loop').checked&&!loopTimer)loopTimer=setTimeout(play,1600);}
},70);
