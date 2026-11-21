import {$, api, formatDay, statuses, message, onSubmit, customerFields, options, list} from './common.js';

const reserve = (path,method,data) => api('/api/reserva',path,method,data);
const form = $('#request-form');

async function loadDates() {
  const dates = await reserve('/dates');
  options(form.elements.day,dates.map(day => [day,formatDay(day)]),dates.length ? 'Selecione' : 'Nenhuma data disponível');
  form.elements.day.disabled = !dates.length;
  $('#request-button').disabled = !dates.length;
}

async function loadAccount() {
  let data;
  try {
    data = await reserve('/me');
  } catch (error) {
    if (error.status !== 401) throw error;
  }
  $('#access').hidden = Boolean(data);
  $('#account').hidden = !data;
  $('#request-button').hidden = !data;
  $('#date-note').textContent = data ? 'A equipe analisará o pedido e enviará os dados de pagamento pelo WhatsApp se a intenção for aprovada.' : 'Entre com CPF e senha para solicitar a data escolhida.';
  if (!data) return;
  const {name,phone,city,state} = data.customer;
  $('#profile').textContent = [name,city+' / '+state,'WhatsApp +'+phone].join(' · ');
  list($('#requests'),data.reservations,(item,row) => {
    item.textContent = formatDay(row.day)+' · '+statuses[row.status];
  },'Você ainda não tem solicitações.');
}

customerFields($('#register'));
onSubmit($('#register'),async input => {
  await reserve('/register','POST',input);
  $('#register').reset();
  $('#login').elements.cpf.value = input.cpf;
  $('#login').elements.password.focus();
  message('Cadastro criado. Entre com CPF e senha para solicitar sua data.');
});
onSubmit($('#login'),async input => {
  await reserve('/login','POST',input);
  $('#login').reset();
  await loadAccount();
  message('Você entrou na sua conta.');
});
onSubmit(form,async input => {
  if ($('#account').hidden) {
    $('#login').elements.cpf.focus();
    return;
  }
  try {
    await reserve('/requests','POST',input);
  } catch (error) {
    if (error.status === 401) await loadAccount();
    if (error.status === 409) await loadDates();
    throw error;
  }
  await loadAccount();
  message('Intenção enviada. Acompanhe a análise em Minhas solicitações.');
});
$('#logout').addEventListener('click',async () => {
  try {
    await reserve('/logout','POST');
    await loadAccount();
    message('Você saiu da sua conta.');
  } catch (error) {
    message(error.message,true);
  }
});
Promise.all([loadDates(),loadAccount()]).then(() => message('')).catch(error => message(error.message,true));
