const toggle=document.getElementById('availability-toggle');
const form=document.getElementById('availability-form');
let requestKey=crypto.randomUUID();
toggle.addEventListener('click',()=>{
 const open=form.hidden;
 form.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
 if(open)form.elements.name.focus({preventScroll:true});
});
form.addEventListener('input',()=>{requestKey=crypto.randomUUID();});
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter,status=document.getElementById('availability-status');
 button.disabled=true;status.textContent='Salvando seu pedido…';
 try{
  const response=await fetch('/api/disponibilidade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),request_key:requestKey})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível salvar. Tente novamente.');
  status.replaceChildren(document.createTextNode('Pedido salvo. '));
  const link=document.createElement('a');link.href=data.whatsapp_url;link.textContent='Continuar no WhatsApp';status.append(link);
  fetch('/api/metricas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'whatsapp'}),keepalive:true}).catch(()=>{});
  window.location.assign(data.whatsapp_url);
 }catch(error){status.textContent=error.message;}
 finally{button.disabled=false;}
});
