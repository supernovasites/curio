// Aggregate counts only. No guest data, cookies or cross-site identifiers are collected.
function count(kind){fetch('/api/metricas',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind}),keepalive:true}).catch(()=>{});}
if(location.pathname==='/'){
  count('visita');
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link)return;const href=link.getAttribute('href');if(href.startsWith('https://book.securebookings.net/'))count('reserva_online');else if(href.startsWith('https://wa.me/'))count('whatsapp');});
}
