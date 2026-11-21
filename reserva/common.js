export const $ = selector => document.querySelector(selector);
export const formatDay = day => day.split('-').reverse().join('/');
export const weekendEnd = friday => new Date(Date.parse(friday+'T12:00:00Z')+2*86400000).toISOString().slice(0,10);
export const weekendLabel = friday => formatDay(friday)+' a '+formatDay(weekendEnd(friday));
export const reservationLabel = day => new Date(day+'T12:00:00Z').getUTCDay()===5 ? weekendLabel(day) : formatDay(day);
export const statuses = {
  pending:'Aguardando aprovação', approved:'Aguardando pagamento',
  confirmed:'Confirmada', rejected:'Recusada', cancelled:'Cancelada'
};

export async function api(base, path, method = 'GET', data = {}) {
  const response = await fetch(base+path, method === 'GET' ? {} : {
    method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error),{status:response.status});
  return result;
}

export function message(text, error = false) {
  $('#status').textContent = text;
  $('#status').classList.toggle('error',error);
}

export function onSubmit(form, action, onSettled) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      message('');
      await action(Object.fromEntries(new FormData(form)), button);
    } catch (error) {
      message(error.message,true);
    } finally {
      if (button) button.disabled = false;
      onSettled?.();
    }
  });
}

export function customerFields(form, customer = {}) {
  form.innerHTML = '<label>Nome completo <input name="name" autocomplete="name" maxlength="120" required></label>'+
    '<label>WhatsApp <input name="phone" type="tel" autocomplete="tel" maxlength="24"></label>'+
    '<label>Cidade <input name="city" maxlength="100"></label>'+
    '<label>UF <input name="state" maxlength="40"></label>'+
    '<label>Cadastro <input name="registered_at" type="date"></label>'+
    '<label>Nascimento <input name="birth_date" type="date"></label>'+
    '<label>Profissão <input name="occupation" maxlength="120"></label>'+
    (customer.has_account ? '' : '<label>CPF (opcional) <input name="cpf" inputmode="numeric" maxlength="14"></label>')+
    '<button type="submit">'+(customer.id ? 'Salvar cliente' : 'Cadastrar')+'</button>';
  for (const key of ['name','phone','city','state','registered_at','birth_date','occupation']) {
    form.elements[key].value = customer[key] || '';
  }
}

export function options(select, values, placeholder) {
  const selected = select.value;
  select.replaceChildren(new Option(placeholder,''));
  for (const [value,label] of values) select.add(new Option(label,value));
  if (values.some(([value]) => value === selected)) select.value = selected;
}

export function list(element, rows, render, empty) {
  const items = (rows.length ? rows : [null]).map(row => {
    const item = document.createElement('li');
    if (row) render(item,row);
    else item.textContent = empty;
    return item;
  });
  element.replaceChildren(...items);
}

export const today = () => new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());

export function monthlyCalendar(root, describe, select) {
  let month = new Date(today().slice(0,7)+'-01T12:00:00Z');
  const label = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
  const monthName = new Intl.DateTimeFormat('pt-BR',{month:'long',timeZone:'UTC'});
  const title = document.createElement('h3');
  title.setAttribute('aria-live','polite');
  const heading = document.createElement('div');
  heading.className = 'calendar-heading';
  function arrow(step) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary '+(step<0 ? 'calendar-previous' : 'calendar-next');
    button.onclick = () => { month.setUTCMonth(month.getUTCMonth()+step); render(); };
    return button;
  }
  const previous = arrow(-1), next = arrow(1);
  heading.append(previous,title,next);
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';
  root.replaceChildren(heading,grid);
  function render() {
    title.textContent = label.format(month);
    for (const [button,step] of [[previous,-1],[next,1]]) {
      const target = new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+step,1));
      const name = monthName.format(target);
      button.textContent = name[0].toLocaleUpperCase('pt-BR')+name.slice(1);
      button.setAttribute('aria-label',label.format(target));
    }
    grid.replaceChildren();
    const first = month.getUTCDay();
    const days = new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    for (let i=1+(5-first+7)%7;i<=days;i+=7) {
      const date = month.toISOString().slice(0,8)+String(i).padStart(2,'0');
      const info = describe(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day '+info.state;
      button.disabled = info.disabled;
      button.setAttribute('aria-label',weekendLabel(date)+' · Entrada sexta às 15h, saída domingo às 15h · '+info.label);
      button.setAttribute('aria-pressed',String(Boolean(info.selected)));
      const period = document.createElement('strong');
      period.textContent = weekendLabel(date);
      const hours = document.createElement('small');
      hours.textContent = 'Entrada sex. 15h · Saída dom. 15h';
      const detail = document.createElement('small');
      detail.textContent = info.label;
      button.append(period,hours,detail);
      button.onclick = () => { select(date); render(); };
      grid.append(button);
    }
  }
  render();
  return render;
}

