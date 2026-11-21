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

onSubmit($('#register'),async input => {
  await reserve('/register','POST',input);
  $('#register').reset();
  $('#login').elements.cpf.value = input.cpf;
  $('#login').elements.birth_date.focus();
  message('Use CPF e data de nascimento em Acessar meu cadastro.');
});
onSubmit($('#login'),async input => {
  await reserve('/login','POST',input);
  $('#login').reset();
  await loadAccount();
  message('Cadastro aberto.');
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
Promise.all([loadDates(),loadAccount()]).then(()=>message('')).catch(error=>message(error.message,true));
