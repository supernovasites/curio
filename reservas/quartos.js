import {renderHeader} from '/campanhas/nav.js';
import {$,api,message,onSubmit,money} from '/reservar/common.js';

const staff = (path,method,data) => api('/api/campanhas',path,method,data);
const cents = value => Math.round(Number(value)*100);

const emptyRoom = {name:'',description:'',photo:'',photos:[],capacity:2,stock:1,adult_cents:0,child_cents:null};
let photosInputId = 0;

async function preparePhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>20*1024*1024)
    throw Error('Use imagens JPG, PNG ou WebP de até 20 MB.');
  if (file.size<=750000) return file;
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1,1440/Math.max(image.width,image.height));
    canvas.width = Math.max(1,Math.round(image.width*scale));
    canvas.height = Math.max(1,Math.round(image.height*scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.85,.7,.55,.4]) {
      const photo = await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if (photo && photo.size<=750000) return new File([photo],'quarto.jpg',{type:'image/jpeg'});
    }
    throw Error('Não foi possível reduzir a foto. Escolha uma imagem menor.');
  } finally {
    image.close();
  }
}

function photosField(room) {
  const root = document.createElement('div');
  root.className = 'room-editor-description';
  const id = 'room-photos-'+(++photosInputId);
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = 'Fotos do quarto';
  const input = document.createElement('input');
  input.id = id;
  input.type = 'file';
  input.multiple = true;
  input.accept = 'image/jpeg,image/png,image/webp';
  const hint = document.createElement('p');
  hint.id = id+'-hint';
  hint.className = 'help';
  input.setAttribute('aria-describedby',hint.id);
  const gallery = document.createElement('div');
  gallery.className = 'room-photo-gallery';
  const removed = new Set();
  function update() {
    const count = room.photos.length-removed.size;
    hint.textContent = count+' de 5 fotos salvas. Disponíveis para adicionar: '+(5-count)+'.';
    input.setCustomValidity(count+input.files.length>5 ? 'O quarto pode ter até cinco fotos.' : '');
  }
  for (const [index,entry] of room.photos.entries()) {
    const tile = document.createElement('div');
    const image = document.createElement('img');
    image.alt = 'Foto '+(index+1);
    image.src = entry.url;
    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.type = 'button';
    remove.textContent = 'Remover foto '+(index+1);
    remove.onclick = () => {
      if (removed.has(entry.id)) {
        removed.delete(entry.id);
        remove.textContent = 'Remover foto '+(index+1);
      } else {
        removed.add(entry.id);
        remove.textContent = 'Manter foto '+(index+1);
      }
      tile.classList.toggle('is-removed',removed.has(entry.id));
      update();
    };
    tile.append(image,remove);
    gallery.append(tile);
  }
  input.onchange = update;
  root.append(label,input,hint,gallery);
  update();
  return {root,input,removed};
}

function roomEditor(room, expanded = false) {
  const item = document.createElement('article');
  item.className = 'card room-editor';
  const creating = !room.id;
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
  title.textContent = room.name || 'Adicionar quarto';
  const facts = document.createElement('p');
  facts.className = 'room-editor-facts';
  facts.textContent = 'Até '+room.capacity+' hóspedes · '+room.stock+' '+(room.stock===1?'unidade':'unidades')+
    ' · '+money(room.adult_cents)+' por adulto/diária';
  const editor = document.createElement('details');
  editor.className = 'customer-editor room-editor-details';
  editor.open = expanded;
  const summary = document.createElement('summary');
  summary.textContent = creating ? 'Preencher dados do novo quarto' : 'Editar quarto';
  const form = document.createElement('form');
  form.className = 'room-editor-form';
  form.innerHTML = '<fieldset><legend>Informações do quarto</legend><div class="room-editor-fields">'+
    '<label>Nome <input name="name" required maxlength="100"></label>'+
    '<div class="room-editor-description" data-photos></div>'+
    '<label class="room-editor-description">Descrição <textarea name="description" rows="4" maxlength="2000"></textarea></label></div></fieldset>'+
    '<fieldset><legend>Capacidade e disponibilidade</legend><div class="room-editor-fields">'+
    '<label>Hóspedes por quarto <input name="capacity" type="number" min="1" max="30" required></label>'+
    '<label>Unidades no inventário <input name="stock" type="number" min="0" max="100" required></label></div></fieldset>'+
    '<fieldset><legend>Diárias por pessoa</legend><div class="room-editor-fields">'+
    '<label>Adulto (R$) <input name="adult_cents" type="number" min="0" max="100000" step=".01" required></label>'+
    '<label>Criança (R$) <input name="child_cents" type="number" min="0" max="100000" step=".01" placeholder="A definir"></label></div></fieldset>'+
    '<button type="submit" class="primary">'+(creating ? 'Adicionar quarto' : 'Salvar quarto')+'</button>';
  const photos = photosField(room);
  form.querySelector('[data-photos]').replaceWith(photos.root);
  for (const key of ['name','description','capacity','stock']) form.elements[key].value = room[key];
  form.elements.adult_cents.value = room.adult_cents/100;
  form.elements.child_cents.value = room.child_cents===null ? '' : room.child_cents/100;
  onSubmit(form,async input=>{
    const details = {...input,capacity:Number(input.capacity),stock:Number(input.stock),remove:[...photos.removed],
      adult_cents:cents(input.adult_cents),child_cents:input.child_cents==='' ? null : cents(input.child_cents)};
    const formData = new FormData();
    formData.set('details',JSON.stringify(details));
    for (const file of photos.input.files) formData.append('photos',await preparePhoto(file));
    const response = await fetch('/api/campanhas/rooms'+(creating ? '' : '/'+room.id),{
      method:creating ? 'POST' : 'PATCH',body:formData
    });
    const saved = await response.json();
    if (!response.ok) throw Error(saved.error || 'Não foi possível salvar o quarto.');
    const replacement = roomEditor(saved,true);
    if (creating) {
      $('#rooms').append(replacement);
      item.replaceWith(roomEditor(emptyRoom,true));
    } else item.replaceWith(replacement);
    replacement.querySelector('summary').focus({preventScroll:true});
    message(creating ? 'Quarto adicionado.' : 'Quarto atualizado.');
  });
  editor.append(summary,form);
  content.append(title);
  if (!creating) content.append(facts);
  content.append(editor);
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
  $('#add-room').replaceChildren(roomEditor(emptyRoom,true));
  message('');
}
start().catch(error=>message(error.message,true));
