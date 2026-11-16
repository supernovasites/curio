import {normalizePhone} from '../campanhas/csv.js';
const enc = new TextEncoder();
const statuses = ['nao_contatado', 'aguardando', 'interessado', 'sem_interesse', 'sem_resposta', 'reserva_realizada'];
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
const dateOnly = value => {const day=clean(value,40).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:'';};
export function cityBreakdown(rows){
  const fold=s=>String(s||'').trim().replace(/\s+/g,' ').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR');
  const states=new Map();for(const entry of 'AC:Acre|AL:Alagoas|AP:Amapá|AM:Amazonas|BA:Bahia|CE:Ceará|DF:Distrito Federal|ES:Espírito Santo|GO:Goiás|MA:Maranhão|MT:Mato Grosso|MS:Mato Grosso do Sul|MG:Minas Gerais|PA:Pará|PB:Paraíba|PR:Paraná|PE:Pernambuco|PI:Piauí|RJ:Rio de Janeiro|RN:Rio Grande do Norte|RS:Rio Grande do Sul|RO:Rondônia|RR:Roraima|SC:Santa Catarina|SP:São Paulo|SE:Sergipe|TO:Tocantins'.split('|')){const [uf,name]=entry.split(':');states.set(fold(uf),uf);states.set(fold(name),uf);}
  const title=s=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR').split(' ').map((word,index)=>index&&['de','do','da','dos','das','e'].includes(word)?word:word.replace(/(^|-)\p{L}/gu,c=>c.toLocaleUpperCase('pt-BR'))).join(' ');
  const groups=new Map();let total=0,missing=0;
  for(const row of rows){const count=Number(row.count)||0,raw=String(row.city||'').trim(),isMissing=!raw,city=isMissing?'Não informada':title(raw),state=isMissing?'':states.get(fold(row.state))||String(row.state||'').trim().toLocaleUpperCase('pt-BR'),key=isMissing?'missing':JSON.stringify([fold(raw),fold(state)]);total+=count;if(isMissing)missing+=count;const accents=(raw.normalize('NFD').match(/\p{M}/gu)||[]).length;const existing=groups.get(key);if(existing){existing.count+=count;if(accents>existing.accents){existing.city=city;existing.accents=accents;}}else groups.set(key,{city,state,count,missing:isMissing,accents});}
  return {total,missing,rows:[...groups.values()].sort((a,b)=>b.count-a.count||a.city.localeCompare(b.city,'pt-BR')||a.state.localeCompare(b.state)).map(({accents,...row})=>({...row,percentage:total?row.count/total*100:0}))};
}
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
  if(path==='/base-cities' && method==='GET'){
    if(user.role!=='admin')fail(403,'Somente administradores podem acessar os dados da base.');
    const rows=await db.prepare('SELECT city,state,COUNT(*) count FROM contacts GROUP BY city,state').all();
    return json(cityBreakdown(rows.results));
  }
  if(path==='/analytics' && method==='GET') {
    if(user.role!=='admin')fail(403,'Somente administradores podem acessar o painel.');
    const days=Math.min(90,Math.max(1,parseInt(new URL(req.url).searchParams.get('days'))||30));
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const start=[new Date(Date.parse(today+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),'2026-11-16'].sort().at(-1);
    const rows=await db.prepare("SELECT day,SUM(acessos) acessos,SUM(reservas) reservas,SUM(whatsapp) whatsapp FROM (SELECT day,COUNT(*) acessos,0 reservas,0 whatsapp FROM homepage_visits WHERE day>=? AND day<=? GROUP BY day UNION ALL SELECT day,0 acessos,SUM(CASE WHEN kind='reserva_online' THEN count ELSE 0 END) reservas,SUM(CASE WHEN kind='whatsapp' THEN count ELSE 0 END) whatsapp FROM homepage_metrics WHERE day>=? AND day<=? AND kind IN ('reserva_online','whatsapp') GROUP BY day) GROUP BY day ORDER BY day DESC").bind(start,today,start,today).all();
    const unique=await db.prepare('SELECT COUNT(DISTINCT visitor_hash) total FROM homepage_visits WHERE day>=? AND day<=?').bind(start,today).first();
    return json({rows:rows.results,unique_visitors:unique.total,start,today,days:Math.max(1,Math.round((Date.parse(today)-Date.parse(start))/86400000)+1),timezone:'America/Fortaleza'});
  }
  if(path==='/import' && method==='POST') {
    if(user.role!=='admin') fail(403,'Somente administradores podem importar a base.');
    const b=await body(req);
    if(!Array.isArray(b.rows)||b.rows.length>40) fail(400,'Envie até 40 contatos por lote.');
    const statements=[];
    for(const row of b.rows){
      const name=clean(row.name,200),phone=normalizePhone(clean(row.phone,30),clean(row.country,50)),city=clean(row.city,100),state=clean(row.state,100);
      if(!name||!Number.isInteger(row.index)||row.index<0) fail(400,'Contato inválido.');
      const id=(await sha(phone?'phone:'+phone:'source:'+row.index)).slice(0,32);
      statements.push(db.prepare("INSERT INTO contacts(id,name,phone,city,state,active,source_key,registered_at,occupation,birth_date) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET registered_at=excluded.registered_at,occupation=excluded.occupation,birth_date=excluded.birth_date,city=excluded.city,state=excluded.state").bind(id,name,phone,city,state,row.active?1:0,id,dateOnly(row.registered_at),clean(row.occupation,120),dateOnly(row.birth_date)));
    }
    if(statements.length) await db.batch(statements);
    await audit(user.id,'importou_lote',String(b.rows.length));return json({ok:true});
  }
  if(path==='/logout' && method==='POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();
    return json({ok:true},200,{'Set-Cookie':'curio_session=; Path=/api/campanhas; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  }
  // Queue membership is global: choosing another saved message never resets a guest.
  const latestJoin=" FROM contacts c LEFT JOIN interactions i ON i.rowid=(SELECT x.rowid FROM interactions x WHERE x.contact_id=c.id ORDER BY (x.status<>'nao_contatado') DESC,x.updated_at DESC,x.rowid DESC LIMIT 1) ";
  if(path==='/summary' && method==='GET') return json(await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN COALESCE(i.status,'nao_contatado')='nao_contatado' AND c.phone<>'' AND c.active=1 AND c.opted_out=0 THEN 1 ELSE 0 END) principal,SUM(CASE WHEN i.status='aguardando' THEN 1 ELSE 0 END) pendentes,SUM(CASE WHEN i.status IN ('interessado','sem_interesse','sem_resposta','reserva_realizada') THEN 1 ELSE 0 END) finalizados,SUM(CASE WHEN i.status='interessado' THEN 1 ELSE 0 END) interessados,SUM(CASE WHEN i.status='reserva_realizada' THEN 1 ELSE 0 END) reservas,SUM(CASE WHEN i.status='sem_interesse' THEN 1 ELSE 0 END) sem_interesse,SUM(CASE WHEN i.status='sem_resposta' THEN 1 ELSE 0 END) sem_resposta,SUM(CASE WHEN c.phone='' OR c.active=0 OR c.opted_out=1 THEN 1 ELSE 0 END) indisponiveis"+latestJoin).first());
  if(path==='/queue' && method==='GET') {
    const url=new URL(req.url),tab=url.searchParams.get('tab')||'principal',q=clean(url.searchParams.get('q'),100),requestedPage=Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1));
    const groups={principal:"COALESCE(i.status,'nao_contatado')='nao_contatado' AND c.phone<>'' AND c.active=1 AND c.opted_out=0",pendentes:"i.status='aguardando'",finalizados:"i.status IN ('interessado','sem_interesse','sem_resposta','reserva_realizada')",interessados:"i.status='interessado'",reservas:"i.status='reserva_realizada'"};
    groups.aniversariantes=groups.principal+" AND substr(c.birth_date,6,2)=? AND c.birth_date<=?";
    if(!groups[tab]) fail(400,'Área inválida.');
    const args=[],conditions=[groups[tab]];
    const calendarParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
    if(tab==='aniversariantes')args.push(calendarParts.month,`${calendarParts.year}-${calendarParts.month}-${calendarParts.day}`);
    if(q){conditions.push('(c.name LIKE ? OR c.city LIKE ?)');args.push('%'+q+'%','%'+q+'%');}
    const from=latestJoin+' WHERE '+conditions.join(' AND ');
    const total=await db.prepare('SELECT COUNT(*) total'+from).bind(...args).first();
    const pageSize=10,pages=Math.ceil(total.total/pageSize),page=Math.min(requestedPage,Math.max(1,pages));
    const rows=await db.prepare("SELECT c.id,c.name,c.city,c.state,c.registered_at,c.occupation,c.birth_date,c.opted_out,COALESCE(i.status,'nao_contatado') status,i.campaign_id,i.sent_at,COALESCE(i.notes,'') notes"+from+' ORDER BY c.registered_at DESC,c.name COLLATE NOCASE,c.id LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all();
    const first=rows.results.length?(page-1)*pageSize+1:0,last=first?first+rows.results.length-1:0;
    return json({rows:rows.results,total:total.total,page,pages,page_size:pageSize,from:first,to:last,month:calendarParts.month});
  }
  if(path==='/dispatch' && method==='POST') {
    if(!req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) fail(415,'Formulário inválido.');
    const raw=await req.text();if(raw.length>50000)fail(413,'Formulário muito grande.');
    const form=new URLSearchParams(raw),id=clean(form.get('contact_id'),80),messageId=clean(form.get('message_id'),80);
    const c=await db.prepare('SELECT id,name,phone,active,opted_out FROM contacts WHERE id=?').bind(id).first();
    const message=await db.prepare('SELECT id,message FROM campaigns WHERE id=?').bind(messageId).first();
    if(!c||!c.phone||!c.active||c.opted_out)fail(400,'Este hóspede não está disponível para envio.');
    if(!message)fail(400,'Selecione uma mensagem salva.');
    const custom=form.get('custom_message');
    if(custom!==null&&(!custom.trim()||custom.length>4000))fail(400,'A mensagem deve conter entre 1 e 4.000 caracteres.');
    const result=await db.prepare("INSERT INTO interactions(campaign_id,contact_id,status,sent_at,updated_by) SELECT ?,c.id,'aguardando',CURRENT_TIMESTAMP,? FROM contacts c WHERE c.id=? AND c.active=1 AND c.opted_out=0 AND c.phone<>'' AND NOT EXISTS(SELECT 1 FROM interactions x WHERE x.contact_id=c.id AND x.status<>'nao_contatado') ON CONFLICT(campaign_id,contact_id) DO UPDATE SET status='aguardando',sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by WHERE interactions.status='nao_contatado'").bind(message.id,user.id,c.id).run();
    if(Number(result.meta?.changes??result.changes)!==1)fail(409,'Este hóspede já foi movido para acompanhamento. Atualize a lista.');
    await audit(user.id,'abriu_whatsapp',c.id);
    const text=(custom===null?message.message:custom.trim()).replaceAll('{nome}',c.name.split(/\s+/)[0]);
    return new Response(null,{status:303,headers:{Location:'https://wa.me/'+c.phone+'?text='+encodeURIComponent(text),'Cache-Control':'no-store'}});
  }
  if(path==='/outcome' && method==='POST') {
    const b=await body(req);
    if(!['interessado','sem_interesse','sem_resposta','reserva_realizada'].includes(b.status))fail(400,'Selecione um resultado.');
    const latest=await db.prepare("SELECT rowid,status FROM interactions WHERE contact_id=? ORDER BY (status<>'nao_contatado') DESC,updated_at DESC,rowid DESC LIMIT 1").bind(clean(b.id,80)).first();
    if(!latest||latest.status!=='aguardando')fail(409,'Este hóspede não está pendente de retorno. Atualize a lista.');
    const result=await db.prepare("UPDATE interactions SET status=?,notes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE rowid=? AND status='aguardando'").bind(b.status,clean(b.notes,2000),user.id,latest.rowid).run();
    if(Number(result.meta?.changes??result.changes)!==1)fail(409,'Resultado já atualizado por outra pessoa.');
    await audit(user.id,'finalizou_atendimento',clean(b.id,80));return json({ok:true});
  }
  if(path==='/return' && method==='POST') {
    const b=await body(req),id=clean(b.id,80);
    const latest=await db.prepare("SELECT rowid,status FROM interactions WHERE contact_id=? ORDER BY (status<>'nao_contatado') DESC,updated_at DESC,rowid DESC LIMIT 1").bind(id).first();
    if(!latest||latest.status!=='aguardando')fail(409,'Este hóspede não está pendente.');
    await db.prepare("UPDATE interactions SET status='nao_contatado',sent_at=NULL,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE rowid=? AND status='aguardando'").bind(user.id,latest.rowid).run();
    await audit(user.id,'devolveu_principal',id);return json({ok:true});
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
    if(q) { conditions.push('(c.name LIKE ? OR c.city LIKE ?)'); args.push(...Array(2).fill('%'+q+'%')); }
    if(statuses.includes(status)) {conditions.push("COALESCE(i.status,'nao_contatado')=?");args.push(status);}
    if(status==='sem_telefone') conditions.push("c.phone=''");
    if(status==='bloqueado') conditions.push('c.opted_out=1');
    const from=" FROM contacts c LEFT JOIN interactions i ON c.id=i.contact_id AND i.campaign_id=? WHERE "+conditions.join(' AND ');
    const total=await db.prepare('SELECT COUNT(*) total'+from).bind(...args).first();
    const rows=await db.prepare("SELECT c.id,c.name,c.city,c.state,c.registered_at,c.occupation,c.birth_date,c.active,c.opted_out,COALESCE(i.status,'nao_contatado') status,i.sent_at,COALESCE(i.notes,'') notes"+from+' ORDER BY c.registered_at DESC,c.name COLLATE NOCASE,c.id LIMIT 40 OFFSET ?').bind(...args,(page-1)*40).all();
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
      if(path==='/api/metricas' && req.method==='POST') {
        if(req.headers.get('Origin')!==new URL(req.url).origin)fail(403,'Origem inválida.');
        const b=await body(req);
        if(!['visita','reserva_online','whatsapp'].includes(b.kind))fail(400,'Evento inválido.');
        if(!env.DB)fail(503,'Indisponível.');
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
        if(b.kind==='visita') {
          const existing=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)curio_visitor=([a-f0-9]{64})(?:;|$)/)?.[1];
          const visitor=existing||random();
          await env.DB.prepare('INSERT INTO homepage_visits(day,visitor_hash) VALUES(?,?) ON CONFLICT(day,visitor_hash) DO NOTHING').bind(day,await sha('visitor:'+visitor)).run();
          response=new Response(null,{status:204,headers:existing?{}:{'Set-Cookie':`curio_visitor=${visitor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`}});
        } else {
          await env.DB.prepare('INSERT INTO homepage_metrics(day,kind,count) VALUES(?,?,1) ON CONFLICT(day,kind) DO UPDATE SET count=count+1').bind(day,b.kind).run();
          response=new Response(null,{status:204});
        }
      }
      else if(path.startsWith('/api/campanhas/')) response=await api(req,env,path.slice('/api/campanhas'.length));
      else if(['/usuarios','/usuarios/','/mensagens','/mensagens/'].includes(path))response=await env.ASSETS.fetch(new Request(new URL('/campanhas/',req.url),req));
      else if(path.startsWith('/api/')) response=json({error:'Recurso não encontrado.'},404);
      else response=await env.ASSETS.fetch(req);
    } catch(e) { response=json({error:e.status ? e.message : 'Não foi possível concluir. Tente novamente.'},e.status || 500); }
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');
    if(['/campanhas','/painel','/usuarios','/mensagens','/api/'].some(p=>path.startsWith(p))) {
      headers.set('Cache-Control','no-store');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me https://*.whatsapp.com");
    }
    return new Response(response.body,{status:response.status,headers});
  }
};
