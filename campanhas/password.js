const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const hiddenEye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.5 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.7M6.5 6.5A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4"/></svg>';
document.querySelectorAll('input[type="password"]').forEach(input=>{
  const wrapper=document.createElement('span');wrapper.className='password-field';input.before(wrapper);wrapper.append(input);
  const button=document.createElement('button');button.type='button';button.className='password-toggle';
  function setVisible(visible){input.type=visible?'text':'password';button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');button.setAttribute('aria-pressed',String(visible));button.title=visible?'Ocultar senha':'Mostrar senha';button.innerHTML=visible?hiddenEye:eye;}
  setVisible(false);button.addEventListener('click',e=>{e.preventDefault();setVisible(input.type==='password');});wrapper.append(button);
  input.form?.addEventListener('reset',()=>setVisible(false));
});
