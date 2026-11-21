import {normalizePhone} from '../campanhas/csv.js';
import {ageOnDate} from '../campanhas/age.js';
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

const localDay = () => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Fortaleza', year:'numeric', month:'2-digit', day:'2-digit'
}).format(new Date());

function readCpf(value) {
  const cpf = clean(value, 20).replace(/[.\s-]/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) fail(400,'Informe um CPF válido.');
  for (const position of [9, 10]) {
    const sum = [...cpf.slice(0, position)].reduce((total, digit, index) => total + Number(digit) * (position + 1 - index), 0);
    if ((sum * 10 % 11) % 10 !== Number(cpf[position])) fail(400,'Informe um CPF válido.');
  }
  return cpf;
}

async function customerLimit(db, key, max) {
  const now = Date.now();
  const row = await db.prepare(
    'INSERT INTO login_limits(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE MIN(attempts+1,?) END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts'
  ).bind(key,now+900000,now,max+1,now).first();
  if (row.attempts > max) fail(429,'Muitas tentativas. Aguarde 15 minutos.');
}

function customerDetails(input) {
  const name = clean(input.name,120), city = clean(input.city,100), state = clean(input.state,40);
  const rawPhone = clean(input.phone,40);
  const phone = normalizePhone(rawPhone) || normalizePhone(rawPhone,'international');
  const registered = dateOnly(input.registered_at), birth = dateOnly(input.birth_date);
  if (!name || (rawPhone && !phone) || (input.registered_at && !registered) || (input.birth_date && (!birth || birth>localDay())))
    fail(400,'Confira o nome, o telefone e as datas.');
  return [name,phone,city,state,registered,birth,clean(input.occupation,120)];
}

async function createCustomer(db, input, publicRegistration = false) {
  const cpf = publicRegistration || input.cpf ? readCpf(input.cpf) : null;
  const id = crypto.randomUUID();
  const details = customerDetails({...input,registered_at:input.registered_at || localDay()});
  if (publicRegistration && !details[1]) fail(400,'Informe um WhatsApp válido com DDD.');
  const statements = [db.prepare('INSERT INTO contacts(name,phone,city,state,registered_at,birth_date,occupation,id,source_key) VALUES(?,?,?,?,?,?,?,?,?)').bind(...details,id,id)];
  if (cpf) statements.push(db.prepare("INSERT INTO customer_accounts(contact_id,cpf,password_hash) VALUES(?,?,'')").bind(id,cpf));
  try {
    await db.batch(statements);
  } catch (error) {
    if (/UNIQUE constraint failed: customer_accounts.cpf/i.test(error.message))
      fail(409,'CPF já cadastrado. Use a opção de acesso ao cadastro.');
    throw error;
  }
  return id;
}

const hotelDay = day => typeof day==='string' && day===dateOnly(day) &&
  new Date(day+'T12:00:00Z').getUTCDay()===5;
const fridaySql = "strftime('%w',d.day)='5'";
const weekendReservations = "SELECT 1 FROM reservations r WHERE r.day BETWEEN d.day AND date(d.day,'+2 days')";
const weekendOccupancy = weekendReservations+" AND r.status IN ('approved','confirmed')";
const weekendHold = weekendReservations+" AND r.status IN ('pending','approved','confirmed')";
const availableDates = "SELECT d.day FROM reservation_dates d WHERE d.open=1 AND d.day>=? AND "+fridaySql+" AND NOT EXISTS ("+weekendHold+")";
async function createReservation(db, contactId, day, userId = null) {
  if (!hotelDay(day) || day < localDay()) fail(400,'Selecione a sexta-feira de entrada do fim de semana, a partir de hoje.');
  const id = crypto.randomUUID();
  const result = await db.prepare("INSERT INTO reservations(id,day,contact_id,status,updated_by) SELECT ?,d.day,c.id,'pending',? FROM ("+availableDates+") d CROSS JOIN contacts c WHERE d.day=? AND c.id=? AND c.active=1 ON CONFLICT DO NOTHING")
    .bind(id,userId,localDay(),day,contactId).run();
  if (!result.meta.changes) fail(409,'Data indisponível, cliente inativo ou já existe um pedido para esta data.');
  return json({id},201);
}

