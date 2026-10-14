// Isolated visual test instance. Never writes to the user's normal data directory.
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const Database=require('better-sqlite3');
const data=mkdtempSync(path.join(tmpdir(),'checkin-layout-'));
process.env.PORT='4329';process.env.DATA_DIR=data;
process.env.ADMIN_TOKEN='isolated-layout-preview';process.env.CHECKIN_OPEN='true';
require('../server');
const db=new Database(path.join(data,'checkin.sqlite'));
const ids=['learning','office','arts','sports','publicity','rights'];
const colors=['#BBD5FF','#FFD0C8','#FFE39A','#ADE6CF','#D9C8FA','#B8E5ED'];
const insert=db.prepare('INSERT INTO checkins(id,name,department,created_at,color) VALUES(?,?,?,?,?)');
for(let d=0;d<6;d++)for(let n=0;n<30;n++){
  const name=n===0?'用于检查长姓名排版的演示名字'.repeat(2).slice(0,30):'演示'+String(n+1).padStart(2,'0');
  insert.run(d+'-'+n,name,ids[d],new Date().toISOString(),colors[n%6]);
}
db.close();
