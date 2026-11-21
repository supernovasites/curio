import {renderHeader} from '/campanhas/nav.js';
import {$,api,message,onSubmit,money} from '/reservar/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const cents = value => Math.round(Number(value)*100);

function roomEditor(room, expanded = false) {
  const item = document.createElement('article');
  item.className = 'card room-editor';
  const photoFrame = document.createElement('div');
  photoFrame.className = 'room-editor-media';
  const placeholder = document.createElement('span');
  placeholder.textContent = 'Foto indisponível';
  placeholder.hidden = Boolean(room.photo);
  photoFrame.append(placeholder);
  if (room.photo) {
    const photo = document.createElement('img');
    photo.alt = 'Foto de '+room.name;
    photo.loading = 'lazy';
    photo.addEventListener('error',()=>{
      photo.hidden = true;
      placeholder.hidden = false;
    });
    photo.src = room.photo;
    photoFrame.append(photo);
  }

  const content = document.createElement('div');
  content.className = 'room-editor-content';
  const title = document.createElement('h2');
  title.textContent = room.name;
  const facts = document.createElement('p');
  facts.className = 'room-editor-facts';
  facts.textContent = 'Até '+room.capacity+' hóspedes · '+room.stock+' '+(room.stock===1?'unidade':'unidades')+
    ' · '+money(room.adult_cents)+' por adulto/diária';
  const editor = document.createElement('details');
  editor.className = 'customer-editor room-editor-details';
  editor.open = expanded;
  const summary = document.createElement('summary');
  summary.textContent = 'Editar quarto';
  const form = document.createElement('form');
  form.className = 'room-editor-form';
  form.innerHTML = '<fieldset><legend>Informações do quarto</legend><div class="room-editor-fields">'+
    '<label>Nome <input name="name" required maxlength="100"></label>'+
    '<label>Link da foto no Hospedin <input name="photo" type="url" maxlength="500"></label>'+
    '<label class="room-editor-description">Descrição <textarea name="description" rows="4" maxlength="2000"></textarea></label></div></fieldset>'+
    '<fieldset><legend>Capacidade e disponibilidade</legend><div class="room-editor-fields">'+
    '<label>Hóspedes por quarto <input name="capacity" type="number" min="1" max="30" required></label>'+
    '<label>Unidades no inventário <input name="stock" type="number" min="0" max="100" required></label></div></fieldset>'+
    '<fieldset><legend>Diárias por pessoa</legend><div class="room-editor-fields">'+
    '<label>Adulto (R$) <input name="adult_cents" type="number" min="0" max="100000" step=".01" required></label>'+
    '<label>Criança (R$) <input name="child_cents" type="number" min="0" max="100000" step=".01" placeholder="A definir"></label></div></fieldset>'+
    '<button type="submit" class="primary">Salvar quarto</button>';
  for (const key of ['name','photo','description','capacity','stock']) form.elements[key].value = room[key];
  form.elements.adult_cents.value = room.adult_cents/100;
  form.elements.child_cents.value = room.child_cents===null ? '' : room.child_cents/100;
  onSubmit(form,async input=>{
    const updated = {...room,...input,capacity:Number(input.capacity),stock:Number(input.stock),
      adult_cents:cents(input.adult_cents),child_cents:input.child_cents==='' ? null : cents(input.child_cents)};
    await staff('/rooms/'+room.id,'PATCH',updated);
    const replacement = roomEditor(updated,true);
    item.replaceWith(replacement);
    replacement.querySelector('summary').focus({preventScroll:true});
    message('Quarto atualizado.');
  });
  editor.append(summary,form);
  content.append(title,facts,editor);
  item.append(photoFrame,content);
  return item;
}

async function loadRooms() {
  const rooms = await staff('/rooms');
  $('#rooms').replaceChildren(...rooms.map(room=>roomEditor(room)));
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
