const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('color migration, validation, deduplication and SSE', async () => {
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
  } finally { child.kill(); }
});
