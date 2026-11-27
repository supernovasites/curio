import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker,{hashPassword} from '../server/worker.mjs';

function adapter(sqlite){return {prepare(sql){const statement=sqlite.prepare(sql);let args=[];const query={bind(...values){args=values;return query;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return {meta:statement.run(...args)};}};return query;},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};}
const makeCpf=base=>{let digits=base;for(const position of [9,10]){const sum=[...digits].reduce((total,digit,index)=>total+Number(digit)*(position+1-index),0);digits+=String((sum*10%11)%10);}return digits;};
const profile=(seed='123456789')=>({entry_date:'2026-12-18',exit_date:'2026-12-20',name:'Cliente de teste',birth_date:'1988-02-20',cpf:makeCpf(seed),rg:'RG teste 123',occupation:'Profissional de teste',companions:[{name:'Acompanhante de teste',cpf:makeCpf('234567890'),rg:'RG teste 456',age:12}],dietary_restrictions:'Sem lactose',notes:'Observação de teste'});
async function setup(t){
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,10,27,15)});const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of ['0001_campanhas','0003_contact_details','0004_reserva_realizada','0006_reservations','0012_guest_registrations'])sqlite.exec(await readFile('migrations/'+file+'.sql','utf8'));
 const password=await hashPassword('test-password');const insert=sqlite.prepare('INSERT INTO users(id,username,name,password_hash,role) VALUES(?,?,?,?,?)');insert.run('admin','admin','Administrador',password,'admin');insert.run('operator','operator','Operador',password,'operador');
 const env={DB:adapter(sqlite),ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}};
 const call=(path,method='GET',data,cookie,origin='https://curio.test')=>worker.fetch(new Request('https://curio.test'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
 const login=async username=>{const response=await call('/api/campanhas/login','POST',{username,password:'test-password'});return response.headers.getSetCookie()[0].split(';')[0];};
 const admin=await login('admin'),operator=await login('operator');return {sqlite,call,admin,operator};
}

test('public lodging registration is pending, validated, idempotent and isolated from contacts until admin approval',async t=>{
 const {sqlite,call,admin,operator}=await setup(t);const data={...profile(),request_key:crypto.randomUUID()};
 assert.equal((await call('/cadastro')).status,200);
 assert.equal((await call('/api/cadastro')).status,405);
 assert.equal((await call('/api/cadastro','POST',data,null,'https://evil.test')).status,403);
 for(const invalid of [{entry_date:'2026-02-30'},{exit_date:'2026-12-18'},{birth_date:'2027-01-01'},{name:''},{cpf:'123'},{rg:''},{occupation:''},{companions:[{name:'Sem documentos',age:10}]},{companions:[{name:'Repetido',cpf:data.cpf,rg:'123',age:10}]},{companions:Array(21).fill(data.companions[0])}])assert.equal((await call('/api/cadastro','POST',{...data,...invalid})).status,400);
 assert.equal((await call('/api/cadastro','POST',data)).status,201);
 assert.equal((await call('/api/cadastro','POST',data)).status,201);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM guest_registrations').get().total,1);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM contacts').get().total,0);
 assert.equal((await call('/api/cadastro','POST',{...data,request_key:crypto.randomUUID()})).status,409);
 const endpoint='/api/campanhas/guest-registrations';
 assert.equal((await call(endpoint)).status,401);assert.equal((await call(endpoint,'GET',null,operator)).status,403);
 const list=await (await call(endpoint,'GET',null,admin)).json();assert.equal(list.total,1);assert.ok(!('cpf' in list.rows[0]));
 const id=list.rows[0].id;let saved=await (await call(endpoint+'/'+id,'GET',null,admin)).json();assert.equal(saved.age,38);assert.equal(saved.companions[0].age,12);assert.equal(saved.status,'pending');
 assert.equal((await call(endpoint+'/'+id,'PATCH',{...data,notes:'Revisado',version:1},admin)).status,200);
 assert.equal((await call(endpoint+'/'+id+'/approve','POST',{version:1},admin)).status,409);
 assert.equal((await call(endpoint+'/'+id+'/approve','POST',{version:2},operator)).status,403);
 assert.equal((await call(endpoint+'/'+id+'/approve','POST',{version:2},admin,'https://evil.test')).status,403);
 const approved=await call(endpoint+'/'+id+'/approve','POST',{version:2},admin);assert.equal(approved.status,200);
 const contactId=(await approved.json()).contact_id;assert.equal(sqlite.prepare('SELECT name FROM contacts WHERE id=?').get(contactId).name,data.name);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM contacts').get().total,1);assert.equal(sqlite.prepare('SELECT cpf FROM customer_accounts').get().cpf,data.cpf);
 assert.equal((await call(endpoint+'/'+id+'/approve','POST',{version:2},admin)).status,409);
 saved=await (await call('/api/campanhas/guest-profiles/'+contactId,'GET',null,admin)).json();assert.equal(saved.notes,'Revisado');assert.equal(saved.status,'approved');
 assert.equal((await call('/api/campanhas/guest-profiles/'+contactId,'PATCH',{...data,name:'Nome corrigido',version:saved.version},admin)).status,200);
 assert.equal(sqlite.prepare('SELECT name FROM contacts WHERE id=?').get(contactId).name,'Nome corrigido');
 const me=await call('/api/campanhas/me','GET',null,admin),pageCookie=me.headers.getSetCookie().find(value=>value.startsWith('curio_client_admin=')).split(';')[0];
 assert.equal((await call('/clientes/')).status,303);assert.equal((await call('/clientes/app.js')).status,303);assert.equal((await call('/clientes/','GET',null,pageCookie)).status,200);
 await call('/api/campanhas/logout','POST',{},admin);assert.equal((await call('/clientes/','GET',null,pageCookie)).status,303);
});

