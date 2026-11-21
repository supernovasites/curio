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

export function customerFields(form) {
  form.innerHTML = '<label>Nome completo <input name="name" autocomplete="name" maxlength="120" required></label>'+
    '<label>CPF <input name="cpf" inputmode="numeric" maxlength="14" required></label>'+
    '<label>WhatsApp com DDD <input name="phone" type="tel" autocomplete="tel" maxlength="24" required></label>'+
    '<label>Cidade <input name="city" autocomplete="address-level2" maxlength="100" required></label>'+
    '<label>UF <select name="state" required><option value="">Selecione</option></select></label>'+
    '<label>Senha <input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="256" required></label>'+
    '<button type="submit">Cadastrar</button>';
  for (const state of 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')) {
    form.elements.state.add(new Option(state,state));
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
