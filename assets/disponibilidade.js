import {maskPhone} from './phone-mask.js';
import {bindDateInput,dateToIso} from './date-mask.js';
const toggle=document.getElementById('availability-toggle');
const form=document.getElementById('availability-form');
const phone=form.elements.phone;
phone.addEventListener('input',()=>{
 const raw=phone.value,position=phone.selectionStart??raw.length;
 let count=raw.slice(0,position).replace(/\D/g,'').length;
 if(raw.replace(/\D/g,'').startsWith('55')&&raw.replace(/\D/g,'').length>11)count=Math.max(0,count-2);
 phone.value=maskPhone(raw);
 if(position<raw.length){let caret=0,seen=0;while(caret<phone.value.length&&seen<count){if(/\d/.test(phone.value[caret]))seen++;caret++;}phone.setSelectionRange(caret,caret);}
});
phone.addEventListener('blur',()=>{phone.value=maskPhone(phone.value);});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
bindDateInput(form.elements.stay_date);
let requestKey=crypto.randomUUID();
toggle.addEventListener('click',()=>{
 const open=form.hidden;
 form.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
 if(open)form.elements.name.focus({preventScroll:true});
});
form.addEventListener('input',()=>{requestKey=crypto.randomUUID();});
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter,status=document.getElementById('availability-status');
 const dataToSend={...Object.fromEntries(new FormData(form)),request_key:requestKey};dataToSend.stay_date=dateToIso(dataToSend.stay_date);
 if(!dataToSend.stay_date||dataToSend.stay_date<day){form.elements.stay_date.setCustomValidity('Digite uma data de hospedagem válida a partir de hoje, no formato DD/MM/AAAA.');form.elements.stay_date.reportValidity();return;}
 button.disabled=true;status.textContent='Salvando seu pedido…';
 try{
  const response=await fetch('/api/disponibilidade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dataToSend)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível salvar. Tente novamente.');
  status.replaceChildren(document.createTextNode('Pedido salvo. '));
  const link=document.createElement('a');link.href=data.whatsapp_url;link.textContent='Continuar no WhatsApp';status.append(link);
  fetch('/api/metricas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'whatsapp'}),keepalive:true}).catch(()=>{});
  window.location.assign(data.whatsapp_url);
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});
