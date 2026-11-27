import {renderHeader} from '/campanhas/nav.js?v=20261127-reservation-map';
import {$, api, weekendEnd, weekendLabel, reservationLabel, statuses, message, onSubmit, customerFields, options, list, monthlyCalendar, today, roomPicker, quoteLine} from '/reservar/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const page = location.pathname.startsWith('/clientes') ? 'clientes' :
  location.pathname.startsWith('/reservarquarto/reservados') ? 'reservado' : 'reservas';
const reservedPage = page === 'reservado';
const customerPage = page === 'clientes';
const newReservation = $('#new-reservation');

let stage = 'pending', catalog = [], selected = '', calendarDates = new Map(), reservations = [], canManage = false;
let filters = {}, customerPageNumber = 1, searchVersion = 0;
const dateForm = $('#date-form');
const registerIntent = $('#register-intent');
let roomVersion = 0;
const picker = roomPicker($('#room-picker'),updateRegisterButton);
const onWeekend = (row,friday) => row.day>=friday && row.day<=weekendEnd(friday);
const renderCalendar = monthlyCalendar($('#calendar'),day => {
  const date = calendarDates.get(day);
  const label = date?.available ? 'Quartos disponíveis' : date?.open && day>=today() ? 'Sem quartos livres' : 'Bloqueado';
  return {state:date?.available ? 'available' : 'blocked',label,selected:day===selected};
},day=>{ selected = day; renderSelected(); loadRooms().catch(error=>message(error.message,true)); });

function updateRegisterButton() {
  registerIntent.disabled = !calendarDates.get(selected)?.available ||
    !newReservation.elements.customerId.value || !picker.selection();
}

async function loadRooms() {
  const version = ++roomVersion, day = selected;
  $('#room-picker').replaceChildren();
  picker.reset();
  if (!day || !calendarDates.get(day)?.available) return;
  const rooms = await staff('/reservations/rooms?day='+encodeURIComponent(day));
  if (version===roomVersion) picker.render(rooms);
}

function renderSelected() {
  $('#selected-date').textContent = selected ? 'Fim de semana selecionado: '+weekendLabel(selected) : 'Selecione um fim de semana no calendário.';
  dateForm.elements.day.value = selected;
  dateForm.hidden = !canManage;
  for (const button of dateForm.querySelectorAll('button')) button.disabled = !selected || selected<today();
  newReservation.elements.day.value = selected;
  updateRegisterButton();
  renderBookings();
}

const stages = [
  ['pending','Aguardando aprovação','Pendentes'],
  ['approved','Aprovadas','Aprovadas'],['confirmed','Confirmadas','Confirmadas'],
  ['closed','Recusadas ou canceladas','Encerradas']
];
const inStage = (row,key) => key==='closed' ? ['rejected','cancelled'].includes(row.status) : row.status===key;

function renderBookings() {
  if (reservedPage) {
    const metrics = $('#booking-stages');
    metrics.replaceChildren(...stages.map(([key,text,shortText]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'metric';
      button.classList.toggle('selected',stage===key);
      button.setAttribute('aria-pressed',String(stage===key));
      const count = document.createElement('strong');
      count.textContent = reservations.filter(row=>inStage(row,key)).length.toLocaleString('pt-BR');
      button.setAttribute('aria-label',text+' '+count.textContent);
      const fullLabel = document.createElement('span');
      fullLabel.className = 'stage-label-full';
      fullLabel.textContent = text;
      const shortLabel = document.createElement('span');
      shortLabel.className = 'stage-label-short';
      shortLabel.textContent = shortText;
      button.append(fullLabel,shortLabel,count);
      button.onclick = ()=>{stage=key;renderBookings();metrics.children[stages.findIndex(([id])=>id===key)].focus();};
      return button;
    }));
  }
  const rows = reservedPage ? reservations.filter(row=>inStage(row,stage)) :
    selected ? reservations.filter(row=>onWeekend(row,selected)) : reservations;
  list($('#reservation-list'),rows,renderReservation,'Nenhuma reserva neste estágio.');
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
  summary.textContent = row.name+(row.active ? '' : ' · Inativo')+(row.deletion_requested_at ? ' · Exclusão solicitada' : '');
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
  const data = await staff(customerPage ? '/customers/search' : '/reservations/customers','POST',{...input,page});
  if (version!==searchVersion) return;
  filters = input; customerPageNumber = data.page;
  if (customerPage) {
    list($('#customer-list'),data.rows,renderCustomer,'Nenhum cliente encontrado.');
    pager($('#customer-pages'),data);
  } else {
    options(newReservation.elements.customerId,data.rows.map(row => [row.id,row.name+(row.city ? ' · '+row.city : '')]),'Selecione o cliente');
    pager($('#reservation-pages'),data);
    renderSelected();
  }
}

