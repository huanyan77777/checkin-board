const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

const root = __dirname;
const publicDir = path.join(root, 'public');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'checkin.sqlite'));
const port = Number(process.env.PORT || 4318);
const adminToken = process.env.ADMIN_TOKEN || 'change-this-before-production';
const eventName = process.env.EVENT_NAME || '北京邮电大学学生会骨干志愿者大会';
const departments = [
  { id: 'learning', name: '学习部' }, { id: 'office', name: '办公室' },
  { id: 'arts', name: '文艺部' }, { id: 'sports', name: '体育部' },
  { id: 'publicity', name: '宣传部' }, { id: 'rights', name: '权益部' }
];
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS roster(id TEXT PRIMARY KEY,name TEXT NOT NULL,department TEXT NOT NULL,required INTEGER NOT NULL DEFAULT 1,UNIQUE(name,department));
CREATE TABLE IF NOT EXISTS checkins(id TEXT PRIMARY KEY,name TEXT NOT NULL,department TEXT NOT NULL,roster_id TEXT,created_at TEXT NOT NULL,ip_hash TEXT,UNIQUE(name,department),FOREIGN KEY(roster_id) REFERENCES roster(id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL);`);
if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get('open')) db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('open', process.env.CHECKIN_OPEN === 'true' ? '1' : '0');
const clients = new Set();
const stmts = {
  list: db.prepare('SELECT id,name,department,created_at AS createdAt FROM checkins ORDER BY created_at ASC'),
  add: db.prepare('INSERT INTO checkins(id,name,department,roster_id,created_at,ip_hash) VALUES(@id,@name,@department,@rosterId,@createdAt,@ipHash)'),
  dup: db.prepare('SELECT id,name,department,created_at AS createdAt FROM checkins WHERE name=? AND department=?'),
  del: db.prepare('DELETE FROM checkins WHERE id=?'), roster: db.prepare('SELECT id,name,department,required FROM roster ORDER BY department,name'),
  setting: db.prepare('SELECT value FROM settings WHERE key=?'), setSetting: db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
  audit: db.prepare('INSERT INTO audit(action,detail,created_at) VALUES(?,?,?)')
};
function openState() { return stmts.setting.get('open')?.value === '1'; }
function snapshot() { return { eventName, open: openState(), departments, checkins: stmts.list.all(), roster: stmts.roster.all(), updatedAt: new Date().toISOString() }; }
function json(res, status, value) { const b = JSON.stringify(value); res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(b); }
function readBody(req) { return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>2e6) req.destroy()});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)}) }
function auth(req) { return req.headers.authorization === `Bearer ${adminToken}` || req.headers['x-admin-token'] === adminToken; }
function validName(x) { return typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 30; }
function ipHash(req) { return crypto.createHash('sha256').update(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')).digest('hex').slice(0,16); }
function broadcast(event, data) { const p=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(p); }
function csvEscape(x) { const s=String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function staticFile(res, pathname) { let file = pathname === '/' ? '/join.html' : pathname; if(file==='/screen')file='/screen.html';if(file==='/admin')file='/admin.html';const safe=path.normalize(file).replace(/^([.][.][\\/])+/, '');const target=path.join(publicDir,safe);if(!target.startsWith(publicDir))return false;try{const data=fs.readFileSync(target);const ext=path.extname(target);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-cache'});res.end(data);return true}catch{return false}}
async function route(req,res){const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{ok:true,service:'checkin-board',database:'sqlite'});
  if(req.method==='GET'&&u.pathname==='/api/config')return json(res,200,snapshot());
  if(req.method==='GET'&&u.pathname==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform',connection:'keep-alive','x-accel-buffering':'no'});res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);clients.add(res);const t=setInterval(()=>res.write(': ping\n\n'),25000);req.on('close',()=>{clearInterval(t);clients.delete(res)});return}
  if(req.method==='POST'&&u.pathname==='/api/checkins'){if(!openState())return json(res,423,{error:'签到暂未开放'});let x;try{x=await readBody(req)}catch{return json(res,400,{error:'请求格式错误'})}const name=String(x.name||'').trim(),department=String(x.department||'').trim();if(!validName(name)||!departments.some(d=>d.id===department))return json(res,400,{error:'请填写有效姓名并选择部门'});const duplicate=stmts.dup.get(name,department);if(duplicate)return json(res,200,{ok:true,duplicate:true,checkin:duplicate});const roster=db.prepare('SELECT id FROM roster WHERE name=? AND department=?').get(name,department);const item={id:crypto.randomUUID(),name,department,rosterId:roster?.id||null,createdAt:new Date().toISOString(),ipHash:ipHash(req)};try{stmts.add.run(item);stmts.audit.run('checkin',JSON.stringify({name,department}),item.createdAt)}catch(e){if(String(e).includes('UNIQUE'))return json(res,200,{ok:true,duplicate:true});throw e}broadcast('checkin',snapshot());return json(res,201,{ok:true,checkin:item})}
  if(u.pathname.startsWith('/api/admin/')){if(!auth(req))return json(res,401,{error:'未授权'});if(req.method==='POST'&&(u.pathname==='/api/admin/open'||u.pathname==='/api/admin/close')){const open=u.pathname.endsWith('open');stmts.setSetting.run('open',open?'1':'0');stmts.audit.run(open?'open':'close','',new Date().toISOString());broadcast('state',snapshot());return json(res,200,snapshot())}if(req.method==='DELETE'&&u.pathname.startsWith('/api/admin/checkins/')){const id=u.pathname.split('/').pop();stmts.del.run(id);stmts.audit.run('delete',id,new Date().toISOString());broadcast('checkin',snapshot());return json(res,200,snapshot())}if(req.method==='GET'&&u.pathname==='/api/admin/export.csv'){const lines=['name,department,created_at'];for(const x of stmts.list.all())lines.push([x.name,departments.find(d=>d.id===x.department)?.name||x.department,x.createdAt].map(csvEscape).join(','));res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="checkins.csv"'});return res.end('\ufeff'+lines.join('\n'))}if(req.method==='POST'&&u.pathname==='/api/admin/roster'){let x;try{x=await readBody(req)}catch{return json(res,400,{error:'请求格式错误'})}const rows=Array.isArray(x.rows)?x.rows:[];const tx=db.transaction(()=>{db.prepare('DELETE FROM roster').run();const add=db.prepare('INSERT OR IGNORE INTO roster(id,name,department,required) VALUES(?,?,?,?)');for(const r of rows)if(validName(r.name)&&departments.some(d=>d.id===r.department))add.run(crypto.randomUUID(),r.name.trim(),r.department,r.required===false?0:1)});tx();return json(res,200,snapshot())}}
  if(req.method==='GET'&&!staticFile(res,u.pathname))return json(res,404,{error:'not found'});
  if(req.method!=='GET')return json(res,404,{error:'not found'});
}
http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);if(!res.headersSent)json(res,500,{error:'server error'})})).listen(port,'127.0.0.1',()=>console.log(`checkin-board listening on 127.0.0.1:${port}`));
