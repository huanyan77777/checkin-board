'use strict';
const $ = id => document.getElementById(id);
const colors = ['#BBD5FF','#FFD0C8','#FFE39A','#ADE6CF','#D9C8FA','#B8E5ED'];
const washes = ['#edf2ff','#fff5d9','#f3eeff','#e9f8f0','#fff0e9','#eaf6fa'];
const accents = ['#5079ef','#ebad32','#a28adc','#39ac89','#f27d6f','#4fadca'];
let state, seen = null, page = 0, timer, stream;
const pageSize = 24;
function fit() {
  const scale = Math.min(innerWidth/1920, innerHeight/1080);
  $('stage').style.transform = 'translate(-50%, -50%) scale('+scale+')';
}
function element(tag, cls, text) {
  const e = document.createElement(tag); e.className = cls;
  if(text !== undefined) e.textContent = text; return e;
}
function render(s, animate = false) {
  state = s; $('total').textContent = s.checkins.length;
  $('eventState').textContent = s.open ? '签到进行中' : '签到暂未开放';
  const fragment = document.createDocumentFragment();
  s.departments.forEach((d, i) => {
    const names = s.checkins.filter(x => x.department === d.id);
    const roster = (s.roster||[]).filter(x => x.department === d.id && x.required);
    const matched = roster.filter(r => names.some(n => n.name === r.name)).length;
    const status=(s.departmentStats||[]).find(x=>x.id===d.id);
    const complete=status?status.complete:roster.length>0&&matched===roster.length;
    const target=status?status.target:(roster.length||null);
    const card = element('section', 'department'+(complete?' complete':''));
    card.dataset.id=d.id;card.style.setProperty('--wash',washes[i]);card.style.setProperty('--accent',accents[i]);
    const header=element('header','dept-header');
    header.append(element('h3','',d.name));
    const icon=element('img','icon');icon.src='/assets/'+d.id+'.png';icon.alt='';header.append(icon);
    const progress=element('div','progress');
    progress.append(element('strong','',names.length+' 人'),element('small','',target!==null ? '应到 '+target+' 人':''));
    header.append(progress);card.append(header);
    // Unknown roster: 24 display cells are placeholders, never an attendance target.
    const slots = Math.max(names.length, target===null?pageSize:target,1);
    const pages = Math.max(1,Math.ceil(slots/pageSize));
    const current = page % pages;
    const cells=element('div','bubbles');
    const visibleSlots=Math.min(pageSize,slots-current*pageSize);
    for(let n=0;n<pageSize;n++){
      const item=names[current*pageSize+n];
      const fresh=animate && seen && item && !seen.has(item.id);
      const cell=element('div','cell'+(item?' lit':' empty')+(fresh?' arrive':'')+(item&&item.name.length>5?' long':''));
      if(n>=visibleSlots)cell.style.visibility='hidden';
      if(item){cell.style.setProperty('--bubble',colors.includes(item.color)?item.color:colors[0]);cell.append(element('span','',item.name));cell.title=item.name;}
      else cell.setAttribute('aria-label','待点亮区域');
      cells.append(cell);
    }
    card.append(cells);
    const foot=element('div','card-footer');
    foot.append(element('span','',complete?'签到已完成':''),
      element('span','',pages>1?(current+1)+' / '+pages:''));
    card.append(foot);fragment.append(card);
  });
  $('grid').replaceChildren(fragment);
  // Fit uncommon long names inside their cell; do not silently clip them.
  document.querySelectorAll('.cell.lit').forEach(cell => {
    const label=cell.querySelector('span');
    let size=cell.classList.contains('long')?15:20;
    while(size>8 && (label.scrollHeight>cell.clientHeight-4 || label.scrollWidth>cell.clientWidth)){
      label.style.fontSize=(--size)+'px';
    }
  });
  seen=new Set(s.checkins.map(x=>x.id));
}
async function fullscreen(){
  try { if(document.fullscreenElement) await document.exitFullscreen();else await $('screenShell').requestFullscreen(); }
  catch { $('connection').textContent='此浏览器不支持网页全屏，请使用 F11'; }
}
function hide(){document.querySelector('.controls').classList.toggle('hidden');}
$('fullBtn').addEventListener('click',fullscreen);$('hideBtn').addEventListener('click',hide);
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='h')hide();});
document.addEventListener('fullscreenchange',()=>{$('fullBtn').textContent=document.fullscreenElement?'退出全屏 · F':'全屏播放 · F';fit();});
addEventListener('resize',fit);fit();
function connect(){
  stream = new EventSource('/api/events');
  stream.onopen=()=>{$('connection').textContent='● 实时连接';};
  stream.onerror=()=>{$('connection').textContent='连接中断，保留已确认姓名 · 正在重连';};
  ['snapshot','checkin','state'].forEach(type=>stream.addEventListener(type,e=>{
    try{render(JSON.parse(e.data),type==='checkin');}catch{$('connection').textContent='数据读取失败，正在恢复';}
  }));
}
async function start(){
  try{
    const r=await fetch('/api/config');if(!r.ok)throw Error('load');render(await r.json());connect();
    timer=setInterval(()=>{page++;if(state)render(state);},8000);
  }catch{$('connection').textContent='服务暂不可用，3秒后重试';setTimeout(start,3000);}
}
start();