const customerCookie = (token, seconds) =>
  'curio_customer_v3='+token+'; Path=/api/reserva; HttpOnly; Secure; SameSite=Strict; Max-Age='+seconds;
const deletionRequestAction = 'solicitou_exclusao_cliente';

async function publicReservations(req, env, path) {
  const db = env.DB, method = req.method, now = Date.now();
  if (!db) fail(503,'Reservas indisponíveis.');
  if (method !== 'GET' && req.headers.get('Origin') !== new URL(req.url).origin) fail(403,'Origem inválida.');
  if (path === '/dates' && method === 'GET') {
    const {results} = await db.prepare(availableDates+' ORDER BY d.day').bind(localDay()).all();
    return json(results.map(row => row.day));
  }
  if (method === 'POST' && ['/register','/login'].includes(path)) {
    const input = await body(req), ip = req.headers.get('CF-Connecting-IP') || 'local';
    const registering = path === '/register';
    await customerLimit(db,await sha('customer-ip:'+path+':'+ip),registering ? 8 : 40);
    const cpf = readCpf(input.cpf), birth = dateOnly(input.birth_date);
    if (!birth || birth !== input.birth_date || birth>localDay()) fail(400,'Informe a data de nascimento completa.');
    if (registering) {
      try { await createCustomer(db,{cpf,birth_date:birth,name:input.name,phone:input.phone,city:input.city,state:input.state},true); }
      catch (error) { if (error.status !== 409) throw error; }
      return json({ok:true},202);
    }
    const accountKey = await sha('customer-account-v3:'+cpf);
    await customerLimit(db,accountKey,5);
    const account = await db.prepare('SELECT a.contact_id FROM customer_accounts a JOIN contacts c ON c.id=a.contact_id WHERE a.cpf=? AND c.birth_date=? AND c.active=1').bind(cpf,birth).first();
    if (!account) fail(401,'CPF ou data de nascimento inválidos. Se os dados estiverem corretos, confirme seu cadastro com a equipe.');
    const contactId = account.contact_id;
    const token = random(), seconds = 3600;
    await db.batch([
      db.prepare('INSERT INTO customer_sessions VALUES(?,?,?)').bind(await sha(token),contactId,now+seconds*1000),
      db.prepare('DELETE FROM customer_sessions WHERE expires_at<=?').bind(now),
      db.prepare('DELETE FROM login_limits WHERE key=? OR expires_at<=?').bind(accountKey,now)
    ]);
    return json({ok:true},200,{'Set-Cookie':customerCookie(token,seconds)});
  }
  const token = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)curio_customer_v3=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) fail(401,'Informe CPF e data de nascimento para acessar seu cadastro.');
  const tokenHash = await sha(token);
  const customer = await db.prepare('SELECT c.id,c.name,c.phone,c.city,c.state FROM customer_sessions s JOIN contacts c ON c.id=s.contact_id WHERE s.token_hash=? AND s.expires_at>? AND c.active=1').bind(tokenHash,now).first();
  if (!customer) fail(401,'Informe CPF e data de nascimento para acessar seu cadastro.');
  if (path === '/me' && method === 'GET') {
    const {results} = await db.prepare('SELECT id,day,status FROM reservations WHERE contact_id=? ORDER BY day DESC,created_at DESC').bind(customer.id).all();
    const deletion = await db.prepare('SELECT created_at FROM audit WHERE action=? AND entity_id=? LIMIT 1').bind(deletionRequestAction,customer.id).first();
    return json({customer,reservations:results,deletionRequestedAt:deletion?.created_at || null});
  }
  if (path === '/me/deletion-request' && method === 'POST') {
    await db.prepare('INSERT INTO audit(action,entity_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM audit WHERE action=? AND entity_id=?)')
      .bind(deletionRequestAction,customer.id,deletionRequestAction,customer.id).run();
    return json({ok:true},202);
  }
  if (path === '/me' && method === 'PATCH') {
    const [name,phone,city,state] = customerDetails(await body(req));
    await db.prepare('UPDATE contacts SET name=?,phone=?,city=?,state=? WHERE id=? AND active=1').bind(name,phone,city,state,customer.id).run();
    return json({ok:true});
  }
  if (path === '/requests' && method === 'POST') return createReservation(db,customer.id,(await body(req)).day);
  if (path === '/logout' && method === 'POST') {
    await db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(tokenHash).run();
    return json({ok:true},200,{'Set-Cookie':customerCookie('',0)});
  }
  fail(404,'Recurso não encontrado.');
}

