const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'});
function currentDay(){const parts=Object.fromEntries(calendar.formatToParts(new Date()).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function dateParts(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const parsed=new Date(value+'T00:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return null;
  return value.split('-').map(Number);
}
export function ageOnDate(birthDate,today=currentDay()){
  const birth=dateParts(birthDate),current=dateParts(today);
  if(!birth||!current||birthDate>today)return null;
  let years=current[0]-birth[0];
  if(current[1]<birth[1]||(current[1]===birth[1]&&current[2]<birth[2]))years--;
  return years>=0?years:null;
}
