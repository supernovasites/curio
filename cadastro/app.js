const root=document.getElementById('public-guest-form');
import('/cadastro/form.js?v=20261127-stay-navigation').then(({guestForm})=>{
 guestForm(root,{}, {publicForm:true,onSave:async data=>{
  const response=await fetch('/api/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível enviar. Tente novamente.');
 }});
}).catch(error=>{
 console.error(error);root.replaceChildren();const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent='Não foi possível carregar o formulário. Atualize a página para tentar novamente.';root.append(notice);
});
