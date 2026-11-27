import {guestForm} from '/cadastro/form.js?v=20261127-date-mask';
guestForm(document.getElementById('public-guest-form'),{}, {publicForm:true,onSave:async data=>{
 const response=await fetch('/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível enviar. Tente novamente.');
}});
