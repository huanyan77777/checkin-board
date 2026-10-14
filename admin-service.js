'use strict';
module.exports = function({db, departments, bubbleColors, json, readBody, auth, snapshot, broadcast}) {
  const setting=db.prepare('SELECT value FROM settings WHERE key=?');
  const save=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const audit=(action,detail)=>db.prepare('INSERT INTO audit(action,detail,created_at) VALUES(?,?,?)').run(action,JSON.stringify(detail),new Date().toISOString());
  function stats(checkins,roster){
    return departments.map(d=>{
      const cfg=JSON.parse(setting.get('department:'+d.id)?.value||'{"target":null,"mode":"auto"}');
      const entries=checkins.filter(x=>x.department===d.id);
      const required=roster.filter(x=>x.department===d.id&&x.required);
      const matched=required.filter(x=>entries.some(e=>e.name===x.name)).length;
      const target=cfg.target===null?(required.length||null):cfg.target;
      const current=cfg.target===null?matched:entries.length;
      const autoComplete=target!==null&&target>0&&current>=target;
      return {...d,target,configuredTarget:cfg.target,mode:cfg.mode,checked:entries.length,rosterCount:required.length,matched,
        source:cfg.target===null?'roster':'manual',complete:cfg.mode==='complete'||(cfg.mode==='auto'&&autoComplete)};
    });
  }
  async function handle(req,res,u){
    if(!u.pathname.startsWith('/api/admin/'))return false;
    if(!auth(req)){json(res,401,{error:'管理员令牌不正确'});return true;}
    const reply=()=>{const s=snapshot();broadcast('state',s);json(res,200,s);};
    if(req.method==='GET'&&u.pathname==='/api/admin/state'){json(res,200,snapshot());return true;}
    if(req.method==='PUT'&&u.pathname.startsWith('/api/admin/departments/')){
      const id=u.pathname.split('/').pop();if(!departments.some(d=>d.id===id)){json(res,404,{error:'部门不存在'});return true;}
      let x;try{x=await readBody(req);}catch{json(res,400,{error:'请求格式错误'});return true;}
      if(!(x.target===null||(Number.isInteger(x.target)&&x.target>=0&&x.target<=10000))||!['auto','complete','incomplete'].includes(x.mode)){
        json(res,400,{error:'应到人数须为0至10000的整数或留空；请选择有效完成模式'});return true;
      }
      db.transaction(()=>{save.run('department:'+id,JSON.stringify({target:x.target,mode:x.mode}));audit('department.update',{id,...x});})();
      reply();return true;
    }
    if(req.method==='PATCH'&&u.pathname.startsWith('/api/admin/checkins/')){
      const id=u.pathname.split('/').pop(),before=db.prepare('SELECT * FROM checkins WHERE id=?').get(id);
      if(!before){json(res,404,{error:'记录不存在，可能已被撤销'});return true;}
      let x;try{x=await readBody(req);}catch{json(res,400,{error:'请求格式错误'});return true;}
      if(typeof x.name!=='string'||!x.name.trim()||x.name.trim().length>30||!departments.some(d=>d.id===x.department)||!bubbleColors.includes(x.color)){
        json(res,400,{error:'请填写1至30字姓名并选择有效部门、颜色'});return true;
      }
      x.name=x.name.trim();
      const conflict=db.prepare('SELECT id FROM checkins WHERE name=? AND department=? AND id<>?').get(x.name,x.department,id);
      if(conflict){json(res,409,{error:'该部门已有同名签到记录，不能覆盖或合并'});return true;}
      const member=db.prepare('SELECT id FROM roster WHERE name=? AND department=?').get(x.name,x.department);
      db.transaction(()=>{
        db.prepare('UPDATE checkins SET name=?,department=?,color=?,roster_id=? WHERE id=?').run(x.name,x.department,x.color,member?.id||null,id);
        audit('checkin.edit',{id,before:{name:before.name,department:before.department,color:before.color},after:x});
      })();
      reply();return true;
    }
    if(req.method==='POST'&&u.pathname==='/api/admin/roster'){
      let x;try{x=await readBody(req);}catch{json(res,400,{error:'请求格式错误'});return true;}
      if(!Array.isArray(x.rows)||!x.rows.length||x.rows.length>10000){json(res,400,{error:'名单需包含1至10000条记录；空文件不会清除现有名单'});return true;}
      const keys=new Set(),rows=[];
      for(let i=0;i<x.rows.length;i++){
        const r=x.rows[i];
        if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.trim().length>30||!departments.some(d=>d.id===r.department)||typeof r.required!=='boolean'){
          json(res,400,{error:'第'+(i+2)+'行无效，请检查姓名、部门和required'});return true;
        }
        const key=JSON.stringify([r.name.trim(),r.department]);
        if(keys.has(key)){json(res,400,{error:'名单有重复姓名+部门，第'+(i+2)+'行；未导入任何记录'});return true;}
        keys.add(key);rows.push({...r,name:r.name.trim()});
      }
      db.transaction(()=>{
        db.prepare('UPDATE checkins SET roster_id=NULL').run();
        db.prepare('DELETE FROM roster').run();
        const add=db.prepare('INSERT INTO roster(id,name,department,required) VALUES(?,?,?,?)');
        for(const r of rows)add.run(require('node:crypto').randomUUID(),r.name,r.department,r.required?1:0);
        db.exec('UPDATE checkins SET roster_id=(SELECT id FROM roster WHERE roster.name=checkins.name AND roster.department=checkins.department)');
        audit('roster.replace',{count:rows.length});
      })();
      reply();return true;
    }
    return false;
  }
  return {stats,handle};
};
