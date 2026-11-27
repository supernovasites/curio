import '/campanhas/password.js';
import {renderHeader} from '/campanhas/nav.js?v=20261127-reservation-map';
const $=s=>document.querySelector(s);
async function api(path,options={}){const response=await fetch('/api/campanhas'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await response.json();if(!response.ok){if(response.status===401&&path!=='/login'){$('#loading-view').hidden=true;$('#platform').hidden=true;$('#login-view').hidden=false;}throw Object.assign(Error(data.error||'Não foi possível carregar.'),{status:response.status});}return data;}
const count = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
const rate = (clicks, visits) => visits ? percent.format(clicks/visits) : '—';
let loadVersion = 0;
async function load(){
  const version = ++loadVersion, period = $('#period').value;
  const query = /^\d+$/.test(period) ? 'days='+period : 'period='+period;
  const data = await api('/analytics?'+query);
  if(version !== loadVersion) return;
  const byDay = new Map(data.rows.map(row => [row.day,row]));
  const series = Array.from({length:data.days},(_,index)=>{
    const day = new Date(Date.parse(data.today)-index*86400000).toISOString().slice(0,10);
    return byDay.get(day) || {day,acessos:0,whatsapp:0};
  });
  const clicks = series.reduce((total,row)=>total+row.whatsapp,0);
  const stats = [['Acessos únicos',count.format(data.unique_visitors)],['Cliques de reserva no WhatsApp',count.format(clicks)],['Taxa de reserva WhatsApp por acesso',rate(clicks,data.unique_visitors)]];
  $('#dashboard').innerHTML = stats.map(([title,value])=>`<article class="metric"><span>${title}</span><strong>${value}</strong></article>`).join('');
  drawChart(series);
  $('#daily-rows').innerHTML = series.map(row=>`<tr><td>${row.day.split('-').reverse().join('/')}</td><td>${count.format(row.acessos)}</td><td>${count.format(row.whatsapp)}</td><td>${rate(row.whatsapp,row.acessos)}</td></tr>`).join('');
  $('#updated').textContent = 'Atualizado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'})+'. Horário de Fortaleza.';
}
async function start(){const user=await api('/me');$('#loading-view').hidden=true;renderHeader(user,'painel');$('#login-view').hidden=true;$('#platform').hidden=false;if(user.role!=='admin'){$('#panel-content').hidden=true;$('#access-error').hidden=false;return;}await Promise.all([load(),loadCities()]);}
$('#login-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;$('#login-error').textContent='';try{const f=new FormData(e.target);await api('/login',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});e.target.reset();await start();}catch(err){$('#login-error').textContent=err.message;}finally{e.submitter.disabled=false;}};
document.addEventListener('click',async e=>{if(e.target.closest('#logout')){await api('/logout',{method:'POST',body:'{}'});location.reload();}});
async function reload(){try{$('#refresh').disabled=true;await Promise.all([load(),loadCities()]);$('#panel-error').textContent='';}catch(err){$('#panel-error').textContent=err.message;}finally{$('#refresh').disabled=false;}}
$('#period').value='7';
$('#city-details').ontoggle=()=>{if($('#city-details').open)loadCities().catch(err=>{$('#city-summary').textContent=err.message;});};
$('#period').onchange=reload;$('#refresh').onclick=reload;
start().catch(err=>{$('#loading-view').hidden=true;if(err.status===401||$('#platform').hidden){$('#platform').hidden=true;$('#login-view').hidden=false;if(err.status!==401)$('#login-error').textContent=err.message;}else $('#panel-error').textContent=err.message;});
function drawChart(series){
  const daily=[...series],width=Math.max(320,daily.length*56+72),left=44,right=18,top=30,bottom=222,plot=width-left-right;
  const maximum=Math.max(1,...daily.map(r=>Number(r.acessos)||0)),levels=Math.min(4,maximum),step=Math.ceil(maximum/levels),ceiling=step*levels;
  const grid=Array.from({length:levels+1},(_,index)=>{const value=index*step,y=bottom-(value/ceiling)*(bottom-top);return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text class="chart-axis-label" x="${left-10}" y="${y+4}" text-anchor="end">${value}</text>`;}).join('');
  const bars=daily.map((r,index)=>{const value=Number(r.acessos)||0,slot=plot/daily.length,x=left+slot*(index+.5),height=value/ceiling*(bottom-top),barWidth=Math.min(34,slot*.6),date=r.day.slice(5).split('-').reverse().join('/');const contacts=Number(r.contatos)||0,segment=contacts?Math.max(18,Math.min(height,contacts/ceiling*(bottom-top))):0;return `<g><title>${date}: ${value} acessos únicos; ${contacts} ${r.contatos_origem==='whatsapp_historico'?'contatos por clique no WhatsApp':'contatos salvos na homepage'}</title><rect class="chart-bar" x="${x-barWidth/2}" y="${bottom-height}" width="${barWidth}" height="${height}" rx="3"/><rect x="${x-barWidth/2}" y="${bottom-segment}" width="${barWidth}" height="${segment}" fill="#0b2418"/>${contacts?`<text x="${x}" y="${bottom-segment/2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="12" font-weight="700">${contacts}</text>`:''}<text class="chart-value" x="${x}" y="${bottom-height-8}" text-anchor="middle">${value}</text><text class="chart-axis-label" x="${x}" y="${bottom+24}" text-anchor="middle">${date}</text></g>`;}).join('');
  $('#daily-chart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Acessos únicos por dia, com a quantidade em cada barra" width="${width}" height="280" viewBox="0 0 ${width} 280"><title>Acessos únicos por dia</title><desc>Dias mais recentes à esquerda. Uma barra para cada dia. Os números acima indicam acessos únicos. A parte verde-escura indica contatos salvos na homepage; segmentos pequenos têm altura mínima para permitir a leitura.</desc>${grid}${bars}</svg>`;
}

async function loadCities(){const d=await api('/base-cities'),escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));$('#city-summary').textContent=Number(d.total).toLocaleString('pt-BR')+' clientes cadastrados. '+Number(d.missing).toLocaleString('pt-BR')+' sem cidade informada.';$('#city-rows').innerHTML=d.rows.length?d.rows.map(r=>`<tr><td><strong>${escapeHtml(r.city)}</strong>${r.missing?'':`<small class="city-state">${escapeHtml(r.state||'UF não informada')}</small>`}</td><td>${Number(r.count).toLocaleString('pt-BR')}</td><td>${Number(r.percentage).toLocaleString('pt-BR',{maximumFractionDigits:1})}%</td></tr>`).join(''):'<tr><td colspan="3">Nenhum cliente cadastrado.</td></tr>';}