async function manageReservations(req, db, path, user, audit) {
  const method = req.method;
  if (user.role !== 'admin') fail(403,'Somente administradores podem gerenciar clientes e reservas.');
  const reservationSearch = path === '/reservations/customers';
  if ((path === '/customers/search' || reservationSearch) && method === 'POST') {
    const input = await body(req), pageSize = 25;
    const fold = text => text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
    const name = [...'áàâãäéèêëíìîïóòôõöúùûüç'].reduce((sql,letter) =>
      "replace(replace("+sql+",'"+letter+"','"+fold(letter)+"'),'"+letter.toUpperCase()+"','"+fold(letter)+"')", 'lower(c.name)');
    const args = [fold(clean(input.q,120))];
    let where = ' WHERE instr('+name+',?)>0';
    if (reservationSearch) where += ' AND c.active=1';
    const deletionDate = "(SELECT MIN(a.created_at) FROM audit a WHERE a.action='"+deletionRequestAction+"' AND a.entity_id=c.id)";
    if (!reservationSearch && input.deletionRequested === true) where += ' AND '+deletionDate+' IS NOT NULL';
    for (const [field,column,op] of [['registeredFrom','registered_at','>='],['registeredTo','registered_at','<='],['birthFrom','birth_date','>='],['birthTo','birth_date','<=']]) {
      if (reservationSearch || !input[field]) continue;
      const date = dateOnly(input[field]);
      if (!date) fail(400,'Confira as datas dos filtros.');
      where += ' AND c.'+column+"<>'' AND c."+column+op+'?';
      args.push(date);
    }
    const total = await db.prepare('SELECT COUNT(*) total FROM contacts c'+where).bind(...args).first();
    const pages = Math.max(1,Math.ceil(total.total/pageSize));
    const page = Math.min(pages,Math.max(1,Math.floor(Number(input.page)||1)));
    const fields = reservationSearch ? 'c.id,c.name,c.city,c.state' :
      'c.id,c.name,c.phone,c.city,c.state,c.registered_at,c.birth_date,c.occupation,c.active,EXISTS(SELECT 1 FROM customer_accounts a WHERE a.contact_id=c.id) has_account,'+deletionDate+' deletion_requested_at';
    const {results} = await db.prepare('SELECT '+fields+' FROM contacts c'+where+' ORDER BY '+name+',c.id LIMIT ? OFFSET ?')
      .bind(...args,pageSize,(page-1)*pageSize).all();
    await audit(user.id,reservationSearch?'buscou_cliente_reserva':'consultou_base_clientes','contacts');
    return json({rows:results,page,pages,total:total.total});
  }
  const customerMatch = path.match(/^\/customers\/([\w-]+)$/);
  if (customerMatch && method === 'PATCH') {
    const input = await body(req), id = customerMatch[1];
    const details = customerDetails(input), contact = await db.prepare('SELECT id FROM contacts WHERE id=?').bind(id).first();
    if (!contact) fail(404,'Cliente não encontrado.');
    const statements = [db.prepare('UPDATE contacts SET name=?,phone=?,city=?,state=?,registered_at=?,birth_date=?,occupation=? WHERE id=?').bind(...details,id)];
    if (input.cpf) statements.push(db.prepare("INSERT INTO customer_accounts(contact_id,cpf,password_hash) VALUES(?,?,'') ON CONFLICT(contact_id) DO NOTHING").bind(id,readCpf(input.cpf)));
    statements.unshift(db.prepare('DELETE FROM customer_sessions WHERE contact_id=? AND EXISTS(SELECT 1 FROM contacts WHERE id=? AND birth_date<>?)').bind(id,id,details[5]));
    try { await db.batch(statements); }
    catch (error) {
      if (/UNIQUE constraint failed: customer_accounts.cpf/i.test(error.message)) fail(409,'CPF já associado a outro cliente.');
      throw error;
    }
    await audit(user.id,'editou_cliente',id);
    return json({ok:true});
  }
  if (path === '/customers' && method === 'POST') {
    const id = await createCustomer(db,await body(req));
    await audit(user.id,'cadastrou_cliente',id);
    return json({id},201);
  }
  if (path === '/reservations/dates' && method === 'GET') {
    const {results} = await db.prepare("SELECT d.day,d.open,EXISTS("+weekendHold+") booked FROM reservation_dates d WHERE "+fridaySql+" ORDER BY d.day").all();
    return json(results);
  }
  if (path === '/reservations/dates' && method === 'POST') {
    const {day,open} = await body(req);
    if (!hotelDay(day) || day < localDay() || typeof open !== 'boolean') fail(400,'Selecione a sexta-feira de entrada do fim de semana, a partir de hoje.');
    await db.prepare('INSERT INTO reservation_dates(day,open) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET open=excluded.open').bind(day,Number(open)).run();
    await audit(user.id,open?'abriu_data':'fechou_data',day);
    return json({ok:true});
  }
  if (path === '/reservations' && method === 'GET') {
    const {results} = await db.prepare("SELECT r.id,r.day,r.status,c.name,(c.phone<>'') has_phone FROM reservations r JOIN contacts c ON c.id=r.contact_id ORDER BY (r.status='pending') DESC,r.day DESC,r.created_at DESC").all();
    return json(results);
  }
  if (path === '/reservations' && method === 'POST') {
    const {day,customerId} = await body(req);
    return createReservation(db,clean(customerId,80),day,user.id);
  }
  const whatsapp = path.match(/^\/reservations\/([\w-]+)\/whatsapp$/);
  if (whatsapp && method === 'GET') {
    const row = await db.prepare("SELECT r.day,r.status,r.payment,c.name,c.phone FROM reservations r JOIN contacts c ON c.id=r.contact_id WHERE r.id=? AND r.status IN ('approved','confirmed')").bind(whatsapp[1]).first();
    if (!row || !/^[1-9]\d{7,14}$/.test(row.phone)) fail(404,'WhatsApp da reserva indisponível.');
    const day = row.day.split('-').reverse().join('/');
    const message = row.status === 'confirmed'
      ? 'Olá, '+row.name+'! Sua reserva na Fazenda Curió para '+day+' está confirmada.'
      : 'Olá, '+row.name+'! Sua solicitação para '+day+' na Fazenda Curió foi aprovada.\n\nDados para pagamento:\n'+row.payment+'\n\nEnvie o comprovante por aqui para confirmarmos a reserva.';
    const end = new Date(Date.parse(row.day+'T12:00:00Z')+2*86400000).toISOString().slice(0,10).split('-').reverse().join('/');
    const schedule = hotelDay(row.day) ? '\n\nEntrada: '+day+' às 15h. Saída: '+end+' às 15h.' : '';
    await audit(user.id,'abriu_whatsapp_reserva',whatsapp[1]);
    return new Response(null,{status:303,headers:{Location:'https://wa.me/'+row.phone+'?text='+encodeURIComponent(message+schedule)}});
  }
  const match = path.match(/^\/reservations\/([\w-]+)$/);
  if (match && method === 'PATCH') {
    const input = await body(req), id = match[1];
    const transitions = new Map([['approved','pending'],['confirmed','approved'],['rejected','pending'],['cancelled','approved']]);
    const expected = transitions.get(input.status);
    if (!expected) fail(400,'Selecione uma ação válida.');
    const approving = input.status === 'approved', payment = clean(input.payment,2000);
    if (approving && !payment) fail(400,'Informe os dados de pagamento para o WhatsApp.');
    const condition = approving ? " AND day>=? AND EXISTS (SELECT 1 FROM reservation_dates d WHERE d.day=reservations.day AND d.open=1 AND "+fridaySql+" AND NOT EXISTS ("+weekendOccupancy+"))" : '';
    const args = [input.status,Number(approving),payment,user.id,id,expected,input.status === 'cancelled' ? 'confirmed' : expected];
    if (approving) args.push(localDay());
    const statement = db.prepare("UPDATE reservations SET status=?,payment=CASE WHEN ? THEN ? ELSE payment END,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND status IN (?,?)"+condition).bind(...args);
    const result = await statement.run();
    if (!result.meta.changes) fail(409,'Esta solicitação mudou ou a data já está indisponível. Atualize a lista.');
    await audit(user.id,'reserva_'+input.status,id);
    return json({ok:true});
  }
  fail(404,'Recurso não encontrado.');
}