export const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);

export function quoteLine(quote) {
  const guests = quote.adults+' adulto(s) a '+money(quote.adultCents) +
    (quote.children ? ' e '+quote.children+' criança(s) a '+money(quote.childCents) : '');
  return quote.room+' · '+quote.nights+' diárias · '+guests+' por diária · Total '+money(quote.totalCents);
}

export function roomPicker(root, changed) {
  let selected = null, adults, children;
  const totals = document.createElement('p');
  totals.setAttribute('role','status');
  function selection() {
    if (!selected) return null;
    const a = Number(adults.value), c = Number(children.value);
    if (!adults.validity.valid || !children.validity.valid || a+c>selected.capacity || (c && selected.child_cents===null)) return null;
    return {roomId:selected.id,adults:a,children:c};
  }
  function update() {
    const input = selection();
    totals.textContent = !selected ? '' : input
      ? selected.name+' · Estimativa para duas diárias: '+money(2*(input.adults*selected.adult_cents+input.children*(selected.child_cents??0)))
      : 'Confira a capacidade e a tarifa infantil.';
    changed();
  }
  function render(rooms) {
    selected = null;
    const cards = document.createElement('div');
    cards.className = 'room-list';
    const guestFields = document.createElement('div');
    guestFields.className = 'reservation-form';
    guestFields.hidden = true;
    const numeric = (text,min) => {
      const label = document.createElement('label');
      label.textContent = text;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(min);
      input.value = String(min);
      input.required = true;
      input.oninput = update;
      label.append(input);
      guestFields.append(label);
      return input;
    };
    adults = numeric('Adultos (12 anos ou mais)',1);
    children = numeric('Crianças (até 11 anos)',0);
    for (const room of rooms) {
      const card = document.createElement('details');
      card.className = 'room-card';
      const summary = document.createElement('summary');
      if (room.photo) {
        const photo = document.createElement('img');
        photo.src = room.photo;
        photo.alt = '';
        photo.loading = 'lazy';
        summary.append(photo);
      }
      const name = document.createElement('strong');
      name.textContent = room.name;
      summary.append(name);
      const details = document.createElement('div');
      const description = document.createElement('p');
      description.textContent = room.description;
      const rates = document.createElement('p');
      rates.textContent = 'Até '+room.capacity+' hóspedes · Adulto: '+money(room.adult_cents)+' por diária · Criança: '+
        (room.child_cents===null ? 'tarifa a consultar' : money(room.child_cents)+' por diária');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'primary';
      pick.textContent = 'Fazer orçamento';
      pick.setAttribute('aria-label','Fazer orçamento para '+room.name);
      pick.onclick = () => {
        selected = room;
        adults.max = String(room.capacity);
        children.max = String(room.capacity-1);
        children.disabled = room.child_cents===null;
        adults.value = '1';
        children.value = '0';
        guestFields.hidden = false;
        update();
        adults.focus();
      };
      details.append(description,rates);
      if (room.photos?.length>1) {
        const gallery = document.createElement('div');
        gallery.className = 'room-photo-gallery';
        for (const [index,entry] of room.photos.slice(1).entries()) {
          const image = document.createElement('img');
          image.src = entry.url;
          image.alt = 'Foto '+(index+2)+' de '+room.name;
          image.loading = 'lazy';
          gallery.append(image);
        }
        details.append(gallery);
      }
      details.append(pick);
      card.append(summary,details);
      cards.append(card);
    }
    const legend = document.createElement('h3');
    legend.textContent = rooms.length ? 'Quartos disponíveis' : 'Nenhum quarto disponível';
    root.replaceChildren(legend,cards,guestFields,totals);
    update();
  }
  return {render,selection,reset(){ selected = null; changed(); }};
}
