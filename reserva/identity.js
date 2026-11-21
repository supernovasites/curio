export function validCpf(value) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (const position of [9,10]) {
    const sum = [...value.slice(0,position)].reduce((total,digit,index)=>total+Number(digit)*(position+1-index),0);
    if ((sum*10%11)%10!==Number(value[position])) return false;
  }
  return true;
}

export function maskCpf(value) {
  const digits = value.replace(/\D/g,'').slice(0,11);
  return [digits.slice(0,3),digits.slice(3,6),digits.slice(6,9)].filter(Boolean).join('.')+
    (digits.length>9 ? '-'+digits.slice(9) : '');
}

export function maskBirth(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) value = value.split('-').reverse().join('');
  const digits = value.replace(/\D/g,'').slice(0,8);
  return [digits.slice(0,2),digits.slice(2,4),digits.slice(4)].filter(Boolean).join('/');
}

export function birthIso(value, today) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return '';
  const iso = value.split('/').reverse().join('-');
  const date = new Date(iso+'T12:00:00Z');
  return iso>today || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==iso ? '' : iso;
}
