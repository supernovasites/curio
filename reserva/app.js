import {$, api, formatDay, statuses, message, onSubmit, list, monthlyCalendar} from './common.js';

const reserve = (path,method,data) => api('/api/reserva',path,method,data);
let dates = new Set(), selected = '', account = null;
const renderCalendar = monthlyCalendar($('#calendar'), day => ({
  label:dates.has(day) ? 'Disponível' : 'Indisponível',
  state:dates.has(day) ? 'available' : 'blocked',
  disabled:!dates.has(day),selected:day===selected
}), day => { selected = day; showSelection(); });

function showSelection() {
  $('#selected-date').textContent = selected ? 'Data escolhida: '+formatDay(selected) : 'Escolha uma data disponível no calendário.';
  $('#request-button').disabled = !selected;
  $('#request-button').hidden = !account;
}

async function loadDates() {
  dates = new Set(await reserve('/dates'));
  if (!dates.has(selected)) selected = '';
  renderCalendar();
  showSelection();
}

async function loadAccount() {
  let data;
  try { data = await reserve('/me'); }
  catch (error) { if (error.status !== 401) throw error; }
  account = data?.customer || null;
  $('#access').hidden = Boolean(account);
  $('#account').hidden = !account;
  showSelection();
  if (!account) return;
  for (const key of ['name','phone','city','state']) $('#profile-form').elements[key].value = account[key] || '';
  list($('#requests'),data.reservations,(item,row) => {
    item.textContent = formatDay(row.day)+' · '+statuses[row.status];
  },'Você ainda não tem solicitações.');
}

const access = $('#login');
const details = $('#registration-fields');
function showRegistration(show) {
  details.hidden = !show;
  details.disabled = !show;
  $('#access-button').textContent = show ? 'Cadastrar e acessar' : 'Continuar';
}
for (const field of ['cpf','birth_date']) {
  access.elements[field].addEventListener('input',() => showRegistration(false));
}

onSubmit(access,async input => {
  const identity = {cpf:input.cpf,birth_date:input.birth_date};
  const registering = !details.hidden;
  if (registering) await reserve('/register','POST',input);
  try {
    await reserve('/login','POST',identity);
  } catch (error) {
    if (error.status !== 401 || registering) throw error;
    if (access.elements.cpf.value !== identity.cpf ||
        access.elements.birth_date.value !== identity.birth_date) return;
    showRegistration(true);
    message('Se for seu primeiro acesso, complete o cadastro. Se já tem cadastro, confira o CPF e a data de nascimento.');
    access.elements.name.focus();
    return;
  }
  access.reset();
  showRegistration(false);
  await loadAccount();
  message(selected ? 'Data escolhida. Você já pode enviar a intenção de reserva.' : 'Escolha sua data no calendário.');
});
onSubmit($('#profile-form'),async input => {
  await reserve('/me','PATCH',input);
  await loadAccount();
  message('Cadastro atualizado.');
});
onSubmit($('#request-form'),async () => {
  if (!account || !selected) return;
  try { await reserve('/requests','POST',{day:selected}); }
  catch (error) {
    if (error.status === 401) await loadAccount();
    if (error.status === 409) await loadDates();
    throw error;
  }
  await loadAccount();
  message(account.phone ? 'Intenção enviada. Acompanhe em Minhas solicitações.' : 'Intenção enviada. Adicione um WhatsApp ao seu cadastro para receber instruções de pagamento.');
});
$('#logout').onclick = async () => {
  try {
    await reserve('/logout','POST');
    await loadAccount();
    message('Você saiu do seu cadastro.');
  } catch (error) { message(error.message,true); }
};
message('');
Promise.all([loadDates(),loadAccount()]).catch(error=>message(error.message,true));
