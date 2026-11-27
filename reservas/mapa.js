import {renderHeader} from '/campanhas/nav.js?v=20261127-campaign-notification';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const addDays=(day,count)=>new Date(Date.parse(day+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);
const formatDay=day=>day.split('-').reverse().join('/');
const weekday=day=>new Date(day+'T12:00:00Z').getUTCDay();
const friday=day=>addDays(day,-((weekday(day)+2)%7));
const statusLabel={approved:'Aprovada',confirmed:'Confirmada'};
let month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit'}).format(new Date()),snapshot=null,version=0;
const dialog=$('#map-dialog');let dialogTrigger=null;
async function api(path,options={}){const response=await fetch('/api/campanhas'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});if(response.status===401){location.replace('/campanhas/?continuar=mapa');throw Error('Entre para acessar o mapa.');}const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível carregar o mapa.');return data;}
function detail(row,trigger){dialogTrigger=trigger;const room=snapshot.rooms.find(room=>room.id===row.room_id);$('#map-dialog-content').innerHTML=`<h2>${escape(row.name)}</h2><p>${escape(room?.name||'Quarto não definido')}</p><dl><dt>Entrada</dt><dd>${formatDay(row.day)} · 15h</dd><dt>Saída</dt><dd>${formatDay(addDays(row.day,2))} · 15h</dd><dt>Situação</dt><dd>${statusLabel[row.status]}</dd></dl>`;dialog.showModal();}
$('#close-map-dialog').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('close',()=>dialogTrigger?.focus({preventScroll:true}));
function render(){
 const data=snapshot,start=month+'-01',days=[],date=new Date(start+'T12:00:00Z');
 while(date.toISOString().startsWith(month)){if(![2,3,4].includes(date.getUTCDay()))days.push(date.toISOString().slice(0,10));date.setUTCDate(date.getUTCDate()+1);}
 const opened=new Map(data.dates.map(row=>[row.day,Boolean(row.open)]));
 const rooms=[...data.rooms];if(data.reservations.some(row=>!row.room_id))rooms.push({id:null,name:'Sem quarto definido',stock:0});
 const dayName=new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'});
 $('#map-month').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z'));
 $('#map-summary').textContent=`${data.rooms.length} quartos · ${data.reservations.length} reservas aprovadas ou confirmadas no período`;
 const header='<thead><tr><th class="map-room-heading" scope="col">Quartos</th>'+days.map(day=>`<th scope="col" data-day="${day}" class="${day===data.today?'is-today':''}"><span>${escape(dayName.format(new Date(day+'T12:00:00Z')))}</span><strong>${day.slice(8)}</strong><small>${day.slice(5,7)}</small></th>`).join('')+'</tr></thead>';
 const body=rooms.map(room=>'<tr><th scope="row" class="map-room-name">'+escape(room.name)+(room.id?`<small>${room.stock} ${room.stock===1?'unidade':'unidades'} · até ${room.capacity} pessoas</small>`:'')+'</th>'+days.map(day=>{
  const bookings=data.reservations.filter(row=>row.room_id===room.id&&row.day<=day&&addDays(row.day,2)>=day);
  const holding=data.holds.filter(row=>row.day<=day&&addDays(row.day,2)>=day);
  const hasLegacy=holding.some(row=>!row.room_id),used=holding.filter(row=>row.room_id===room.id).reduce((count,row)=>count+Number(row.count),0),free=Math.max(0,Number(room.stock)-used);
  const available=room.id&&[0,5,6].includes(weekday(day))&&opened.get(friday(day))&&day>=data.today&&!hasLegacy&&free>0;
  const pending=holding.some(row=>row.room_id===room.id)&&!bookings.length;
  if(bookings.length)return `<td class="map-booked ${bookings.some(row=>row.status==='confirmed')?'map-confirmed':'map-approved'}">`+bookings.map(row=>`<button type="button" class="map-guest" data-reservation="${escape(row.id)}" title="${escape(row.name)} · ${statusLabel[row.status]}">${escape(row.name)}</button>`).join('')+(available?`<small>${free} livre</small>`:'')+'</td>';
  if(available)return `<td class="map-free"><span>${free>1?free+' livres':'Livre'}</span></td>`;
  if(pending)return '<td class="map-pending"><span>Em análise</span></td>';
  return '<td class="map-blocked"><span>—</span></td>';
 }).join('')+'</tr>').join('');
 $('#reservation-map').innerHTML='<caption class="sr-only">Mapa mensal de quartos e reservas. A saída acontece no domingo, às 15h.</caption>'+header+'<tbody>'+body+'</tbody>';
 $('#reservation-map').querySelectorAll('[data-reservation]').forEach(button=>button.onclick=()=>detail(data.reservations.find(row=>row.id===button.dataset.reservation),button));
 const current=$('#reservation-map').querySelector('[data-day="'+data.today+'"]');$('#map-scroll').scrollLeft=current?Math.max(0,current.offsetLeft-190):0;
}
async function load(){const current=++version;$('#map-status').textContent='Atualizando…';$('#refresh-map').disabled=true;try{const data=await api('/reservations/map?'+new URLSearchParams({month}));if(current!==version)return;snapshot=data;render();$('#map-content').hidden=false;$('#map-status').textContent='';}catch(error){$('#map-status').textContent=error.message;$('#map-status').classList.add('error');}finally{if(current===version)$('#refresh-map').disabled=false;}}
function moveMonth(step){const next=new Date(month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+step);month=next.toISOString().slice(0,7);load();}
$('#previous-month').onclick=()=>moveMonth(-1);$('#next-month').onclick=()=>moveMonth(1);$('#current-month').onclick=()=>{month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit'}).format(new Date());load();};$('#refresh-map').onclick=load;
async function start(){const user=await api('/me');if(user.role!=='admin')throw Error('Somente administradores podem acessar o mapa de reservas.');renderHeader(user,'mapa');$('.app-header').hidden=false;$('#logout').onclick=async()=>{await api('/logout',{method:'POST',body:'{}'});location.replace('/campanhas/');};await load();}
start().catch(error=>{$('#map-status').textContent=error.message;$('#map-status').classList.add('error');});
