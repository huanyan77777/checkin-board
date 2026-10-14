const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('colors, SSE, department controls, record editing, roster replacement and persistence', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkin-colors-'));
  const port=4329, token='isolated-local-test';
  const start=()=>spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DATA_DIR:dir,ADMIN_TOKEN:token,CHECKIN_OPEN:'true'},stdio:['ignore','pipe','pipe']});
  let child=start();
  async function ready(p){
    await new Promise((resolve,reject)=>{
      p.stdout.on('data',d=>{if(String(d).includes('listening'))resolve();});
      p.stderr.on('data',d=>reject(Error(String(d))));
      p.on('exit',code=>reject(Error('early exit '+code)));
    });
  }
  const request=(url,body)=>fetch('http://127.0.0.1:'+port+url,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try {
    await ready(child);
    const s=await (await request('/api/config')).json();
    assert.equal(s.bubbleColors.length,6);
    const controller=new AbortController();
    const events=await fetch('http://127.0.0.1:'+port+'/api/events',{signal:controller.signal});
    const reader=events.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value),/event: snapshot/);
    for(let i=0;i<6;i++){
      const r=await request('/api/checkins',{name:'颜色测试'+i,department:s.departments[i].id,color:s.bubbleColors[i]});
      assert.equal(r.status,201);assert.equal((await r.json()).checkin.color,s.bubbleColors[i]);
    }
    assert.match(new TextDecoder().decode((await reader.read()).value),/event: checkin/);
    controller.abort();
    const dup=await (await request('/api/checkins',{name:'颜色测试0',department:'learning',color:s.bubbleColors[1]})).json();
    assert.equal(dup.duplicate,true);assert.equal(dup.checkin.color,s.bubbleColors[0]);
    assert.equal((await request('/api/checkins',{name:'无效颜色',department:'learning',color:'red'})).status,400);
    assert.equal((await (await request('/api/config')).json()).checkins.length,6);
    await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
    child=start();await ready(child);
    const restored=await (await request('/api/config')).json();
    assert.equal(restored.checkins.length,6);
    assert.deepEqual(restored.checkins.map(x=>x.color).sort(),s.bubbleColors.slice().sort());
    const admin=async(route,method='GET',body)=>fetch('http://127.0.0.1:'+port+'/api/admin/'+route,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    assert.equal((await request('/api/admin/state')).status,401);
    assert.equal((await admin('departments/learning','PUT',{target:-1,mode:'auto'})).status,400);
    let a=await(await admin('departments/learning','PUT',{target:1,mode:'auto'})).json();
    assert.equal(a.departmentStats[0].complete,true);
    a=await(await admin('departments/learning','PUT',{target:1,mode:'incomplete'})).json();
    assert.equal(a.departmentStats[0].complete,false);
    a=await(await admin('departments/learning','PUT',{target:99,mode:'complete'})).json();
    assert.equal(a.departmentStats[0].complete,true);
    assert.equal(a.checkins.length,6);
    a=await(await admin('departments/learning','PUT',{target:0,mode:'auto'})).json();
    assert.equal(a.departmentStats[0].complete,false);
    const first=a.checkins.find(x=>x.department==='learning');
    assert.equal((await admin('checkins/'+first.id,'PATCH',{name:'颜色测试1',department:'office',color:s.bubbleColors[1]})).status,409);
    a=await(await admin('checkins/'+first.id,'PATCH',{name:'编辑测试',department:'office',color:s.bubbleColors[2]})).json();
    const edited=a.checkins.find(x=>x.id===first.id);
    assert.equal(edited.name,'编辑测试');assert.equal(edited.createdAt,first.createdAt);
    assert.equal(a.departmentStats[0].checked,0);assert.equal(a.departmentStats[1].checked,2);
    assert.equal((await admin('checkins/missing','PATCH',{name:'编辑测试',department:'office',color:s.bubbleColors[2]})).status,404);
    const rows=[{name:'编辑测试',department:'office',required:true}];
    for(let n=0;n<2;n++){
      const imported=await admin('roster','POST',{rows});assert.equal(imported.status,200);
      const result=await imported.json();assert.equal(result.checkins.length,6);
      assert.equal(result.departmentStats[1].matched,1);assert.equal(result.departmentStats[1].complete,true);
    }
    assert.equal((await admin('roster','POST',{rows:[]})).status,400);
    assert.equal((await admin('roster','POST',{rows:[...rows,...rows]})).status,400);
    a=await(await admin('departments/office','PUT',{target:3,mode:'auto'})).json();
    assert.equal(a.departmentStats[1].complete,false);
    a=await(await admin('departments/office','PUT',{target:null,mode:'auto'})).json();
    assert.equal(a.departmentStats[1].complete,true);assert.equal(a.departmentStats[1].target,1);
    await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
    child=start();await ready(child);
    a=await(await request('/api/config')).json();
    assert.equal(a.departmentStats[0].configuredTarget,0);
    assert.equal(a.departmentStats[1].source,'roster');
    assert.equal(a.checkins.find(x=>x.id===first.id).name,'编辑测试');
  } finally { child.kill(); }
});
