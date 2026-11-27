import {renderHeader} from '/campanhas/nav.js?v=20261127-reservation-map';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let messages=[],selected='',status='novo',page=1,pages=1,sequence=0,rows=[];
const drafts=new Map();
function notify(text){$('#notice').textContent=text;$('#notice').hidden=false;}
async function api(path,options={}){
 const res=await fetch('/api/campanhas'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
 if(res.status===401){location.replace('/campanhas/?continuar=retorno');throw Error('Entre para acessar.');}
 const data=await res.json();if(!res.ok)throw Error(data.error||'Não foi possível concluir.');return data;
}
const send=(path,data,method='POST')=>api(path,{method,body:JSON.stringify(data)});
const protect=fn=>async event=>{try{await fn(event);}catch(error){notify(error.message);}};
function messageFor(row){return drafts.get(selected+':'+row.id)??(messages.find(m=>m.id===selected)?.message||'Olá, {nome}! Recebemos seu pedido de disponibilidade. Vamos conversar sobre sua hospedagem?').replaceAll('{nome}',row.name.split(/\s+/)[0]);}
function renderRows(){
 $('#contact-list').innerHTML=rows.length?rows.map(row=>`<article class="guest"><button class="guest-name" aria-expanded="false" aria-controls="lead-${escape(row.id)}"><span class="guest-identity"><strong>${escape(row.name)}</strong><span class="return-meta"><span>Cidade: ${escape(row.city)}</span></span><span class="return-state">${row.status==='novo'?'Novo pedido':'WhatsApp aberto'}</span></span></button><div class="guest-details" id="lead-${escape(row.id)}" hidden><form class="return-send" method="POST" action="/api/campanhas/return-dispatch" target="_blank" rel="noopener"><input type="hidden" name="id" value="${escape(row.id)}"><label>Mensagem para este cliente<textarea name="message" class="return-message" rows="5" maxlength="4000" required data-draft="${escape(selected+':'+row.id)}">${escape(messageFor(row))}</textarea></label><button type="submit" class="primary">Enviar mensagem pelo WhatsApp</button></form></div></article>`).join(''):'<p class="empty">Nenhum pedido nesta lista.</p>';
}
async function contacts(){
 const current=++sequence;const data=await api('/return-leads?'+new URLSearchParams({status,page,q:$('#search').value}));if(current!==sequence)return;
 rows=data.rows;page=data.page;pages=data.pages;renderRows();$('#contact-count').textContent=data.total+' '+(data.total===1?'pedido':'pedidos');$('#page-label').textContent=`Página ${page} de ${pages}`;$('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
}
async function loadMessages(){
 messages=await api('/campaigns');if(!messages.some(m=>m.id===selected))selected=messages[0]?.id||'';
 $('#message-select').replaceChildren(new Option('Mensagem de disponibilidade padrão',''),...messages.map(m=>new Option(m.name,m.id)));$('#message-select').value=selected;
 $('#saved-messages').innerHTML=messages.map(m=>`<article class="saved-message card"><h3>${escape(m.name)}</h3><p>${escape(m.message)}</p><button class="secondary" data-edit="${escape(m.id)}">Editar mensagem</button></article>`).join('')||'<p>Nenhuma mensagem salva.</p>';
}
document.addEventListener('click',protect(async event=>{
 if(event.target.closest('#logout')){await send('/logout',{});location.replace('/campanhas/');return;}
 const tab=event.target.closest('[data-status]');if(tab){status=tab.dataset.status;page=1;document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b===tab)));await contacts();}
 const guest=event.target.closest('.guest-name');if(guest){const open=guest.getAttribute('aria-expanded')!=='true';guest.setAttribute('aria-expanded',String(open));guest.nextElementSibling.hidden=!open;}
 const edit=event.target.closest('[data-edit]');if(edit){const m=messages.find(m=>m.id===edit.dataset.edit),f=$('#message-form');f.elements.id.value=m.id;f.elements.name.value=m.name;f.elements.message.value=m.message;$('#message-editor').open=true;f.elements.name.focus();}
}));
$('#contact-list').addEventListener('input',event=>{if(event.target.matches('[data-draft]'))drafts.set(event.target.dataset.draft,event.target.value);});
$('#contact-list').addEventListener('submit',event=>{
 const form=event.target;if(!form.matches('.return-send'))return;const button=event.submitter;setTimeout(()=>button.disabled=true,0);
 // This form opens WhatsApp in another tab; refresh the recorded state without sending messages.
 let attempts=0;const poll=async()=>{try{await contacts();}catch{}if(++attempts<3)setTimeout(poll,1000);else button.disabled=false;};setTimeout(poll,800);
});
$('#message-select').onchange=event=>{selected=event.target.value;renderRows();};
let timer;$('#search').oninput=()=>{clearTimeout(timer);timer=setTimeout(protect(async()=>{page=1;await contacts();}),250);};
$('#prev').onclick=protect(async()=>{page--;await contacts();});$('#next').onclick=protect(async()=>{page++;await contacts();});
$('#clear-message').onclick=()=>{const form=$('#message-form');form.reset();form.elements.id.value='';form.elements.name.focus();};
$('#message-form').onsubmit=protect(async event=>{
 event.preventDefault();const form=event.target,button=event.submitter,id=form.elements.id.value;button.disabled=true;
 try{const result=await send('/campaigns'+(id?'/'+id:''),{name:form.elements.name.value,message:form.elements.message.value},id?'PATCH':'POST');selected=id||result.id;form.reset();form.elements.id.value='';await loadMessages();renderRows();notify('Mensagem salva e disponível para os próximos contatos.');}finally{button.disabled=false;}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')contacts().catch(error=>notify(error.message));});
async function start(){const user=await api('/me');renderHeader(user,'retorno');await loadMessages();await contacts();$('#loading').hidden=true;$('#platform').hidden=false;}
start().catch(error=>{$('#loading').textContent='Não foi possível carregar. Atualize a página para tentar novamente.';notify(error.message);});