async function loadDates() {
  const rows = await staff('/reservations/dates');
  calendarDates = new Map(rows.map(row=>[row.day,row]));
  renderCalendar();
  renderSelected();
  await loadRooms();
}

function whatsapp(row) {
  const link = document.createElement('a');
  link.href = '/api/campanhas/reservations/'+encodeURIComponent(row.id)+'/whatsapp';
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

function reservationEditor(row) {
  const editor = document.createElement('details');
  editor.className = 'customer-editor';
  const title = document.createElement('summary');
  title.textContent = 'Editar reserva';
  const form = document.createElement('form');
  form.className = 'reservation-form';
  form.innerHTML = '<label>Sexta-feira de entrada <input name="day" type="date" required></label>'+
    '<label>Quarto <select name="roomId" required></select></label>'+
    '<label>Adultos (12 anos ou mais) <input name="adults" type="number" min="1" max="30" required></label>'+
    '<label>Crianças (até 11 anos) <input name="children" type="number" min="0" max="29" required></label>'+
    '<button type="submit" class="primary">Salvar reserva</button>';
  const fields = form.elements;
  fields.day.value = row.day;
  options(fields.roomId,catalog.map(room=>[room.id,room.name]),'Escolha um quarto');
  fields.roomId.value = row.room_id || '';
  fields.adults.value = row.quote?.adults ?? 1;
  fields.children.value = row.quote?.children ?? 0;
  onSubmit(form,async data=>{
    const saved = await staff('/reservations/'+row.id+'/details','PATCH',{...data,adults:Number(data.adults),children:Number(data.children)});
    await loadReservations();
    message('Reserva atualizada. Orçamento: '+quoteLine(saved.quote));
  });
  editor.append(title,form);
  return editor;
}

function renderReservation(item,row) {
  const label = document.createElement('strong');
  label.textContent = reservationLabel(row.day)+' · '+row.name+' · '+statuses[row.status];
  item.append(label);
  if (row.quote) {
    const budget = document.createElement('p');
    budget.textContent = 'Orçamento: '+quoteLine(row.quote);
    item.append(budget);
  }
  if (reservedPage && ['pending','approved'].includes(row.status)) item.append(reservationEditor(row));
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
    addAction(actions,row,'Cancelar intenção','cancelled');
  }
  if (row.status === 'approved') {
    if (row.has_phone) actions.append(whatsapp(row));
    else actions.append('Cadastre o WhatsApp do cliente para enviar a mensagem.');
    addAction(actions,row,'Confirmar pagamento','confirmed');
    addAction(actions,row,'Cancelar','cancelled');
  }
  if (row.status === 'confirmed') {
    if (row.has_phone) actions.append(whatsapp(row));
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
  if (reservedPage) await loadReservations();
  else await Promise.all([loadDates(),loadReservations()]);
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
  if (customerPage && !canManage) { message('Somente administradores podem acessar a base de clientes.',true); return; }
  $(customerPage ? '#customers' : '#reservations').hidden = false;
  if (customerPage) await loadCustomers();
  else if (reservedPage) {
    $('#booking-title').textContent = 'Aprovar Reserva';
    $('#booking-controls').hidden = true;
    $('#booking-stages').hidden = false;
    catalog = await staff('/rooms');
    await loadReservations();
  } else await Promise.all([loadCustomers(),loadDates(),loadReservations()]);
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
onSubmit($('#customer-search'),data => loadCustomers({...data,deletionRequested:data.deletionRequested==='on'}));
$('#customer-search').onreset = () => loadCustomers().catch(error=>message(error.message,true));
onSubmit($('#reservation-search'),data => loadCustomers(data));
onSubmit($('#date-form'),async ({day},button) => {
  await staff('/reservations/dates','POST',{day,open:button?.value !== 'close'});
  await loadDates();
  message(button?.value === 'close' ? 'Fim de semana bloqueado.' : 'Fim de semana disponibilizado.');
});
newReservation.elements.customerId.onchange = renderSelected;
onSubmit(newReservation,async data => {
  try {
    const room = picker.selection();
    if (!room) return;
    const result = await staff('/reservations','POST',{...data,...room});
    message('Intenção registrada. Orçamento: '+quoteLine(result.quote));
  } finally {
    await Promise.all([loadDates(),loadReservations()]);
  }
},renderSelected);
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
