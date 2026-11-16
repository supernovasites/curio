import {normalizePhone} from '../campanhas/csv.js';
const enc = new TextEncoder();
const statuses = ['nao_contatado', 'aguardando', 'interessado', 'sem_interesse', 'sem_resposta'];
const hex = a => Array.from(new Uint8Array(a), b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export async function hashPassword(password, salt = random()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'}, key, 256);
  return `pbkdf2$100000$${salt}$${hex(bits)}`;
}
async function verify(password, hash) {
  const candidate = await hashPassword(password, hash.split('$')[2]);
  let diff = candidate.length ^ hash.length;
  for(let i=0;i<candidate.length;i++) diff |= candidate.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  return diff === 0;
}
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
const json = (v, status=200, extra={}) => new Response(JSON.stringify(v), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
const clean = (s,max=200) => typeof s === 'string' ? s.trim().slice(0,max) : '';
async function body(req) {
  if (!req.headers.get('content-type')?.includes('application/json')) fail(415,'Envie JSON.');
  const text = await req.text();
  if(text.length>20000) fail(413,'Dados muito grandes.');
  try { return JSON.parse(text); } catch { fail(400,'Dados inválidos.'); }
}
async function api(req, env, path) {
  if(!env.DB) fail(503,'Banco ainda não configurado. Vincule o banco D1 à variável DB no Cloudflare.');
  const db=env.DB, now=Date.now(), method=req.method;
  const write = !['GET','HEAD'].includes(method);
  if(write && req.headers.get('Origin') !== new URL(req.url).origin) fail(403,'Origem inválida.');
  const audit = async (uid,action,id) => db.prepare('INSERT INTO audit(user_id,action,entity_id) VALUES(?,?,?)').bind(uid,action,id).run();
  if(path==='/login' && method==='POST') {
    const b=await body(req), username=clean(b.username,60).toLowerCase();
    const password=typeof b.password==='string' && b.password.length<=256 ? b.password : '';
    const keys=await Promise.all([sha('ip:'+ (req.headers.get('CF-Connecting-IP') || 'local')),sha('user:'+username)]);
    for(const key of keys) {
      const limit=await db.prepare('SELECT * FROM login_limits WHERE key=?').bind(key).first();
      if(limit && limit.expires_at>now && limit.attempts>=10) fail(429,'Muitas tentativas. Aguarde 15 minutos.');
    }
    await db.batch(keys.map(key=>db.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END').bind(key,now+900000,now,now,now+900000)));
    const u=await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    const dummy='pbkdf2$100000$dummy$'+'0'.repeat(64);
    const ok=await verify(password,u?.password_hash || dummy);
    if(!u || !u.active || !ok) fail(401,'Login ou senha inválidos.');
    const token=random();
    await db.batch([db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha(token),u.id,now+28800000),db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),db.prepare('DELETE FROM login_limits WHERE key=?').bind(keys[1]),db.prepare('DELETE FROM login_limits WHERE expires_at<?').bind(now)]);
    await audit(u.id,'login',u.id);
    return json({ok:true},200,{'Set-Cookie':`curio_session=${token}; Path=/api/campanhas; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
  }
  const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('curio_session='))?.slice(14) || '';
  const tokenHash=await sha(token);
  const user=await db.prepare('SELECT u.id,u.username,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(tokenHash,now).first();
  if(!user) fail(401,'Entre para acessar a plataforma.');
  if(path==='/me' && method==='GET') return json(user);
  if(path==='/import' && method==='POST') {
    if(user.role!=='admin') fail(403,'Somente administradores podem importar a base.');
    const b=await body(req);
    if(!Array.isArray(b.rows)||b.rows.length>40) fail(400,'Envie até 40 contatos por lote.');
    const statements=[];
    for(const row of b.rows){
      const name=clean(row.name,200),phone=normalizePhone(clean(row.phone,30),clean(row.country,50)),city=clean(row.city,100),state=clean(row.state,100);
      if(!name||!Number.isInteger(row.index)||row.index<0) fail(400,'Contato inválido.');
      const id=(await sha(phone?'phone:'+phone:'source:'+row.index)).slice(0,32);
      statements.push(db.prepare('INSERT INTO contacts(id,name,phone,city,state,active,source_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(source_key) DO NOTHING').bind(id,name,phone,city,state,row.active?1:0,id));
    }
    if(statements.length) await db.batch(statements);
    await audit(user.id,'importou_lote',String(b.rows.length));return json({ok:true});
  }
  if(path==='/logout' && method==='POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
    return json({ok:true},200,{'Set-Cookie':'curio_session=; Path=/api/campanhas; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  }
  if(path==='/campaigns' && method==='GET') return json((await db.prepare('SELECT id,name,message,created_at FROM campaigns ORDER BY created_at DESC,id').all()).results);
  if(path==='/campaigns' && method==='POST') {
    const b=await body(req), name=clean(b.name,100), message=clean(b.message,4000);
    if(!name || !message) fail(400,'Informe o nome e a mensagem.');
    const id=crypto.randomUUID();
    await db.prepare('INSERT INTO campaigns(id,name,message,created_by) VALUES(?,?,?,?)').bind(id,name,message,user.id).run();
    await audit(user.id,'criou_campanha',id); return json({id},201);
  }
  const campaignMatch=path.match(/^\/campaigns\/([\w-]+)$/);
  if(campaignMatch && method==='PATCH') {
    const b=await body(req), name=clean(b.name,100), message=clean(b.message,4000);
    if(!name || !message) fail(400,'Informe o nome e a mensagem.');
    await db.prepare('UPDATE campaigns SET name=?,message=? WHERE id=?').bind(name,message,campaignMatch[1]).run();
    await audit(user.id,'editou_campanha',campaignMatch[1]); return json({ok:true});
  }
  const url=new URL(req.url), campaign=url.searchParams.get('campaign');
  if(['/contacts','/dashboard'].includes(path) && method==='GET') {
    if(!campaign || !await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(campaign).first()) fail(400,'Selecione uma campanha.');
    if(path==='/dashboard') {
      const totals=await db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN c.phone<>'' AND c.active=1 AND c.opted_out=0 THEN 1 ELSE 0 END) elegiveis, SUM(CASE WHEN c.phone='' THEN 1 ELSE 0 END) sem_telefone, SUM(CASE WHEN c.opted_out=1 THEN 1 ELSE 0 END) bloqueados, SUM(CASE WHEN i.sent_at IS NOT NULL THEN 1 ELSE 0 END) contatados, SUM(CASE WHEN i.status='aguardando' THEN 1 ELSE 0 END) aguardando, SUM(CASE WHEN i.status='interessado' THEN 1 ELSE 0 END) interessado, SUM(CASE WHEN i.status='sem_interesse' THEN 1 ELSE 0 END) sem_interesse, SUM(CASE WHEN i.status='sem_resposta' THEN 1 ELSE 0 END) sem_resposta FROM contacts c LEFT JOIN interactions i ON i.contact_id=c.id AND i.campaign_id=?").bind(campaign).first();
      return json(totals);
    }
    const q=clean(url.searchParams.get('q'),100), status=url.searchParams.get('status')||'', page=Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1));
    const conditions=['1=1'],args=[campaign];
    if(q) { conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.city LIKE ?)'); args.push(...Array(3).fill('%'+q+'%')); }
    if(statuses.includes(status)) {conditions.push("COALESCE(i.status,'nao_contatado')=?");args.push(status);}
    if(status==='sem_telefone') conditions.push("c.phone=''");
    if(status==='bloqueado') conditions.push('c.opted_out=1');
    const from=" FROM contacts c LEFT JOIN interactions i ON c.id=i.contact_id AND i.campaign_id=? WHERE "+conditions.join(' AND ');
    const total=await db.prepare('SELECT COUNT(*) total'+from).bind(...args).first();
    const rows=await db.prepare("SELECT c.id,c.name,c.phone,c.city,c.state,c.active,c.opted_out,COALESCE(i.status,'nao_contatado') status,i.sent_at,COALESCE(i.notes,'') notes"+from+' ORDER BY c.name COLLATE NOCASE,c.id LIMIT 40 OFFSET ?').bind(...args,(page-1)*40).all();
    return json({rows:rows.results,total:total.total,page,pages:Math.ceil(total.total/40)});
  }
  const contactMatch=path.match(/^\/contacts\/([\w-]+)$/);
  if(contactMatch && method==='PATCH') {
    const id=contactMatch[1],b=await body(req);
    const c=await db.prepare('SELECT * FROM contacts WHERE id=?').bind(id).first();
    if(!c) fail(404,'Contato não encontrado.');
    if(typeof b.opted_out==='boolean') {
      await db.prepare('UPDATE contacts SET opted_out=? WHERE id=?').bind(b.opted_out?1:0,id).run();
      await audit(user.id,b.opted_out?'bloqueou_contato':'liberou_contato',id); return json({ok:true});
    }
    if(!statuses.includes(b.status)) fail(400,'Situação inválida.');
    if(!await db.prepare('SELECT id FROM campaigns WHERE id=?').bind(b.campaign).first()) fail(400,'Campanha inválida.');
    if(b.status!=='nao_contatado' && (!c.phone || !c.active || c.opted_out)) fail(400,'Contato sem telefone, inativo ou bloqueado.');
    await db.prepare("INSERT INTO interactions(campaign_id,contact_id,status,sent_at,notes,updated_by) VALUES(?,?,?,CASE WHEN ?='nao_contatado' THEN NULL ELSE CURRENT_TIMESTAMP END,?,?) ON CONFLICT(campaign_id,contact_id) DO UPDATE SET status=excluded.status,sent_at=CASE WHEN excluded.status='nao_contatado' THEN NULL ELSE COALESCE(interactions.sent_at,CURRENT_TIMESTAMP) END,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(b.campaign,id,b.status,b.status,clean(b.notes,2000),user.id).run();
    await audit(user.id,'atualizou_resultado',id);return json({ok:true});
  }
  if(path.startsWith('/users')) {
    if(user.role!=='admin') fail(403,'Somente administradores podem gerenciar usuários.');
    if(path==='/users' && method==='GET') return json((await db.prepare('SELECT id,username,name,role,active,created_at FROM users ORDER BY name').all()).results);
    const match=path.match(/^\/users\/([\w-]+)$/);
    if((path==='/users' && method==='POST') || (match && method==='PATCH')) {
      const b=await body(req), name=clean(b.name,100),username=clean(b.username,60).toLowerCase(),role=b.role;
      if(!name || !/^[a-z0-9._-]{3,60}$/.test(username) || !['admin','operador'].includes(role)) fail(400,'Preencha nome, login (3–60 caracteres) e perfil.');
      const existing=match ? await db.prepare('SELECT * FROM users WHERE id=?').bind(match[1]).first() : null;
      if(match && !existing) fail(404,'Usuário não encontrado.');
      const active=b.active===false?0:1;
      if(existing?.id===user.id && (!active || role!=='admin')) fail(400,'Você não pode bloquear ou remover seu próprio perfil de administrador.');
      const password=typeof b.password==='string'?b.password:'';
      if((!existing || password) && (password.length<8 || password.length>256)) fail(400,'Use uma senha entre 8 e 256 caracteres.');
      const id=existing?.id || crypto.randomUUID(), hash=password ? await hashPassword(password) : existing.password_hash;
      if(existing) await db.batch([db.prepare('UPDATE users SET name=?,username=?,role=?,active=?,password_hash=? WHERE id=?').bind(name,username,role,active,hash,id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)]);
      else await db.prepare('INSERT INTO users(id,name,username,role,active,password_hash) VALUES(?,?,?,?,?,?)').bind(id,name,username,role,active,hash).run();
      await audit(user.id,existing?'editou_usuario':'criou_usuario',id);return json({ok:true,id},existing?200:201);
    }
  }
  fail(404,'Recurso não encontrado.');
}
export default {
  async fetch(req,env) {
    const path=new URL(req.url).pathname;
    let response;
    try {
      if(path.startsWith('/api/campanhas/')) response=await api(req,env,path.slice('/api/campanhas'.length));
      else if(path==='/campanhas' || path==='/campanhas/') response=await env.ASSETS.fetch(new Request(new URL('/campanhas/index.html',req.url),req));
      else if(path.startsWith('/api/')) response=json({error:'Recurso não encontrado.'},404);
      else response=await env.ASSETS.fetch(req);
    } catch(e) { response=json({error:e.status ? e.message : 'Não foi possível concluir. Tente novamente.'},e.status || 500); }
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');
    if(path.startsWith('/campanhas') || path.startsWith('/api/')) {
      headers.set('Cache-Control','no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    return new Response(response.body,{status:response.status,headers});
  }
};
