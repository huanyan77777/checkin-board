'use strict';
const $=id=>document.getElementById(id);
const palette=['晴空蓝','珊瑚粉','暖阳黄','薄荷绿','丁香紫','湖水青'];
const accents=['#5079ef','#ebad32','#a28adc','#39ac89','#f27d6f','#4fadca'];
let token='',state=null,stream=null,editing=null,pendingRows=null;
const cards=new Map(),dirty=new Set();
function node(tag,cls='',text){const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'';}
async function api(url,method='GET',body){
 const res=await fetch('/api/admin/'+url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!res.ok){const data=await res.json();throw Error(data.error||'操作失败');}return res;
}
async function perform(button,action){
 button.disabled=true;try{await action();}catch(e){message(e.message||'网络异常，请重试',true);}finally{button.disabled=false;}
}
function selectOptions(select,items){select.replaceChildren();items.forEach(([value,label])=>{const o=node('option','',label);o.value=value;select.append(o);});}
function render(s){
 state=s;$('count').textContent=s.checkins.length;$('done').textContent=s.departmentStats.filter(d=>d.complete).length+' / 6';
 const known=s.departmentStats.filter(d=>d.target!==null);
 $('expected').textContent=known.reduce((sum,d)=>sum+d.target,0)+(known.length<6?'（部分未设）':'');
 $('gate').textContent=s.open?'开放中':'已关闭';
 s.departmentStats.forEach((d,i)=>{
   if(!cards.has(d.id))buildCard(d,i);
   const c=cards.get(d.id);
   c.badge.textContent=d.complete?'已完成':'未完成';c.badge.className='badge'+(d.complete?' done':'');
   c.numbers.textContent=d.checked+' / '+(d.target===null?'待设置':d.target)+' 人';
   c.detail.textContent=(d.source==='manual'?'手动人数目标':'名单核对：'+d.matched+'/'+d.rosterCount+' 人')+' · '+({auto:'自动判定',complete:'手动标记完成',incomplete:'手动保持未完成'}[d.mode]);
   c.meter.style.width=(d.target>0?Math.min(100,100*(d.source==='roster'?d.matched:d.checked)/d.target):0)+'%';
   if(!dirty.has(d.id)){c.input.value=d.configuredTarget===null?'':d.configuredTarget;c.mode.value=d.mode;}
 });
 renderRecords();
}
function buildCard(d,i){
 const card=node('article','department');card.style.setProperty('--accent',accents[i]);
 const head=node('div','dept-top'),badge=node('span','badge');head.append(node('h3','',d.name),badge);
 const numbers=node('div','numbers'),detail=node('p','detail'),meter=node('i'),bar=node('div','meter');bar.append(meter);
 const label=node('label','','应到人数（留空按名单）'),stepper=node('div','stepper');
 const input=node('input');input.type='number';input.min='0';input.max='10000';input.step='1';input.placeholder='使用名单';input.setAttribute('aria-label',d.name+'应到人数');
 const minus=node('button','secondary','−'),plus=node('button','secondary','+');minus.setAttribute('aria-label',d.name+'应到人数减一');plus.setAttribute('aria-label',d.name+'应到人数加一');
 const mark=()=>dirty.add(d.id);input.addEventListener('input',mark);
 for(const [btn,n] of [[minus,-1],[plus,1]])btn.onclick=()=>{input.value=Math.max(0,Math.min(10000,Number(input.value||(state.departmentStats.find(x=>x.id===d.id)?.target)||0)+n));mark();};
 stepper.append(minus,input,plus);label.append(stepper);
 const modeLabel=node('label','','完成判定'),mode=node('select');mode.setAttribute('aria-label',d.name+'完成判定');
 selectOptions(mode,[['auto','自动判定'],['complete','手动标记已完成'],['incomplete','手动保持未完成']]);mode.onchange=mark;modeLabel.append(mode);
 const actions=node('div','actions'),reset=node('button','secondary','按名单人数'),save=node('button','','保存设置');
 reset.onclick=()=>{input.value='';mark();message(d.name+'已切换为名单人数，点击保存生效。');};
 save.onclick=()=>perform(save,async()=>{
   const target=input.value.trim()===''?null:Number(input.value);
   if(target!==null&&(!Number.isInteger(target)||target<0||target>10000))throw Error('应到人数须为0至10000的整数');
   const result=await (await api('departments/'+d.id,'PUT',{target,mode:mode.value})).json();
   dirty.delete(d.id);render(result);message(d.name+'设置已保存并同步大屏。');
 });
 actions.append(reset,save);card.append(head,numbers,detail,bar,label,modeLabel,actions);$('departments').append(card);
 cards.set(d.id,{badge,numbers,detail,meter,input,mode});
}
function renderRecords(){
 const query=$('search').value.trim().toLowerCase(),dep=$('filter').value;
 const rows=state.checkins.filter(x=>(!dep||x.department===dep)&&x.name.toLowerCase().includes(query));
 $('recordCount').textContent='显示 '+rows.length+' / '+state.checkins.length+' 条';
 $('empty').hidden=rows.length>0;const fragment=document.createDocumentFragment();
 for(const x of rows){
   const tr=node('tr');tr.append(node('td','',x.name),node('td','',state.departments.find(d=>d.id===x.department)?.name||x.department));
   const color=node('td'),swatch=node('span','swatch');swatch.style.background=x.color;color.append(swatch,document.createTextNode(palette[state.bubbleColors.indexOf(x.color)]||'默认'));
   tr.append(color,node('td','',new Date(x.createdAt).toLocaleString('zh-CN')));
   const td=node('td'),actions=node('div','row-actions'),edit=node('button','secondary','修改'),remove=node('button','danger','撤销');
   edit.setAttribute('aria-label','修改 '+x.name);remove.setAttribute('aria-label','撤销 '+x.name);
   edit.onclick=()=>openEditor(x);
   remove.onclick=()=>{if(confirm('确认撤销“'+x.name+'”的签到？该操作会同步大屏。'))perform(remove,async()=>{render(await (await api('checkins/'+x.id,'DELETE')).json());message('已撤销签到。');});};
   actions.append(edit,remove);td.append(actions);tr.append(td);fragment.append(tr);
 }
 $('records').replaceChildren(fragment);
}
function openEditor(x){
 editing=x.id;$('editName').value=x.name;$('editDepartment').value=x.department;$('editColor').value=x.color;
 $('editInfo').textContent='原签到时间：'+new Date(x.createdAt).toLocaleString('zh-CN');$('editError').textContent='';$('editor').showModal();
}
$('cancelEdit').onclick=()=>$('editor').close();
$('editForm').onsubmit=async e=>{
 e.preventDefault();$('saveEdit').disabled=true;
 try{const result=await (await api('checkins/'+editing,'PATCH',{name:$('editName').value,department:$('editDepartment').value,color:$('editColor').value})).json();render(result);$('editor').close();message('记录已修改，已同步部门进度和大屏。');}
 catch(e){$('editError').textContent=e.message;}
 finally{$('saveEdit').disabled=false;}
};
$('loginForm').onsubmit=e=>{e.preventDefault();perform(e.submitter,async()=>{
 token=$('token').value.trim();const result=await(await api('state')).json();
 cards.clear();dirty.clear();$('departments').replaceChildren();
 selectOptions($('filter'),[['','全部部门'],...result.departments.map(d=>[d.id,d.name])]);
 selectOptions($('editDepartment'),result.departments.map(d=>[d.id,d.name]));
 selectOptions($('editColor'),result.bubbleColors.map((c,i)=>[c,palette[i]]));
 render(result);$('workspace').hidden=false;$('logout').hidden=false;$('token').value='';
 if(stream)stream.close();stream=new EventSource('/api/events');
 stream.onopen=()=>$('connection').textContent='● 实时连接';
 stream.onerror=()=>$('connection').textContent='正在重连，未保存输入将保留';
 for(const type of ['snapshot','state','checkin'])stream.addEventListener(type,e=>render(JSON.parse(e.data)));
 message('控制台已连接。令牌仅保存在当前页面内存。');
 });};
