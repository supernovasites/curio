import {$, api, weekendLabel, reservationLabel, statuses, message, onSubmit, list, monthlyCalendar, roomPicker, quoteLine, today} from './common.js';
import {validCpf, maskCpf, maskBirth, birthIso} from './identity.js';

const reserve = (path,method,data) => api('/api/reserva',path,method,data);
let dates = new Set(), selected = '', account = null, accountVersion = 0;
let roomVersion = 0;
const picker = roomPicker($('#room-picker'),showSelection);
const renderCalendar = monthlyCalendar($('#calendar'), day => dates.has(day) ? {
  label:'Disponível',state:'available',disabled:!account,selected:day===selected
} : null, day => { selected = day; loadRooms().catch(error=>message(error.message,true)); },{
  navigationBelow:true,emptyMessage:'Nenhum fim de semana disponível neste mês.'
});

function showSelection() {
  $('#selected-date').textContent = !account ? 'Acesse sua reserva para selecionar um fim de semana.' :
    selected ? 'Fim de semana escolhido: '+weekendLabel(selected) : 'Escolha um fim de semana disponível.';
  $('#request-button').disabled = !selected || !picker.selection();
  $('#request-button').hidden = !account;
}

async function loadRooms() {
  const version = ++roomVersion, day = selected;
  $('#room-picker').replaceChildren();
  picker.reset();
  if (!account || !day || !dates.has(day)) return;
  const rooms = await reserve('/rooms?day='+encodeURIComponent(day));
  if (version===roomVersion) picker.render(rooms);
}

async function loadDates() {
  dates = new Set(await reserve('/dates'));
  if (!dates.has(selected)) selected = '';
  renderCalendar();
  await loadRooms();
}

async function loadAccount() {
  const version = ++accountVersion;
  let data;
  try { data = await reserve('/me'); }
  catch (error) { if (error.status !== 401) throw error; }
  if (version !== accountVersion) return;
  account = data?.customer || null;
  if (!account) selected = '';
  $('#access').hidden = Boolean(account);
  $('#account').hidden = !account;
  renderCalendar();
  showSelection();
  if (!account) {
    $('#profile-details').open = false;
    $('#profile-form').reset();
    $('#requests').replaceChildren();
    await loadRooms();
    return;
  }
  $('#deletion-form').hidden = Boolean(data.deletionRequestedAt);
  $('#deletion-status').hidden = !data.deletionRequestedAt;
  for (const key of ['name','phone','city','state']) $('#profile-form').elements[key].value = account[key] || '';
  list($('#requests'),data.reservations,(item,row) => {
    item.textContent = reservationLabel(row.day)+' · '+statuses[row.status]+(row.quote ? ' · '+quoteLine(row.quote) : '');
  },'Você ainda não tem solicitações.');
}

const access = $('#login');
const details = $('#registration-fields');
function showRegistration(show) {
  details.hidden = !show;
  details.disabled = !show;
  $('#access-button').textContent = show ? 'Salvar cadastro' : 'Continuar';
}
const cpfField = access.elements.cpf, birthField = access.elements.birth_date;
const cpfDigits = value => value.replace(/\D/g,'');
const fields = [
  [cpfField,maskCpf,value=>validCpf(cpfDigits(value)),'Informe um CPF válido com 11 dígitos.'],
  [birthField,maskBirth,value=>Boolean(birthIso(value,today())),'Informe uma data válida no formato DD/MM/AAAA.']
];

function validateIdentity(field, mask, valid, error) {
  const previous = field.value;
  const cursor = field.selectionStart;
  const formatted = mask(previous);
  if (formatted!==previous) {
    field.value = formatted;
    if (cursor!==null && cursor<previous.length) {
      const digits = cpfDigits(previous.slice(0,cursor)).length;
      let index=0;
      while (index<formatted.length && cpfDigits(formatted.slice(0,index)).length<digits) index++;
      field.setSelectionRange(index,index);
    }
  }
  field.setCustomValidity(formatted && !valid(formatted) ? error : '');
}
for (const config of fields) {
  const [field] = config;
  const changed = () => {
    validateIdentity(...config);
    showRegistration(false);
  };
  field.addEventListener('input',changed);
  field.addEventListener('change',()=>validateIdentity(...config));
}

onSubmit(access,async input => {
  for (const config of fields) validateIdentity(...config);
  if (!access.reportValidity()) return;
  const identity = {cpf:cpfDigits(cpfField.value),birth_date:birthIso(birthField.value,today())};
  const registering = !details.hidden;
  if (registering) await reserve('/register','POST',{...input,...identity});
  try {
    await reserve('/login','POST',identity);
  } catch (error) {
    if (error.status !== 401 || registering) throw error;
    if (cpfDigits(cpfField.value) !== identity.cpf ||
        birthIso(birthField.value,today()) !== identity.birth_date) return;
    showRegistration(true);
    message('Se for seu primeiro acesso, complete o cadastro. Se já tem cadastro, confira o CPF e a data de nascimento.');
    access.elements.name.focus();
    return;
  }
  access.reset();
  showRegistration(false);
  await loadAccount();
  message(registering ? 'Cadastro salvo. Escolha um fim de semana disponível.' : 'Escolha seu fim de semana no calendário.');
});
onSubmit($('#profile-form'),async input => {
  await reserve('/me','PATCH',input);
  await loadAccount();
  message('Cadastro atualizado.');
});
onSubmit($('#deletion-form'),async () => {
  await reserve('/me/deletion-request','POST');
  $('#deletion-form').hidden = true;
  $('#deletion-status').hidden = false;
});
onSubmit($('#request-form'),async () => {
  const room = picker.selection();
  if (!account || !selected || !room) return;
  let result;
  try { result = await reserve('/requests','POST',{day:selected,...room}); }
  catch (error) {
    if (error.status === 401) await loadAccount();
    if (error.status === 409) await loadDates();
    throw error;
  }
  await Promise.all([loadAccount(),loadDates()]);
  message('Intenção enviada. Orçamento: '+quoteLine(result.quote));
},showSelection);
$('#logout').onclick = async () => {
  try {
    await reserve('/logout','POST');
    await loadAccount();
    message('Você saiu do seu cadastro.');
  } catch (error) { message(error.message,true); }
};
message('');
Promise.all([loadDates(),loadAccount()]).catch(error=>message(error.message,true));
