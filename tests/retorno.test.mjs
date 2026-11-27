import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker,{hashPassword} from '../server/worker.mjs';

function adapter(sqlite){return {prepare(sql){const stmt=sqlite.prepare(sql);let args=[];const query={bind(...values){args=values;return query;},async first(){return stmt.get(...args)||null;},async all(){return {results:stmt.all(...args)};},async run(){return {meta:stmt.run(...args)};}};return query;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};}

test('availability requests validate, persist, retry safely and are private to authenticated staff',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,27,15)});
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of ['0001_campanhas','0002_homepage_metrics','0011_availability_leads','0013_return_lead_stages'])sqlite.exec(await readFile('migrations/'+file+'.sql','utf8'));
 sqlite.prepare('INSERT INTO users(id,username,name,password_hash,role) VALUES(?,?,?,?,?)').run('operator','equipe','Equipe',await hashPassword('test-password'),'operador');
 const env={DB:adapter(sqlite),ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}};
 const call=(path,method='GET',data,cookie,origin='https://curio.test')=>worker.fetch(new Request('https://curio.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
 const payload={request_key:crypto.randomUUID(),name:'Maria Teste',phone:'(91) 99999-1234',city:'Belém'};
 assert.equal((await call('/api/disponibilidade','GET')).status,405);
 assert.equal((await call('/api/disponibilidade','POST',payload,null,'https://evil.test')).status,403);
 for(const fields of [{name:''},{phone:'123'},{city:''},{request_key:'bad'}])assert.equal((await call('/api/disponibilidade','POST',{...payload,...fields})).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM homepage_metrics').get().total,0);
 const saved=await call('/api/disponibilidade','POST',payload);assert.equal(saved.status,201);
 assert.deepEqual(await saved.json(),{ok:true,status:'aguardando_contato'});
 assert.equal(sqlite.prepare("SELECT count FROM homepage_metrics WHERE day='2026-11-27' AND kind='whatsapp'").get().count,1);
 assert.equal((await call('/api/disponibilidade','POST',payload)).status,201);
 assert.equal(sqlite.prepare("SELECT count FROM homepage_metrics WHERE kind='whatsapp'").get().count,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM availability_leads').get().total,1);
 assert.equal((await call('/api/disponibilidade','POST',{...payload,city:'Outra'})).status,409);
 assert.equal((await call('/api/campanhas/return-leads')).status,401);
 assert.equal((await call('/api/campanhas/return-count')).status,401);
 const guarded=await call('/retorno/');assert.equal(guarded.status,303);assert.match(guarded.headers.get('Location'),/continuar=retorno/);
 assert.equal((await call('/retorno/app.js')).status,303);
 const login=await call('/api/campanhas/login','POST',{username:'equipe',password:'test-password'}),cookie=login.headers.get('Set-Cookie').split(';')[0];
 const me=await call('/api/campanhas/me','GET',null,cookie),returnCookie=me.headers.getSetCookie().find(value=>value.startsWith('curio_return='));
 assert.match(returnCookie,/Path=\/retorno; HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await call('/retorno/','GET',null,returnCookie.split(';')[0])).status,200);
 const list=await (await call('/api/campanhas/return-leads','GET',null,cookie)).json();assert.equal(list.total,1);assert.equal(list.rows[0].city,'Belém');assert.equal(list.rows[0].status,'novo');assert.equal(list.rows[0].phone,'5591999991234');assert.ok(!('stay_date' in list.rows[0]));
 assert.deepEqual(await (await call('/api/campanhas/return-count','GET',null,cookie)).json(),{total:1});
 const id=list.rows[0].id;
 const dispatch=(input,session=cookie,origin='https://curio.test')=>worker.fetch(new Request('https://curio.test/api/campanhas/return-dispatch',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:session},body:new URLSearchParams(input)}),env);
 assert.equal((await dispatch({id,message:'Olá'},'',undefined)).status,401);
 assert.equal((await dispatch({id,message:'Olá'},cookie,'https://evil.test')).status,403);
 assert.equal((await dispatch({id,message:''})).status,400);
 const opened=await dispatch({id,message:'Olá, {Nome}! Vamos consultar?'});assert.equal(opened.status,303);
 const whatsapp=new URL(opened.headers.get('Location'));assert.equal(whatsapp.pathname,'/5591999991234');assert.equal(whatsapp.searchParams.get('text'),'Olá, Maria! Vamos consultar?');
 assert.equal((await (await call('/api/campanhas/return-leads','GET',null,cookie)).json()).total,0);
 assert.equal((await (await call('/api/campanhas/return-leads?status=pendentes','GET',null,cookie)).json()).total,1);
 assert.deepEqual(await (await call('/api/campanhas/return-count','GET',null,cookie)).json(),{total:0});
 const pending=(await (await call('/api/campanhas/return-leads?status=pendentes','GET',null,cookie)).json()).rows[0];
 assert.ok(pending.created_at);assert.ok(pending.last_message_at);assert.equal(pending.message_template,'Mensagem de disponibilidade padrão');
 const revisit=await worker.fetch(new Request('https://curio.test/api/campanhas/return-open',{method:'POST',headers:{Origin:'https://curio.test','Content-Type':'application/x-www-form-urlencoded',Cookie:cookie},body:new URLSearchParams({id})}),env);
 assert.equal(revisit.status,303);assert.equal(revisit.headers.get('Location'),'https://wa.me/5591999991234');
 assert.equal(sqlite.prepare('SELECT stage FROM availability_leads WHERE id=?').get(id).stage,'pendentes');
 assert.equal(sqlite.prepare("SELECT COUNT(*) total FROM audit WHERE action='consultou_whatsapp_retorno'").get().total,1);
 assert.equal((await call('/api/campanhas/return-leads?status=invalid','GET',null,cookie)).status,400);
 const created=await call('/api/campanhas/campaigns','POST',{name:'Disponibilidade',message:'Olá, {nome}!'},cookie);assert.equal(created.status,201);const template=(await created.json()).id;
 assert.equal((await call('/api/campanhas/campaigns/'+template,'PATCH',{name:'Retorno',message:'Olá, {nome}! Qual a melhor data?'},cookie)).status,200);
 assert.equal((await (await call('/api/campanhas/campaigns','GET',null,cookie)).json())[0].name,'Retorno');
 assert.equal((await dispatch({id,campaign_id:template,message:'Olá, Maria!'})).status,303);
 const withTemplate=await (await call('/api/campanhas/return-leads?status=pendentes','GET',null,cookie)).json();
 assert.equal(withTemplate.rows[0].message_template,'Retorno');
 await call('/api/campanhas/logout','POST',{},cookie);
 assert.equal((await call('/retorno/','GET',null,returnCookie.split(';')[0])).status,303);
 assert.equal((await call('/api/campanhas/return-leads','GET',null,cookie)).status,401);
});

