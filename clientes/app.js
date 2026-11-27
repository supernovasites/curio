import {renderHeader} from '/campanhas/nav.js?v=20261127-campaign-notification';
import {guestForm} from '/cadastro/form.js?v=20261127-stay-navigation';
const $=selector=>document.querySelector(selector);
let approvalPage=1,customerPage=1,customerQuery='',approvalsVersion=0,customersVersion=0;
function message(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error);}
async function api(path,method='GET',data){
 const response=await fetch('/api/campanhas'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 if(response.status===401){location.replace('/campanhas/?continuar=clientes');throw Error('Entre para acessar a página de clientes.');}
 const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível concluir.');return result;
}
function pagination(root,data,load){root.replaceChildren();for(const step of [-1,0,1]){const node=document.createElement(step?'button':'span');if(!step)node.textContent=`${data.total} cadastro(s) · página ${data.page} de ${data.pages}`;else{node.type='button';node.className='secondary';node.textContent=step<0?'Anterior':'Próxima';node.disabled=step<0?data.page<=1:data.page>=data.pages;node.onclick=()=>load(data.page+step).catch(error=>message(error.message,true));}root.append(node);}}
function lazyEditor(root,row,{approval=false}={}){
 const details=document.createElement('details');details.className='customer-editor';const summary=document.createElement('summary');summary.textContent=row.name+(approval?' · '+row.entry_date.split('-').reverse().join('/')+' a '+row.exit_date.split('-').reverse().join('/'):row.active===0?' · Inativo':'');
 const content=document.createElement('div');content.className='guest-edit-placeholder';details.append(summary,content);root.append(details);let loaded=false,loading=false;
 details.addEventListener('toggle',async()=>{
  if(!details.open||loaded||loading)return;loading=true;content.textContent='Carregando cadastro…';
  try{
   const profile=await api(approval?'/guest-registrations/'+row.id:'/guest-profiles/'+row.id);content.replaceChildren();const form=document.createElement('form');content.append(form);
   guestForm(form,profile,{onSave:async data=>{await api(approval?'/guest-registrations/'+row.id:'/guest-profiles/'+row.id,'PATCH',data);message('Cadastro atualizado.');await Promise.all([loadApprovals(approvalPage),loadCustomers(customerPage)]);}});
   if(approval&&profile.status==='pending'){
    const actions=document.createElement('div');actions.className='approval-actions';
    for(const [action,label,style] of [['approve','Aprovar cadastro','primary'],['reject','Recusar cadastro','secondary']]){
     const button=document.createElement('button');button.type='button';button.textContent=label;button.className=style;
     button.onclick=async()=>{button.disabled=true;try{if(form.dataset.dirty==='true'){message('Salve as alterações antes de revisar este cadastro.',true);return;}await api('/guest-registrations/'+row.id+'/'+action,'POST',{version:profile.version});message(action==='approve'?'Cadastro aprovado e incluído em Clientes.':'Cadastro recusado.');await Promise.all([loadApprovals(approvalPage),loadCustomers(customerPage)]);}catch(error){message(error.message,true);}finally{button.disabled=false;}};actions.append(button);
    }
    form.addEventListener('input',()=>{form.dataset.dirty='true';});form.addEventListener('click',event=>{if(event.target.closest('.guest-companions button'))form.dataset.dirty='true';});content.append(actions);
   }
   loaded=true;
  }catch(error){content.textContent=error.message;message(error.message,true);}finally{loading=false;}
 });
}
async function loadApprovals(page=1){const seq=++approvalsVersion;const data=await api('/guest-registrations?'+new URLSearchParams({status:$('#approval-filter').value,page}));if(seq!==approvalsVersion)return;approvalPage=data.page;const root=$('#approval-list');root.replaceChildren();if(!data.rows.length)root.textContent='Nenhum cadastro nesta situação.';for(const row of data.rows)lazyEditor(root,row,{approval:true});pagination($('#approval-pages'),data,loadApprovals);}
async function loadCustomers(page=1){const seq=++customersVersion;const data=await api('/customers/search','POST',{q:customerQuery,page});if(seq!==customersVersion)return;customerPage=data.page;const root=$('#customer-list');root.replaceChildren();if(!data.rows.length)root.textContent='Nenhum cliente encontrado.';for(const row of data.rows)lazyEditor(root,row);pagination($('#customer-pages'),data,loadCustomers);}
$('#approval-filter').onchange=()=>loadApprovals().catch(error=>message(error.message,true));
$('#customer-search').onsubmit=event=>{event.preventDefault();customerQuery=event.target.elements.q.value;loadCustomers().catch(error=>message(error.message,true));};
$('#customer-search').onreset=()=>{customerQuery='';loadCustomers().catch(error=>message(error.message,true));};
guestForm($('#manual-guest-form'),{},{onSave:async data=>{await api('/guest-registrations','POST',data);message('Cliente cadastrado pela administração.');$('#manual-guest-form').reset();await Promise.all([loadCustomers(),loadApprovals()]);}});
async function start(){const user=await api('/me');if(user.role!=='admin')throw Error('Somente administradores podem acessar Clientes.');renderHeader(user,'clientes');$('.app-header').hidden=false;$('#logout').onclick=async()=>{await api('/logout','POST',{});location.replace('/campanhas/');};$('#customer-platform').hidden=false;await Promise.all([loadApprovals(),loadCustomers()]);message('');}
start().catch(error=>message(error.message,true));
