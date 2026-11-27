import {ageOnDate} from '/campanhas/age.js';
import {validCpf,maskCpf} from '/reservar/identity.js';
import {bindDateInput,dateToIso,maskDate,sundayCheckout} from '/assets/date-mask.js?v=20261127-friday-checkout';
export function guestForm(form,profile={}, {publicForm=false,onSave}={}){
 form.classList.add('guest-registration-form');
 form.innerHTML=`<div class="guest-fields">
 <label>Data de Entrada · sexta-feira *<input name="entry_date" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" required></label>
 <label>Saída automática · domingo às 15h<input name="exit_date" type="text" placeholder="Preenchida após a entrada" readonly></label>
 <label class="wide">Nome completo *<input name="name" autocomplete="name" maxlength="120" required></label>
 <label>Data de Nascimento *<input name="birth_date" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" autocomplete="bday" required></label>
 ${publicForm?'':'<label>Idade<input name="age" readonly aria-describedby="age-help"></label>'}
 <label>CPF *<input name="cpf" inputmode="numeric" maxlength="14" required></label>
 <label>RG *<input name="rg" maxlength="30" required></label>
 <label class="wide">Profissão *<input name="occupation" maxlength="120" required></label></div>
 ${publicForm?'':'<p id="age-help" class="help">A idade é calculada pela data de nascimento.</p>'}
 <details class="guest-companions"><summary>Acompanhantes <span class="companion-count"></span></summary>
 <div class="companion-list"></div><div class="companion-editor" hidden>
 <label>Nome *<input data-companion="name" maxlength="120"></label>
 <label>CPF *<input data-companion="cpf" inputmode="numeric" maxlength="14"></label>
 <label>RG *<input data-companion="rg" maxlength="30"></label>
 <label>Idade *<input data-companion="age" type="number" min="0" max="125" step="1"></label>
 <p class="companion-error error" role="alert"></p>
 <div class="dialog-actions"><button type="button" class="secondary" data-cancel-companion>Cancelar</button><button type="button" class="primary" data-save-companion>Salvar acompanhante</button></div></div>
 <button type="button" class="secondary" data-add-companion>Adicionar acompanhante</button></details>
 <label>Restrições alimentares<textarea name="dietary_restrictions" rows="3" maxlength="2000" placeholder="Informe alergias, intolerâncias ou outras restrições alimentares."></textarea></label>
 <label>Observações<textarea name="notes" rows="3" maxlength="2000"></textarea></label>
 ${publicForm?'<p class="help">Seus dados serão usados pela Fazenda Curió para revisar o cadastro e organizar a hospedagem. O envio não confirma uma reserva.</p>':''}
 <p class="form-status" role="status" aria-live="polite"></p>
 <button type="submit" class="primary">${publicForm?'Enviar cadastro para aprovação':profile.id||profile.contact_id?'Salvar cadastro':'Cadastrar cliente'}</button>`;
 const field=name=>form.elements[name],status=form.querySelector('.form-status');
 const ageHelp=form.querySelector('#age-help');if(ageHelp){ageHelp.id='age-help-'+crypto.randomUUID();field('age').setAttribute('aria-describedby',ageHelp.id);}
 for(const name of ['entry_date','exit_date','name','birth_date','cpf','rg','occupation','dietary_restrictions','notes'])field(name).value=profile[name]||'';
 for(const name of ['entry_date','birth_date'])bindDateInput(field(name));
 const updateExit=()=>{const exit=sundayCheckout(dateToIso(field('entry_date').value));field('exit_date').value=maskDate(exit);field('entry_date').setCustomValidity(field('entry_date').value.length===10&&!exit?'A entrada deve ser uma sexta-feira válida.':'');};updateExit();field('entry_date').addEventListener('input',updateExit);
 const updateAge=()=>{if(field('age'))field('age').value=ageOnDate(dateToIso(field('birth_date').value))??'';};updateAge();field('birth_date').oninput=updateAge;
 const cpfMask=input=>{input.addEventListener('input',()=>{input.value=maskCpf(input.value);input.setCustomValidity('');});};cpfMask(field('cpf'));
 const editor=form.querySelector('.companion-editor'),add=form.querySelector('[data-add-companion]'),list=form.querySelector('.companion-list'),error=form.querySelector('.companion-error');
 let companions=(profile.companions||[]).map(c=>({...c})),editing=-1,saving=false;
 const inputs=[...editor.querySelectorAll('[data-companion]')];cpfMask(inputs.find(i=>i.dataset.companion==='cpf'));
 function closeEditor(){editor.hidden=true;add.hidden=false;editing=-1;error.textContent='';inputs.forEach(input=>input.value='');}
 function openEditor(index=-1){editing=index;const data=companions[index]||{};inputs.forEach(input=>input.value=data[input.dataset.companion]??'');error.textContent='';editor.hidden=false;add.hidden=true;inputs[0].focus();}
 function renderCompanions(){list.replaceChildren();form.querySelector('.companion-count').textContent=companions.length?'('+companions.length+')':'';
  companions.forEach((person,index)=>{const row=document.createElement('div');row.className='companion-saved';const text=document.createElement('span');text.textContent=person.name+' · '+person.age+' anos';const edit=document.createElement('button');edit.type='button';edit.className='secondary';edit.textContent='Editar';edit.onclick=()=>{if(!editor.hidden){error.textContent='Salve ou cancele o acompanhante atual primeiro.';return;}openEditor(index);};const remove=document.createElement('button');remove.type='button';remove.className='text-btn';remove.textContent='Remover';remove.onclick=()=>{if(!editor.hidden){error.textContent='Salve ou cancele o acompanhante atual primeiro.';return;}companions.splice(index,1);renderCompanions();};row.append(text,edit,remove);list.append(row);});
  add.textContent=companions.length?'Adicionar outro acompanhante':'Adicionar acompanhante';add.disabled=companions.length>=20;
 }renderCompanions();
 add.onclick=()=>openEditor();form.querySelector('[data-cancel-companion]').onclick=closeEditor;
 form.querySelector('[data-save-companion]').onclick=()=>{
  const person=Object.fromEntries(inputs.map(input=>[input.dataset.companion,input.value.trim()]));person.cpf=person.cpf.replace(/\D/g,'');
  if(!person.name||!person.rg||!validCpf(person.cpf)||person.age===''||!Number.isInteger(Number(person.age))||Number(person.age)<0||Number(person.age)>125){error.textContent='Preencha nome, CPF válido, RG e idade de 0 a 125 anos.';return;}
  if(companions.some((c,index)=>index!==editing&&c.cpf===person.cpf)){error.textContent='Este CPF já foi adicionado como acompanhante.';return;}
  person.age=Number(person.age);if(editing<0)companions.push(person);else companions[editing]=person;closeEditor();renderCompanions();add.focus();
 };
 let requestKey=crypto.randomUUID();form.addEventListener('input',()=>{requestKey=crypto.randomUUID();});
 form.addEventListener('reset',()=>{companions=[];closeEditor();renderCompanions();requestKey=crypto.randomUUID();queueMicrotask(()=>{updateAge();updateExit();});});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving)return;status.classList.remove('error');status.textContent='';
  const data=Object.fromEntries(new FormData(form));data.cpf=data.cpf.replace(/\D/g,'');
  for(const name of ['entry_date','birth_date']){
   data[name]=dateToIso(data[name]);
   if(!data[name]){field(name).setCustomValidity('Digite uma data válida no formato DD/MM/AAAA.');field(name).reportValidity();return;}
  }
  if(!validCpf(data.cpf)){field('cpf').setCustomValidity('Informe um CPF válido.');field('cpf').reportValidity();return;}
  if(!editor.hidden){status.textContent='Salve ou cancele o acompanhante atual antes de enviar o cadastro.';status.classList.add('error');return;}
  data.exit_date=sundayCheckout(data.entry_date);
  if(!data.exit_date){field('entry_date').setCustomValidity('A entrada deve ser uma sexta-feira. A saída será no domingo seguinte, às 15h.');field('entry_date').reportValidity();return;}
  if(companions.some(c=>c.cpf===data.cpf)){status.textContent='O CPF do titular não pode se repetir nos acompanhantes.';status.classList.add('error');return;}
  data.companions=companions;data.version=profile.version??0;data.request_key=requestKey;delete data.age;
  const button=event.submitter;saving=true;button.disabled=true;
  try{
   await onSave(data);status.textContent=publicForm?'Cadastro enviado. Aguarde a aprovação da administração.':'Cadastro salvo.';
   if(publicForm){
    // Remove submitted personal data from both visible and collapsed controls.
    form.querySelectorAll('input,textarea').forEach(input=>{input.value='';input.defaultValue='';});
    companions.length=0;
    const confirmation=document.createElement('div');confirmation.className='registration-confirmation';confirmation.setAttribute('role','status');confirmation.tabIndex=-1;
    const title=document.createElement('h2');title.textContent='Cadastro enviado';
    const description=document.createElement('p');description.textContent='Aguarde a aprovação da administração. Seus dados não ficam disponíveis para consulta nesta página pública.';
    const home=document.createElement('a');home.href='/';home.className='primary';home.textContent='Voltar ao site';
    confirmation.append(title,description,home);form.replaceChildren(confirmation);form.parentElement?.querySelector('.required-note')?.remove();confirmation.focus();
   }
  }
  catch(err){status.textContent=err.message;status.classList.add('error');}
  finally{saving=false;if(!publicForm||!status.textContent.startsWith('Cadastro enviado'))button.disabled=false;}
 });
}