function sessionToken(req, name) {
  const cookie = (req.headers.get('cookie') || '').split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='));
  const token = cookie?.slice(name.length+1) || '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}

async function staffForToken(db, tokenHash, now) {
  return db.prepare('SELECT u.id,u.username,u.name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').bind(tokenHash,now).first();
}

const reservationsCookie = (token, maxAge) =>
  'curio_booking_admin='+token+'; Path=/reservarquarto; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;

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
  const token = sessionToken(req,'curio_session');
  if (!token) fail(401,'Entre para acessar a plataforma.');
  const tokenHash = await sha(token);
  const user = await staffForToken(db,tokenHash,now);
  if (!user) fail(401,'Entre para acessar a plataforma.');
  if (path==='/me' && method==='GET') {
    const {expires_at,...profile} = user;
    const headers = user.role==='admin' ? {'Set-Cookie':reservationsCookie(token,Math.ceil((expires_at-now)/1000))} : {};
    return json(profile,200,headers);
  }
  if(path==='/customers' || path.startsWith('/customers/') || path==='/reservations' || path.startsWith('/reservations/'))
    return manageReservations(req,db,path,user,audit);
  if(path==='/base-cities' && method==='GET'){
    if(user.role!=='admin')fail(403,'Somente administradores podem acessar os dados da base.');
    const rows=await db.prepare('SELECT city,state,COUNT(*) count FROM contacts GROUP BY city,state').all();
    return json(cityBreakdown(rows.results));
  }
  if(path==='/analytics' && method==='GET') {
    if(user.role!=='admin')fail(403,'Somente administradores podem acessar o painel.');
    const days=Math.min(90,Math.max(1,parseInt(new URL(req.url).searchParams.get('days'))||1));
    const today=new URL(req.url).searchParams.get('period')==='yesterday' ? new Date(Date.parse(localDay())-86400000).toISOString().slice(0,10) : localDay();
    const start=[new Date(Date.parse(today+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),'2026-11-16'].sort().at(-1);
    const rows=await db.prepare("SELECT day,SUM(acessos) acessos,SUM(whatsapp) whatsapp FROM (SELECT day,COUNT(*) acessos,0 whatsapp FROM homepage_visits WHERE day>=? AND day<=? GROUP BY day UNION ALL SELECT day,0 acessos,count whatsapp FROM homepage_metrics WHERE day>=? AND day<=? AND kind='whatsapp') GROUP BY day ORDER BY day DESC").bind(start,today,start,today).all();
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
  if(path==='/summary' && method==='GET') {
    const summary=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN COALESCE(i.status,'nao_contatado')='nao_contatado' AND c.phone<>'' AND c.active=1 AND c.opted_out=0 THEN 1 ELSE 0 END) principal,SUM(CASE WHEN i.status='aguardando' THEN 1 ELSE 0 END) pendentes,SUM(CASE WHEN i.status='interessado' THEN 1 ELSE 0 END) interessados,SUM(CASE WHEN i.status='reserva_realizada' THEN 1 ELSE 0 END) reservas,SUM(CASE WHEN i.status='sem_interesse' THEN 1 ELSE 0 END) sem_interesse,SUM(CASE WHEN i.status='sem_resposta' THEN 1 ELSE 0 END) sem_resposta,SUM(CASE WHEN c.phone='' OR c.active=0 OR c.opted_out=1 THEN 1 ELSE 0 END) indisponiveis"+latestJoin).first();
    const years=await db.prepare("SELECT DISTINCT substr(registered_at,1,4) year FROM contacts WHERE length(registered_at)>=4 AND substr(registered_at,1,4) GLOB '[0-9][0-9][0-9][0-9]' ORDER BY year DESC").all();
    return json({...summary,registration_years:years.results.map(row=>row.year)});
  }
  if(path==='/queue' && method==='GET') {
    const url=new URL(req.url),tab=url.searchParams.get('tab')||'principal',q=clean(url.searchParams.get('q'),100),year=clean(url.searchParams.get('year'),4),requestedPage=Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1));
    const groups={principal:"COALESCE(i.status,'nao_contatado')='nao_contatado' AND c.phone<>'' AND c.active=1 AND c.opted_out=0",pendentes:"i.status='aguardando'",interessados:"i.status='interessado'",sem_interesse:"i.status='sem_interesse'",sem_resposta:"i.status='sem_resposta'",reservas:"i.status='reserva_realizada'"};
    groups.aniversariantes=groups.principal+" AND substr(c.birth_date,6,2)=? AND c.birth_date<=?";
    if(!groups[tab]) fail(400,'Área inválida.');
    const args=[],conditions=[groups[tab]];
    const calendarParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
    if(tab==='aniversariantes')args.push(calendarParts.month,`${calendarParts.year}-${calendarParts.month}-${calendarParts.day}`);
    if(q){conditions.push('(c.name LIKE ? OR c.city LIKE ?)');args.push('%'+q+'%','%'+q+'%');}if(year){if(!/^\d{4}$/.test(year))fail(400,'Selecione um ano de cadastro válido.');conditions.push('substr(c.registered_at,1,4)=?');args.push(year);}
    const from=latestJoin+' WHERE '+conditions.join(' AND ');
    const total=await db.prepare('SELECT COUNT(*) total'+from).bind(...args).first();
    const pageSize=10,pages=Math.ceil(total.total/pageSize),page=Math.min(requestedPage,Math.max(1,pages));
    const rows=await db.prepare("SELECT c.id,c.name,c.city,c.state,c.registered_at,c.occupation,c.birth_date,c.opted_out,COALESCE(i.status,'nao_contatado') status,i.campaign_id,i.sent_at,COALESCE(i.notes,'') notes"+from+' ORDER BY c.registered_at ASC,c.name COLLATE NOCASE,c.id LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all();
    const first=rows.results.length?(page-1)*pageSize+1:0,last=first?first+rows.results.length-1:0;
    return json({rows:rows.results.map(({birth_date,...row})=>({...row,age:ageOnDate(birth_date)})),total:total.total,page,pages,page_size:pageSize,from:first,to:last,month:calendarParts.month});
  }
  if(path==='/contact' && method==='GET') {
    const id=clean(new URL(req.url).searchParams.get('id'),80);
    const c=await db.prepare('SELECT phone,active,opted_out FROM contacts WHERE id=?').bind(id).first();
    if(!c||!c.phone||!c.active||c.opted_out)fail(404,'Este contato não está disponível.');
    await audit(user.id,'abriu_contato',id);
    return new Response(null,{status:303,headers:{Location:'https://wa.me/'+c.phone,'Cache-Control':'no-store'}});
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
    const reservationFromInterest=b.status==='reserva_realizada'&&latest?.status==='interessado';
    if(!latest||(latest.status!=='aguardando'&&!reservationFromInterest))fail(409,'Este hóspede não está pendente de retorno ou não está na etapa de interesse. Atualize a lista.');
    const expectedStatus=reservationFromInterest?'interessado':'aguardando';
    const result=await db.prepare("UPDATE interactions SET status=?,notes=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE rowid=? AND status=?").bind(b.status,clean(b.notes,2000),user.id,latest.rowid,expectedStatus).run();
    if(Number(result.meta?.changes??result.changes)!==1)fail(409,'Resultado já atualizado por outra pessoa.');
    await audit(user.id,reservationFromInterest?'marcou_reserva_realizada':'registrou_resultado',clean(b.id,80));return json({ok:true});
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
    const rows=await db.prepare("SELECT c.id,c.name,c.city,c.state,c.registered_at,c.occupation,c.active,c.opted_out,COALESCE(i.status,'nao_contatado') status,i.sent_at,COALESCE(i.notes,'') notes"+from+' ORDER BY c.registered_at ASC,c.name COLLATE NOCASE,c.id LIMIT 40 OFFSET ?').bind(...args,(page-1)*40).all();
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
    const url = new URL(req.url), path = url.pathname;
    const legacyPage = { '/reserva':'/reservar/', '/reserva/':'/reservar/',
      '/gestaodereservaaa':'/reservarquarto/', '/gestaodereservaaa/':'/reservarquarto/' }[path];
    let response;
    try {
      if (legacyPage && ['GET','HEAD'].includes(req.method))
        response = Response.redirect(new URL(legacyPage+url.search,url),308);
      else if ((path==='/reservas' || path==='/reservas/') && ['GET','HEAD'].includes(req.method))
        response = await env.ASSETS.fetch(new Request(new URL('/reservar/'+url.search,url),req));
      else if (path==='/reservarquarto' || path.startsWith('/reservarquarto/')) {
        const token = sessionToken(req,'curio_booking_admin');
        const user = env.DB && token ? await staffForToken(env.DB,await sha(token),Date.now()) : null;
        if (!user) response = Response.redirect(new URL('/campanhas/?continuar=reservarquarto',url),303);
        else if (user.role !== 'admin') fail(403,'Somente administradores podem acessar a gestão de reservas.');
        else response = await env.ASSETS.fetch(req);
      }
      else if(path==='/api/metricas' && req.method==='POST') {
        if(req.headers.get('Origin')!==new URL(req.url).origin)fail(403,'Origem inválida.');
        const b=await body(req);
        if(!['visita','whatsapp'].includes(b.kind))fail(400,'Evento inválido.');
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
      else if(path.startsWith('/api/reserva/')) response=await publicReservations(req,env,path.slice('/api/reserva'.length));
      else if(path.startsWith('/api/campanhas/')) response=await api(req,env,path.slice('/api/campanhas'.length));
      else if(['/usuarios','/usuarios/','/mensagens','/mensagens/'].includes(path))response=await env.ASSETS.fetch(new Request(new URL('/campanhas/',req.url),req));
      else if(path.startsWith('/api/')) response=json({error:'Recurso não encontrado.'},404);
      else response=await env.ASSETS.fetch(req);
    } catch(e) { response=json({error:e.status ? e.message : 'Não foi possível concluir. Tente novamente.'},e.status || 500); }
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');
    if(['/campanhas','/painel','/usuarios','/mensagens','/clientes','/reservas','/reserva','/reservar','/gestaodereservaaa','/reservarquarto','/api/'].some(p=>path.startsWith(p))) {
      headers.set('Cache-Control','no-store');
      headers.set('Referrer-Policy','no-referrer');
      headers.set('X-Robots-Tag','noindex');
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://wa.me https://*.whatsapp.com");
    }
    return new Response(response.body,{status:response.status,headers});
  }
};
