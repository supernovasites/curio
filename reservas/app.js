import {renderHeader} from '/campanhas/nav.js';
import {$, api, formatDay, statuses, message, onSubmit, customerFields, options, list, monthlyCalendar, today} from '/reserva/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const page = location.pathname.startsWith('/clientes') ? 'clientes' : 'reservas';
const customerPage = page === 'clientes';
const newReservation = $('#new-reservation');

let selected = '', calendarDates = new Map(), reservations = [], canManage = false;
let filters = {}, customerPageNumber = 1, searchVersion = 0;
const dateForm = $('#date-form');
const renderCalendar = monthlyCalendar($('#calendar'),day => {
  const calendarDate = calendarDates.get(day);
  const booking = reservations.find(row=>row.day===day && ['approved','confirmed'].includes(row.status));
  const requests = reservations.filter(row=>row.day===day && row.status==='pending').length;
  const open = calendarDate?.open && day>=today();
  const label = booking ? 'Ocupada · '+booking.name : open ? 'Disponível' : 'Bloqueada';
  return {state:booking ? 'booked' : open ? 'available' : 'blocked',
    label:label+(requests ? ' · '+requests+' pendente(s)' : ''), selected:day===selected};
},day=>{ selected = day; renderSelected(); });

function renderSelected() {
  const available = selected && calendarDates.get(selected)?.open && !calendarDates.get(selected)?.booked && selected>=today();
  $('#selected-date').textContent = selected ? 'Data selecionada: '+formatDay(selected) : 'Selecione uma data no calendário.';
  dateForm.elements.day.value = selected;
  dateForm.hidden = !canManage;
  for (const button of dateForm.querySelectorAll('button')) button.disabled = !selected || selected<today();
  newReservation.elements.day.value = selected;
  newReservation.querySelector('button').disabled = !available;
  list($('#reservation-list'),selected ? reservations.filter(row=>row.day===selected) : reservations,renderReservation,'Nenhuma solicitação registrada.');
}

function pager(element,data) {
  const controls = [-1,1].map(step=>{
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary';
    button.textContent = step<0 ? 'Anterior' : 'Próxima';
    button.disabled = step<0 ? data.page===1 : data.page===data.pages;
    button.onclick = () => loadCustomers(filters,data.page+step).catch(error=>message(error.message,true));
    return button;
  });
  const summary = document.createElement('span');
  summary.textContent = data.total+' cliente(s) · página '+data.page+' de '+data.pages;
  element.replaceChildren(controls[0],summary,controls[1]);
}

function renderCustomer(item,row) {
  const details = document.createElement('details');
  details.className = 'customer-editor';
  const summary = document.createElement('summary');
  summary.textContent = row.name+(row.active ? '' : ' · Inativo');
  const form = document.createElement('form');
  form.className = 'reservation-form';
  customerFields(form,row);
  onSubmit(form,async data => {
    await staff('/customers/'+row.id,'PATCH',data);
    await loadCustomers(filters,customerPageNumber);
    message('Cadastro atualizado.');
  });
  details.append(summary,form);
  item.append(details);
}

async function loadCustomers(input = {}, page = 1) {
  const version = ++searchVersion;
  const data = await staff('/customers/search','POST',{...input,page,activeOnly:!customerPage});
  if (version!==searchVersion) return;
  filters = input; customerPageNumber = data.page;
  if (customerPage) {
    list($('#customer-list'),data.rows,renderCustomer,'Nenhum cliente encontrado.');
    pager($('#customer-pages'),data);
  } else {
    options(newReservation.elements.customerId,data.rows.map(row => [row.id,row.name+(row.phone ? ' · +'+row.phone : '')]),'Selecione o cliente');
    pager($('#reservation-pages'),data);
  }
}

async function loadDates() {
  const rows = await staff('/reservations/dates');
  calendarDates = new Map(rows.map(row=>[row.day,row]));
  renderCalendar();
  renderSelected();
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
    if (row.phone) actions.append(whatsapp(row));
    else actions.append('Cadastre o WhatsApp do cliente para enviar a mensagem.');
    addAction(actions,row,'Confirmar pagamento','confirmed');
    addAction(actions,row,'Cancelar','cancelled');
  }
  if (row.status === 'confirmed') {
    if (row.phone) actions.append(whatsapp(row));
    else actions.append('Cadastre o WhatsApp do cliente para enviar a mensagem.');
    addAction(actions,row,'Cancelar reserva','cancelled');
  }
}

async function loadReservations() {
  reservations = await staff('/reservations');
  renderCalendar();
  renderSelected();
}

async function changeReservation(row,status,payment) {
  await staff('/reservations/'+row.id,'PATCH',{status,payment});
  await Promise.all([loadDates(),loadReservations()]);
  message(status === 'approved' ? 'Intenção aprovada. Use o link da solicitação para enviar os dados de pagamento pelo WhatsApp.' : 'Status atualizado.');
}

async function start() {
  const user = await staff('/me');
  canManage = user.role === 'admin';
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
onSubmit($('#customer-search'),data => loadCustomers(data));
$('#customer-search').onreset = () => loadCustomers().catch(error=>message(error.message,true));
onSubmit($('#reservation-search'),data => loadCustomers(data));
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