test('admin manual registration, rejection, legacy edits and CPF conflicts preserve existing data',async t=>{
 const {sqlite,call,admin}=await setup(t);const endpoint='/api/campanhas/guest-registrations',data=profile();
 const manual=await call(endpoint,'POST',data,admin);assert.equal(manual.status,201);const created=await manual.json();assert.equal(created.status,'approved');
 assert.equal(sqlite.prepare('SELECT status FROM guest_registrations WHERE id=?').get(created.id).status,'approved');
 const another={...profile('345678901'),request_key:crypto.randomUUID(),companions:[]};await call('/api/cadastro','POST',another);
 const pending=(await (await call(endpoint,'GET',null,admin)).json()).rows[0];assert.equal((await call(endpoint+'/'+pending.id+'/reject','POST',{version:1},admin)).status,200);
 assert.equal(sqlite.prepare('SELECT COUNT(*) total FROM contacts').get().total,1);
 assert.equal((await call('/api/cadastro','POST',{...another,request_key:crypto.randomUUID()})).status,201);
 sqlite.prepare("INSERT INTO contacts(id,source_key,name,phone,city,state,birth_date,occupation,registered_at) VALUES('legacy','legacy','Cliente legado','5591999991234','Belém','PA','1980-01-01','Antiga','2023-01-01')").run();
 const before=await (await call('/api/campanhas/guest-profiles/legacy','GET',null,admin)).json();assert.equal(before.version,0);
 const legacy={...profile('456789012'),companions:[],version:0};assert.equal((await call('/api/campanhas/guest-profiles/legacy','PATCH',legacy,admin)).status,200);
 const record=sqlite.prepare("SELECT phone,city,registered_at FROM contacts WHERE id='legacy'").get();assert.equal(record.phone,'5591999991234');assert.equal(record.city,'Belém');assert.equal(record.registered_at,'2023-01-01');
 assert.equal((await call('/api/campanhas/guest-profiles/legacy','PATCH',legacy,admin)).status,409);
 const version=sqlite.prepare("SELECT version FROM guest_registrations WHERE contact_id='legacy'").get().version;
 assert.equal((await call('/api/campanhas/guest-profiles/legacy','PATCH',{...legacy,cpf:data.cpf,name:'Não deve salvar',version},admin)).status,409);
 assert.equal(sqlite.prepare("SELECT name FROM contacts WHERE id='legacy'").get().name,legacy.name);
 assert.equal(sqlite.prepare("SELECT cpf FROM customer_accounts WHERE contact_id='legacy'").get().cpf,legacy.cpf);
});

test('public lodging registration throttles submissions without leaking documents',async t=>{
 const {call}=await setup(t);
 for(let i=0;i<11;i++){const response=await call('/api/cadastro','POST',{...profile(String(123450000+i)),companions:[],request_key:crypto.randomUUID()});assert.equal(response.status,i<10?201:429);const result=await response.json();assert.ok(!('cpf' in result));assert.ok(!('companions' in result));}
});