$('logout').onclick=()=>{stream?.close();stream=null;token='';state=null;pendingRows=null;$('editor').close();$('workspace').hidden=true;$('logout').hidden=true;$('connection').textContent='已退出';$('importPreview').hidden=true;message('已退出控制台。');};
$('search').oninput=renderRecords;$('filter').onchange=renderRecords;
for(const action of ['open','close'])$(action).onclick=()=>perform($(action),async()=>{render(await(await api(action,'POST',{})).json());message(action==='open'?'签到已开放。':'签到已关闭；已签到数据保留。');});
$('refresh').onclick=()=>perform($('refresh'),async()=>{render(await(await api('state')).json());message('数据已刷新，未保存的部门设置保留。');});
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>perform($('export'),async()=>{download(await(await api('export.csv')).blob(),'checkins.csv');message('签到CSV已导出。');});
$('template').onclick=()=>download(new Blob(['\ufeffname,department,required\r\n示例姓名,学习部,1\r\n'],{type:'text/csv;charset=utf-8'}),'roster-template.csv');
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(value);value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';}
  else value+=c;
 }
 if(quoted)throw Error('CSV引号未闭合');row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
$('csv').onchange=()=>{pendingRows=null;$('importPreview').hidden=true;};
$('previewCsv').onclick=()=>perform($('previewCsv'),async()=>{
 pendingRows=null;$('importPreview').hidden=true;const file=$('csv').files[0];if(!file)throw Error('请选择CSV文件');if(file.size>1500000)throw Error('CSV文件过大，请控制在1.5MB以内');
 const rows=parseCSV(await file.text());if(!rows.length||rows[0].map(x=>x.trim()).join(',')!=='name,department,required')throw Error('表头必须为 name,department,required');
 const seen=new Set();pendingRows=rows.slice(1).map((r,i)=>{
  const name=(r[0]||'').trim(),raw=(r[1]||'').trim(),required=(r[2]||'').trim();
  const d=state.departments.find(d=>d.id===raw||d.name===raw);
  if(r.length!==3||!name||name.length>30||!d||!['0','1'].includes(required))throw Error('第'+(i+2)+'行无效');
  const key=JSON.stringify([name,d.id]);if(seen.has(key))throw Error('第'+(i+2)+'行姓名与部门重复');seen.add(key);
  return {name,department:d.id,required:required==='1'};
 });
 if(!pendingRows.length)throw Error('CSV没有有效数据，未修改现有名单');
 $('importSummary').textContent='共 '+pendingRows.length+' 人，其中应到 '+pendingRows.filter(x=>x.required).length+' 人。';
 $('previewRows').replaceChildren(...pendingRows.slice(0,20).map(r=>{const tr=node('tr');tr.append(node('td','',r.name),node('td','',state.departments.find(d=>d.id===r.department).name),node('td','',r.required?'是':'否'));return tr;}));
 $('importPreview').hidden=false;message('校验通过，请核对预览。');
});
$('importCsv').onclick=()=>perform($('importCsv'),async()=>{
 if(!pendingRows)throw Error('请先预览CSV');
 render(await(await api('roster','POST',{rows:pendingRows})).json());pendingRows=null;$('importPreview').hidden=true;message('应到名单已替换；签到记录、手动人数和完成设置均保留。');
});

