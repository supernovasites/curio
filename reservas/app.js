import {renderHeader} from '/campanhas/nav.js';
import {$, api, formatDay, statuses, message, onSubmit, customerFields, options, list} from '/reserva/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const page = location.pathname.startsWith('/clientes') ? 'clientes' : 'reservas';
const customerPage = page === 'clientes';
const newReservation = $('#new-reservation');

async function loadCustomers(q = '') {
  const rows = await staff('/customers/search','POST',{q});
  if (customerPage) {
    list($('#customer-list'),rows,(item,row) => {
      item.textContent = [row.name,row.city+' / '+row.state,'+'+row.phone].join(' · ');
    },'Nenhum cliente encontrado.');
  } else {
    options(newReservation.elements.customerId,rows.map(row => [row.id,row.name+' · +'+row.phone]),'Selecione o cliente');
  }
}

async function loadDates() {
  const rows = await staff('/reservations/dates');
  list($('#date-list'),rows,(item,row) => {
    item.textContent = formatDay(row.day)+' · '+(row.booked ? 'Ocupada' : row.open ? 'Disponível' : 'Bloqueada');
  },'Nenhuma data configurada.');
  options(newReservation.elements.day,rows.filter(row => row.open && !row.booked).map(row => [row.day,formatDay(row.day)]),'Selecione a data');
}

function whatsapp(row) {
  const text = row.status === 'confirmed'
    ? 'Olá, '+row.name+'! Sua reserva na Fazenda Curió para '+formatDay(row.day)+' está confirmada.'
    : 'Olá, '+row.name+'! Sua solicitação para '+formatDay(row.day)+' na Fazenda Curió foi aprovada.\n\nDados para pagamento:\n'+row.payment+'\n\nEnvie o comprovante por aqui para confirmarmos a reserva.';
  const link = document.createElement('a');
  link.href = 'https://wa.me/'+row.phone+'?text='+encodeURIComponent(text);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = row.status === 'confirmed' ? 'Enviar confirmação pelo WhatsApp' : 'Enviar dados de pagamento pelo WhatsApp';
  return link;
}

function addAction(actions,row,label,status) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = label;
  button.onclick = async () => {
    button.disabled = true;
    try { await changeReservation(row,status); }
    catch (error) { message(error.message,true); }
    finally { button.disabled = false; }
  };
  actions.append(button);
}

function renderReservation(item,row) {
  const label = document.createElement('strong');
  label.textContent = formatDay(row.day)+' · '+row.name+' · '+statuses[row.status];
  item.append(label);
  const actions = document.createElement('div');
  actions.className = 'reservation-actions';
  item.append(actions);
  if (row.status === 'pending') {
    const form = document.createElement('form');
    form.className = 'reservation-form';
    form.innerHTML = '<label>Dados de pagamento <textarea name="payment" required maxlength="2000"></textarea></label><button type="submit">Aprovar intenção</button>';
    onSubmit(form,({payment}) => changeReservation(row,'approved',payment));
    item.append(form);
    addAction(actions,row,'Recusar','rejected');
  }
  if (row.status === 'approved') {
    actions.append(whatsapp(row));
    addAction(actions,row,'Confirmar pagamento','confirmed');
    addAction(actions,row,'Cancelar','cancelled');
  }
  if (row.status === 'confirmed') {
    actions.append(whatsapp(row));
    addAction(actions,row,'Cancelar reserva','cancelled');
  }
}

async function loadReservations() {
  list($('#reservation-list'),await staff('/reservations'),renderReservation,'Nenhuma solicitação registrada.');
}

async function changeReservation(row,status,payment) {
  await staff('/reservations/'+row.id,'PATCH',{status,payment});
  await Promise.all([loadDates(),loadReservations()]);
  message(status === 'approved' ? 'Intenção aprovada. Use o link da solicitação para enviar os dados de pagamento pelo WhatsApp.' : 'Status atualizado.');
}

async function start() {
  const user = await staff('/me');
  renderHeader(user,page);
  $('.app-header').hidden = false;
  $('#signin').hidden = true;
  $('#logout').onclick = async () => {
    try {
      await staff('/logout','POST');
      location.reload();
    } catch (error) { message(error.message,true); }
  };
  $(customerPage ? '#customers' : '#reservations').hidden = false;
  if (customerPage) await loadCustomers();
  else await Promise.all([loadCustomers(),loadDates(),loadReservations()]);
  message('');
}

customerFields($('#customer-form'));
onSubmit($('#customer-form'),async data => {
  await staff('/customers','POST',data);
  $('#customer-form').reset();
  $('#customer-search').reset();
  await loadCustomers();
  message('Cliente cadastrado e disponível na base de campanhas.');
});
onSubmit($('#customer-search'),({q}) => loadCustomers(q));
onSubmit($('#reservation-search'),({q}) => loadCustomers(q));
onSubmit($('#date-form'),async ({day},button) => {
  await staff('/reservations/dates','POST',{day,open:button?.value !== 'close'});
  await loadDates();
  message(button?.value === 'close' ? 'Data bloqueada.' : 'Data disponibilizada.');
});
onSubmit(newReservation,async data => {
  await staff('/reservations','POST',data);
  await loadReservations();
  message('Intenção registrada.');
});
onSubmit($('#login'),async data => {
  await staff('/login','POST',data);
  $('#login').reset();
  await start();
});
start().catch(error => {
  if (error.status === 401) {
    $('#signin').hidden = false;
    message('');
  } else message(error.message,true);
});