test('availability rate limit and return pagination',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,27,15)});
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());for(const file of ['0001_campanhas','0002_homepage_metrics','0011_availability_leads','0013_return_lead_stages'])sqlite.exec(await readFile('migrations/'+file+'.sql','utf8'));
 const env={DB:adapter(sqlite)};
 for(let i=0;i<6;i++){
  const response=await worker.fetch(new Request('https://curio.test/api/disponibilidade',{method:'POST',headers:{Origin:'https://curio.test','Content-Type':'application/json'},body:JSON.stringify({request_key:crypto.randomUUID(),name:'Teste',phone:'91999991234',city:'Belém'})}),env);
  assert.equal(response.status,i<5?201:429);
 }
 sqlite.prepare('INSERT INTO users(id,username,name,password_hash,role) VALUES(?,?,?,?,?)').run('staff','staff','Equipe',await hashPassword('test-password'),'operador');
 const request=(path,options={})=>worker.fetch(new Request('https://curio.test/api/campanhas'+path,options),env);
 const login=await request('/login',{method:'POST',headers:{Origin:'https://curio.test','Content-Type':'application/json'},body:JSON.stringify({username:'staff',password:'test-password'})}),cookie=login.headers.get('Set-Cookie').split(';')[0];
 const insert=sqlite.prepare('INSERT INTO availability_leads(id,request_key,name,phone,city,stay_date) VALUES(?,?,?,?,?,?)');for(let i=0;i<20;i++)insert.run('lead'+i,crypto.randomUUID(),'Cliente '+i,'5591999991234','Manaus','2026-12-20');
 const list=await (await request('/return-leads?status=todos&page=2',{headers:{Cookie:cookie}})).json();assert.equal(list.rows.length,10);assert.equal(list.total,25);assert.equal(list.page,2);assert.equal(list.pages,3);
 const search=await (await request('/return-leads?q=Manaus',{headers:{Cookie:cookie}})).json();assert.equal(search.total,20);
});
