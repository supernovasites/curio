import {renderHeader} from '/campanhas/nav.js';
import {$,api,message,onSubmit} from '/reservar/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const cents = value => Math.round(Number(value)*100);

function roomEditor(room) {
  const item = document.createElement('details');
  item.className = 'card customer-editor';
  const title = document.createElement('summary');
  title.textContent = room.name;
  if (room.photo) {
    const photo = document.createElement('img');
    photo.className = 'room-editor-photo';
    photo.alt = '';
    photo.src = room.photo;
    photo.loading = 'lazy';
    item.append(title,photo);
  } else item.append(title);
  const form = document.createElement('form');
  form.className = 'reservation-form';
  form.innerHTML = '<label>Nome <input name="name" required maxlength="100"></label>'+
    '<label>Foto do Hospedin <input name="photo" type="url" maxlength="500"></label>'+
    '<label>Descrição <textarea name="description" maxlength="2000"></textarea></label>'+
    '<label>Capacidade por quarto <input name="capacity" type="number" min="1" max="30" required></label>'+
    '<label>Unidades disponíveis para o inventário <input name="stock" type="number" min="0" max="100" required></label>'+
    '<label>Diária por adulto (R$) <input name="adult_cents" type="number" min="0" max="100000" step=".01" required></label>'+
    '<label>Diária por criança (R$) <input name="child_cents" type="number" min="0" max="100000" step=".01" placeholder="A definir"></label>'+
    '<button type="submit" class="primary">Salvar quarto</button>';
  for (const key of ['name','photo','description','capacity','stock']) form.elements[key].value = room[key];
  form.elements.adult_cents.value = room.adult_cents/100;
  form.elements.child_cents.value = room.child_cents===null ? '' : room.child_cents/100;
  onSubmit(form,async input=>{
    await staff('/rooms/'+room.id,'PATCH',{...input,capacity:Number(input.capacity),stock:Number(input.stock),
      adult_cents:cents(input.adult_cents),child_cents:input.child_cents==='' ? null : cents(input.child_cents)});
    await loadRooms();
    message('Quarto atualizado.');
  });
  item.append(form);
  return item;
}

async function loadRooms() {
  const rooms = await staff('/rooms');
  $('#rooms').replaceChildren(...rooms.map(roomEditor));
}

async function start() {
  const user = await staff('/me');
  renderHeader(user,'quartos');
  $('#logout').onclick = async () => {
    try { await staff('/logout','POST'); location.replace('/campanhas/'); }
    catch (error) { message(error.message,true); }
  };
  await loadRooms();
  message('');
}
start().catch(error=>message(error.message,true));
