export function maskDate(value){
 let text=String(value||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(text))text=text.split('-').reverse().join('');
 const digits=text.replace(/\D/g,'').slice(0,8);
 return [digits.slice(0,2),digits.slice(2,4),digits.slice(4)].filter(Boolean).join('/');
}
export function dateToIso(value){
 if(!/^\d{2}\/\d{2}\/\d{4}$/.test(value||''))return '';
 const iso=value.split('/').reverse().join('-'),date=new Date(iso+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===iso?iso:'';
}
export function bindDateInput(input){
 input.type='text';input.inputMode='numeric';input.maxLength=10;input.placeholder='DD/MM/AAAA';
 input.removeAttribute('min');input.removeAttribute('max');input.value=maskDate(input.value);
 input.addEventListener('input',()=>{input.value=maskDate(input.value);input.setCustomValidity('');});
}
