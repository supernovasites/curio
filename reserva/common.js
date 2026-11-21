export const $ = selector => document.querySelector(selector);
export const formatDay = day => day.split('-').reverse().join('/');
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

export function onSubmit(form, action) {
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
    for (const weekday of ['Sexta','Sábado','Domingo']) {
      const cell = document.createElement('strong');
      cell.textContent = weekday;
      grid.append(cell);
    }
    const first = month.getUTCDay();
    const padding = first===0 ? 2 : first===6 ? 1 : 0;
    for (let i=0;i<padding;i++) grid.append(document.createElement('span'));
    const days = new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
    for (let i=1;i<=days;i++) {
      const weekday = (first+i-1)%7;
      if (weekday>=1 && weekday<=4) continue;
      const date = month.toISOString().slice(0,8)+String(i).padStart(2,'0');
      const info = describe(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day '+info.state;
      button.disabled = info.disabled;
      button.setAttribute('aria-label',formatDay(date)+' · '+info.label);
      button.setAttribute('aria-pressed',String(Boolean(info.selected)));
      button.textContent = String(i);
      const detail = document.createElement('small');
      detail.textContent = info.label;
      button.append(detail);
      button.onclick = () => { select(date); render(); };
      grid.append(button);
    }
  }
  render();
  return render;
}
