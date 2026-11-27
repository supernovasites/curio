import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker,{hashPassword} from '../server/worker.mjs';
function adapter(sqlite){return {prepare(sql){const statement=sqlite.prepare(sql);let args=[];const query={bind(...values){args=values;return query;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return {meta:statement.run(...args)};}};return query;},async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};}
test('reservation map is admin-only, includes approved overlapping stays and keeps pending names private',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,27,15)});const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of ['0001_campanhas','0003_contact_details','0004_reserva_realizada','0006_reservations','0007_customer_directory','0008_rooms'])sqlite.exec(await readFile('migrations/'+file+'.sql','utf8'));
 const password=await hashPassword('test-password');for(const role of ['admin','operador'])sqlite.prepare('INSERT INTO users(id,username,name,password_hash,role) VALUES(?,?,?,?,?)').run(role,role,role,password,role);
 const fixtures=[['approved','Aprovado de teste','2026-11-27','approved','arvore'],['confirmed','Confirmado de teste','2026-11-27','confirmed','sede-3'],['pending','Nome pendente privado','2026-11-27','pending','sede-4'],['rejected','Nome recusado privado','2026-11-27','rejected','anexo-3'],['cross','Reserva de outubro','2026-10-30','approved',null],['future','Reserva dezembro','2026-12-04','approved','arvore']];
 for(const [id,name,day,status,room] of fixtures){sqlite.prepare('INSERT INTO contacts(id,source_key,name,phone) VALUES(?,?,?,?)').run(id,id,name,'5591999991234');sqlite.prepare('INSERT OR IGNORE INTO reservation_dates(day,open) VALUES(?,1)').run(day);sqlite.prepare('INSERT INTO reservations(id,day,contact_id,status,room_id) VALUES(?,?,?,?,?)').run(id,day,id,status,room);}
 const env={DB:adapter(sqlite),ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}};
 const request=(path,method='GET',data,cookie)=>worker.fetch(new Request('https://curio.test'+path,{method,headers:{Origin:'https://curio.test','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
 const login=async username=>(await request('/api/campanhas/login','POST',{username,password:'test-password'})).headers.getSetCookie()[0].split(';')[0];
 const admin=await login('admin'),operator=await login('operador'),endpoint='/api/campanhas/reservations/map?month=2026-11';
 assert.equal((await request(endpoint)).status,401);assert.equal((await request(endpoint,'GET',null,operator)).status,403);
 assert.equal((await request('/api/campanhas/reservations/map?month=2026-13','GET',null,admin)).status,400);
 const response=await request(endpoint,'GET',null,admin);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const map=await response.json();
 assert.equal(map.month,'2026-11');assert.equal(map.today,'2026-11-27');assert.equal(map.rooms.length,7);
 assert.deepEqual(map.reservations.map(row=>row.id),['cross','approved','confirmed']);
 assert.ok(map.holds.some(row=>row.room_id==='sede-4'&&row.count===1));assert.ok(map.dates.some(row=>row.day==='2026-10-30'));
 const serialized=JSON.stringify(map);assert.ok(!serialized.includes('Nome pendente privado'));assert.ok(!serialized.includes('Nome recusado privado'));assert.ok(!serialized.includes('5591999991234'));assert.ok(!serialized.includes('payment'));
 assert.equal((await request('/reservarquarto/mapa/')).status,303);
 const me=await request('/api/campanhas/me','GET',null,admin),pageCookie=me.headers.getSetCookie().find(cookie=>cookie.startsWith('curio_booking_admin=')).split(';')[0];assert.equal((await request('/reservarquarto/mapa/','GET',null,pageCookie)).status,200);
 const legacy=await request('/reservarquarto/reservados/');assert.equal(legacy.status,308);assert.match(legacy.headers.get('Location'),/\/reservarquarto\/mapa\/$/);
 const december=await (await request('/api/campanhas/reservations/map?month=2026-12','GET',null,admin)).json();assert.deepEqual(december.reservations.map(row=>row.id),['future']);
});
