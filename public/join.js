'use strict';
const $=id=>document.getElementById(id);
const labels=['晴空蓝','珊瑚粉','暖阳黄','薄荷绿','丁香紫','湖水青'];
let color='#BBD5FF',open=false,busy=false;
function availability(value){open=value;$('submit').disabled=busy||!open;$('submit').textContent=busy?'提交中…':open?'确认签到 · 点亮一格':'签到暂未开放';}
async function init(){
 try{
  const r=await fetch('/api/config');if(!r.ok)throw Error();const s=await r.json();
  s.departments.forEach(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=d.name;$('department').append(o);});
  (s.bubbleColors||['#BBD5FF','#FFD0C8','#FFE39A','#ADE6CF','#D9C8FA','#B8E5ED']).forEach((c,i)=>{
    const l=document.createElement('label');l.className='color-choice';l.style.setProperty('--color',c);
    const input=document.createElement('input');input.type='radio';input.name='color';input.value=c;input.checked=i===0;
    input.addEventListener('change',()=>{color=c;$('preview').style.background=c;});
    l.append(input,document.createTextNode(labels[i]));$('colors').append(l);
  });
  availability(s.open);
  // Poll only the gate status; data remains authoritative on submission.
  setInterval(async()=>{try{const r=await fetch('/api/config');if(r.ok)availability((await r.json()).open);}catch{}},15000);
 }catch{$('msg').textContent='暂时无法连接服务，请刷新页面重试。';$('submit').textContent='连接失败';}
}
$('name').addEventListener('input',()=>{$('preview').textContent=$('name').value.trim()||'你的名字';});
$('form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!open)return;busy=true;availability(open);$('msg').className='';$('msg').textContent='正在确认签到…';
 try{
  const r=await fetch('/api/checkins',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('name').value,department:$('department').value,color}),signal:AbortSignal.timeout(15000)});
  const d=await r.json();if(!r.ok){if(r.status===423)open=false;throw Error(d.error);}
  $('msg').className='ok';$('msg').textContent=d.duplicate?'你已经签到过了，原来的姓名泡会保留。':'签到成功！你的名字已点亮大屏。';
 }catch(e){$('msg').className='err';$('msg').textContent=e.name==='TimeoutError'?'尚未确认结果，请重试，不会重复计数。':e.message||'网络异常，请重试';}
 finally{busy=false;availability(open);}
});
init();
